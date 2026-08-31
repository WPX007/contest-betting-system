type WorkbookSheet = {
  sheet: string;
  data: unknown[][];
};

export type ImportedMember = {
  sheet: string;
  row: number;
  name?: string;
  username?: string;
  teamName: string;
  track?: "A" | "B";
  isCaptain?: boolean;
};

export type PreparedImportMember = {
  sheet: string;
  row: number;
  name: string;
  username: string;
  teamName: string;
  track?: "A" | "B";
  role: "CAPTAIN" | "PLAYER";
};

export const IMPORT_INITIAL_COINS = 1000;

export type ImportedAlliance = {
  source: string;
  teamNames: string[];
};

export type ParsedTeamWorkbook = {
  members: ImportedMember[];
  alliances: ImportedAlliance[];
  warnings: string[];
};

const aliases = {
  name: ["中文名", "姓名", "成员姓名", "队员姓名", "name"],
  username: ["英文名", "英文姓名", "账号", "用户名", "username", "englishname"],
  team: ["队伍", "队伍名", "战队", "战队名", "所属队伍", "team", "teamname", "队伍1", "战队1"],
  partner: ["联姻队伍", "联姻战队", "联姻对象", "伙伴队伍", "partner", "队伍2", "战队2"],
  alliance: ["联姻组", "联姻编号", "联姻关系", "alliance", "alliancegroup", "alliancekey"],
} satisfies Record<string, string[]>;

const pairedAliases = {
  pair: ["配对", "配对编号", "序号"],
  aTeam: ["a队", "a组队伍", "a组战队"],
  aCaptain: ["a队队长", "a组队长"],
  aMembers: ["a队队员", "a组队员", "a队成员", "a组成员"],
  bTeam: ["b队", "b组队伍", "b组战队"],
  bCaptain: ["b队队长", "b组队长"],
  bMembers: ["b队队员", "b组队员", "b队成员", "b组成员"],
} satisfies Record<string, string[]>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[\s_\-—:：()（）/\\]+/g, "");
}

function columnIndex(row: unknown[], names: string[]) {
  const accepted = new Set(names.map(normalized));
  return row.findIndex((cell) => accepted.has(normalized(cell)));
}

function nonEmpty(value: unknown) {
  const valueText = text(value);
  return valueText && valueText !== "-" && valueText !== "无" ? valueText : "";
}

function canonicalTeamName(value: unknown) {
  const teamName = nonEmpty(value);
  const compact = teamName.replace(/\s+/g, "");
  const trackFirst = compact.match(/^(?:战队)?([AB])队?0*(\d+)$/i);
  const numberFirst = compact.match(/^(?:战队)?0*(\d+)[-_]?([AB])队?$/i);
  const match = trackFirst
    ? { track: trackFirst[1], number: trackFirst[2] }
    : numberFirst
      ? { track: numberFirst[2], number: numberFirst[1] }
      : null;
  if (!match) return teamName;
  return `战队${match.number.padStart(2, "0")}-${match.track.toUpperCase()}`;
}

function parseMemberCell(value: unknown) {
  return nonEmpty(value)
    .split(/[、,，;；\n]+/)
    .map((item) => item.trim().replace(/^[`·•\s]+|[`·•\s]+$/g, ""))
    .filter(Boolean)
    .map((item) => {
      const pairedName = item.match(/^([^()（）]+?)[(（]([^()（）]+)[)）]$/);
      if (!pairedName) {
        return /[A-Za-z]/.test(item) && !/[\u3400-\u9fff]/.test(item)
          ? { username: item }
          : { name: item };
      }
      const outside = pairedName[1].trim();
      const inside = pairedName[2].trim();
      const outsideHasHan = /[\u3400-\u9fff]/.test(outside);
      const insideHasHan = /[\u3400-\u9fff]/.test(inside);
      if (!outsideHasHan && insideHasHan) return { username: outside, name: inside };
      if (outsideHasHan && !insideHasHan) return { name: outside, username: inside };
      return { username: outside, name: inside };
    });
}

