import { NextResponse } from "next/server";
import readXlsxFile from "read-excel-file/node";
import { AssetType, LedgerReason, Track, UserRole } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { IMPORT_INITIAL_COINS, parseTeamWorkbook, prepareImportedRoster } from "@/lib/team-import";

export const runtime = "nodejs";

function key(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function trackFromTeamName(teamName: string) {
  if (teamName.endsWith("-A") || /A队$/i.test(teamName)) return Track.A;
  if (teamName.endsWith("-B") || /B队$/i.test(teamName)) return Track.B;
  return null;
}

class DisjointSet {
  private parent = new Map<string, string>();

  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.parent.get(value) ?? value;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(first: string, second: string) {
    const firstRoot = this.find(first);
    const secondRoot = this.find(second);
    if (firstRoot !== secondRoot) this.parent.set(secondRoot, firstRoot);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const form = await request.formData();
    const file = form.get("file");
    const action = form.get("action") === "apply" ? "apply" : "preview";
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择 Excel 文件" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "仅支持 .xlsx 格式的 Excel 文件" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Excel 文件不能超过 5MB" }, { status: 400 });
    }

    const workbook = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
    const parsed = parseTeamWorkbook(workbook);
    const roster = prepareImportedRoster(parsed);
    const users = await prisma.user.findMany({
      include: { team: true },
      orderBy: { createdAt: "asc" },
    });
    const errors = [...roster.errors];
    const warnings = [...roster.warnings];
    const importedTeams: Array<{ name: string; track: Track }> = [];
    const importedTeamByName = new Map<string, { name: string; track: Track }>();

    for (const member of roster.members) {
      const track = member.track === "A"
        ? Track.A
        : member.track === "B"
          ? Track.B
          : trackFromTeamName(member.teamName);
      if (!track) {
        errors.push(`${member.sheet} 第 ${member.row} 行：无法判断队伍“${member.teamName}”属于 A 组还是 B 组`);
        continue;
      }
      const teamKey = key(member.teamName);
      const existing = importedTeamByName.get(teamKey);
      if (existing && existing.track !== track) {
        errors.push(`${member.sheet} 第 ${member.row} 行：队伍“${member.teamName}”同时出现在 A 组和 B 组`);
        continue;
      }
      if (!existing) {
        const team = { name: member.teamName, track };
        importedTeams.push(team);
        importedTeamByName.set(teamKey, team);
      }
    }

    for (const alliance of parsed.alliances) {
      for (const teamName of alliance.teamNames) {
        if (importedTeamByName.has(key(teamName))) continue;
        const track = trackFromTeamName(teamName);
        if (!track) {
          errors.push(`${alliance.source}：找不到队伍“${teamName}”`);
          continue;
        }
        const team = { name: teamName, track };
        importedTeams.push(team);
        importedTeamByName.set(key(teamName), team);
      }
    }

    const removedUsers = users
      .filter((user) => user.id !== admin.id)
      .map((user) => ({ id: user.id, name: user.name, username: user.username, fromTeam: user.team?.name ?? "无" }));
    const assignments = roster.members.map((member) => ({
        userId: `new:${member.username}`,
        name: member.name,
        username: member.username,
        fromTeam: "新建账号",
        teamId: `new-team:${member.teamName}`,
        teamName: member.teamName,
        role: member.role,
      }));
    if (parsed.alliances.length === 0) {
      warnings.push("未读取到联姻关系；确认导入后将清除现有联姻关系");
    }
    warnings.unshift(`确认导入后会清空旧赛程、盘口、竞猜、闯关和旧战队；仅保留管理员及系统设置。`);
    warnings.unshift(`其余 ${removedUsers.length} 名旧用户及其钱包、充值记录会被全部清除。`);
    warnings.unshift(`表格用户将按英文名开号，初始密码 000000，初始竞猜币 ${IMPORT_INITIAL_COINS}。`);

    const previewTeams = importedTeams.map((team) => ({ id: `new-team:${team.name}`, name: team.name }));
    const previewTeamByName = new Map(previewTeams.map((team) => [key(team.name), team]));
    const disjointSet = new DisjointSet();
    previewTeams.forEach((team) => disjointSet.add(team.id));
    for (const alliance of parsed.alliances) {
      const allianceTeams = alliance.teamNames.map((name) => previewTeamByName.get(key(name)));
      const missing = alliance.teamNames.filter((_, index) => !allianceTeams[index]);
      if (missing.length > 0) {
        errors.push(`${alliance.source}：找不到队伍 ${missing.join("、")}`);
        continue;
      }
      const ids = allianceTeams.flatMap((team) => team ? [team.id] : []);
      for (let index = 1; index < ids.length; index += 1) disjointSet.union(ids[0], ids[index]);
    }
    const allianceGroups = new Map<string, typeof previewTeams>();
    for (const team of previewTeams) {
      const root = disjointSet.find(team.id);
      const group = allianceGroups.get(root) ?? [];
      group.push(team);
      allianceGroups.set(root, group);
    }
    const alliances = Array.from(allianceGroups.values())
      .filter((group) => group.length > 1)
      .map((group) => group.map((team) => ({ id: team.id, name: team.name })));

    const preview = {
      fileName: file.name,
      assignments,
      unassignedUsers: removedUsers,
      alliances,
      errors,
      warnings,
      summary: {
        assignmentCount: assignments.length,
        changedAssignmentCount: assignments.length,
        clearedAssignmentCount: removedUsers.length,
        createdUserCount: assignments.length,
        removedUserCount: removedUsers.length,
        allianceGroupCount: alliances.length,
        initialCoins: IMPORT_INITIAL_COINS,
      },
    };

    if (action === "preview") return NextResponse.json({ data: { ...preview, applied: false } });
    if (errors.length > 0) {
      return NextResponse.json({ error: "表格存在错误，不能导入", data: preview }, { status: 400 });
    }

    const passwordHash = await hashPassword("000000");
    const applied = await prisma.$transaction(async (tx) => {
      const removableIds = removedUsers.map((user) => user.id);

      await tx.parlayLeg.deleteMany({});
      await tx.parlayEntry.deleteMany({});
      await tx.parlayRoundMarket.deleteMany({});
      await tx.parlayRound.deleteMany({});
      await tx.bet.deleteMany({});
      await tx.settlementBatch.deleteMany({});
      await tx.marketOption.deleteMany({});
      await tx.market.deleteMany({});
      await tx.match.deleteMany({});
      await tx.rechargeRequest.deleteMany({});

      if (removableIds.length > 0) {
        const wallets = await tx.wallet.findMany({ where: { userId: { in: removableIds } }, select: { id: true } });
        const walletIds = wallets.map((wallet) => wallet.id);
        if (walletIds.length > 0) await tx.ledgerEntry.deleteMany({ where: { walletId: { in: walletIds } } });
        await tx.auditLog.deleteMany({ where: { actorId: { in: removableIds } } });
        await tx.session.deleteMany({ where: { userId: { in: removableIds } } });
        await tx.wallet.deleteMany({ where: { userId: { in: removableIds } } });
        await tx.user.deleteMany({ where: { id: { in: removableIds } } });
      }

      const adminWallets = await tx.wallet.findMany({ where: { userId: admin.id }, select: { id: true } });
      const adminWalletIds = adminWallets.map((wallet) => wallet.id);
      if (adminWalletIds.length > 0) {
        await tx.ledgerEntry.deleteMany({ where: { walletId: { in: adminWalletIds } } });
        await tx.wallet.updateMany({
          where: { id: { in: adminWalletIds } },
          data: { balance: 0, version: { increment: 1 } },
        });
      }

      await tx.team.deleteMany({});
      const teamRecords: Array<{ id: string; name: string; track: Track; allianceKey: string }> = [];
      for (const team of importedTeams) {
        const created = await tx.team.create({
          data: { name: team.name, track: team.track, allianceKey: `solo:pending` },
        });
        await tx.team.update({ where: { id: created.id }, data: { allianceKey: `solo:${created.id}` } });
        teamRecords.push(created);
      }
      const liveTeamByName = new Map(teamRecords.map((team) => [key(team.name), team]));

      for (const team of teamRecords) {
        await tx.team.update({ where: { id: team.id }, data: { allianceKey: `solo:${team.id}` } });
      }
      const liveAlliances = alliances.map((group) => group.map((item) => {
        const team = liveTeamByName.get(key(item.name));
        if (!team) throw new Error(`导入后找不到队伍“${item.name}”`);
        return { id: team.id, name: team.name };
      }));
      for (const group of liveAlliances) {
        const allianceKey = `import:${group.map((team) => team.id).sort().join("|")}`;
        await tx.team.updateMany({ where: { id: { in: group.map((team) => team.id) } }, data: { allianceKey } });
      }

      const createdAssignments = [];
      for (const member of roster.members) {
        const team = liveTeamByName.get(key(member.teamName));
        if (!team) throw new Error(`导入后找不到队伍“${member.teamName}”`);
        const created = await tx.user.create({
          data: {
            name: member.name,
            username: member.username,
            passwordHash,
            role: member.role === "CAPTAIN" ? UserRole.CAPTAIN : UserRole.PLAYER,
            teamId: team.id,
          },
        });
        const coinWallet = await tx.wallet.create({
          data: { userId: created.id, asset: AssetType.BET_COIN, balance: IMPORT_INITIAL_COINS },
        });
        await tx.wallet.create({ data: { userId: created.id, asset: AssetType.POINT, balance: 0 } });
        await tx.ledgerEntry.create({
          data: {
            walletId: coinWallet.id,
            amount: IMPORT_INITIAL_COINS,
            balanceAfter: IMPORT_INITIAL_COINS,
            reason: LedgerReason.INITIAL_GRANT,
            reference: `import:${admin.id}:${created.id}`,
            note: "队伍表格导入开号并发放初始竞猜币",
          },
        });
        createdAssignments.push({
          userId: created.id,
          name: created.name,
          username: created.username,
          fromTeam: "新建账号",
          teamId: team.id,
          teamName: team.name,
          role: member.role,
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "TEAM_WORKBOOK_IMPORT",
          target: file.name,
          after: JSON.stringify({
            createdUserCount: createdAssignments.length,
            removedUserCount: removedUsers.length,
            allianceGroupCount: liveAlliances.length,
            initialCoins: IMPORT_INITIAL_COINS,
          }),
        },
      });

      return {
        assignments: createdAssignments,
        alliances: liveAlliances,
      };
    }, { timeout: 60_000 });

    return NextResponse.json({
      data: {
        ...preview,
        applied: true,
        assignments: applied.assignments,
        alliances: applied.alliances,
        summary: {
          ...preview.summary,
          assignmentCount: applied.assignments.length,
          changedAssignmentCount: applied.assignments.length,
          allianceGroupCount: applied.alliances.length,
        },
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入 Excel 失败" }, { status: 400 });
  }
}
