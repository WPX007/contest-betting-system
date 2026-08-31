export type MarketOption = {
  id: string;
  key?: "home" | "draw" | "away";
  label: string;
  amount: number;
  injectedAmount?: number;
  oddsBps?: number;
  isWinner?: boolean;
};

export type Market = {
  id: string;
  week?: number;
  title: string;
  bestOf: 2 | 3;
  track: "A" | "B";
  home: string;
  away: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeAlliance: string;
  awayAlliance: string;
  time: string;
  scheduledAt?: string;
  closesAt?: string;
  closesIn: string;
  pool: number;
  options: MarketOption[];
  score?: string | null;
  state: "DRAFT" | "OPEN" | "CLOSED" | "PENDING_REVIEW" | "SETTLED" | "VOIDED";
};

export const currentUser = {
  id: "viewer-01",
  name: "演示用户",
  role: "VIEWER",
  betCoin: 1000,
  points: 140,
};

export const markets: Market[] = [
  {
    id: "market-001",
    title: "常规赛第 4 轮 · 系列赛结果",
    bestOf: 2,
    track: "A",
    home: "战队01-A",
    away: "战队06-A",
    homeAlliance: "联姻组01",
    awayAlliance: "联姻组06",
    time: "今天 20:00",
    closesIn: "今天 20:00 自动封盘",
    pool: 8280,
    state: "OPEN",
    options: [
      { id: "home", label: "战队01-A 胜（2:0）", amount: 2560 },
      { id: "draw", label: "平局（1:1）", amount: 3750 },
      { id: "away", label: "战队06-A 胜（0:2）", amount: 1970 },
    ],
  },
  {
    id: "market-002",
    title: "常规赛第 4 轮 · 系列赛结果",
    bestOf: 2,
    track: "A",
    home: "战队02-A",
    away: "战队11-A",
    homeAlliance: "联姻组02",
    awayAlliance: "联姻组11",
    time: "周一 19:00",
    closesIn: "已于周一 18:50 封盘",
    pool: 7360,
    state: "SETTLED",
    options: [
      { id: "home", label: "战队02-A 胜（2:0）", amount: 2860 },
      { id: "draw", label: "平局（1:1）", amount: 2950 },
      { id: "away", label: "战队11-A 胜（0:2）", amount: 1550 },
    ],
  },
  {
    id: "market-003",
    title: "常规赛第 4 轮 · 系列赛结果",
    bestOf: 2,
    track: "A",
    home: "战队03-A",
    away: "战队09-A",
    homeAlliance: "联姻组03",
    awayAlliance: "联姻组09",
    time: "周三 20:00",
    closesIn: "周三 20:00 自动封盘",
    pool: 0,
    state: "OPEN",
    options: [
      { id: "home", label: "战队03-A 胜（2:0）", amount: 0 },
      { id: "draw", label: "平局（1:1）", amount: 0 },
      { id: "away", label: "战队09-A 胜（0:2）", amount: 0 },
    ],
  },
  {
    id: "market-004", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "A",
    home: "战队04-A", away: "战队12-A", homeAlliance: "联姻组04", awayAlliance: "联姻组12",
    time: "周四 20:00", closesIn: "周四 20:00 自动封盘", pool: 4280, state: "OPEN",
    options: [
      { id: "home", label: "战队04-A 胜（2:0）", amount: 1380 },
      { id: "draw", label: "平局（1:1）", amount: 1750 },
      { id: "away", label: "战队12-A 胜（0:2）", amount: 1150 },
    ],
  },
  {
    id: "market-005", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "A",
    home: "战队05-A", away: "战队08-A", homeAlliance: "联姻组05", awayAlliance: "联姻组08",
    time: "周五 19:30", closesIn: "周五 19:30 自动封盘", pool: 0, state: "OPEN",
    options: [
      { id: "home", label: "战队05-A 胜（2:0）", amount: 0 },
      { id: "draw", label: "平局（1:1）", amount: 0 },
      { id: "away", label: "战队08-A 胜（0:2）", amount: 0 },
    ],
  },
  {
    id: "market-006", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "A",
    home: "战队07-A", away: "战队10-A", homeAlliance: "联姻组07", awayAlliance: "联姻组10",
    time: "周六 20:00", closesIn: "周六 20:00 自动封盘", pool: 5890, state: "OPEN",
    options: [
      { id: "home", label: "战队07-A 胜（2:0）", amount: 1900 },
      { id: "draw", label: "平局（1:1）", amount: 2440 },
      { id: "away", label: "战队10-A 胜（0:2）", amount: 1550 },
    ],
  },
  {
    id: "market-007", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "B",
    home: "战队01-B", away: "战队06-B", homeAlliance: "联姻组01", awayAlliance: "联姻组06",
    time: "周一 20:30", closesIn: "已于周一 20:20 封盘", pool: 6680, state: "SETTLED",
    options: [
      { id: "home", label: "战队01-B 胜（2:0）", amount: 2250 },
      { id: "draw", label: "平局（1:1）", amount: 2680 },
      { id: "away", label: "战队06-B 胜（0:2）", amount: 1750 },
    ],
  },
  {
    id: "market-008", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "B",
    home: "战队02-B", away: "战队11-B", homeAlliance: "联姻组02", awayAlliance: "联姻组11",
    time: "今天 19:30", closesIn: "今天 19:30 自动封盘", pool: 7160, state: "OPEN",
    options: [
      { id: "home", label: "战队02-B 胜（2:0）", amount: 2360 },
      { id: "draw", label: "平局（1:1）", amount: 3010 },
      { id: "away", label: "战队11-B 胜（0:2）", amount: 1790 },
    ],
  },
  {
    id: "market-009", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "B",
    home: "战队03-B", away: "战队09-B", homeAlliance: "联姻组03", awayAlliance: "联姻组09",
    time: "今天 21:30", closesIn: "今天 21:30 自动封盘", pool: 6120, state: "OPEN",
    options: [
      { id: "home", label: "战队03-B 胜（2:0）", amount: 2180 },
      { id: "draw", label: "平局（1:1）", amount: 2200 },
      { id: "away", label: "战队09-B 胜（0:2）", amount: 1740 },
    ],
  },
  {
    id: "market-010", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "B",
    home: "战队04-B", away: "战队12-B", homeAlliance: "联姻组04", awayAlliance: "联姻组12",
    time: "周四 21:00", closesIn: "周四 21:00 自动封盘", pool: 0, state: "OPEN",
    options: [
      { id: "home", label: "战队04-B 胜（2:0）", amount: 0 },
      { id: "draw", label: "平局（1:1）", amount: 0 },
      { id: "away", label: "战队12-B 胜（0:2）", amount: 0 },
    ],
  },
  {
    id: "market-011", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "B",
    home: "战队05-B", away: "战队08-B", homeAlliance: "联姻组05", awayAlliance: "联姻组08",
    time: "周五 20:30", closesIn: "周五 20:30 自动封盘", pool: 0, state: "OPEN",
    options: [
      { id: "home", label: "战队05-B 胜（2:0）", amount: 0 },
      { id: "draw", label: "平局（1:1）", amount: 0 },
      { id: "away", label: "战队08-B 胜（0:2）", amount: 0 },
    ],
  },
  {
    id: "market-012", title: "常规赛第 4 轮 · 系列赛结果", bestOf: 2, track: "B",
    home: "战队07-B", away: "战队10-B", homeAlliance: "联姻组07", awayAlliance: "联姻组10",
    time: "周日 20:00", closesIn: "周日 20:00 自动封盘", pool: 0, state: "OPEN",
    options: [
      { id: "home", label: "战队07-B 胜（2:0）", amount: 0 },
      { id: "draw", label: "平局（1:1）", amount: 0 },
      { id: "away", label: "战队10-B 胜（0:2）", amount: 0 },
    ],
  },
];