export function parseTeamWorkbook(sheets: WorkbookSheet[]): ParsedTeamWorkbook {
  const members: ImportedMember[] = [];
  const groupTeams = new Map<string, Set<string>>();
  const partnerLinks: Array<[string, string]> = [];
  const warnings: string[] = [];

  for (const sheet of sheets) {
    let parsedSheet = false;
    for (let headerIndex = 0; headerIndex < Math.min(sheet.data.length, 15); headerIndex += 1) {
      const header = sheet.data[headerIndex] ?? [];
      const pairedColumns = {
        pair: columnIndex(header, pairedAliases.pair),
        aTeam: columnIndex(header, pairedAliases.aTeam),
        aCaptain: columnIndex(header, pairedAliases.aCaptain),
        aMembers: columnIndex(header, pairedAliases.aMembers),
        bTeam: columnIndex(header, pairedAliases.bTeam),
        bCaptain: columnIndex(header, pairedAliases.bCaptain),
        bMembers: columnIndex(header, pairedAliases.bMembers),
      };
      const pairedTable = pairedColumns.aTeam >= 0
        && pairedColumns.bTeam >= 0
        && (pairedColumns.aCaptain >= 0 || pairedColumns.aMembers >= 0)
        && (pairedColumns.bCaptain >= 0 || pairedColumns.bMembers >= 0);
      if (pairedTable) {
        parsedSheet = true;
        for (let rowIndex = headerIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
          const row = sheet.data[rowIndex] ?? [];
          const aTeam = canonicalTeamName(row[pairedColumns.aTeam]);
          const bTeam = canonicalTeamName(row[pairedColumns.bTeam]);
          if (!aTeam && !bTeam) continue;

          for (const [teamName, captainColumn, membersColumn, track] of [
            [aTeam, pairedColumns.aCaptain, pairedColumns.aMembers, "A"],
            [bTeam, pairedColumns.bCaptain, pairedColumns.bMembers, "B"],
          ] as const) {
            if (!teamName) continue;
            const captains = captainColumn >= 0 ? parseMemberCell(row[captainColumn]) : [];
            const roster = membersColumn >= 0 ? parseMemberCell(row[membersColumn]) : [];
            const seen = new Set<string>();
            for (const [identity, isCaptain] of [
              ...captains.map((item) => [item, true] as const),
              ...roster.map((item) => [item, false] as const),
            ]) {
              const identityKey = normalized(identity.username || identity.name);
              if (!identityKey || seen.has(identityKey)) continue;
              seen.add(identityKey);
              members.push({
                sheet: sheet.sheet,
                row: rowIndex + 1,
                ...identity,
                teamName,
                track,
                isCaptain,
              });
            }
          }

          if (aTeam && bTeam) {
            const pair = pairedColumns.pair >= 0 ? nonEmpty(row[pairedColumns.pair]) : "";
            partnerLinks.push([aTeam, bTeam]);
            if (!pair) warnings.push(`${sheet.sheet} 第 ${rowIndex + 1} 行：未填写配对编号，已按同行 A/B 队建立联姻关系`);
          }
        }
        break;
      }

      const columns = {
        name: columnIndex(header, aliases.name),
        username: columnIndex(header, aliases.username),
        team: columnIndex(header, aliases.team),
        partner: columnIndex(header, aliases.partner),
        alliance: columnIndex(header, aliases.alliance),
      };
      const memberTable = columns.team >= 0 && (columns.name >= 0 || columns.username >= 0);
      const allianceTable = columns.team >= 0 && (columns.partner >= 0 || columns.alliance >= 0);
      if (!memberTable && !allianceTable) continue;
      parsedSheet = true;

      for (let rowIndex = headerIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
        const row = sheet.data[rowIndex] ?? [];
        const teamName = canonicalTeamName(row[columns.team]);
        if (!teamName) continue;
        const name = columns.name >= 0 ? nonEmpty(row[columns.name]) : "";
        const username = columns.username >= 0 ? nonEmpty(row[columns.username]) : "";
        if (memberTable && (name || username)) {
          members.push({
            sheet: sheet.sheet,
            row: rowIndex + 1,
            ...(name ? { name } : {}),
            ...(username ? { username } : {}),
            teamName,
          });
        }
        const partner = columns.partner >= 0 ? canonicalTeamName(row[columns.partner]) : "";
        if (partner) partnerLinks.push([teamName, partner]);
        const alliance = columns.alliance >= 0 ? nonEmpty(row[columns.alliance]) : "";
        if (alliance) {
          const teams = groupTeams.get(alliance) ?? new Set<string>();
          teams.add(teamName);
          groupTeams.set(alliance, teams);
        }
      }
      break;
    }
    if (!parsedSheet && sheet.data.some((row) => row.some((cell) => nonEmpty(cell)))) {
      warnings.push(`工作表“${sheet.sheet}”未找到可识别表头，已跳过`);
    }
  }

  const alliances: ImportedAlliance[] = [
    ...Array.from(groupTeams.entries()).map(([group, teams]) => ({
      source: `联姻组：${group}`,
      teamNames: Array.from(teams),
    })),
    ...partnerLinks.map(([first, second]) => ({
      source: "联姻队伍配对",
      teamNames: [first, second],
    })),
  ];

  return { members, alliances, warnings };
}

function identityKey(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

export function prepareImportedRoster(parsed: ParsedTeamWorkbook) {
  const members: PreparedImportMember[] = [];
  const errors: string[] = [];
  const warnings = [...parsed.warnings];
  const byUsername = new Map<string, PreparedImportMember>();
  const byName = new Map<string, PreparedImportMember>();

  for (const member of parsed.members) {
    const username = member.username?.trim() ?? "";
    if (!username) {
      errors.push(`${member.sheet} 第 ${member.row} 行：缺少英文名，无法开号`);
      continue;
    }
    if (identityKey(username) === "admin") {
      warnings.push(`${member.sheet} 第 ${member.row} 行：管理员账号不参与导入，已跳过`);
      continue;
    }
    const name = member.name?.trim() || username;
    const next: PreparedImportMember = {
      sheet: member.sheet,
      row: member.row,
      name,
      username,
      teamName: member.teamName,
      track: member.track,
      role: member.isCaptain ? "CAPTAIN" : "PLAYER",
    };
    const usernameKey = identityKey(username);
    const existing = byUsername.get(usernameKey);
    if (existing) {
      if (existing.teamName !== next.teamName) {
        errors.push(`${member.sheet} 第 ${member.row} 行：英文名 ${username} 被分配到不同队伍`);
      } else if (member.name && existing.name !== next.name && existing.name !== existing.username) {
        errors.push(`${member.sheet} 第 ${member.row} 行：英文名 ${username} 对应多个中文名`);
      } else {
        if (member.name && existing.name === existing.username) existing.name = member.name;
        if (next.role === "CAPTAIN") existing.role = "CAPTAIN";
      }
      continue;
    }
    const nameKey = identityKey(name);
    const named = byName.get(nameKey);
    if (named && named.username !== username) {
      errors.push(`${member.sheet} 第 ${member.row} 行：中文名 ${name} 对应多个英文账号`);
      continue;
    }
    byUsername.set(usernameKey, next);
    byName.set(nameKey, next);
    members.push(next);
  }

  if (parsed.members.length === 0) errors.push("未读取到队伍成员数据，请检查表头");
  return { members, errors, warnings };
}
