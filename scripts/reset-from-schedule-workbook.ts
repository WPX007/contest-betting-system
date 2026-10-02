import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import readXlsxFile from "read-excel-file/node";
import {
  AssetType,
  LedgerReason,
  MarketStatus,
  MatchScheduleStatus,
  MatchStatus,
  PrismaClient,
  Track,
  UserRole,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const SEASON_ID = "season-2026";
const SEASON_START = new Date("2026-10-12T00:00:00+08:00");
const SEASON_END = new Date("2027-01-24T23:59:59+08:00");
const INITIAL_COINS = 1000;

type Sheet = { sheet: string; data: unknown[][] };
type TeamSeed = { id: string; name: string; track: Track; allianceKey: string; scheduleOrder: number };
type MemberSeed = { id: string; name: string; username: string; role: UserRole; teamId: string };
type MatchSeed = {
  id: string;
  marketId: string;
  week: number;
  slot: number;
  track: Track;
  bestOf: number;
  homeTeamId: string;
  awayTeamId: string;
};

function cell(value: unknown) {
  return String(value ?? "").trim();
}

function requiredSheet(sheets: Sheet[], name: string) {
  const sheet = sheets.find((item) => item.sheet === name);
  if (!sheet) throw new Error(`缺少工作表：${name}`);
  return sheet.data;
}

function columns(header: unknown[]) {
  return new Map(header.map((value, index) => [cell(value), index]));
}

function column(map: Map<string, number>, name: string) {
  const index = map.get(name);
  if (index === undefined) throw new Error(`缺少列：${name}`);
  return index;
}

function parseIdentity(value: unknown) {
  const source = cell(value);
  const matched = source.match(/^([^()（）]+)[(（]([^()（）]+)[)）]$/);
  if (!matched) {
    if (/^[A-Za-z0-9_.-]+$/.test(source)) return { username: source, name: source };
    throw new Error(`成员格式必须为 英文名(中文名) 或英文账号：${source}`);
  }
  return { username: matched[1].trim(), name: matched[2].trim() };
}

function idPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function parseWorkbook(path: string) {
  const sheets = await readXlsxFile(path) as Sheet[];
  const allianceRows = requiredSheet(sheets, "同盟关系");
  const rosterRows = requiredSheet(sheets, "组队成员");
  const scheduleRows = requiredSheet(sheets, "11周赛程");

  const allianceHeader = columns(allianceRows[0] ?? []);
  const aTeamColumn = column(allianceHeader, "巅峰赛区队伍");
  const bTeamColumn = column(allianceHeader, "王者赛区队伍");
  const teamSeeds: TeamSeed[] = [];
  const teamByName = new Map<string, TeamSeed>();
  for (const [rowOffset, row] of allianceRows.slice(1).entries()) {
    const order = rowOffset + 1;
    const aName = cell(row[aTeamColumn]);
    const bName = cell(row[bTeamColumn]);
    if (!aName && !bName) continue;
    if (!aName || !bName) throw new Error(`同盟关系第 ${rowOffset + 2} 行缺少 A 或 B 队`);
    for (const [name, track] of [[aName, Track.A], [bName, Track.B]] as const) {
      if (teamByName.has(name)) throw new Error(`队伍重复：${name}`);
      const team = {
        id: `team-${track.toLowerCase()}-${String(order).padStart(2, "0")}`,
        name,
        track,
        allianceKey: `import:alliance-${String(order).padStart(2, "0")}`,
        scheduleOrder: order,
      };
      teamSeeds.push(team);
      teamByName.set(name, team);
    }
  }
  if (teamSeeds.filter((team) => team.track === Track.A).length !== 12 || teamSeeds.filter((team) => team.track === Track.B).length !== 12) {
    throw new Error("同盟关系必须正好包含 12 支 A 队和 12 支 B 队");
  }

  const rosterHeader = columns(rosterRows[0] ?? []);
  const rosterTeamColumn = column(rosterHeader, "战队");
  const rosterNameColumn = column(rosterHeader, "姓名");
  const rosterRoleColumn = column(rosterHeader, "职位");
  const memberSeeds: MemberSeed[] = [];
  const usernames = new Set<string>();
  for (const [rowOffset, row] of rosterRows.slice(1).entries()) {
    const teamName = cell(row[rosterTeamColumn]);
    const identityText = cell(row[rosterNameColumn]);
    if (!teamName && !identityText) continue;
    const team = teamByName.get(teamName);
    if (!team) throw new Error(`组队成员第 ${rowOffset + 2} 行引用了未知队伍：${teamName}`);
    const identity = parseIdentity(identityText);
    const usernameKey = identity.username.toLowerCase();
    if (usernames.has(usernameKey)) throw new Error(`英文账号重复：${identity.username}`);
    usernames.add(usernameKey);
    memberSeeds.push({
      id: `user-${idPart(identity.username)}`,
      name: identity.name,
      username: identity.username,
      role: cell(row[rosterRoleColumn]) === "队长" ? UserRole.CAPTAIN : UserRole.PLAYER,
      teamId: team.id,
    });
  }
  if (memberSeeds.length === 0) throw new Error("未读取到队伍成员");
  for (const team of teamSeeds) {
    const members = memberSeeds.filter((member) => member.teamId === team.id);
    if (members.length === 0) throw new Error(`队伍没有成员：${team.name}`);
    if (members.filter((member) => member.role === UserRole.CAPTAIN).length !== 1) throw new Error(`队伍必须正好有一名队长：${team.name}`);
  }

  const scheduleHeader = columns(scheduleRows[0] ?? []);
  const numberColumn = column(scheduleHeader, "比赛编号");
  const formatColumn = column(scheduleHeader, "赛制");
  const homeColumn = column(scheduleHeader, "主队");
  const awayColumn = column(scheduleHeader, "客队");
  const matchSeeds: MatchSeed[] = [];
  const slotKeys = new Set<string>();
  const weeklyTeams = new Set<string>();
  const pairsByTrack = { [Track.A]: new Set<string>(), [Track.B]: new Set<string>() };
  for (const [rowOffset, row] of scheduleRows.slice(1).entries()) {
    const number = cell(row[numberColumn]);
    if (!number) continue;
    const numberMatch = number.match(/^([AB])-W(\d+)-M(\d+)$/i);
    if (!numberMatch) throw new Error(`赛程第 ${rowOffset + 2} 行比赛编号无效：${number}`);
    const track = numberMatch[1].toUpperCase() as Track;
    const week = Number(numberMatch[2]);
    const slot = Number(numberMatch[3]);
    if (week < 1 || week > 11 || slot < 1 || slot > 6) throw new Error(`比赛编号超出 11 周固定赛程范围：${number}`);
    const slotKey = `${track}-${week}-${slot}`;
    if (slotKeys.has(slotKey)) throw new Error(`固定场次重复：${number}`);
    slotKeys.add(slotKey);
    const home = teamByName.get(cell(row[homeColumn]));
    const away = teamByName.get(cell(row[awayColumn]));
    if (!home || !away) throw new Error(`赛程第 ${rowOffset + 2} 行存在未知队伍`);
    if (home.track !== track || away.track !== track || home.id === away.id) throw new Error(`赛程第 ${rowOffset + 2} 行对阵或赛区无效`);
    for (const team of [home, away]) {
      const weeklyTeamKey = `${track}-${week}-${team.id}`;
      if (weeklyTeams.has(weeklyTeamKey)) throw new Error(`第 ${week} 周 ${track} 组队伍重复出赛：${team.name}`);
      weeklyTeams.add(weeklyTeamKey);
    }
    const pairKey = [home.id, away.id].sort().join(":");
    if (pairsByTrack[track].has(pairKey)) throw new Error(`${track} 组对阵重复：${home.name} vs ${away.name}`);
    pairsByTrack[track].add(pairKey);
    const bestOf = Number(cell(row[formatColumn]).match(/\d+/)?.[0] ?? 2);
    matchSeeds.push({
      id: `match-${track.toLowerCase()}-w${week}-m${slot}`,
      marketId: `market-${track.toLowerCase()}-w${week}-m${slot}`,
      week,
      slot,
      track,
      bestOf,
      homeTeamId: home.id,
      awayTeamId: away.id,
    });
  }
  if (matchSeeds.length !== 132 || slotKeys.size !== 132 || pairsByTrack[Track.A].size !== 66 || pairsByTrack[Track.B].size !== 66) {
    throw new Error(`赛程必须包含 A/B 各 66 场且无重复，当前共 ${matchSeeds.length} 场`);
  }
  return { teams: teamSeeds, members: memberSeeds, matches: matchSeeds };
}

async function resetDatabase(data: Awaited<ReturnType<typeof parseWorkbook>>) {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
  });
  const passwordHash = await hashPassword("000000");
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany();
      await tx.session.deleteMany();
      await tx.rechargeRequest.deleteMany();
      await tx.ledgerEntry.deleteMany();
      await tx.settlementBatch.deleteMany();
      await tx.bet.deleteMany();
      await tx.parlayLeg.deleteMany();
      await tx.parlayEntry.deleteMany();
      await tx.parlayRoundMarket.deleteMany();
      await tx.parlayRound.deleteMany();
      await tx.marketOption.deleteMany();
      await tx.market.deleteMany();
      await tx.match.deleteMany();
      await tx.wallet.deleteMany();
      await tx.user.deleteMany();
      await tx.team.deleteMany();
      await tx.season.deleteMany();
      await tx.parlayConfig.deleteMany();

      await tx.season.create({
        data: { id: SEASON_ID, name: "2027年“策划杯”秋季赛", startsAt: SEASON_START, endsAt: SEASON_END },
      });
      await tx.team.createMany({ data: data.teams });
      await tx.user.create({
        data: { id: "admin", name: "系统管理员", username: "admin", passwordHash, role: UserRole.SUPER_ADMIN },
      });
      await tx.user.createMany({
        data: data.members.map((member) => ({ ...member, passwordHash })),
      });
      const users = [{ id: "admin" }, ...data.members.map((member) => ({ id: member.id }))];
      await tx.wallet.createMany({
        data: users.flatMap((user) => [
          { id: `wallet-${user.id}-coin`, userId: user.id, asset: AssetType.BET_COIN, balance: user.id === "admin" ? 0 : INITIAL_COINS },
          { id: `wallet-${user.id}-point`, userId: user.id, asset: AssetType.POINT, balance: 0 },
        ]),
      });
      await tx.ledgerEntry.createMany({
        data: data.members.map((member) => ({
          walletId: `wallet-${member.id}-coin`,
          amount: INITIAL_COINS,
          balanceAfter: INITIAL_COINS,
          reason: LedgerReason.INITIAL_GRANT,
          reference: `season-reset:${member.id}`,
          note: "新赛季初始发放",
        })),
      });
      await tx.parlayConfig.create({ data: { id: "default" } });

      for (const match of data.matches) {
        const home = data.teams.find((team) => team.id === match.homeTeamId)!;
        const away = data.teams.find((team) => team.id === match.awayTeamId)!;
        const weekEnd = new Date(SEASON_START.getTime() + match.week * 7 * 86_400_000);
        await tx.match.create({
          data: {
            id: match.id,
            seasonId: SEASON_ID,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            track: match.track,
            bestOf: match.bestOf,
            weekNumber: match.week,
            slotIndex: match.slot,
            scheduleStatus: MatchScheduleStatus.UNSET,
            pairingConfiguredAt: now,
            pairingConfiguredByUserId: "admin",
            status: MatchStatus.SCHEDULED,
            markets: {
              create: {
                id: match.marketId,
                title: `常规赛第 ${match.week} 周 · ${match.track} 组第 ${match.slot} 场`,
                status: MarketStatus.DRAFT,
                opensAt: now,
                closesAt: weekEnd,
                options: {
                  create: [
                    { id: `${match.marketId}-home`, label: `${home.name} 胜（2:0）` },
                    { id: `${match.marketId}-draw`, label: "平局（1:1）" },
                    { id: `${match.marketId}-away`, label: `${away.name} 胜（0:2）` },
                  ],
                },
              },
            },
          },
        });
      }
    }, { maxWait: 10_000, timeout: 120_000 });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const workbookPath = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!workbookPath) throw new Error("用法：npx tsx scripts/reset-from-schedule-workbook.ts <xlsx路径> [--apply]");
  const data = await parseWorkbook(workbookPath);
  console.log(`校验通过：${data.teams.length} 支队伍，${data.members.length} 个账号，${data.matches.length} 场比赛。`);
  console.log("第 1 周开始日期：2026-10-12；所有比赛时间待双方队长确认。");
  if (!apply) {
    console.log("当前为预览模式，数据库未修改。添加 --apply 才会执行完整重置。");
    return;
  }
  await resetDatabase(data);
  console.log("数据库已完成重置并按工作簿重建。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