export const weekOptions = [
  { week: 1, range: "7月27日—8月2日" },
  { week: 2, range: "8月3日—8月9日" },
  { week: 3, range: "8月10日—8月16日" },
  { week: 4, range: "8月17日—8月23日" },
  { week: 5, range: "8月24日—8月30日" },
  { week: 6, range: "8月31日—9月6日" },
  { week: 7, range: "9月7日—9月13日" },
  { week: 8, range: "9月14日—9月20日" },
  { week: 9, range: "9月21日—9月27日" },
  { week: 10, range: "9月28日—10月4日" },
  { week: 11, range: "10月5日—10月11日" },
  { week: 12, range: "10月12日—10月18日" },
  { week: 13, range: "10月19日—10月25日" },
  { week: 14, range: "10月26日—11月1日" },
  { week: 15, range: "11月2日—11月8日" },
];

function pairingsForWeek(week: number) {
  let teams = Array.from({ length: 12 }, (_, index) => index + 1);
  for (let round = 1; round < week; round += 1) {
    teams = [teams[0], teams[teams.length - 1], ...teams.slice(1, -1)];
  }
  return Array.from({ length: 6 }, (_, index) => [teams[index], teams[11 - index]]);
}

export function getMarketsForWeek(week: number): Market[] {
  if (week === 4) return markets;
  if (week >= 5) return [];

  const isPast = week < 4;
  return (["A", "B"] as const).flatMap((track) =>
    pairingsForWeek(week).map(([homeNumber, awayNumber], index) => {
      const home = String(homeNumber).padStart(2, "0");
      const away = String(awayNumber).padStart(2, "0");
      const pool = isPast ? 4800 + week * 310 + index * 270 + (track === "B" ? 420 : 0) : 0;
      const homeAmount = isPast ? Math.floor(pool * 0.34) : 0;
      const drawAmount = isPast ? Math.floor(pool * 0.39) : 0;
      const awayAmount = pool - homeAmount - drawAmount;

      return {
        id: `week-${week}-${track.toLowerCase()}-${index + 1}`,
        week,
        title: `常规赛第 ${week} 轮 · 系列赛结果`,
        bestOf: 2,
        track,
        home: `战队${home}-${track}`,
        away: `战队${away}-${track}`,
        homeAlliance: `联姻组${home}`,
        awayAlliance: `联姻组${away}`,
        time: `周${["一", "二", "三", "四", "五", "六"][index]} ${index % 2 === 0 ? "20:00" : "21:00"}`,
        closesIn: isPast ? "已封盘并完成结算" : "开赛时自动封盘",
        pool,
        state: isPast ? "SETTLED" : "OPEN",
        options: [
          { id: "home", label: `战队${home}-${track} 胜（2:0）`, amount: homeAmount },
          { id: "draw", label: "平局（1:1）", amount: drawAmount },
          { id: "away", label: `战队${away}-${track} 胜（0:2）`, amount: awayAmount },
        ],
      };
    }),
  );
}

export const ledger = [
  { id: "l1", title: "赛季初始发放", amount: 1000, time: "2026-08-18 09:00", type: "income" },
  { id: "l2", title: "每周参与任务", amount: 100, time: "2026-08-18 18:30", type: "income" },
  { id: "l3", title: "常规赛第 3 轮 · 下注", amount: -120, time: "2026-08-17 19:49", type: "expense" },
  { id: "l4", title: "常规赛第 3 轮 · 结算派奖", amount: 20, time: "2026-08-17 21:30", type: "income" },
];

export const rankings = [
  { rank: 1, name: "星野", team: "战队04-B", value: "1,856", points: "520", hits: 16, predictions: 22, rate: "72.7%" },
  { rank: 2, name: "凌川", team: "战队11-A", value: "1,640", points: "420", hits: 14, predictions: 21, rate: "66.7%" },
  { rank: 3, name: "雾岛", team: "战队02-A", value: "1,485", points: "610", hits: 14, predictions: 20, rate: "70.0%" },
  { rank: 4, name: "演示用户", team: "观众", value: "1,000", points: "140", hits: 7, predictions: 12, rate: "58.3%" },
];
