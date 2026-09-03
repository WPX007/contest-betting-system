"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { weekOptions, type Market } from "@/lib/demo-data";
import { apiRequest, ApiError } from "@/lib/api-client";
import { ticketPoolContribution, type ParlayBasePools } from "@/lib/parlay-pool";
import { RECHARGE_PLANS, rechargeCreditedAmount } from "@/lib/recharge-plans";
import { calculateSettlement, validateStake } from "@/lib/settlement";
import { MyBetsPanel, type BetOrder, type ParlayOrder } from "@/components/my-bets-panel";
import { WalletPanel, type HouseTreasury, type WalletEntry } from "@/components/wallet-panel";

type Tab = "竞猜大厅" | "赛程确认" | "我的竞猜" | "竞猜币充值" | "钱包流水" | "排行榜" | "成就奖" | "后台管理设置";
type AdminTab = "MATCH" | "BETS" | "PARLAYS" | "USERS" | "ASSET" | "RECHARGES" | "TREASURY" | "RULES";
type StatusFilter = "ALL" | "OPEN" | "CLOSED" | "SETTLED";
type MatchScope = "TODAY" | "WEEK";
type ParlayMode = "DAILY" | "WEEKLY_A" | "WEEKLY_B";
const parlayScopeLabel = (scope: "DAILY" | "WEEKLY" | "WEEKLY_A" | "WEEKLY_B") => scope === "WEEKLY_A" ? "本周 A 组过关" : scope === "WEEKLY_B" ? "本周 B 组过关" : scope === "WEEKLY" ? "本周过关" : "今日过关";
const parlayPeriodLabel = (scope: "DAILY" | "WEEKLY" | "WEEKLY_A" | "WEEKLY_B", dayKey: string) => scope === "DAILY" ? dayKey : `第 ${dayKey.match(/\d+/)?.[0] ?? ""} 周`;
type RankingSortKey = "value" | "points" | "hits" | "predictions" | "rate";
type MatchOverride = { week: number; track: "A" | "B"; home: string; away: string; time: string };
type RatioConfig = { returnPercent: number; recoveryPercent: number; prizePercent: number };
type PointRewardConfig = { smallGameWinPoints: number; allianceGameWinPoints: number; seriesWinPoints: number };
type WeeklyParlayConfig = { ticket: number; basePool: number; bonusMultiplier: number };
type MatchSchedule = {
  id: string; week: number; track: "A" | "B"; slotIndex: number | null;
  home: string; away: string; homeTeamId: string; awayTeamId: string;
  scheduleStatus: "UNSET" | "PROPOSED" | "CONFIRMED";
  proposedScheduledAt: string | null; scheduledAt: string | null;
  proposedByTeamId: string | null; proposedByTeamName: string | null;
  pairingConfigured: boolean; pairingLockReason: string | null;
  canPropose: boolean; canConfirm: boolean; canConfigurePairing: boolean; canAdminReschedule: boolean;
};
type ManagedUser = { id: string; chineseName: string; englishName: string; team: string; teamId?: string | null; initialCoins: number };
type AdminTeam = { id: string; name: string; track: "A" | "B" };
type SessionUser = { id: string; username: string; displayName: string; team: string; teamId?: string; role: string; isAdmin: boolean; points: number };
type BetRecord = {
  id: string;
  marketId: string;
  week: number;
  userId: string;
  userName: string;
  username: string;
  team: string;
  optionId: string;
  optionLabel: string;
  amount: number;
  createdAt: string;
  recordStatus: "ACTIVE" | "REFUNDED";
};
type RankingEntry = { id: string; rank: number; name: string; username: string; team: string; allianceTeams: string; value: number; points: number; hits: number; predictions: number; rate: number };
type AchievementData = {
  settledMarketCount: number;
  minimumPredictions: number;
  achievements: Array<{
    key: string;
    title: string;
    requirement: string;
    holders: Array<{ id: string; name: string; username: string; team: string; detail: string }>;
  }>;
};
type RechargeRequest = {
  id: string;
  amount: number;
  baseAmount: number;
  bonusAmount: number;
  firstRechargeBonus: number;
  isFirstRecharge: boolean;
  priceMier: number;
  status: "PENDING" | "FIRST_CONFIRMED" | "COMPLETED" | "REJECTED";
  createdAt: string;
  firstConfirmedAt: string | null;
  completedAt: string | null;
};
type AdminRechargeRequest = RechargeRequest & {
  user: { id: string; name: string; username: string; team: string };
  firstConfirmedBy: string | null;
  completedBy: string | null;
};
type AdminRechargeData = {
  totalCompletedAmount: number;
  pendingCount: number;
  requests: AdminRechargeRequest[];
};
type AdminTreasury = HouseTreasury & {
  rakeEntries: Array<{ id: string; amount: number; note: string | null; reference: string; createdAt: string }>;
  marketInjections: Array<{ id: string; amount: number; note: string | null; reference: string; createdAt: string }>;
  parlayRounds: Array<{
    dayKey: string;
    scope: "DAILY" | "WEEKLY" | "WEEKLY_A" | "WEEKLY_B";
    status: string;
    marketCount: number;
    entryCount: number;
    basePool: number;
    carryover: number;
    ticketStake: number;
    ticketContribution: number;
    ticketBonus: number;
    pool: number;
    closesAt: string;
  }>;
};
type TeamImportPreview = {
  fileName: string;
  applied: boolean;
  assignments: Array<{ userId: string; name: string; username: string; fromTeam: string; teamId: string; teamName: string; role?: string }>;
  unassignedUsers: Array<{ id: string; name: string; username: string; fromTeam: string }>;
  alliances: Array<Array<{ id: string; name: string }>>;
  errors: string[];
  warnings: string[];
  summary: {
    assignmentCount: number;
    changedAssignmentCount: number;
    clearedAssignmentCount: number;
    createdUserCount?: number;
    removedUserCount?: number;
    allianceGroupCount: number;
    initialCoins?: number;
  };
};
type ParlayOffer = {
  scope: "DAILY" | "WEEKLY" | "WEEKLY_A" | "WEEKLY_B";
  ticketStake: number;
  basePool: number;
  pool: number;
  ticketPoolBonusMultiplier: number;
  ticketPoolContribution: number;
  closesAt: string;
  frozen: boolean;
  joinedCount: number;
  markets: Array<{
    id: string;
    home: string;
    away: string;
    track: "A" | "B";
    scheduledAt: string | null;
    status: string;
    options: Array<{ id: string; label: string }>;
  }>;
};
type AdminParlayRound = {
  id: string;
  scope: "DAILY" | "WEEKLY" | "WEEKLY_A" | "WEEKLY_B";
  dayKey: string;
  status: string;
  ticketStake: number;
  basePool: number;
  ticketPoolBonusMultiplier: number;
  ticketPoolContribution: number;
  pool: number;
  closesAt: string;
  createdAt: string;
  markets: Array<{ id: string; matchup: string }>;
  participants: Array<{
    orderId: string;
    userId: string;
    name: string;
    username: string;
    team: string;
    stake: number;
    status: string;
    payout: number | null;
    joinedAt: string;
    legs: Array<{ marketId: string; matchup: string; optionLabel: string; status: string }>;
  }>;
};

const money = new Intl.NumberFormat("zh-CN");
const emptyMarket: Market = {
  id: "",
  title: "待配置比赛",
  bestOf: 2,
  track: "A",
  home: "待配置",
  away: "待配置",
  homeAlliance: "",
  awayAlliance: "",
  time: "",
  closesIn: "",
  pool: 0,
  options: [{ id: "", label: "待配置", amount: 0 }],
  state: "CLOSED",
};
const tabs: Tab[] = ["竞猜大厅", "赛程确认", "我的竞猜", "竞猜币充值", "钱包流水", "排行榜", "成就奖", "后台管理设置"];
const adminTabs: AdminTab[] = ["MATCH", "BETS", "PARLAYS", "USERS", "ASSET", "RECHARGES", "TREASURY", "RULES"];
const stateLabels: Record<string, string> = {
  OPEN: "开盘中",
  CLOSED: "已封盘",
  SETTLED: "已结算",
  PENDING_REVIEW: "待复核",
};
const weekDays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function marketTimeOrder(time: string) {
  const dayText = time.startsWith("今天") ? "周二" : weekDays.find((day) => time.startsWith(day));
  const dayIndex = dayText ? weekDays.indexOf(dayText) : 99;
  const clock = time.match(/(\d{1,2}):(\d{2})/);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : 24 * 60;
  return dayIndex * 24 * 60 + minutes;
}

function formatClock(totalMinutes: number) {
  const normalized = (totalMinutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function marketDayKey(time: string) {
  if (time.startsWith("今天")) {
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date());
  }
  return weekDays.find((day) => time.startsWith(day)) ?? "时间待定";
}

function weekDateLabel(week: number, dayIndex: number) {
  const date = new Date(2026, 6, 27 + (week - 1) * 7 + dayIndex);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekCompactRange(week: number) {
  const start = new Date(2026, 6, 27 + (week - 1) * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 5);
  return `${start.getMonth() + 1}.${start.getDate()}-${end.getMonth() + 1}.${end.getDate()}`;
}

function currentCompetitionWeek() {
  const [year, month, day] = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }).split("-").map(Number);
  const daysSinceSeasonStart = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(2026, 6, 27)) / 86_400_000);
  return Math.min(weekOptions.length, Math.max(1, Math.floor(daysSinceSeasonStart / 7) + 1));
}

export function Dashboard() {
  const initialScopeUserId = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("竞猜大厅");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(currentCompetitionWeek);
  const [matchScope, setMatchScope] = useState<MatchScope>("TODAY");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [balance, setBalance] = useState(0);
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [optionId, setOptionId] = useState("");
  const [stake, setStake] = useState(100);
  const [notice, setNotice] = useState("");
  const [marketStatus, setMarketStatus] = useState<Record<string, string>>({});
  const [parlaySelections, setParlaySelections] = useState<Record<string, string>>({});
  const [parlayMode, setParlayMode] = useState<ParlayMode>("DAILY");
  const [parlayJoined, setParlayJoined] = useState(false);
  const [parlayFrozen, setParlayFrozen] = useState(false);
  const [currentMinute, setCurrentMinute] = useState(-1);
  const [parlayTicket, setParlayTicket] = useState(100);
  const [parlayPool, setParlayPool] = useState(50_000);
  const [parlayBasePools, setParlayBasePools] = useState<ParlayBasePools>({ three: 50_000, four: 50_000, five: 50_000, sixPlus: 50_000 });
  const [ticketPoolBonusMultiplier, setTicketPoolBonusMultiplier] = useState(0.5);
  const [parlayTicketContribution, setParlayTicketContribution] = useState(150);
  const [weeklyParlayConfig, setWeeklyParlayConfig] = useState<WeeklyParlayConfig>({ ticket: 100, basePool: 12_000, bonusMultiplier: 0.5 });
  const [weeklyParlayTicket, setWeeklyParlayTicket] = useState(100);
  const [weeklyParlayPool, setWeeklyParlayPool] = useState(12_000);
  const [weeklyParlayContribution, setWeeklyParlayContribution] = useState(150);
  const [weeklyParlayAvailableMarkets, setWeeklyParlayAvailableMarkets] = useState<ParlayOffer["markets"]>([]);
  const [weeklyParlayClosesAt, setWeeklyParlayClosesAt] = useState<string | null>(null);
  const [weeklyParlayJoinedCount, setWeeklyParlayJoinedCount] = useState(0);
  const [weeklyParlayFrozen, setWeeklyParlayFrozen] = useState(false);
  const [weeklyParlayJoined, setWeeklyParlayJoined] = useState(false);
  const [weeklyParlaySelections, setWeeklyParlaySelections] = useState<Record<string, string>>({});
  const [weeklyBParlayConfig, setWeeklyBParlayConfig] = useState<WeeklyParlayConfig>({ ticket: 100, basePool: 12_000, bonusMultiplier: 0.5 });
  const [weeklyBParlayTicket, setWeeklyBParlayTicket] = useState(100);
  const [weeklyBParlayPool, setWeeklyBParlayPool] = useState(12_000);
  const [weeklyBParlayContribution, setWeeklyBParlayContribution] = useState(150);
  const [weeklyBParlayAvailableMarkets, setWeeklyBParlayAvailableMarkets] = useState<ParlayOffer["markets"]>([]);
  const [weeklyBParlayClosesAt, setWeeklyBParlayClosesAt] = useState<string | null>(null);
  const [weeklyBParlayJoinedCount, setWeeklyBParlayJoinedCount] = useState(0);
  const [weeklyBParlayFrozen, setWeeklyBParlayFrozen] = useState(false);
  const [weeklyBParlayJoined, setWeeklyBParlayJoined] = useState(false);
  const [weeklyBParlaySelections, setWeeklyBParlaySelections] = useState<Record<string, string>>({});
  const [ratios, setRatios] = useState<RatioConfig>({ returnPercent: 25, recoveryPercent: 5, prizePercent: 70 });
  const [pointRewards, setPointRewards] = useState<PointRewardConfig>({ smallGameWinPoints: 10, allianceGameWinPoints: 5, seriesWinPoints: 20 });
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [adminTeams, setAdminTeams] = useState<AdminTeam[]>([]);
  const [betRecords, setBetRecords] = useState<BetRecord[]>([]);
  const [serverMarkets, setServerMarkets] = useState<Market[]>([]);
  const [myBets, setMyBets] = useState<BetOrder[]>([]);
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([]);
  const [houseTreasury, setHouseTreasury] = useState<HouseTreasury | null>(null);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [parlayOrders, setParlayOrders] = useState<ParlayOrder[]>([]);
  const [rankingEntries, setRankingEntries] = useState<RankingEntry[]>([]);
  const [achievementData, setAchievementData] = useState<AchievementData | null>(null);
  const [parlayMarketIds, setParlayMarketIds] = useState<string[]>([]);
  const [parlayClosesAt, setParlayClosesAt] = useState<string | null>(null);
  const [parlayJoinedCount, setParlayJoinedCount] = useState(0);
  const [adminParlayRounds, setAdminParlayRounds] = useState<AdminParlayRound[]>([]);
  const [adminRecharges, setAdminRecharges] = useState<AdminRechargeData>({ totalCompletedAmount: 0, pendingCount: 0, requests: [] });
  const [adminTreasury, setAdminTreasury] = useState<AdminTreasury | null>(null);
  const [matchSchedules, setMatchSchedules] = useState<MatchSchedule[]>([]);
  const [submittingBet, setSubmittingBet] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    const dismiss = () => setNotice("");
    window.addEventListener("pointerdown", dismiss);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [notice]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentMinute(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    apiRequest<{ id: string; username: string; displayName: string; role: string; isAdmin: boolean; team: { id: string; name: string } | null; balance: number; points: number }>("/api/auth/session")
      .then((user) => {
        setSessionUser({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, isAdmin: user.isAdmin, team: user.team?.name ?? "无", teamId: user.team?.id, points: user.points });
        setBalance(user.balance);
        const savedTab = window.sessionStorage.getItem(`contest-active-tab:${user.id}`) as Tab | null;
        if (
          savedTab
          && tabs.includes(savedTab)
          && (savedTab !== "后台管理设置" || user.isAdmin)
          && (savedTab !== "赛程确认" || user.role === "CAPTAIN" || user.isAdmin)
          && savedTab !== "竞猜币充值"
        ) setActiveTab(savedTab);
      })
      .catch(() => setSessionUser(null))
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    if (!sessionChecked || !sessionUser) return;
    window.sessionStorage.setItem(`contest-active-tab:${sessionUser.id}`, activeTab);
  }, [activeTab, sessionChecked, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;
    void refreshData(sessionUser.isAdmin);
    const dataTimer = window.setInterval(() => void Promise.all([
      loadMarkets(),
      loadParlayStatus(),
      ...(sessionUser.role === "CAPTAIN" || sessionUser.isAdmin ? [loadMatchSchedules()] : []),
      ...(sessionUser.isAdmin ? [loadAdminParlays(), loadAdminRecharges(), loadAdminTreasury()] : []),
    ]), 30_000);
    const walletTimer = window.setInterval(() => void loadFinancialState(sessionUser.isAdmin), 5_000);
    return () => {
      window.clearInterval(dataTimer);
      window.clearInterval(walletTimer);
    };
    // Session identity is the intended reload boundary; refreshData updates wallet fields on the same user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id]);

  const visibleMarkets = useMemo(() => {
    return serverMarkets
      .filter((market) => (market.week ?? 4) === selectedWeek)
      .sort((first, second) => (first.scheduledAt ?? "").localeCompare(second.scheduledAt ?? ""));
  }, [selectedWeek, serverMarkets]);
  const allConfiguredMarkets = useMemo(
    () => [...serverMarkets].sort((first, second) => ((first.week ?? 4) - (second.week ?? 4)) || (first.scheduledAt ?? "").localeCompare(second.scheduledAt ?? "")),
    [serverMarkets],
  );
  const timelineCurrentWeek = currentCompetitionWeek();
  const currentAdminMarkets = allConfiguredMarkets.filter((market) => (market.week ?? 4) === timelineCurrentWeek);
  const todayDateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date());

  const todayMarkets = useMemo(
    () => visibleMarkets.filter((market) => market.scheduledAt && new Date(market.scheduledAt).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })),
    [visibleMarkets],
  );
  const parlayMarkets = parlayMarketIds.length > 0 ? allConfiguredMarkets.filter((market) => parlayMarketIds.includes(market.id)) : todayMarkets;
  const weeklyOfferMarketView = (offerMarket: ParlayOffer["markets"][number]) => allConfiguredMarkets.find((market) => market.id === offerMarket.id) ?? {
    ...offerMarket,
    time: offerMarket.scheduledAt
      ? new Date(offerMarket.scheduledAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      : "时间待确认",
  };
  const weeklyParlayMarkets = weeklyParlayAvailableMarkets.map(weeklyOfferMarketView);
  const weeklyBParlayMarkets = weeklyBParlayAvailableMarkets.map(weeklyOfferMarketView);
  const weeklyParlayClosed = weeklyParlayClosesAt ? Date.now() >= new Date(weeklyParlayClosesAt).getTime() : true;
  const weeklyBParlayClosed = weeklyBParlayClosesAt ? Date.now() >= new Date(weeklyBParlayClosesAt).getTime() : true;
  const activeWeeklyTrack = parlayMode === "WEEKLY_B" ? "B" : "A";
  const activeWeeklyMarkets = parlayMode === "WEEKLY_B" ? weeklyBParlayMarkets : weeklyParlayMarkets;
  const activeWeeklyTicket = parlayMode === "WEEKLY_B" ? weeklyBParlayTicket : weeklyParlayTicket;
  const activeWeeklyPool = parlayMode === "WEEKLY_B" ? weeklyBParlayPool : weeklyParlayPool;
  const activeWeeklyContribution = parlayMode === "WEEKLY_B" ? weeklyBParlayContribution : weeklyParlayContribution;
  const activeWeeklyClosesAt = parlayMode === "WEEKLY_B" ? weeklyBParlayClosesAt : weeklyParlayClosesAt;
  const activeWeeklyJoinedCount = parlayMode === "WEEKLY_B" ? weeklyBParlayJoinedCount : weeklyParlayJoinedCount;
  const activeWeeklyFrozen = parlayMode === "WEEKLY_B" ? weeklyBParlayFrozen : weeklyParlayFrozen;
  const activeWeeklyJoined = parlayMode === "WEEKLY_B" ? weeklyBParlayJoined : weeklyParlayJoined;
  const activeWeeklyClosed = parlayMode === "WEEKLY_B" ? weeklyBParlayClosed : weeklyParlayClosed;
  const activeWeeklySelections = parlayMode === "WEEKLY_B" ? weeklyBParlaySelections : weeklyParlaySelections;
  const candidateDeadline = todayMarkets.length > 0
    ? Math.min(...todayMarkets.map((market) => marketTimeOrder(market.time) % (24 * 60)))
    : 0;
  const parlayDeadline = parlayClosesAt
    ? new Date(parlayClosesAt).getHours() * 60 + new Date(parlayClosesAt).getMinutes()
    : candidateDeadline;
  const effectiveParlayTicket = parlayTicket;
  const effectiveParlayPool = parlayPool;
  const parlayClosed = parlayClosesAt ? Date.now() >= new Date(parlayClosesAt).getTime() : currentMinute >= 0 && currentMinute >= parlayDeadline;
  const scopeMarkets = matchScope === "TODAY" ? todayMarkets : visibleMarkets;
  const displayedMarkets = useMemo(
    () => statusFilter === "ALL" ? scopeMarkets : scopeMarkets.filter((market) => (marketStatus[market.id] ?? market.state) === statusFilter),
    [marketStatus, scopeMarkets, statusFilter],
  );
  const selectedMarket = displayedMarkets.find((market) => market.id === selectedMarketId) ?? displayedMarkets[0] ?? scopeMarkets[0] ?? visibleMarkets[0] ?? emptyMarket;
  const selectedMarketBets = myBets.filter((bet) => bet.marketId === selectedMarket.id && bet.status === "ACTIVE");
  const lockedOptionId = selectedMarketBets[0]?.optionId;
  const selectedOption = selectedMarket.options.find((option) => option.id === (lockedOptionId ?? optionId)) ?? selectedMarket.options[0];
  const existingMarketStake = selectedMarketBets.reduce((total, bet) => total + bet.stake, 0);
  const selectedState = marketStatus[selectedMarket.id] ?? selectedMarket.state;
  const potential = useMemo(
    () => calculateSettlement({
      totalPool: selectedMarket.pool + stake,
      winnerPool: selectedOption.amount + stake,
      stake,
      returnRatio: ratios.returnPercent / 100,
      prizeRatio: ratios.prizePercent / 100,
    }),
    [ratios, selectedMarket, selectedOption, stake],
  );
  const validation = validateStake(balance, stake);
  const sessionPoints = sessionUser?.points ?? 0;
  const isAdminSession = sessionUser?.isAdmin === true;
  const pendingScheduleConfirmations = matchSchedules.filter((schedule) => schedule.canConfirm).length;
  async function loadMarkets() {
    try {
      const data = await apiRequest<Market[]>("/api/markets");
      setServerMarkets(data);
      setMarketStatus(Object.fromEntries(data.map((market) => [market.id, market.state])));
      const current = data.find((market) => market.id === selectedMarketId) ?? data.find((market) => (market.week ?? 4) === selectedWeek) ?? data[0];
      if (current) {
        setSelectedMarketId(current.id);
        setOptionId((value) => current.options.some((option) => option.id === value) ? value : current.options[0]?.id ?? "");
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setSessionUser(null);
      throw error;
    }
  }

  async function loadParlayStatus() {
    const [offer, weeklyAOffer, weeklyBOffer] = await Promise.all([
      apiRequest<ParlayOffer>("/api/parlays?scope=daily"),
      apiRequest<ParlayOffer>("/api/parlays?scope=weekly_a"),
      apiRequest<ParlayOffer>("/api/parlays?scope=weekly_b"),
    ]);
    setParlayTicket(offer.ticketStake);
    setParlayPool(offer.pool);
    setParlayTicketContribution(offer.ticketPoolContribution);
    setParlayClosesAt(offer.closesAt);
    setParlayMarketIds(offer.markets.map((market) => market.id));
    setParlayFrozen(offer.frozen);
    setParlayJoinedCount(offer.joinedCount);
    setWeeklyParlayTicket(weeklyAOffer.ticketStake);
    setWeeklyParlayPool(weeklyAOffer.pool);
    setWeeklyParlayContribution(weeklyAOffer.ticketPoolContribution);
    setWeeklyParlayClosesAt(weeklyAOffer.closesAt);
    setWeeklyParlayAvailableMarkets(weeklyAOffer.markets);
    setWeeklyParlayFrozen(weeklyAOffer.frozen);
    setWeeklyParlayJoinedCount(weeklyAOffer.joinedCount);
    setWeeklyBParlayTicket(weeklyBOffer.ticketStake);
    setWeeklyBParlayPool(weeklyBOffer.pool);
    setWeeklyBParlayContribution(weeklyBOffer.ticketPoolContribution);
    setWeeklyBParlayClosesAt(weeklyBOffer.closesAt);
    setWeeklyBParlayAvailableMarkets(weeklyBOffer.markets);
    setWeeklyBParlayFrozen(weeklyBOffer.frozen);
    setWeeklyBParlayJoinedCount(weeklyBOffer.joinedCount);
  }

  async function loadMatchSchedules() {
    if (sessionUser?.role !== "CAPTAIN" && !sessionUser?.isAdmin) return;
    setMatchSchedules(await apiRequest<MatchSchedule[]>("/api/match-schedules"));
  }

  async function loadAdminParlays() {
    setAdminParlayRounds(await apiRequest<AdminParlayRound[]>("/api/admin/parlays"));
  }

  async function loadFinancialState(isAdmin: boolean) {
    const [wallet, entries, rankings, achievements, userRecharges, bets] = await Promise.all([
      apiRequest<{ balance: number; points: number; treasury: HouseTreasury | null }>("/api/wallet"),
      apiRequest<WalletEntry[]>("/api/wallet/ledger?pageSize=50"),
      apiRequest<RankingEntry[]>("/api/rankings"),
      apiRequest<AchievementData>("/api/achievements"),
      apiRequest<RechargeRequest[]>("/api/recharges"),
      apiRequest<BetOrder[]>("/api/bets/me?pageSize=50"),
    ]);
    setBalance(wallet.balance);
    setHouseTreasury(wallet.treasury);
    setSessionUser((current) => current ? { ...current, points: wallet.points } : current);
    setWalletEntries(entries);
    setRankingEntries(rankings);
    setAchievementData(achievements);
    setRechargeRequests(userRecharges);
    setMyBets(bets);

    if (isAdmin) {
      const [adminUsers, treasury] = await Promise.all([
        apiRequest<{ users: Array<{ id: string; name: string; username: string; team: { id: string; name: string } | null; balance: number }>; teams: AdminTeam[] }>("/api/admin/users"),
        apiRequest<AdminTreasury>("/api/admin/treasury"),
      ]);
      setManagedUsers(adminUsers.users.map((user) => ({ id: user.id, chineseName: user.name, englishName: user.username, team: user.team?.name ?? "无", teamId: user.team?.id, initialCoins: user.balance })));
      setAdminTeams(adminUsers.teams);
      setAdminTreasury(treasury);
    }
  }

  async function loadRecharges() {
    setRechargeRequests(await apiRequest<RechargeRequest[]>("/api/recharges"));
  }

  async function loadAdminRecharges() {
    setAdminRecharges(await apiRequest<AdminRechargeData>("/api/admin/recharges"));
  }

  async function loadAdminTreasury() {
    setAdminTreasury(await apiRequest<AdminTreasury>("/api/admin/treasury"));
  }

  async function refreshData(isAdmin = sessionUser?.isAdmin ?? false) {
    setLoadingData(true);
    try {
      const [marketData, betData, wallet, entries, parlays, offer, weeklyAOffer, weeklyBOffer, rankingData, achievements, userRecharges] = await Promise.all([
        apiRequest<Market[]>("/api/markets"),
        apiRequest<BetOrder[]>("/api/bets/me?pageSize=50"),
        apiRequest<{ balance: number; points: number; treasury: HouseTreasury | null }>("/api/wallet"),
        apiRequest<WalletEntry[]>("/api/wallet/ledger?pageSize=50"),
        apiRequest<ParlayOrder[]>("/api/parlays/me"),
        apiRequest<ParlayOffer>("/api/parlays?scope=daily"),
        apiRequest<ParlayOffer>("/api/parlays?scope=weekly_a"),
        apiRequest<ParlayOffer>("/api/parlays?scope=weekly_b"),
        apiRequest<RankingEntry[]>("/api/rankings"),
        apiRequest<AchievementData>("/api/achievements"),
        apiRequest<RechargeRequest[]>("/api/recharges"),
      ]);
      setServerMarkets(marketData);
      setMarketStatus(Object.fromEntries(marketData.map((market) => [market.id, market.state])));
      if (sessionUser && initialScopeUserId.current !== sessionUser.id) {
        const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
        const initialTodayMarkets = marketData.filter(
          (market) => market.scheduledAt
            && new Date(market.scheduledAt).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) === todayKey,
        );
        const initialWeek = initialTodayMarkets[0]?.week ?? currentCompetitionWeek();
        const initialMarkets = initialTodayMarkets.length > 0
          ? initialTodayMarkets
          : marketData.filter((market) => (market.week ?? 4) === initialWeek);
        setSelectedWeek(initialWeek);
        setMatchScope(initialTodayMarkets.length > 0 ? "TODAY" : "WEEK");
        setStatusFilter("ALL");
        setSelectedMarketId(initialMarkets[0]?.id ?? "");
        setOptionId(initialMarkets[0]?.options[0]?.id ?? "");
        initialScopeUserId.current = sessionUser.id;
      }
      setMyBets(betData);
      setBalance(wallet.balance);
      setHouseTreasury(wallet.treasury);
      setSessionUser((current) => current ? { ...current, points: wallet.points } : current);
      setWalletEntries(entries);
      setParlayOrders(parlays);
      setRankingEntries(rankingData);
      setAchievementData(achievements);
      setRechargeRequests(userRecharges);
      setParlayTicket(offer.ticketStake);
      setParlayPool(offer.pool);
      setParlayTicketContribution(offer.ticketPoolContribution);
      setParlayClosesAt(offer.closesAt);
      setParlayMarketIds(offer.markets.map((market) => market.id));
      setParlayFrozen(offer.frozen);
      setParlayJoinedCount(offer.joinedCount);
      setWeeklyParlayTicket(weeklyAOffer.ticketStake);
      setWeeklyParlayPool(weeklyAOffer.pool);
      setWeeklyParlayContribution(weeklyAOffer.ticketPoolContribution);
      setWeeklyParlayClosesAt(weeklyAOffer.closesAt);
      setWeeklyParlayAvailableMarkets(weeklyAOffer.markets);
      setWeeklyParlayFrozen(weeklyAOffer.frozen);
      setWeeklyParlayJoinedCount(weeklyAOffer.joinedCount);
      setWeeklyBParlayTicket(weeklyBOffer.ticketStake);
      setWeeklyBParlayPool(weeklyBOffer.pool);
      setWeeklyBParlayContribution(weeklyBOffer.ticketPoolContribution);
      setWeeklyBParlayClosesAt(weeklyBOffer.closesAt);
      setWeeklyBParlayAvailableMarkets(weeklyBOffer.markets);
      setWeeklyBParlayFrozen(weeklyBOffer.frozen);
      setWeeklyBParlayJoinedCount(weeklyBOffer.joinedCount);
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      setParlayJoined(parlays.some((order) => order.scope === "DAILY" && order.dayKey === todayKey && order.status === "ACTIVE"));
      setWeeklyParlayJoined(parlays.some((order) => order.scope === "WEEKLY_A" && order.dayKey === `week-${currentCompetitionWeek()}-A` && order.status === "ACTIVE"));
      setWeeklyBParlayJoined(parlays.some((order) => order.scope === "WEEKLY_B" && order.dayKey === `week-${currentCompetitionWeek()}-B` && order.status === "ACTIVE"));
      if (isAdmin) {
        const [adminUsers, adminBets, settings, parlayRounds, rechargeData, treasuryData] = await Promise.all([
          apiRequest<{ users: Array<{ id: string; name: string; username: string; team: { id: string; name: string } | null; balance: number }>; teams: AdminTeam[] }>("/api/admin/users"),
          apiRequest<BetRecord[]>("/api/admin/bets"),
          apiRequest<{ parlayTicket: number; parlayBasePools: ParlayBasePools; ticketPoolBonusMultiplier: number; weeklyParlayA: WeeklyParlayConfig; weeklyParlayB: WeeklyParlayConfig; ratios: RatioConfig; pointRewards: PointRewardConfig }>("/api/admin/settings"),
          apiRequest<AdminParlayRound[]>("/api/admin/parlays"),
          apiRequest<AdminRechargeData>("/api/admin/recharges"),
          apiRequest<AdminTreasury>("/api/admin/treasury"),
        ]);
        setManagedUsers(adminUsers.users.map((user) => ({ id: user.id, chineseName: user.name, englishName: user.username, team: user.team?.name ?? "无", teamId: user.team?.id, initialCoins: user.balance })));
        setAdminTeams(adminUsers.teams);
        setBetRecords(adminBets);
        setParlayTicket(settings.parlayTicket);
        setParlayBasePools(settings.parlayBasePools);
        setTicketPoolBonusMultiplier(settings.ticketPoolBonusMultiplier);
        setWeeklyParlayConfig(settings.weeklyParlayA);
        setWeeklyBParlayConfig(settings.weeklyParlayB);
        setRatios(settings.ratios);
        setPointRewards(settings.pointRewards);
        setAdminParlayRounds(parlayRounds);
        setAdminRecharges(rechargeData);
        setAdminTreasury(treasuryData);
        setMatchSchedules(await apiRequest<MatchSchedule[]>("/api/match-schedules"));
      } else if (sessionUser) {
        if (sessionUser.role === "CAPTAIN") setMatchSchedules(await apiRequest<MatchSchedule[]>("/api/match-schedules"));
        setBetRecords(betData.map((order) => ({
          id: order.id,
          marketId: order.marketId,
          week: order.week,
          userId: sessionUser.id,
          userName: sessionUser.displayName,
          username: sessionUser.username,
          team: sessionUser.team,
          optionId: order.optionId,
          optionLabel: order.optionLabel,
          amount: order.stake,
          createdAt: order.createdAt,
          recordStatus: order.status === "REFUNDED" ? "REFUNDED" : "ACTIVE",
        })));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setSessionUser(null);
      else setNotice(error instanceof Error ? error.message : "数据加载失败");
    } finally {
      setLoadingData(false);
    }
  }

  async function login(username: string, password: string) {
    try {
      const user = await apiRequest<{ id: string; username: string; displayName: string; role: string; isAdmin: boolean; team: { id: string; name: string } | null; balance: number; points: number }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      initialScopeUserId.current = null;
      setSessionUser({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, isAdmin: user.isAdmin, team: user.team?.name ?? "无", teamId: user.team?.id, points: user.points });
      setBalance(user.balance);
      setActiveTab("竞猜大厅");
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "登录失败";
    }
  }

  async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setSessionUser(null);
    setActiveTab("竞猜大厅");
    setNotice("");
  }

  async function changePassword() {
    const currentPassword = window.prompt("请输入当前密码");
    if (!currentPassword) return;
    const newPassword = window.prompt("请输入至少 6 位新密码");
    if (!newPassword) return;
    const confirmation = window.prompt("请再次输入新密码");
    if (confirmation !== newPassword) {
      setNotice("两次输入的新密码不一致。");
      return;
    }
    try {
      await apiRequest("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSessionUser(null);
      setNotice("");
      window.alert("密码已修改，请使用新密码重新登录。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "修改密码失败");
    }
  }

  async function exchangePoints(points: number) {
    const coins = points * 5;
    if (!window.confirm(`确认使用 ${money.format(points)} 点券兑换 ${money.format(coins)} 竞猜币？兑换后不能反向换回点券。`)) return false;
    try {
      const result = await apiRequest<{ pointsSpent: number; coinsReceived: number; pointsBalance: number; coinBalance: number }>("/api/wallet/exchange", {
        method: "POST",
        body: JSON.stringify({ points, idempotencyKey: createIdempotencyKey() }),
      });
      setBalance(result.coinBalance);
      setSessionUser((current) => current ? { ...current, points: result.pointsBalance } : current);
      await loadFinancialState(false);
      setNotice(`兑换成功：${money.format(result.pointsSpent)} 点券已兑换为 ${money.format(result.coinsReceived)} 竞猜币。`);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "点券兑换失败");
      return false;
    }
  }

  async function submitRecharge(baseAmount: number) {
    const plan = RECHARGE_PLANS.find((item) => item.baseAmount === baseAmount);
    if (!plan) {
      setNotice("请选择有效的充值套餐。");
      return;
    }
    const isFirstRecharge = !rechargeRequests.some((request) => request.status === "COMPLETED" && request.baseAmount === plan.baseAmount);
    const creditedAmount = rechargeCreditedAmount(plan, isFirstRecharge);
    const firstRechargeText = isFirstRecharge ? `，首充双倍奖励 ${money.format(plan.baseAmount)} 竞猜币` : "";
    if (!window.confirm(`确认支付 ${money.format(plan.priceMier)} 米儿购买 ${money.format(plan.baseAmount)} 竞猜币，档位赠送 ${money.format(plan.bonusAmount)} 竞猜币${firstRechargeText}？共到账 ${money.format(creditedAmount)} 竞猜币，提交后将等待管理员确认。`)) return;
    try {
      await apiRequest("/api/recharges", {
        method: "POST",
        body: JSON.stringify({ baseAmount }),
      });
      await loadRecharges();
      setNotice(`已提交充值申请，审核通过后到账 ${money.format(creditedAmount)} 竞猜币。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交充值申请失败");
    }
  }

  async function reviewRecharge(rechargeId: string, action: "FIRST_CONFIRM" | "FINAL_CONFIRM" | "ONE_CLICK_CONFIRM" | "REJECT") {
    try {
      await apiRequest("/api/admin/recharges", {
        method: "PATCH",
        body: JSON.stringify({ rechargeId, action }),
      });
      await Promise.all([refreshData(true), loadAdminRecharges()]);
      setNotice(action === "FIRST_CONFIRM" ? "首次确认已完成，请进行第二次确认后发放。" : action === "FINAL_CONFIRM" ? "二次确认完成，竞猜币已发放到用户账户。" : action === "ONE_CLICK_CONFIRM" ? "一键审核完成，竞猜币已发放到用户账户。" : "充值申请已驳回。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "充值审核失败");
    }
  }

  function chooseMarket(id: string) {
    const market = visibleMarkets.find((item) => item.id === id);
    if (!market) return;
    setSelectedMarketId(id);
    const existingBet = myBets.find((bet) => bet.marketId === id && bet.status === "ACTIVE");
    setOptionId(existingBet?.optionId ?? market.options[0].id);
    setNotice("");
  }

  function changeWeek(week: number) {
    const nextWeek = Math.min(weekOptions.length, Math.max(1, week));
    const nextMarkets = serverMarkets.filter((market) => (market.week ?? 4) === nextWeek);
    setSelectedWeek(nextWeek);
    setMatchScope("WEEK");
    setStatusFilter("ALL");
    setParlaySelections({});
    setSelectedMarketId(nextMarkets[0]?.id ?? "");
    setOptionId(nextMarkets[0]?.options[0]?.id ?? "");
    setNotice("");
  }

  function changeMatchScope(scope: MatchScope) {
    const nextMarkets = scope === "TODAY" ? todayMarkets : visibleMarkets;
    if (nextMarkets.length === 0) return;
    setMatchScope(scope);
    setStatusFilter("ALL");
    setSelectedMarketId(nextMarkets[0].id);
    setOptionId(nextMarkets[0].options[0].id);
    setNotice("");
  }

  async function joinParlay() {
    if (isAdminSession) {
      setNotice("管理员账号仅用于管理与核对，不能参与过关竞猜。");
      return;
    }
    if (parlayJoined) return;
    if (parlayClosed) {
      setNotice(`本期过关已于 ${formatClock(parlayDeadline)} 截止，现已自动封盘，不能继续入场。`);
      return;
    }
    if (parlayMarkets.some((market) => !parlaySelections[market.id])) {
      setNotice("请先选择今日全部比赛的预测结果，再提交过关竞猜。");
      return;
    }
    if (balance < effectiveParlayTicket) {
      setNotice(`竞猜币余额不足，参与今日过关需要 ${effectiveParlayTicket} 竞猜币。`);
      return;
    }
    try {
      const dayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      await apiRequest("/api/parlays", {
        method: "POST",
        body: JSON.stringify({
          scope: "DAILY",
          idempotencyKey: createIdempotencyKey(),
          dayKey,
          selections: parlayMarkets.map((market) => ({ marketId: market.id, optionId: parlaySelections[market.id] })),
        }),
      });
      await refreshData(false);
      setNotice(`过关竞猜已受理；今日 ${parlayMarkets.length} 场选择已冻结。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "过关提交失败");
    }
  }

  async function joinWeeklyParlay() {
    if (isAdminSession) {
      setNotice("管理员账号仅用于管理与核对，不能参与本周串关。");
      return;
    }
    if (activeWeeklyJoined) return;
    if (activeWeeklyMarkets.length !== 6) {
      setNotice(`本周 ${activeWeeklyTrack} 组 6 场比赛时间尚未全部确认，本周串关暂未开放。`);
      return;
    }
    if (activeWeeklyClosed) {
      setNotice("本周串关已于最早一场比赛开赛时截止。");
      return;
    }
    if (activeWeeklyMarkets.some((market) => !activeWeeklySelections[market.id])) {
      setNotice(`请先为本周 ${activeWeeklyTrack} 组全部 6 场比赛选择预测结果。`);
      return;
    }
    if (balance < activeWeeklyTicket) {
      setNotice(`竞猜币余额不足，参与本周 ${activeWeeklyTrack} 组过关需要 ${activeWeeklyTicket} 竞猜币。`);
      return;
    }
    try {
      await apiRequest("/api/parlays", {
        method: "POST",
        body: JSON.stringify({
          scope: parlayMode,
          dayKey: `week-${currentCompetitionWeek()}-${activeWeeklyTrack}`,
          idempotencyKey: createIdempotencyKey(),
          selections: activeWeeklyMarkets.map((market) => ({ marketId: market.id, optionId: activeWeeklySelections[market.id] })),
        }),
      });
      await refreshData(false);
      setNotice(`本周 ${activeWeeklyTrack} 组串关已受理，6 场选择与奖池参数已冻结。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "本周串关提交失败");
    }
  }

  function changeStatusFilter(filter: StatusFilter) {
    const nextFilter = statusFilter === filter ? "ALL" : filter;
    const nextMarkets = nextFilter === "ALL"
      ? scopeMarkets
      : scopeMarkets.filter((market) => (marketStatus[market.id] ?? market.state) === nextFilter);
    if (nextMarkets.length === 0) return;
    setStatusFilter(nextFilter);
    setSelectedMarketId(nextMarkets[0].id);
    setOptionId(nextMarkets[0].options[0].id);
    setNotice("");
  }

  async function placeBet() {
    if (!sessionUser) return;
    if (sessionUser.isAdmin) {
      setNotice("管理员账号仅用于管理与核对，不能参与单场竞猜。");
      return;
    }
    if (selectedState !== "OPEN") {
      setNotice(`该场比赛当前为“${stateLabels[selectedState]}”，暂时不能下注。`);
      return;
    }
    if (!validation.valid) {
      setNotice(validation.message);
      return;
    }
    if (!window.confirm(`确认下注 ${stake} 竞猜币？\n${selectedMarket.home} vs ${selectedMarket.away}\n预测：${selectedOption.label}`)) return;
    setSubmittingBet(true);
    try {
      const receipt = await apiRequest<{ acceptedOdds: number; balanceAfter: number }>("/api/bets", {
        method: "POST",
        body: JSON.stringify({
          marketId: selectedMarket.id,
          optionId: selectedOption.id,
          stake,
          idempotencyKey: createIdempotencyKey(),
        }),
      });
      setBalance(receipt.balanceAfter);
      await refreshData(false);
      setNotice(`${lockedOptionId ? "加注" : "竞猜"}已受理：${selectedOption.label}，受理赔率 ${receipt.acceptedOdds.toFixed(2)}×，${lockedOptionId ? "加注" : "下注"} ${stake} 竞猜币。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "下注失败");
    } finally {
      setSubmittingBet(false);
    }
  }

  async function updateMarket(id: string, status: string) {
    const market = allConfiguredMarkets.find((item) => item.id === id);
    try {
      await apiRequest("/api/admin/markets", {
        method: "PATCH",
        body: JSON.stringify({ action: "STATUS", ids: [id], status }),
      });
      await refreshData(true);
      setNotice(`${market ? `${market.home} vs ${market.away}` : id} 已更新为“${stateLabels[status] ?? status}”。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "盘口更新失败");
    }
  }

  async function proposeSchedule(matchId: string, scheduledAt: string) {
    try {
      await apiRequest("/api/match-schedules", {
        method: "POST",
        body: JSON.stringify({ action: "PROPOSE", matchId, scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      await loadMatchSchedules();
      setNotice("比赛时间已提交，等待另一方队长确认。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交比赛时间失败");
    }
  }

  async function confirmSchedule(matchId: string) {
    try {
      await apiRequest("/api/match-schedules", {
        method: "POST",
        body: JSON.stringify({ action: "CONFIRM", matchId }),
      });
      await Promise.all([loadMatchSchedules(), loadMarkets(), loadParlayStatus()]);
      setNotice("比赛时间已确认并生效，竞猜盘口已自动开放。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "确认比赛时间失败");
    }
  }

  async function adminReschedule(matchId: string, scheduledAt: string) {
    try {
      await apiRequest("/api/admin/markets", {
        method: "PATCH",
        body: JSON.stringify({ action: "RESCHEDULE", matchId, scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      await Promise.all([refreshData(true), loadMatchSchedules()]);
      setNotice("管理员时间已生效并锁定，队长端的待确认时间已失效。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "管理员修改比赛时间失败");
    }
  }

  async function adminConfigurePairing(matchId: string, homeTeamId: string, awayTeamId: string) {
    try {
      await apiRequest("/api/admin/markets", {
        method: "PATCH",
        body: JSON.stringify({ action: "PAIRING", matchId, homeTeamId, awayTeamId }),
      });
      await Promise.all([refreshData(true), loadMatchSchedules()]);
      setNotice("对阵双方已保存，双方队长现在可以设置并确认比赛时间。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存固定对阵失败");
    }
  }

  async function settleAdminMarket(marketId: string, homeScore: number, awayScore: number) {
    try {
      const result = await apiRequest<{ totalPool: number; winnerPool: number; settledBets: number; pointRewardRecipients: number; totalPointRewards: number }>("/api/admin/markets", {
        method: "PATCH",
        body: JSON.stringify({ action: "SETTLE", marketId, homeScore, awayScore }),
      });
      await refreshData(true);
      setNotice(`比赛已完成结算：比分 ${homeScore}:${awayScore}，处理 ${result.settledBets} 笔竞猜币订单；向 ${result.pointRewardRecipients} 人累计发放 ${money.format(result.totalPointRewards)} 点券。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "比赛结算失败");
    }
  }

  async function updateMarketBatch(ids: string[], status: string, scope: string) {
    if (status === "SETTLED") {
      setNotice("批量结算需要每场分别选择获胜选项和填写比分，请逐场结算。");
      return;
    }
    try {
      await apiRequest("/api/admin/markets", {
        method: "PATCH",
        body: JSON.stringify({ action: "STATUS", ids, status }),
      });
      await refreshData(true);
      setNotice(`${scope}共 ${ids.length} 场比赛已批量更新为“${stateLabels[status] ?? status}”。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量更新失败");
    }
  }

  async function configureMatch(id: string, config: MatchOverride) {
    const homeTeam = adminTeams.find((team) => team.name === config.home && team.track === config.track);
    const awayTeam = adminTeams.find((team) => team.name === config.away && team.track === config.track);
    if (!homeTeam || !awayTeam) {
      setNotice("所选队伍已不存在，请刷新后重新选择最新队伍。");
      return;
    }
    const dayIndex = Math.max(0, weekDays.findIndex((day) => config.time.startsWith(day)));
    const clock = config.time.match(/(\d{1,2}):(\d{2})/);
    const scheduledAt = new Date(2026, 6, 27 + (config.week - 1) * 7 + dayIndex, Number(clock?.[1] ?? 20), Number(clock?.[2] ?? 0));
    try {
      await apiRequest("/api/admin/markets", {
        method: id === "blank" ? "POST" : "PATCH",
        body: JSON.stringify({
          ...(id === "blank" ? {} : { action: "CONFIGURE", marketId: id }),
          week: config.week,
          track: config.track,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
      await refreshData(true);
      setNotice(`第 ${config.week} 周 ${config.time} 已配置为 ${config.home} 对阵 ${config.away}；旧订单如有下注已自动退款。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "比赛配置失败");
    }
  }

  async function adjustCoins(targetType: "USER" | "TEAM", target: string, action: "GRANT" | "DEDUCT", amount: number) {
    try {
      await apiRequest("/api/admin/wallet", {
        method: "POST",
        body: JSON.stringify({ targetType, target, action, amount, reason: "运营调整" }),
      });
      await refreshData(true);
      setNotice(`已${action === "GRANT" ? "发放" : "扣除"} ${money.format(amount)} 竞猜币。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "竞猜币调整失败");
    }
  }

  async function saveParlaySettings(ticket: number, basePools: ParlayBasePools, bonusMultiplier: number) {
    try {
      await apiRequest("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          parlayTicket: ticket,
          parlayBasePools: basePools,
          ticketPoolBonusMultiplier: bonusMultiplier,
        }),
      });
      await refreshData(true);
      setNotice(`过关参数已更新：门票 ${money.format(ticket)}，每张门票向奖池增加 ${money.format(ticketPoolContribution(ticket, Math.round(bonusMultiplier * 10_000)))} 竞猜币；已冻结期次不受影响。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存过关参数失败");
    }
  }

  async function saveWeeklyParlaySettings(track: "A" | "B", config: WeeklyParlayConfig) {
    try {
      await apiRequest("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(track === "A" ? { weeklyParlayA: config } : { weeklyParlayB: config }),
      });
      await refreshData(true);
      setNotice(`本周 ${track} 组串关参数已更新：门票 ${money.format(config.ticket)}、基础奖池 ${money.format(config.basePool)}、门票加成 ${config.bonusMultiplier}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存本周串关参数失败");
    }
  }

  async function saveRatios(config: RatioConfig) {
    try {
      await apiRequest("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ ratios: config }) });
      await refreshData(true);
      setNotice(`结算比例已更新：返还 ${config.returnPercent}%、后台抽水 ${config.recoveryPercent}%、用户奖励 ${config.prizePercent}%。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存结算比例失败");
    }
  }

  async function savePointRewards(config: PointRewardConfig) {
    try {
      await apiRequest("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ pointRewards: config }) });
      await refreshData(true);
      setNotice(`点券奖励参数已更新：小局 ${config.smallGameWinPoints}、联姻加成 ${config.allianceGameWinPoints}、BO2/BO3 胜场 ${config.seriesWinPoints}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存点券奖励参数失败");
    }
  }

  async function saveClosedOdds(marketId: string, odds: Record<string, number>, reason: string) {
    const market = allConfiguredMarkets.find((item) => item.id === marketId);
    if (!market) return;
    const byOptionId = Object.fromEntries(market.options.map((option) => [option.id, odds[option.key ?? "away"]]));
    try {
      await apiRequest("/api/admin/markets", { method: "PATCH", body: JSON.stringify({ action: "ODDS", marketId, odds: byOptionId, reason }) });
      await refreshData(true);
      setNotice("封盘赔率已调整并锁定，修改原因与操作人已写入审计记录。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "赔率调整失败");
    }
  }

  async function injectMarketLiquidity(marketId: string, injections: Array<{ optionId: string; amount: number }>) {
    try {
      const total = injections.reduce((sum, item) => sum + item.amount, 0);
      await apiRequest("/api/admin/markets", {
        method: "PATCH",
        body: JSON.stringify({
          action: "LIQUIDITY",
          marketId,
          injections,
          idempotencyKey: createIdempotencyKey(),
        }),
      });
      await refreshData(true);
      setNotice(`已向该盘口注入 ${money.format(total)} 竞猜币，各结果奖池与赔率已更新。`);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "盘口注入失败");
      return false;
    }
  }

  async function importTeamWorkbook(file: File, action: "preview" | "apply") {
    const form = new FormData();
    form.set("file", file);
    form.set("action", action);
    const result = await apiRequest<TeamImportPreview>("/api/admin/team-import", {
      method: "POST",
      body: form,
    });
    if (result.applied) {
      await refreshData(true);
      setNotice(`表格已覆盖为真实名单：新建 ${result.summary.createdUserCount ?? result.summary.assignmentCount} 个账号，删除 ${result.summary.removedUserCount ?? result.summary.clearedAssignmentCount} 名旧用户。账号为英文名，密码 000000。`);
    }
    return result;
  }

  async function addManagedUser(user: Omit<ManagedUser, "id">) {
    if (managedUsers.some((item) => item.chineseName === user.chineseName || item.englishName.toLowerCase() === user.englishName.toLowerCase())) {
      setNotice("中文名或英文名已存在，请检查后重新填写。");
      return;
    }
    try {
      await apiRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name: user.chineseName, username: user.englishName, teamId: user.team === "无" ? null : user.teamId, initialCoins: user.initialCoins }),
      });
      await refreshData(true);
      setNotice(`用户“${user.chineseName} / ${user.englishName}”已添加，初始密码为 000000。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "添加用户失败");
    }
  }

  async function deleteManagedUser(id: string) {
    const target = managedUsers.find((user) => user.id === id);
    try {
      await apiRequest(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshData(true);
      setNotice(`用户“${target?.chineseName ?? id}”已删除。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除用户失败");
    }
  }

  async function resetManagedUserPassword(id: string) {
    try {
      await apiRequest("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId: id, action: "RESET_PASSWORD" }),
      });
      setNotice("密码已重置为 000000，该用户的旧登录会话已全部失效。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重置密码失败");
    }
  }

  function renderMarketCard(market: Market) {
    const state = marketStatus[market.id] ?? market.state;
    const ownBets = myBets.filter((bet) => bet.marketId === market.id && bet.status !== "REFUNDED" && bet.status !== "VOIDED");
    const ownBetAmount = ownBets.reduce((total, bet) => total + bet.stake, 0);
    const ownBetLabels = Array.from(new Set(ownBets.map((bet) => bet.optionLabel))).join("、");
    const ownPayout = ownBets.reduce((total, bet) => total + (bet.payout ?? 0), 0);
    const ownProfit = ownPayout - ownBetAmount;
    const showOwnProfit = state === "SETTLED" && ownBetAmount > 0 && ownBets.every((bet) => bet.status === "SETTLED");
    const hasExactStartTime = /\d{1,2}:\d{2}/.test(market.time);
    const finalScore = state === "SETTLED"
      ? market.score ?? "待定"
      : null;
    const scoreParts = finalScore?.match(/\d+/g)?.map(Number);
    const settledOutcome = scoreParts?.length === 2
      ? scoreParts[0] === scoreParts[1] ? "draw" : scoreParts[0] > scoreParts[1] ? "home" : "away"
      : null;
    return (
      <button className={`market-card card-state-${state.toLowerCase().replace("_", "-")}${market.id === selectedMarket.id ? " selected" : ""}`} key={market.id} onClick={() => chooseMarket(market.id)}>
        <div className="market-meta">
          <span className={`track track-${market.track.toLowerCase()}`}>{market.track} 赛道</span>
          <span>{market.bestOf === 2 ? "BO2" : "BO3"}</span>
          <b className={`market-state key-market-state state-${state.toLowerCase().replace("_", "-")}`}>{stateLabels[state]}</b>
        </div>
        <div className="market-center-time"><span className="time-icon" aria-hidden="true">⏰</span><strong className={hasExactStartTime ? "" : "warning-value"}>{hasExactStartTime ? market.time : "待定"}</strong></div>
        <div className="compact-teams">
          <strong>{market.home}</strong>
          <span className={finalScore ? "key-final-score" : ""}>{finalScore ?? "VS"}</span>
          <strong>{market.away}</strong>
          {settledOutcome && <i className={`settlement-watermark result-${settledOutcome}`} aria-label={settledOutcome === "draw" ? "平局" : settledOutcome === "home" ? "主队胜" : "客队胜"}>{settledOutcome === "draw" ? "平" : "胜"}</i>}
        </div>
        <div className="market-essentials">
          <div className="key-pool"><strong>竞猜奖池 {market.pool > 0 ? money.format(market.pool) : "待开放"}</strong></div>
          <div className={`key-own-bet ${ownBetAmount > 0 ? "has-bet" : "no-bet"}`}><strong>我的押注 {money.format(ownBetAmount)}</strong></div>
        </div>
        <div className="odds-row">
          {market.options.map((option) => (
            <span key={option.id}>
              <small>{option.key === "home" || option.id === "home" ? "主胜" : option.key === "draw" || option.id === "draw" ? "平局" : "客胜"}</small>
              <b>{option.oddsBps ? (option.oddsBps / 10000).toFixed(2) : option.amount > 0 ? (ratios.returnPercent / 100 + ratios.prizePercent / 100 * market.pool / option.amount).toFixed(2) : "—"}</b>
            </span>
          ))}
        </div>
        {showOwnProfit
          ? <div className={`personal-profit ${ownProfit > 0 ? "profit-positive" : ownProfit < 0 ? "profit-negative" : "profit-neutral"}`}>
            <span>本场净盈亏</span>
            <strong>{ownProfit > 0 ? "+" : ""}{money.format(ownProfit)}</strong>
            <small>预测 {ownBetLabels} · 押注 {money.format(ownBetAmount)} · 到账 {money.format(ownPayout)}</small>
          </div>
          : ownBetAmount > 0 && <div className="personal-result"><span className="has-bet">{ownBetLabels}</span></div>}
      </button>
    );
  }

  if (!sessionChecked) {
    return <main className="login-page"><section className="login-card loading-card">正在恢复登录会话…</section></main>;
  }

  if (!sessionUser) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">竞</span>
          <div><strong>赛点</strong><small>内部赛事竞猜</small></div>
        </div>
        <nav>
          {([
            "竞猜大厅",
            ...(sessionUser.role === "CAPTAIN" ? ["赛程确认" as Tab] : []),
            "我的竞猜",
            "钱包流水",
            "排行榜",
            "成就奖",
            ...(sessionUser.isAdmin ? ["后台管理设置" as Tab] : []),
          ] as Tab[]).map((tab) => (
            <button key={tab} className={activeTab === tab ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(tab)}>
              {tab}{tab === "赛程确认" && pendingScheduleConfirmations > 0 && <i className="nav-alert-dot" title={`${pendingScheduleConfirmations} 场比赛待确认`} aria-label={`${pendingScheduleConfirmations} 场比赛待确认`} />}
            </button>
          ))}
        </nav>
        <div className="risk-card">
          <strong>封闭式虚拟积分</strong>
          <span>不可购买、提现或转赠</span>
        </div>
        <div className="profile">
          <span className="avatar">{sessionUser.displayName.slice(0, 1)}</span>
          <div><strong>{sessionUser.displayName}</strong><small>{sessionUser.isAdmin ? "管理员账号" : `${sessionUser.team} · ${sessionUser.role === "CAPTAIN" ? "队长" : "普通用户"}`}</small></div>
          <button className="logout-button" onClick={changePassword}>改密</button>
          <button className="logout-button" onClick={logout}>退出</button>
        </div>
      </aside>

      <section className="content">
        {process.env.NEXT_PUBLIC_APP_ENV === "local-test" && <div className="test-environment-banner">本地自测环境 · 所有操作仅写入独立测试数据库，不影响正式数据</div>}
        <header className="topbar">
          <div>
            <p className="eyebrow">2027年“策划杯”秋季赛</p>
            <h1>{activeTab}</h1>
          </div>
          <div className="balances">
            <div><span>{isAdminSession ? "后台净额" : "竞猜币"}</span><strong>{money.format(balance)}</strong></div>
            <div><span>点券</span><strong>{money.format(sessionPoints)}</strong></div>
            <div className="total-value"><span>总价值</span><strong>{(balance / 50 + sessionPoints / 10).toFixed(1)}</strong></div>
          </div>
        </header>

        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示">×</button><small>点击任意位置关闭</small></div>}

        {activeTab === "竞猜大厅" && (
          <div className="grid-layout">
            <section>
              <div className="match-scope-tabs">
                <button disabled={todayMarkets.length === 0} className={matchScope === "TODAY" ? "active" : ""} onClick={() => changeMatchScope("TODAY")}>今日对战 <span>{todayMarkets.length}</span></button>
                <button className={matchScope === "WEEK" ? "active" : ""} onClick={() => changeMatchScope("WEEK")}>本周对战 <span>{visibleMarkets.length}</span></button>
              </div>
              <div className="section-heading week-heading">
                <div><p className="eyebrow">{matchScope === "TODAY" ? `今天 · ${todayDateLabel}` : `第 ${selectedWeek} 周 · ${weekOptions[selectedWeek - 1].range}`}</p><h2>{matchScope === "TODAY" ? "今日全部对战" : "本周全部对战"}</h2></div>
              </div>
              <nav className="round-timeline" aria-label="选择比赛轮次">
                {weekOptions.map((option) => (
                  <button
                    className={`${option.week === selectedWeek ? "active" : ""}${option.week === timelineCurrentWeek ? " current" : ""}${option.week < timelineCurrentWeek ? " completed" : ""}`}
                    aria-current={option.week === timelineCurrentWeek ? "date" : undefined}
                    aria-pressed={option.week === selectedWeek}
                    onClick={() => changeWeek(option.week)}
                    key={option.week}
                  >
                    <span className="round-rail"><i /></span>
                    <strong>第 {option.week} 轮{option.week === timelineCurrentWeek && <em>本周</em>}</strong>
                    <small>{option.range}</small>
                  </button>
                ))}
              </nav>
              <div className="week-overview"><span className="pill">{statusFilter === "ALL" ? `共 ${scopeMarkets.length} 场` : `显示 ${displayedMarkets.length} / ${scopeMarkets.length} 场`}</span><span className="pill">可押全部余额 {money.format(balance)}</span></div>
              <div className="week-legend">
                {(["OPEN", "CLOSED", "SETTLED"] as StatusFilter[]).map((state) => {
                  const count = scopeMarkets.filter((market) => (marketStatus[market.id] ?? market.state) === state).length;
                  return (
                    <button disabled={count === 0} className={statusFilter === state ? "active" : ""} onClick={() => changeStatusFilter(state)} key={state}>
                      <i className={`state-dot state-${state.toLowerCase().replace("_", "-")}`} />{stateLabels[state]} {count}
                    </button>
                  );
                })}
                {statusFilter !== "ALL" && <button className="clear-filter" onClick={() => changeStatusFilter("ALL")}>显示全部</button>}
              </div>
              <div className="parlay-mode-selector">
                <label>过关模式
                  <select value={parlayMode} onChange={(event) => setParlayMode(event.target.value as ParlayMode)}>
                    <option value="DAILY">今日过关</option>
                    <option value="WEEKLY_A">本周 A 组过关</option>
                    <option value="WEEKLY_B">本周 B 组过关</option>
                  </select>
                </label>
              </div>
              {parlayMode !== "DAILY" && (
                <details className="parlay-card parlay-track-group weekly-parlay-card" open>
                  <summary>
                    <div><span className="parlay-kicker">本周 {activeWeeklyTrack} 组</span><strong>{activeWeeklyMarkets.length === 6 ? activeWeeklyFrozen ? "场次已锁定" : "本周可参与" : `等待时间确认 ${activeWeeklyMarkets.length}/6`} · 6 场全中瓜分奖池</strong></div>
                    <div><b>{money.format(activeWeeklyPool)}</b><span>竞猜币奖池 · 已有 {activeWeeklyJoinedCount} 人参与</span><i>⌄</i></div>
                  </summary>
                  <div className="parlay-body">
                    {activeWeeklyClosed && <div className="parlay-closed-warning">已有结束的比赛，当前无法购票过关</div>}
                    <div className="parlay-rules"><span>无需确认比赛时间即可购票</span><span>门票 {money.format(activeWeeklyTicket)}</span><span>每张门票奖池 +{money.format(activeWeeklyContribution)}</span><span>{activeWeeklyMarkets.some((market) => market.scheduledAt) && activeWeeklyClosesAt ? `截止 ${new Date(activeWeeklyClosesAt).toLocaleString("zh-CN", { hour12: false })}` : "确认时间后自动更新截止时间"}</span><span>首次参与后冻结 6 场</span></div>
                    {activeWeeklyMarkets.length === 6 ? <div className="parlay-matches">
                      {activeWeeklyMarkets.map((market, index) => <label className="parlay-match" key={market.id}>
                        <span className="parlay-number">{index + 1}</span>
                        <span className="parlay-versus"><strong>{market.home} vs {market.away}</strong><small>{market.time} · {market.track} 赛道</small></span>
                        <select disabled={isAdminSession || activeWeeklyJoined || activeWeeklyClosed} value={activeWeeklySelections[market.id] ?? ""} onChange={(event) => parlayMode === "WEEKLY_B" ? setWeeklyBParlaySelections((current) => ({ ...current, [market.id]: event.target.value })) : setWeeklyParlaySelections((current) => ({ ...current, [market.id]: event.target.value }))}>
                          <option value="">选择结果</option>
                          {market.options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                        </select>
                      </label>)}
                    </div> : <div className="empty-matches">本周 {activeWeeklyTrack} 组 6 场比赛须全部由双方队长确认时间后，才会开放该组过关。</div>}
                    <div className="parlay-submit">
                      <span>已选择 {Object.keys(activeWeeklySelections).filter((id) => activeWeeklyMarkets.some((market) => market.id === id)).length} / 6 场</span>
                      <button disabled={isAdminSession || activeWeeklyJoined || activeWeeklyClosed || activeWeeklyMarkets.length !== 6} onClick={joinWeeklyParlay}>{isAdminSession ? "管理员不可参与" : activeWeeklyJoined ? `已参与本周 ${activeWeeklyTrack} 组过关` : activeWeeklyClosed ? "已有结束的比赛，无法购票" : activeWeeklyMarkets.length !== 6 ? "等待 6 场固定对阵" : `支付 ${money.format(activeWeeklyTicket)} 竞猜币参与`}</button>
                    </div>
                  </div>
                </details>
              )}
              {parlayMode === "DAILY" && parlayMarkets.length >= 3 && (
                <details className="parlay-card parlay-track-group" open>
                  <summary>
                    <div><span className="parlay-kicker">闯关模式</span><strong>{parlayClosed ? "已截止" : parlayFrozen ? "场次已锁定" : "今日可参与"} · {parlayMarkets.length} 场全中瓜分奖池</strong></div>
                    <div><b>{money.format(effectiveParlayPool)}</b><span>竞猜币奖池 · 已有 {parlayJoinedCount} 人参与</span><i>⌄</i></div>
                  </summary>
                  <div className="parlay-body">
                    <div className="parlay-rules"><span>仅含双方已确认时间的比赛</span><span>已有 {parlayJoinedCount} 人参与闯关</span><span>门票 {money.format(effectiveParlayTicket)} 竞猜币</span><span>每张门票奖池 +{money.format(parlayTicketContribution)}</span><span>截止 {formatClock(parlayDeadline)}</span><span>{parlayFrozen ? "首位购票后场次已冻结" : "首位购票后冻结场次"}</span><span>全部命中方可瓜分</span></div>
                    <div className="parlay-matches">
                      {parlayMarkets.map((market, index) => (
                        <label className="parlay-match" key={market.id}>
                          <span className="parlay-number">{index + 1}</span>
                          <span className="parlay-versus"><strong>{market.home} vs {market.away}</strong><small>{market.time} · {market.track} 赛道</small></span>
                          <select
                            disabled={isAdminSession || parlayJoined || parlayClosed || (marketStatus[market.id] ?? market.state) !== "OPEN"}
                            value={parlaySelections[market.id] ?? ""}
                            onChange={(event) => setParlaySelections((current) => ({ ...current, [market.id]: event.target.value }))}
                          >
                            <option value="">选择结果</option>
                            {market.options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                    <div className="parlay-submit">
                      <span>已选择 {Object.keys(parlaySelections).filter((id) => parlayMarkets.some((market) => market.id === id)).length} / {parlayMarkets.length} 场</span>
                      <button disabled={isAdminSession || parlayJoined || parlayClosed} onClick={joinParlay}>{isAdminSession ? "管理员不可参与竞猜" : parlayJoined ? "已参与今日过关" : parlayClosed ? `已于 ${formatClock(parlayDeadline)} 截止` : `支付 ${money.format(effectiveParlayTicket)} 竞猜币参与`}</button>
                    </div>
                  </div>
                </details>
              )}
              {matchScope === "WEEK" ? (
                <div className="week-day-groups">
                  {displayedMarkets.length === 0 && <div className="empty-matches">本周没有“{statusFilter === "ALL" ? "全部" : stateLabels[statusFilter]}”状态的比赛</div>}
                  {weekDays.map((day, dayIndex) => {
                    const dayMarkets = displayedMarkets.filter((market) => marketDayKey(market.time) === day);
                    if (dayMarkets.length === 0) return null;
                    const openCount = dayMarkets.filter((market) => (marketStatus[market.id] ?? market.state) === "OPEN").length;
                    return (
                      <section className="week-day-group" key={day}>
                        <header>
                          <div><strong>{day}</strong><span>{weekDateLabel(selectedWeek, dayIndex)}</span></div>
                          <div><b>{dayMarkets.length} 场比赛</b><span>{openCount} 场开盘中</span>{dayMarkets.length >= 3 && <em>可参与过关</em>}</div>
                        </header>
                        <div className="market-list">{dayMarkets.map(renderMarketCard)}</div>
                      </section>
                    );
                  })}
                </div>
              ) : (["A", "B"] as const).map((track) => {
                const trackMarkets = displayedMarkets.filter((market) => market.track === track);
                const openCount = trackMarkets.filter((market) => (marketStatus[market.id] ?? market.state) === "OPEN").length;
                return (
                  <details className="track-group" open key={track}>
                    <summary>
                      <span><b className={`track track-${track.toLowerCase()}`}>{track} 赛道</b><strong>{track === "A" ? "全局 BP" : "正常 BP"}</strong></span>
                      <span>{trackMarkets.length} 场 · {openCount} 场开盘中 <i>⌄</i></span>
                    </summary>
                    <div className="market-list">
                      {trackMarkets.length === 0 && <div className="empty-matches">该赛道今天没有“{statusFilter === "ALL" ? "全部" : stateLabels[statusFilter]}”状态的比赛</div>}
                      {trackMarkets.map(renderMarketCard)}
                    </div>
                  </details>
                );
              })}
            </section>
            {scopeMarkets.length > 0 ? <aside className="bet-panel">
              <div className="bet-head"><div><p className="eyebrow">{selectedMarket.track} 赛道 · {selectedMarket.bestOf === 2 ? "BO2" : "BO3"}</p><h2>{selectedMarket.home} vs {selectedMarket.away}</h2></div><span className={`open-dot state-${selectedState.toLowerCase().replace("_", "-")}`}>{stateLabels[selectedState]}</span></div>
              <p className="subtle">{selectedMarket.title} · {selectedMarket.closesIn}</p>
              <div className="options">
                {selectedMarket.options.map((option) => {
                  const multiplier = option.oddsBps ? option.oddsBps / 10000 : ratios.returnPercent / 100 + (ratios.prizePercent / 100 * (selectedMarket.pool + stake)) / (option.amount + stake);
                  const lockedOut = Boolean(lockedOptionId && option.id !== lockedOptionId);
                  return <button disabled={isAdminSession || selectedState !== "OPEN" || lockedOut} key={option.id} className={`${option.id === selectedOption.id ? "option active" : "option"}${lockedOut ? " option-locked" : ""}`} onClick={() => setOptionId(option.id)}>
                    <span>{option.label}</span><strong>约 {multiplier.toFixed(2)}×</strong><small>当前 {money.format(option.amount)}</small>
                  </button>;
                })}
              </div>
              {lockedOptionId && <div className="selection-lock">已锁定结果：<strong>{selectedOption.label}</strong><span>本场已下注 {money.format(existingMarketStake)}，只能继续加注该结果</span></div>}
              <label className="stake-label">下注额 <span>可用 {money.format(balance)}</span></label>
              <div className="stake-input"><input disabled={isAdminSession || selectedState !== "OPEN"} value={stake} type="number" min="50" max={validation.cap} onChange={(event) => setStake(Math.max(0, Number(event.target.value)))} /><span>竞猜币</span></div>
              <div className="quick-stakes">{[50, 100, validation.cap].map((value, index) => <button disabled={isAdminSession || selectedState !== "OPEN" || value < 50} key={`${value}-${index}`} onClick={() => setStake(value)}>{index === 2 ? "最大" : value}</button>)}</div>
              <div className="estimate"><span>预估到账</span><strong>{money.format(potential.payout)} <small>竞猜币</small></strong><p>包含本金返还 {potential.returnedStake} + 奖池奖励 {potential.prize}</p></div>
              <button disabled={submittingBet || isAdminSession || selectedState !== "OPEN"} className="primary" onClick={placeBet}>{submittingBet ? "订单提交中…" : isAdminSession ? "管理员账号不可下注" : selectedState === "OPEN" ? `${lockedOptionId ? "确认加注" : "确认下注"} ${stake > 0 ? `${money.format(stake)} 竞猜币` : ""}` : stateLabels[selectedState]}</button>
              <p className="fine-print">{isAdminSession ? "管理员账号仅用于赛事管理、资产操作和信息核对。" : "首次下注后结果锁定，只能继续加注；封盘后不可撤单。禁止竞猜本人或联姻战队的比赛。"}</p>
            </aside> : <aside className="bet-panel empty-bet-panel"><span>暂无比赛</span><h2>第 {selectedWeek} 周尚未配置赛程</h2><p>管理员创建并设置本周比赛后，竞猜盘口将在这里展示。</p>{sessionUser.isAdmin && <button onClick={() => setActiveTab("后台管理设置")}>前往后台管理设置</button>}</aside>}
          </div>
        )}

        {activeTab === "赛程确认" && sessionUser.role === "CAPTAIN" && <SchedulePanel schedules={matchSchedules} onPropose={proposeSchedule} onConfirm={confirmSchedule} />}
        {activeTab === "我的竞猜" && <MyBetsPanel bets={myBets} parlays={parlayOrders} loading={loadingData} />}
        {!sessionUser.isAdmin && activeTab === "竞猜币充值" && <RechargeShop requests={rechargeRequests} onSubmit={submitRecharge} />}
        {activeTab === "钱包流水" && <WalletPanel balance={balance} points={sessionPoints} entries={walletEntries} loading={loadingData} treasury={houseTreasury} onExchange={sessionUser.isAdmin ? undefined : exchangePoints} />}
        {activeTab === "排行榜" && <Ranking entries={rankingEntries} loading={loadingData} />}
        {activeTab === "成就奖" && <Achievements data={achievementData} loading={loadingData} />}
        {sessionUser.isAdmin && activeTab === "后台管理设置" && <Admin
          key={`${adminTeams.map((team) => team.id).join(",")}:${parlayTicket}:${parlayBasePools.three}:${parlayBasePools.four}:${parlayBasePools.five}:${parlayBasePools.sixPlus}:${ticketPoolBonusMultiplier}:${weeklyParlayConfig.ticket}:${weeklyParlayConfig.basePool}:${weeklyParlayConfig.bonusMultiplier}:${weeklyBParlayConfig.ticket}:${weeklyBParlayConfig.basePool}:${weeklyBParlayConfig.bonusMultiplier}:${ratios.returnPercent}:${ratios.recoveryPercent}:${ratios.prizePercent}:${pointRewards.smallGameWinPoints}:${pointRewards.allianceGameWinPoints}:${pointRewards.seriesWinPoints}`}
          statuses={marketStatus}
          adminMarkets={currentAdminMarkets}
          allAdminMarkets={allConfiguredMarkets}
          parlayTicket={parlayTicket}
          parlayBasePools={parlayBasePools}
          ticketPoolBonusMultiplier={ticketPoolBonusMultiplier}
          weeklyParlayConfig={weeklyParlayConfig}
          weeklyBParlayConfig={weeklyBParlayConfig}
          ratios={ratios}
          pointRewards={pointRewards}
          managedUsers={managedUsers}
          teams={adminTeams}
          matchSchedules={matchSchedules}
          betRecords={betRecords}
          parlayRounds={adminParlayRounds}
          rechargeData={adminRecharges}
          treasury={adminTreasury}
          onUpdate={updateMarket}
          onSettle={settleAdminMarket}
          onBatchUpdate={updateMarketBatch}
          onConfigureMatch={configureMatch}
          onConfigurePairing={adminConfigurePairing}
          onAdminReschedule={adminReschedule}
          onAdjustCoins={adjustCoins}
          onSaveParlay={saveParlaySettings}
          onSaveWeeklyParlay={saveWeeklyParlaySettings}
          onSaveRatios={saveRatios}
          onSavePointRewards={savePointRewards}
          onSaveOdds={saveClosedOdds}
          onInjectLiquidity={injectMarketLiquidity}
          onImportTeams={importTeamWorkbook}
          onAddUser={addManagedUser}
          onDeleteUser={deleteManagedUser}
          onResetPassword={resetManagedUserPassword}
          onReviewRecharge={reviewRecharge}
          onNotify={setNotice}
        />}
      </section>
      <nav className="mobile-nav" aria-label="移动端主导航">
        {([
          "竞猜大厅",
          ...(sessionUser.role === "CAPTAIN" ? ["赛程确认" as Tab] : []),
          "我的竞猜",
          "钱包流水",
          "排行榜",
          "成就奖",
          ...(sessionUser.isAdmin ? ["后台管理设置" as Tab] : []),
        ] as Tab[]).map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab === "后台管理设置" ? "管理" : tab === "竞猜币充值" ? "充值" : tab.replace("竞猜", "") || "大厅"}{tab === "赛程确认" && pendingScheduleConfirmations > 0 && <i className="nav-alert-dot" title={`${pendingScheduleConfirmations} 场比赛待确认`} />}</button>)}
      </nav>
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<string> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(await onLogin(username, password));
    setSubmitting(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span>竞</span><div><strong>内部竞猜中心</strong><small>2027年“策划杯”秋季赛</small></div></div>
        <div className="login-heading"><p className="eyebrow">ACCOUNT LOGIN</p><h1>登录竞猜系统</h1><span>普通用户请使用英文名登录，管理员请使用 admin 登录。</span></div>
        <form onSubmit={submit}>
          <label>账号<input autoFocus autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} placeholder="英文名 / admin" /></label>
          <label>密码<input autoComplete="current-password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="请输入密码" /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={submitting || !username.trim() || !password}>{submitting ? "登录中…" : "登录"}</button>
        </form>
        <p className="login-tip">默认初始密码：000000；首次登录后可在侧边栏修改</p>
      </section>
    </main>
  );
}

function RechargeShop({
  requests,
  onSubmit,
}: {
  requests: RechargeRequest[];
  onSubmit: (baseAmount: number) => Promise<void>;
}) {
  const [selectedBase, setSelectedBase] = useState(RECHARGE_PLANS[0].baseAmount);
  const [submitting, setSubmitting] = useState(false);
  const selected = RECHARGE_PLANS.find((plan) => plan.baseAmount === selectedBase) ?? RECHARGE_PLANS[0];
  const activeRequest = requests.find((request) => request.status === "PENDING" || request.status === "FIRST_CONFIRMED");
  const firstRechargeAvailableFor = (baseAmount: number) => !requests.some(
    (request) => request.status === "COMPLETED" && request.baseAmount === baseAmount,
  );
  const selectedFirstRechargeAvailable = firstRechargeAvailableFor(selected.baseAmount);
  const selectedCreditedAmount = rechargeCreditedAmount(selected, selectedFirstRechargeAvailable);
  const statusLabel = (status: RechargeRequest["status"]) => status === "PENDING"
    ? "等待后台首次确认"
    : status === "FIRST_CONFIRMED"
      ? "等待后台二次确认"
      : status === "COMPLETED"
        ? "已到账"
        : "已驳回";

  async function confirmRecharge() {
    setSubmitting(true);
    try {
      await onSubmit(selected.baseAmount);
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="recharge-shop">
    <div className="recharge-shop-hero">
      <div><p className="eyebrow">竞猜币商城</p><h2>选择充值套餐</h2><span>每个档位首次充值均可享基础竞猜币双倍，档位额外赠送 10%–16%。</span></div>
      <div className="recharge-rate"><span>兑换标准</span><strong>50 竞猜币 = 1 米儿</strong></div>
    </div>
    {activeRequest && <div className="recharge-pending-banner"><strong>当前已有充值申请审核中</strong><span>{money.format(activeRequest.baseAmount)} + 档位赠送 {money.format(activeRequest.bonusAmount)}{activeRequest.isFirstRecharge ? ` + 首充奖励 ${money.format(activeRequest.firstRechargeBonus)}` : ""}，共到账 {money.format(activeRequest.amount)} 竞猜币 · {statusLabel(activeRequest.status)}</span></div>}
    <div className="recharge-plan-grid">
      {RECHARGE_PLANS.map((plan) => {
        const tierFirstRechargeAvailable = firstRechargeAvailableFor(plan.baseAmount);
        return <button
          className={selectedBase === plan.baseAmount ? "recharge-plan selected" : "recharge-plan"}
          disabled={Boolean(activeRequest)}
          onClick={() => setSelectedBase(plan.baseAmount)}
          key={plan.baseAmount}
        >
          <span className="recharge-bonus">额外赠送 {plan.bonusPercent}% · {money.format(plan.bonusAmount)}</span>
          {tierFirstRechargeAvailable && <span className="recharge-first-bonus">本档首充双倍</span>}
          <span className="recharge-gem" aria-hidden="true"><i>◆</i></span>
          <strong>{money.format(plan.baseAmount)} 竞猜币</strong>
          <small>实际到账 {money.format(rechargeCreditedAmount(plan, tierFirstRechargeAvailable))}</small>
          <b>{money.format(plan.priceMier)} 米儿</b>
        </button>;
      })}
    </div>
    <div className="recharge-confirm-bar">
      <div><span>当前选择</span><strong>{money.format(selected.baseAmount)} + 档位赠送 {money.format(selected.bonusAmount)}{selectedFirstRechargeAvailable ? ` + 本档首充奖励 ${money.format(selected.baseAmount)}` : ""} = {money.format(selectedCreditedAmount)} 竞猜币</strong><small>本次需要 {money.format(selected.priceMier)} 米儿</small></div>
      <button disabled={Boolean(activeRequest) || submitting} onClick={confirmRecharge}>{activeRequest ? "已有申请审核中" : submitting ? "正在提交…" : `确认充值 · ${money.format(selected.priceMier)} 米儿`}</button>
    </div>
    <section className="recharge-history">
      <h3>充值申请记录</h3>
      {requests.map((request) => <div key={request.id}><span><strong>{money.format(request.baseAmount)} 竞猜币套餐</strong><small>{new Date(request.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></span><span><b>+{money.format(request.bonusAmount)} 档位赠送{request.isFirstRecharge ? ` · +${money.format(request.firstRechargeBonus)} 首充奖励` : ""}</b><small>需 {money.format(request.priceMier)} 米儿 · 到账 {money.format(request.amount)}</small></span><em className={`recharge-${request.status.toLowerCase()}`}>{statusLabel(request.status)}</em></div>)}
      {requests.length === 0 && <p>暂无充值申请</p>}
    </section>
  </section>;
}

function SchedulePanel({ schedules, onPropose, onConfirm, admin = false, teams = [], onConfigurePairing, onAdminReschedule }: {
  schedules: MatchSchedule[];
  onPropose: (matchId: string, scheduledAt: string) => void;
  onConfirm: (matchId: string) => void;
  admin?: boolean;
  teams?: AdminTeam[];
  onConfigurePairing?: (matchId: string, homeTeamId: string, awayTeamId: string) => void;
  onAdminReschedule?: (matchId: string, scheduledAt: string) => void;
}) {
  const [times, setTimes] = useState<Record<string, string>>({});
  const [pairings, setPairings] = useState<Record<string, { homeTeamId: string; awayTeamId: string }>>({});
  const availableWeeks = [...new Set(schedules.map((schedule) => schedule.week))].sort((first, second) => first - second);
  const [scheduleWeek, setScheduleWeek] = useState(() => availableWeeks.includes(currentCompetitionWeek()) ? currentCompetitionWeek() : availableWeeks[0] ?? 1);
  const visibleSchedules = admin ? schedules.filter((schedule) => schedule.week === scheduleWeek) : schedules;
  const inputValue = (schedule: MatchSchedule) => times[schedule.id] ?? (() => {
    const source = schedule.proposedScheduledAt ?? schedule.scheduledAt;
    if (!source) return "";
    const date = new Date(source);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  })();
  return <section className="panel schedule-panel">
    <div className="section-heading"><div><p className="eyebrow">{admin ? "管理员先设置对阵，队长再确认时间" : "双方队长共同确认"}</p><h2>{admin ? "前 11 周固定场次" : "我的赛程确认"}</h2></div>{admin ? <div className="schedule-filter"><label>查看周次<select value={scheduleWeek} onChange={(event) => setScheduleWeek(Number(event.target.value))}>{availableWeeks.map((week) => <option value={week} key={week}>第 {week} 周　{weekCompactRange(week)}</option>)}</select></label><span className="pill">{visibleSchedules.filter((item) => item.pairingConfigured).length} / {visibleSchedules.length} 已设置对阵</span></div> : <span className="pill">{schedules.filter((item) => item.scheduleStatus === "CONFIRMED").length} / {schedules.length} 已确认时间</span>}</div>
    <div className="schedule-list">
      {visibleSchedules.map((schedule) => <article className={`schedule-row schedule-${schedule.scheduleStatus.toLowerCase()}`} key={schedule.id}>
        <div className="schedule-match"><span>第 {schedule.week} 周 · {weekCompactRange(schedule.week)} · {schedule.track} 赛道 · 第 {schedule.slotIndex ?? "-"} 场</span><strong>{schedule.pairingConfigured ? `${schedule.home} vs ${schedule.away}` : "等待管理员设置对阵"}</strong><small>{!schedule.pairingConfigured ? "管理员设置双方后，队长方可确认时间" : schedule.scheduleStatus === "CONFIRMED" ? `已生效：${new Date(schedule.scheduledAt!).toLocaleString("zh-CN", { hour12: false })}` : schedule.scheduleStatus === "PROPOSED" ? `${schedule.proposedByTeamName} 提议：${new Date(schedule.proposedScheduledAt!).toLocaleString("zh-CN", { hour12: false })}` : "对阵已设置，等待双方队长确认时间"}</small></div>
        <div className="schedule-actions">
          {admin && schedule.canConfigurePairing && <div className="schedule-pairing-controls">
            <select value={pairings[schedule.id]?.homeTeamId ?? schedule.homeTeamId} onChange={(event) => setPairings((current) => ({ ...current, [schedule.id]: { homeTeamId: event.target.value, awayTeamId: current[schedule.id]?.awayTeamId ?? schedule.awayTeamId } }))}>{teams.filter((team) => team.track === schedule.track).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select>
            <span>vs</span>
            <select value={pairings[schedule.id]?.awayTeamId ?? schedule.awayTeamId} onChange={(event) => setPairings((current) => ({ ...current, [schedule.id]: { homeTeamId: current[schedule.id]?.homeTeamId ?? schedule.homeTeamId, awayTeamId: event.target.value } }))}>{teams.filter((team) => team.track === schedule.track).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select>
            <button className="admin-primary" onClick={() => onConfigurePairing?.(schedule.id, pairings[schedule.id]?.homeTeamId ?? schedule.homeTeamId, pairings[schedule.id]?.awayTeamId ?? schedule.awayTeamId)}>{schedule.pairingConfigured ? "修改对阵" : "保存对阵"}</button>
          </div>}
          {admin && !schedule.canConfigurePairing && schedule.pairingLockReason && <small className="schedule-lock-reason">{schedule.pairingLockReason}</small>}
          {(schedule.canPropose || schedule.canAdminReschedule) && <input type="datetime-local" value={inputValue(schedule)} onChange={(event) => setTimes((current) => ({ ...current, [schedule.id]: event.target.value }))} />}
          {!admin && schedule.canPropose && <button onClick={() => onPropose(schedule.id, inputValue(schedule))}>{schedule.scheduleStatus === "PROPOSED" ? "修改/反提时间" : "提交比赛时间"}</button>}
          {!admin && schedule.canConfirm && <button className="admin-primary" onClick={() => onConfirm(schedule.id)}>确认该时间</button>}
          {admin && schedule.canAdminReschedule && <button onClick={() => onAdminReschedule?.(schedule.id, inputValue(schedule))}>{schedule.scheduleStatus === "CONFIRMED" ? "管理员修改时间" : "管理员设置时间"}</button>}
          {schedule.scheduleStatus === "CONFIRMED" && !schedule.canAdminReschedule && <b>时间已锁定</b>}
        </div>
      </article>)}
      {visibleSchedules.length === 0 && <div className="order-empty">第 {scheduleWeek} 周没有固定对阵</div>}
    </div>
  </section>;
}

function Ranking({ entries, loading }: { entries: RankingEntry[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<RankingSortKey>("value");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const sortLabels: Record<RankingSortKey, string> = { value: "竞猜币", points: "点券", hits: "命中数", predictions: "预测数", rate: "命中率" };
  const sortedRankings = useMemo(
    () => [...entries].sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];
      return sortDirection === "desc" ? second - first : first - second;
    }),
    [entries, sortDirection, sortKey],
  );

  function toggleSort(key: RankingSortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => direction === "desc" ? "asc" : "desc");
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  }

  const sortButton = (key: RankingSortKey) => (
    <button className={sortKey === key ? "sortable active" : "sortable"} onClick={() => toggleSort(key)}>
      {sortLabels[key]} <i>{sortKey === key ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}</i>
    </button>
  );

  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">赛季榜单</p><h2>竞猜排行榜</h2></div><span className="pill">{sortLabels[sortKey]} · {sortDirection === "desc" ? "由大到小" : "由小到大"}</span></div>
    <div className="data-table ranking-table">
      <div className="tr th rank-row"><span>排名</span><span>玩家</span><span>所属战队</span><span>联姻队伍</span><span>{sortButton("value")}</span><span>{sortButton("points")}</span><span>{sortButton("hits")}</span><span>{sortButton("predictions")}</span><span>{sortButton("rate")}</span></div>
      {sortedRankings.map((item, index) => <div className="tr rank-row" key={item.id}><span className={`rank rank-${index + 1}`}>{index + 1}</span><span><strong>{item.name}</strong><small>{item.username}</small></span><span>{item.team}</span><span>{item.allianceTeams}</span><span><strong>{money.format(item.value)}</strong></span><span>{money.format(item.points)}</span><span>{item.hits}</span><span>{item.predictions}</span><span>{item.rate.toFixed(1)}%</span></div>)}
      {!loading && sortedRankings.length === 0 && <div className="order-empty">暂无排行榜用户</div>}
    </div>
  </section>;
}

function Achievements({ data, loading }: { data: AchievementData | null; loading: boolean }) {
  return <section className="panel achievement-panel">
    <div className="section-heading">
      <div><p className="eyebrow">赛季荣誉</p><h2>成就奖</h2></div>
      <span className="pill">随竞猜与结算数据自动更新</span>
    </div>
    {data && <div className="achievement-summary">
      当前已结算 {data.settledMarketCount} 场比赛；命中率称号最低参与门槛为 {data.minimumPredictions} 场。
    </div>}
    <div className="achievement-grid">
      {data?.achievements.map((achievement) => <article className={`achievement-card achievement-${achievement.key.toLowerCase().replaceAll("_", "-")}`} key={achievement.key}>
        <header><span>{achievement.title.slice(0, 1)}</span><div><h3>{achievement.title}</h3><small>称号奖励</small></div></header>
        <p><b>获得要求</b>{achievement.requirement}</p>
        <div className="achievement-holders">
          <b>当前获得者</b>
          {achievement.holders.length > 0
            ? achievement.holders.map((holder) => <div key={holder.id}><span><strong>{holder.name}</strong><small>{holder.team} · {holder.username}</small></span><em>{holder.detail}</em></div>)
            : <span className="achievement-empty">暂未有人达成</span>}
        </div>
      </article>)}
      {!loading && !data && <div className="order-empty">暂无成就数据</div>}
    </div>
  </section>;
}

type AdminProps = {
  statuses: Record<string, string>;
  adminMarkets: Market[];
  allAdminMarkets: Market[];
  parlayTicket: number;
  parlayBasePools: ParlayBasePools;
  ticketPoolBonusMultiplier: number;
  weeklyParlayConfig: WeeklyParlayConfig;
  weeklyBParlayConfig: WeeklyParlayConfig;
  ratios: RatioConfig;
  pointRewards: PointRewardConfig;
  managedUsers: ManagedUser[];
  teams: AdminTeam[];
  matchSchedules: MatchSchedule[];
  betRecords: BetRecord[];
  parlayRounds: AdminParlayRound[];
  rechargeData: AdminRechargeData;
  treasury: AdminTreasury | null;
  onUpdate: (id: string, status: string) => void;
  onSettle: (marketId: string, homeScore: number, awayScore: number) => void;
  onBatchUpdate: (ids: string[], status: string, scope: string) => void;
  onConfigureMatch: (id: string, config: MatchOverride) => void;
  onConfigurePairing: (matchId: string, homeTeamId: string, awayTeamId: string) => void;
  onAdminReschedule: (matchId: string, scheduledAt: string) => void;
  onAdjustCoins: (targetType: "USER" | "TEAM", target: string, action: "GRANT" | "DEDUCT", amount: number) => void;
  onSaveParlay: (ticket: number, basePools: ParlayBasePools, bonusMultiplier: number) => void;
  onSaveWeeklyParlay: (track: "A" | "B", config: WeeklyParlayConfig) => void;
  onSaveRatios: (config: RatioConfig) => void;
  onSavePointRewards: (config: PointRewardConfig) => void;
  onSaveOdds: (marketId: string, odds: Record<string, number>, reason: string) => void;
  onInjectLiquidity: (marketId: string, injections: Array<{ optionId: string; amount: number }>) => Promise<boolean>;
  onImportTeams: (file: File, action: "preview" | "apply") => Promise<TeamImportPreview>;
  onAddUser: (user: Omit<ManagedUser, "id">) => void;
  onDeleteUser: (id: string) => void;
  onResetPassword: (id: string) => void;
  onReviewRecharge: (rechargeId: string, action: "FIRST_CONFIRM" | "FINAL_CONFIRM" | "ONE_CLICK_CONFIRM" | "REJECT") => void;
  onNotify: (message: string) => void;
};

function Admin({
  statuses,
  adminMarkets,
  allAdminMarkets,
  parlayTicket,
  parlayBasePools,
  ticketPoolBonusMultiplier,
  weeklyParlayConfig,
  weeklyBParlayConfig,
  ratios,
  pointRewards,
  managedUsers,
  teams,
  matchSchedules,
  betRecords,
  parlayRounds,
  rechargeData,
  treasury,
  onUpdate,
  onSettle,
  onBatchUpdate,
  onConfigureMatch,
  onConfigurePairing,
  onAdminReschedule,
  onAdjustCoins,
  onSaveParlay,
  onSaveWeeklyParlay,
  onSaveRatios,
  onSavePointRewards,
  onSaveOdds,
  onInjectLiquidity,
  onImportTeams,
  onAddUser,
  onDeleteUser,
  onResetPassword,
  onReviewRecharge,
  onNotify,
}: AdminProps) {
  const initialTrack: "A" | "B" = teams.some((team) => team.track === "A") ? "A" : teams[0]?.track ?? "A";
  const initialTrackTeams = teams.filter((team) => team.track === initialTrack);
  const [adminTab, setAdminTab] = useState<AdminTab>(() => {
    if (typeof window === "undefined") return "MATCH";
    const saved = window.sessionStorage.getItem("contest-admin-tab") as AdminTab | null;
    return saved && adminTabs.includes(saved) ? saved : "MATCH";
  });
  const [matchId, setMatchId] = useState("blank");
  const [matchWeek, setMatchWeek] = useState(12);
  const [matchDay, setMatchDay] = useState(1);
  const [matchStartTime, setMatchStartTime] = useState("20:00");
  const [track, setTrack] = useState<"A" | "B">(initialTrack);
  const [home, setHome] = useState(initialTrackTeams[0]?.name ?? "");
  const [away, setAway] = useState(initialTrackTeams[1]?.name ?? "");
  const [targetType, setTargetType] = useState<"USER" | "TEAM">("USER");
  const [target, setTarget] = useState(managedUsers[0]?.id ?? "");
  const [assetAction, setAssetAction] = useState<"GRANT" | "DEDUCT">("GRANT");
  const [assetAmount, setAssetAmount] = useState(100);
  const [assetReason, setAssetReason] = useState("运营调整");
  const [ticket, setTicket] = useState(parlayTicket);
  const [basePools, setBasePools] = useState(parlayBasePools);
  const [bonusMultiplier, setBonusMultiplier] = useState(ticketPoolBonusMultiplier);
  const [weeklyParlayForm, setWeeklyParlayForm] = useState(weeklyParlayConfig);
  const [weeklyBParlayForm, setWeeklyBParlayForm] = useState(weeklyBParlayConfig);
  const [ratioForm, setRatioForm] = useState(ratios);
  const [pointRewardForm, setPointRewardForm] = useState(pointRewards);
  const openMarkets = allAdminMarkets.filter((market) => (statuses[market.id] ?? market.state) === "OPEN");
  const closedMarkets = allAdminMarkets.filter((market) => (statuses[market.id] ?? market.state) === "CLOSED");
  const settlementMarkets = allAdminMarkets.filter((market) => ["CLOSED", "PENDING_REVIEW"].includes(statuses[market.id] ?? market.state));
  const [oddsMarketId, setOddsMarketId] = useState(closedMarkets[0]?.id ?? "");
  const [homeOdds, setHomeOdds] = useState(2.5);
  const [drawOdds, setDrawOdds] = useState(1.8);
  const [awayOdds, setAwayOdds] = useState(3.1);
  const [oddsReason, setOddsReason] = useState("封盘后人工校准");
  const [liquidityMarketId, setLiquidityMarketId] = useState(openMarkets[0]?.id ?? "");
  const [liquidityAmounts, setLiquidityAmounts] = useState<Record<"home" | "draw" | "away", number>>({ home: 0, draw: 0, away: 0 });
  const [liquidityBusy, setLiquidityBusy] = useState(false);
  const [batchStatus, setBatchStatus] = useState("CLOSED");
  const [operationWeek, setOperationWeek] = useState(4);
  const [userChineseName, setUserChineseName] = useState("");
  const [userEnglishName, setUserEnglishName] = useState("");
  const [userTeam, setUserTeam] = useState("");
  const [userInitialCoins, setUserInitialCoins] = useState(1000);
  const [teamImportFile, setTeamImportFile] = useState<File | null>(null);
  const [teamImportPreview, setTeamImportPreview] = useState<TeamImportPreview | null>(null);
  const [teamImportBusy, setTeamImportBusy] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState(managedUsers[0]?.id ?? "");
  const [detailMarketId, setDetailMarketId] = useState(allAdminMarkets[0]?.id ?? "");
  const [settlementMarketId, setSettlementMarketId] = useState(settlementMarkets[0]?.id ?? "");
  const [settlementHomeScore, setSettlementHomeScore] = useState(2);
  const [settlementAwayScore, setSettlementAwayScore] = useState(0);
  const availableTeams = [...teams].sort((first, second) => first.track.localeCompare(second.track) || first.name.localeCompare(second.name, "zh-CN"));
  const teamOptions = availableTeams.filter((team) => team.track === track);
  const detailMarket = allAdminMarkets.find((market) => market.id === detailMarketId) ?? allAdminMarkets[0];
  const detailBets = betRecords.filter((record) => record.marketId === detailMarket?.id);
  const activeDetailBets = detailBets.filter((record) => record.recordStatus === "ACTIVE");
  const operationMarkets = allAdminMarkets.filter((market) => (market.week ?? 4) === operationWeek);
  const settlementMarket = settlementMarkets.find((market) => market.id === settlementMarketId) ?? settlementMarkets[0];
  const liquidityMarket = openMarkets.find((market) => market.id === liquidityMarketId) ?? openMarkets[0];
  const settlementResultLabel = settlementHomeScore === settlementAwayScore ? "平局" : settlementHomeScore > settlementAwayScore ? "主胜" : "客胜";
  const perTicketPoolIncrease = ticketPoolContribution(ticket, Math.round(bonusMultiplier * 10_000));

  function changeAdminTab(tab: AdminTab) {
    setAdminTab(tab);
    window.sessionStorage.setItem("contest-admin-tab", tab);
  }

  function selectMatch(id: string) {
    setMatchId(id);
    const market = allAdminMarkets.find((item) => item.id === id);
    if (!market) return;
    setMatchWeek(market.week ?? 4);
    const parsedDay = market.time.startsWith("今天") ? 2 : weekDays.findIndex((day) => market.time.startsWith(day)) + 1;
    const parsedTime = market.time.match(/(\d{1,2}:\d{2})/)?.[1];
    setMatchDay(parsedDay > 0 ? parsedDay : 1);
    setMatchStartTime(parsedTime ?? "20:00");
    setTrack(market.track);
    setHome(market.home);
    setAway(market.away);
  }

  function changeTrack(nextTrack: "A" | "B") {
    const nextTeams = availableTeams.filter((team) => team.track === nextTrack);
    setTrack(nextTrack);
    setHome(nextTeams[0]?.name ?? "");
    setAway(nextTeams[1]?.name ?? "");
  }

  function submitMatch() {
    if (!home || !away) {
      onNotify(`${track} 组至少需要两支已导入队伍才能设置对战。`);
      return;
    }
    if (home === away) {
      onNotify("主队和客队不能选择同一支战队。");
      return;
    }
    onConfigureMatch(matchId, { week: matchWeek, track, home, away, time: `${weekDays[matchDay - 1]} ${matchStartTime}` });
  }

  function submitAsset() {
    if (!Number.isInteger(assetAmount) || assetAmount <= 0) {
      onNotify("竞猜币调整金额必须为大于 0 的整数。");
      return;
    }
    onAdjustCoins(targetType, target, assetAction, assetAmount);
  }

  async function previewTeamImport() {
    if (!teamImportFile) {
      onNotify("请先选择 .xlsx 表格文件。");
      return;
    }
    setTeamImportBusy(true);
    try {
      setTeamImportPreview(await onImportTeams(teamImportFile, "preview"));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "表格预览失败");
    } finally {
      setTeamImportBusy(false);
    }
  }

  async function applyTeamImport() {
    if (!teamImportFile || !teamImportPreview || teamImportPreview.errors.length > 0) return;
    const createdCount = teamImportPreview.summary.createdUserCount ?? teamImportPreview.summary.assignmentCount;
    const removedCount = teamImportPreview.summary.removedUserCount ?? teamImportPreview.summary.clearedAssignmentCount;
    const message = [
      `确认以“${teamImportFile.name}”覆盖为真实名单？`,
      `仅保留管理员账号`,
      `清空全部旧赛程、盘口、竞猜、闯关和旧战队`,
      `删除现有普通用户 ${removedCount} 人，并清空其钱包和充值记录`,
      `按表格英文名新建账号 ${createdCount} 人，密码 000000，初始竞猜币 ${teamImportPreview.summary.initialCoins ?? 1000}`,
      `联姻组：${teamImportPreview.summary.allianceGroupCount} 组`,
    ].join("\n");
    if (!window.confirm(message)) return;
    setTeamImportBusy(true);
    try {
      const result = await onImportTeams(teamImportFile, "apply");
      setTeamImportPreview(result);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "表格导入失败");
    } finally {
      setTeamImportBusy(false);
    }
  }

  function submitUser() {
    if (!userChineseName.trim() || !userEnglishName.trim() || !userTeam.trim()) {
      onNotify("请完整填写中文名、英文名和队伍名。");
      return;
    }
    if (!Number.isInteger(userInitialCoins) || userInitialCoins < 0) {
      onNotify("初始竞猜币必须为不小于 0 的整数。");
      return;
    }
    if (managedUsers.some((user) => user.chineseName === userChineseName.trim() || user.englishName.toLowerCase() === userEnglishName.trim().toLowerCase())) {
      onNotify("中文名或英文名已存在，请检查后重新填写。");
      return;
    }
    const selectedTeam = availableTeams.find((team) => team.name === userTeam);
    onAddUser({
      chineseName: userChineseName.trim(),
      englishName: userEnglishName.trim(),
      team: userTeam.trim(),
      teamId: selectedTeam?.id ?? null,
      initialCoins: userInitialCoins,
    });
    setUserChineseName("");
    setUserEnglishName("");
    setUserTeam("");
    setUserInitialCoins(1000);
  }

  function submitDeleteUser() {
    if (!deleteUserId) {
      onNotify("请先从下拉菜单选择需要删除的用户。");
      return;
    }
    const nextUser = managedUsers.find((user) => user.id !== deleteUserId);
    onDeleteUser(deleteUserId);
    setDeleteUserId(nextUser?.id ?? "");
  }

  function submitRatios() {
    const total = ratioForm.returnPercent + ratioForm.recoveryPercent + ratioForm.prizePercent;
    if (total !== 100) {
      onNotify(`三个比例合计必须为 100%，当前为 ${total}%。`);
      return;
    }
    onSaveRatios(ratioForm);
  }

  function submitPointRewards() {
    if (Object.values(pointRewardForm).some((value) => !Number.isInteger(value) || value < 0)) {
      onNotify("三个点券奖励参数必须是不小于 0 的整数。");
      return;
    }
    onSavePointRewards(pointRewardForm);
  }

  function submitParlaySettings() {
    if (!Number.isInteger(ticket) || ticket <= 0) {
      onNotify("门票价格必须为大于 0 的整数。");
      return;
    }
    if (Object.values(basePools).some((value) => !Number.isInteger(value) || value < 0)) {
      onNotify("各场次基础奖池必须为不小于 0 的整数。");
      return;
    }
    if (!Number.isFinite(bonusMultiplier) || bonusMultiplier < 0 || bonusMultiplier > 100) {
      onNotify("门票奖池加成倍数必须在 0 到 100 之间。");
      return;
    }
    onSaveParlay(ticket, basePools, bonusMultiplier);
  }

  function submitWeeklyParlaySettings(track: "A" | "B") {
    const config = track === "A" ? weeklyParlayForm : weeklyBParlayForm;
    if (!Number.isInteger(config.ticket) || config.ticket <= 0 || !Number.isInteger(config.basePool) || config.basePool < 0) {
      onNotify(`本周 ${track} 组串关门票必须大于 0，基础奖池必须是不小于 0 的整数。`);
      return;
    }
    if (!Number.isFinite(config.bonusMultiplier) || config.bonusMultiplier < 0 || config.bonusMultiplier > 100) {
      onNotify(`本周 ${track} 组串关门票加成必须在 0 到 100 之间。`);
      return;
    }
    onSaveWeeklyParlay(track, config);
  }

  function submitOdds() {
    if (!oddsReason.trim() || [homeOdds, drawOdds, awayOdds].some((value) => value < 1)) {
      onNotify("赔率必须不小于 1.00，并填写调整原因。");
      return;
    }
    onSaveOdds(oddsMarketId, { home: homeOdds, draw: drawOdds, away: awayOdds }, oddsReason);
  }

  async function submitLiquidity() {
    if (!liquidityMarket) {
      onNotify("当前没有可注入的未封盘比赛。");
      return;
    }
    if (Object.values(liquidityAmounts).some((value) => !Number.isInteger(value) || value < 0)) {
      onNotify("各结果注入金额必须为不小于 0 的整数。");
      return;
    }
    const injections = liquidityMarket.options.map((option) => ({
      optionId: option.id,
      amount: liquidityAmounts[option.key ?? "away"],
    }));
    const total = injections.reduce((sum, item) => sum + item.amount, 0);
    if (injections.length !== 3 || total <= 0) {
      onNotify("请至少为一个结果填写大于 0 的注入金额。");
      return;
    }
    if (!window.confirm(`确认向“${liquidityMarket.home} vs ${liquidityMarket.away}”注入共 ${money.format(total)} 竞猜币？`)) return;
    setLiquidityBusy(true);
    try {
      if (await onInjectLiquidity(liquidityMarket.id, injections)) {
        setLiquidityAmounts({ home: 0, draw: 0, away: 0 });
      }
    } finally {
      setLiquidityBusy(false);
    }
  }

  function submitSettlement() {
    if (!settlementMarket) {
      onNotify("当前没有可结算的已封盘比赛。");
      return;
    }
    if (![settlementHomeScore, settlementAwayScore].every((score) => Number.isInteger(score) && score >= 0)) {
      onNotify("比赛比分必须为不小于 0 的整数。");
      return;
    }
    onSettle(settlementMarket.id, settlementHomeScore, settlementAwayScore);
  }

  return <section className="admin-workspace">
    <div className="section-heading"><div><p className="eyebrow">运营工作台</p><h2>竞猜系统管理后台</h2></div><span className="risk-badge">关键操作全量审计</span></div>
    <div className="admin-summary">
      <div><span>开放盘口</span><strong>{adminMarkets.filter((market) => (statuses[market.id] ?? market.state) === "OPEN").length}</strong></div>
      <div><span>已封盘</span><strong>{adminMarkets.filter((market) => (statuses[market.id] ?? market.state) === "CLOSED").length}</strong></div>
      <div><span>当前闯关参与</span><strong>{parlayRounds[0]?.participants.length ?? 0} 人</strong></div>
      <div><span>待审核充值</span><strong>{rechargeData.pendingCount} 笔</strong></div>
    </div>
    <div className="admin-tabs">
      <button className={adminTab === "MATCH" ? "active" : ""} onClick={() => changeAdminTab("MATCH")}>比赛与盘口</button>
      <button className={adminTab === "BETS" ? "active" : ""} onClick={() => changeAdminTab("BETS")}>下注明细</button>
      <button className={adminTab === "PARLAYS" ? "active" : ""} onClick={() => changeAdminTab("PARLAYS")}>闯关明细</button>
      <button className={adminTab === "USERS" ? "active" : ""} onClick={() => changeAdminTab("USERS")}>用户管理</button>
      <button className={adminTab === "ASSET" ? "active" : ""} onClick={() => changeAdminTab("ASSET")}>竞猜币操作</button>
      <button className={adminTab === "RECHARGES" ? "active" : ""} onClick={() => changeAdminTab("RECHARGES")}>充值审核{rechargeData.pendingCount > 0 ? ` (${rechargeData.pendingCount})` : ""}</button>
      <button className={adminTab === "TREASURY" ? "active" : ""} onClick={() => changeAdminTab("TREASURY")}>后台净额明细</button>
      <button className={adminTab === "RULES" ? "active" : ""} onClick={() => changeAdminTab("RULES")}>过关与结算参数</button>
    </div>

    {adminTab === "MATCH" && <div className="admin-grid">
      <SchedulePanel schedules={matchSchedules} onPropose={() => undefined} onConfirm={() => undefined} admin teams={teams} onConfigurePairing={onConfigurePairing} onAdminReschedule={onAdminReschedule} />
      <section className="admin-card">
        <div className="admin-card-head"><div><small>第 12–15 周</small><h3>管理员配置后续对战</h3></div><span>前 11 周请在上方逐场设置对阵</span></div>
        <div className="form-grid">
          <label className="wide">选择场次<select value={matchId} onChange={(event) => selectMatch(event.target.value)}><option value="blank">空白场次（新建）</option>{allAdminMarkets.filter((market) => (market.week ?? 4) > 11).map((market) => <option value={market.id} key={market.id}>第 {market.week ?? 4} 周 · {market.home} vs {market.away}</option>)}</select></label>
          <label>比赛周次<select value={matchWeek} onChange={(event) => setMatchWeek(Number(event.target.value))}>{weekOptions.filter((option) => option.week > 11).map((option) => <option value={option.week} key={option.week}>第 {option.week} 周 · {option.range}</option>)}</select></label>
          <label>比赛日<select value={matchDay} onChange={(event) => setMatchDay(Number(event.target.value))}>{weekDays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label>
          <label>开赛时间<input type="time" value={matchStartTime} onChange={(event) => setMatchStartTime(event.target.value)} /></label>
          <label>赛道<select value={track} onChange={(event) => changeTrack(event.target.value as "A" | "B")}><option value="A">A 赛道</option><option value="B">B 赛道</option></select></label>
          <label>主队<select value={home} onChange={(event) => setHome(event.target.value)}>{teamOptions.length === 0 && <option value="">该组暂无队伍</option>}{teamOptions.map((team) => <option value={team.name} key={team.id}>{team.name}</option>)}</select></label>
          <label>客队<select value={away} onChange={(event) => setAway(event.target.value)}>{teamOptions.length === 0 && <option value="">该组暂无队伍</option>}{teamOptions.map((team) => <option value={team.name} key={team.id}>{team.name}</option>)}</select></label>
        </div>
        <div className="admin-warning">已有盘口被重新配置时，旧盘口立即作废，所有已押注竞猜币原路退回并生成冲正流水。</div>
        <button className="admin-primary" onClick={submitMatch}>{matchId === "blank" ? "创建比赛" : "保存修改并执行退款"}</button>
      </section>

      <section className="admin-card">
        <div className="admin-card-head"><div><small>赛程状态</small><h3>盘口快速操作</h3></div><span>第 {operationWeek} 周 · {operationMarkets.length} 场</span></div>
        <div className="admin-batch-controls">
          <select value={operationWeek} onChange={(event) => setOperationWeek(Number(event.target.value))}>
            {weekOptions.map((option) => <option value={option.week} key={option.week}>第 {option.week} 周 · {option.range}</option>)}
          </select>
          <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value)}>
            <option value="OPEN">开盘中</option>
            <option value="CLOSED">已封盘</option>
            <option value="PENDING_REVIEW">待复核</option>
          </select>
          <button disabled={operationMarkets.length === 0} onClick={() => onBatchUpdate(operationMarkets.map((market) => market.id), batchStatus, `第 ${operationWeek} 周`)}>应用到第 {operationWeek} 周</button>
          <button onClick={() => onBatchUpdate(allAdminMarkets.map((market) => market.id), batchStatus, "全部赛程")}>应用到全部比赛</button>
        </div>
        <div className="admin-market-list">{operationMarkets.map((market, index) => {
          const status = statuses[market.id] ?? market.state;
          const isClosed = status === "CLOSED";
          return <div className={isClosed ? "is-closed" : ""} key={market.id}><span><strong>第 {operationWeek} 周 · 第 {index + 1} 场｜{market.home} vs {market.away}</strong><small>{market.time} · {market.track} 赛道 · 奖池 {money.format(market.pool)}</small></span><b className={`admin-market-status state-${status.toLowerCase().replace("_", "-")}`}>{stateLabels[status] ?? status}</b>{status === "SETTLED" ? <span className="settled-lock">已结算锁定</span> : <select className="market-state-select" value={status} onChange={(event) => onUpdate(market.id, event.target.value)}><option value="OPEN">解封 / 开盘</option><option value="CLOSED">封盘</option><option value="PENDING_REVIEW">待复核</option></select>}</div>;
        })}{operationMarkets.length === 0 && <div className="admin-market-empty">第 {operationWeek} 周尚未配置比赛</div>}</div>
      </section>

      <section className="admin-card admin-wide liquidity-card">
        <div className="admin-card-head"><div><small>未封盘盘口</small><h3>按结果注入竞猜币</h3></div><span>注入后立即更新奖池与动态赔率</span></div>
        <label className="liquidity-market-select">选择比赛<select value={liquidityMarket?.id ?? ""} onChange={(event) => setLiquidityMarketId(event.target.value)}>{openMarkets.map((market) => <option value={market.id} key={market.id}>第 {market.week ?? 4} 周 · {market.time} · {market.home} vs {market.away}</option>)}</select></label>
        {liquidityMarket ? <div className="liquidity-option-grid">
          {(["home", "draw", "away"] as const).map((result) => {
            const option = liquidityMarket.options.find((item) => item.key === result);
            return <label key={result}>
              <span>{option?.label ?? (result === "home" ? "主胜" : result === "draw" ? "平局" : "客胜")}</span>
              <small>当前结果池 {money.format(option?.amount ?? 0)} · 已注入 {money.format(option?.injectedAmount ?? 0)}</small>
              <input type="number" min="0" step="1" value={liquidityAmounts[result]} onChange={(event) => setLiquidityAmounts((current) => ({ ...current, [result]: Number(event.target.value) }))} />
            </label>;
          })}
        </div> : <div className="bet-detail-empty">当前没有未封盘比赛，创建或解封盘口后可进行注入。</div>}
        <div className="admin-warning">每次填写的是追加注入量，可分别向主胜、平局、客胜注入不同金额。注入会计入对应结果池和总奖池，并作为后台支出写入净额明细。</div>
        <button className="admin-primary" disabled={!liquidityMarket || liquidityBusy} onClick={submitLiquidity}>{liquidityBusy ? "正在注入…" : `确认注入 ${money.format(Object.values(liquidityAmounts).reduce((sum, amount) => sum + amount, 0))} 竞猜币`}</button>
      </section>

      <section className="admin-card admin-wide settlement-card">
        <div className="admin-card-head"><div><small>赛果与派奖</small><h3>比赛结果结算</h3></div><span>管理员只需填写比分</span></div>
        <div className="settlement-form">
          <label className="settlement-match">选择比赛<select value={settlementMarket?.id ?? ""} onChange={(event) => setSettlementMarketId(event.target.value)}>{settlementMarkets.map((market) => <option value={market.id} key={market.id}>第 {market.week ?? 4} 周 · {market.time} · {market.home} vs {market.away}</option>)}</select></label>
          <label>主队比分<input type="number" min="0" step="1" value={settlementHomeScore} onChange={(event) => setSettlementHomeScore(Number(event.target.value))} /></label>
          <label>客队比分<input type="number" min="0" step="1" value={settlementAwayScore} onChange={(event) => setSettlementAwayScore(Number(event.target.value))} /></label>
          <div className="settlement-auto-result"><span>系统自动判定</span><strong>{settlementResultLabel}</strong></div>
        </div>
        {settlementMarket ? <div className="settlement-preview">
          <span><strong>{settlementMarket.home}</strong><b>{settlementHomeScore}</b></span>
          <em>{settlementResultLabel}</em>
          <span><b>{settlementAwayScore}</b><strong>{settlementMarket.away}</strong></span>
        </div> : <div className="bet-detail-empty">当前没有可结算比赛，请先将比赛封盘。</div>}
        <div className="admin-warning">当前点券参数：每赢 1 小局，队员 +{pointRewards.smallGameWinPoints}；联姻大组成员 +{pointRewards.allianceGameWinPoints}；BO2/BO3 获胜队员额外 +{pointRewards.seriesWinPoints}。</div>
        <div className="admin-warning">系统会根据比分自动判定主胜、平局或客胜。确认后将锁定赛果，自动计算中奖订单、返还和奖励，同时更新闯关命中状态并生成钱包流水。</div>
        <button className="admin-primary settlement-submit" disabled={!settlementMarket} onClick={submitSettlement}>确认比分并执行结算</button>
      </section>

      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>封盘后配置</small><h3>调整锁定赔率</h3></div><span>必须记录调整原因</span></div>
        <div className="form-grid odds-form">
          <label>已封盘比赛<select value={oddsMarketId} onChange={(event) => setOddsMarketId(event.target.value)}>{closedMarkets.map((market) => <option value={market.id} key={market.id}>第 {market.week ?? 4} 周 · {market.time} · {market.home} vs {market.away}</option>)}</select></label>
          <label>主胜赔率<input type="number" min="1" step="0.01" value={homeOdds} onChange={(event) => setHomeOdds(Number(event.target.value))} /></label>
          <label>平局赔率<input type="number" min="1" step="0.01" value={drawOdds} onChange={(event) => setDrawOdds(Number(event.target.value))} /></label>
          <label>客胜赔率<input type="number" min="1" step="0.01" value={awayOdds} onChange={(event) => setAwayOdds(Number(event.target.value))} /></label>
          <label className="wide">调整原因<input value={oddsReason} onChange={(event) => setOddsReason(event.target.value)} /></label>
        </div>
        <button className="admin-primary" disabled={closedMarkets.length === 0} onClick={submitOdds}>保存并锁定赔率</button>
      </section>
    </div>}

    {adminTab === "BETS" && <div className="admin-grid">
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>订单核对</small><h3>每场比赛下注明细</h3></div><span>共 {betRecords.length} 笔下注记录</span></div>
        <div className="bet-detail-filter">
          <label>选择比赛
            <select value={detailMarket?.id ?? ""} onChange={(event) => setDetailMarketId(event.target.value)}>
              {allAdminMarkets.map((market) => <option value={market.id} key={market.id}>第 {market.week ?? 4} 周 · {market.time} · {market.home} vs {market.away}</option>)}
            </select>
          </label>
          {detailMarket && <div className="bet-detail-market-state"><span>当前状态</span><b className={`state-${(statuses[detailMarket.id] ?? detailMarket.state).toLowerCase().replace("_", "-")}`}>{stateLabels[statuses[detailMarket.id] ?? detailMarket.state]}</b></div>}
        </div>
        {detailMarket ? <>
          <div className="bet-detail-summary">
            <div><span>有效订单</span><strong>{activeDetailBets.length}</strong></div>
            <div><span>下注人数</span><strong>{new Set(activeDetailBets.map((record) => record.userId)).size}</strong></div>
            <div><span>有效下注总额</span><strong>{money.format(activeDetailBets.reduce((total, record) => total + record.amount, 0))}</strong></div>
            <div><span>退款订单</span><strong>{detailBets.filter((record) => record.recordStatus === "REFUNDED").length}</strong></div>
          </div>
          <div className="bet-option-summary">
            {detailMarket.options.map((option) => {
              const optionBets = activeDetailBets.filter((record) => record.optionId === option.id);
              return <section className="bet-option-card" key={option.id}>
                <header><span>{option.label}</span><strong>{money.format(optionBets.reduce((total, record) => total + record.amount, 0))} 竞猜币</strong><small>{optionBets.length} 笔</small></header>
                <div className="option-bettor-list">
                  {optionBets.map((record) => <div className="option-bettor-row" key={record.id}>
                    <strong>{record.userName}</strong>
                    <span>{money.format(record.amount)} 竞猜币</span>
                    <time>{new Date(record.createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
                  </div>)}
                  {optionBets.length === 0 && <p>暂无用户下注</p>}
                </div>
              </section>;
            })}
          </div>
        </> : <div className="bet-detail-empty">暂无已配置比赛</div>}
      </section>
    </div>}

    {adminTab === "PARLAYS" && <div className="admin-grid">
      {parlayRounds.map((round) => <section className="admin-card admin-wide" key={round.id}>
        <div className="admin-card-head">
          <div><small>{parlayScopeLabel(round.scope)}</small><h3>{parlayPeriodLabel(round.scope, round.dayKey)} 参与明细</h3></div>
          <span>{round.participants.length} 人参与 · {round.status === "OPEN" ? "进行中" : round.status === "CLOSED" ? "已截止" : round.status === "SETTLED" ? "已结算" : "已作废"}</span>
        </div>
        <div className="parlay-admin-summary">
          <div><span>参与人数</span><strong>{round.participants.length}</strong></div>
          <div><span>过关场数</span><strong>{round.markets.length} 场</strong></div>
          <div><span>门票</span><strong>{money.format(round.ticketStake)}</strong></div>
          <div><span>基础奖池</span><strong>{money.format(round.basePool)}</strong></div>
          <div><span>每票增加</span><strong>{money.format(round.ticketPoolContribution)}</strong></div>
          <div><span>当前奖池</span><strong>{money.format(round.pool)}</strong></div>
          <div><span>截止时间</span><strong>{new Date(round.closesAt).toLocaleString("zh-CN", { hour12: false })}</strong></div>
        </div>
        <div className="parlay-admin-markets">冻结场次：{round.markets.map((market) => market.matchup).join("；")}</div>
        <div className="parlay-participant-list">
          {round.participants.map((participant) => <details className="parlay-participant" key={participant.orderId}>
            <summary>
              <span><strong>{participant.name}</strong><small>{participant.username} · {participant.team}</small></span>
              <span><b>{money.format(participant.stake)} 竞猜币</b><small>{new Date(participant.joinedAt).toLocaleString("zh-CN", { hour12: false })}</small></span>
              <em className={`entry-status-${participant.status.toLowerCase()}`}>{participant.status === "ACTIVE" ? "闯关中" : participant.status === "WON" ? `闯关成功 +${money.format(participant.payout ?? 0)}` : participant.status === "LOST" ? "闯关失败" : "已退款"}</em>
            </summary>
            <div>{participant.legs.map((leg, index) => <p className={`leg-status-${leg.status.toLowerCase()}`} key={`${participant.orderId}-${leg.marketId}`}><span>{index + 1}. {leg.matchup}</span><strong>{leg.optionLabel}</strong><i>{leg.status === "PENDING" ? "待赛果" : leg.status === "WON" ? "命中" : "未命中"}</i></p>)}</div>
          </details>)}
          {round.participants.length === 0 && <div className="bet-detail-empty">本期暂无用户参与闯关</div>}
        </div>
      </section>)}
      {parlayRounds.length === 0 && <section className="admin-card admin-wide"><div className="bet-detail-empty">尚未生成闯关期次，首位用户提交后会自动显示参与信息。</div></section>}
    </div>}

    {adminTab === "USERS" && <div className="admin-grid">
      <section className="admin-card admin-wide team-import-card">
        <div className="admin-card-head"><div><small>批量覆盖</small><h3>导入队伍分配与联姻关系</h3></div><span>Excel 预览确认后生效</span></div>
        <div className="team-import-controls">
          <label>选择 Excel 文件<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setTeamImportFile(event.target.files?.[0] ?? null); setTeamImportPreview(null); }} /></label>
          <button disabled={!teamImportFile || teamImportBusy} onClick={previewTeamImport}>{teamImportBusy ? "处理中…" : "校验并预览"}</button>
          <button className="apply" disabled={!teamImportPreview || teamImportPreview.errors.length > 0 || teamImportPreview.applied || teamImportBusy} onClick={applyTeamImport}>{teamImportPreview?.applied ? "已导入" : "确认覆盖现有数据"}</button>
        </div>
        <div className="team-import-format">
          <strong>支持表头：</strong>
          <span>成员表：中文名 / 英文名 / 队伍名</span>
          <span>联姻表：队伍名 / 联姻组，或 队伍名 / 联姻队伍</span>
          <span>横向配对表：配对 / A队 / A队队长 / A队队员 / B队 / B队队长 / B队队员</span>
        </div>
        {teamImportPreview && <div className="team-import-preview">
          <div className="team-import-summary">
            <div><span>新建账号</span><strong>{teamImportPreview.summary.createdUserCount ?? teamImportPreview.summary.assignmentCount}</strong></div>
            <div><span>删除旧用户</span><strong>{teamImportPreview.summary.removedUserCount ?? teamImportPreview.summary.clearedAssignmentCount}</strong></div>
            <div><span>初始竞猜币</span><strong>{teamImportPreview.summary.initialCoins ?? 1000}</strong></div>
            <div><span>联姻组</span><strong>{teamImportPreview.summary.allianceGroupCount}</strong></div>
          </div>
          {teamImportPreview.errors.length > 0 && <div className="team-import-messages errors"><strong>必须修正以下错误</strong>{teamImportPreview.errors.map((message) => <p key={message}>{message}</p>)}</div>}
          {teamImportPreview.warnings.length > 0 && <div className="team-import-messages warnings"><strong>注意事项</strong>{teamImportPreview.warnings.map((message) => <p key={message}>{message}</p>)}</div>}
          <div className="team-import-columns">
            <section><h4>将开账号</h4><div>{teamImportPreview.assignments.map((item) => <p key={item.userId}><span>{item.name}<small>{item.username}{item.role === "CAPTAIN" ? " · 队长" : ""} · 密码 000000</small></span><b>{item.teamName}</b></p>)}</div></section>
            <section><h4>联姻关系预览</h4><div>{teamImportPreview.alliances.map((group, index) => <p key={group.map((team) => team.id).join("-")}><span>联姻组 {index + 1}</span><b>{group.map((team) => team.name).join(" ↔ ")}</b></p>)}{teamImportPreview.alliances.length === 0 && <p><span>无联姻关系</span></p>}</div></section>
          </div>
          {teamImportPreview.unassignedUsers.length > 0 && <details className="team-import-cleared"><summary>将删除的旧用户（{teamImportPreview.unassignedUsers.length} 人）</summary><p>{teamImportPreview.unassignedUsers.map((user) => `${user.name} / ${user.username}（${user.fromTeam}）`).join("、")}</p></details>}
        </div>}
        <div className="admin-warning">确认导入后以表格为真实数据：旧赛程、盘口、竞猜、闯关、战队和普通用户数据全部清除，只保留管理员及系统设置；表格人员按英文名开号，密码 000000。</div>
      </section>
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>账户管理</small><h3>添加用户</h3></div><span>当前 {managedUsers.length} 人</span></div>
        <div className="form-grid user-form">
          <label>中文名<input value={userChineseName} onChange={(event) => setUserChineseName(event.target.value)} placeholder="例如：张三" /></label>
          <label>英文名<input value={userEnglishName} onChange={(event) => setUserEnglishName(event.target.value)} placeholder="例如：Alex" /></label>
          <label>队伍名<select value={userTeam} onChange={(event) => setUserTeam(event.target.value)}><option value="">请选择队伍</option><option value="无">无</option>{availableTeams.map((team) => <option value={team.name} key={team.id}>{team.track}组 · {team.name}</option>)}</select></label>
          <label>初始竞猜币<input type="number" min="0" step="1" value={userInitialCoins} onChange={(event) => setUserInitialCoins(Number(event.target.value))} /></label>
        </div>
        <button className="admin-primary" onClick={submitUser}>添加用户并发放初始竞猜币</button>
      </section>
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>用户列表</small><h3>已添加用户</h3></div><span>删除操作不可撤销</span></div>
        <div className="user-delete-controls">
          <label>选择删除用户<select value={deleteUserId} onChange={(event) => setDeleteUserId(event.target.value)}><option value="">请选择用户</option>{managedUsers.map((user) => <option value={user.id} key={user.id}>{user.chineseName} / {user.englishName} · {user.team}</option>)}</select></label>
          <button disabled={!deleteUserId} onClick={submitDeleteUser}>删除所选用户</button>
        </div>
        <div className="managed-user-table">
          <div className="managed-user-row header"><span>中文名</span><span>英文名</span><span>队伍名</span><span>竞猜币</span><span>账号操作</span></div>
          {managedUsers.map((user) => <div className="managed-user-row" key={user.id}><span><strong>{user.chineseName}</strong></span><span>{user.englishName}</span><span>{user.team}</span><span>{money.format(user.initialCoins)}</span><span><button className="user-reset-button" onClick={() => onResetPassword(user.id)}>重置密码</button></span></div>)}
        </div>
      </section>
    </div>}

    {adminTab === "ASSET" && <div className="admin-grid">
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>资产中心</small><h3>竞猜币发放与扣除</h3></div><span>禁止直接修改数据库余额</span></div>
        <div className="form-grid asset-form">
          <label>目标类型<select value={targetType} onChange={(event) => { const type = event.target.value as "USER" | "TEAM"; setTargetType(type); setTarget(type === "USER" ? (managedUsers[0]?.id ?? "") : (availableTeams[0]?.id ?? "")); }}><option value="USER">指定用户</option><option value="TEAM">指定队伍</option></select></label>
          <label>目标<select value={target} onChange={(event) => setTarget(event.target.value)}>{targetType === "USER" ? managedUsers.map((user) => <option value={user.id} key={user.id}>{user.chineseName} / {user.englishName}</option>) : availableTeams.map((team) => <option value={team.id} key={team.id}>{team.track}组 · {team.name}</option>)}</select></label>
          <label>操作<select value={assetAction} onChange={(event) => setAssetAction(event.target.value as "GRANT" | "DEDUCT")}><option value="GRANT">发放竞猜币</option><option value="DEDUCT">扣除竞猜币</option></select></label>
          <label>金额<input type="number" min="1" step="1" value={assetAmount} onChange={(event) => setAssetAmount(Number(event.target.value))} /></label>
          <label className="wide">操作原因<input value={assetReason} onChange={(event) => setAssetReason(event.target.value)} /></label>
        </div>
        <div className="admin-warning">发放或扣除均生成独立账本流水，保留操作人、目标、原因及调整前后余额。</div>
        <button className="admin-primary" onClick={submitAsset}>确认{assetAction === "GRANT" ? "发放" : "扣除"}</button>
      </section>
    </div>}

    {adminTab === "RECHARGES" && <div className="admin-grid">
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>充值审核</small><h3>用户充值申请</h3></div><span>已成功充值累计 {money.format(rechargeData.totalCompletedAmount)} 竞猜币</span></div>
        <div className="recharge-audit-summary">
          <div><span>待首次确认</span><strong>{rechargeData.requests.filter((request) => request.status === "PENDING").length}</strong></div>
          <div><span>待二次确认</span><strong>{rechargeData.requests.filter((request) => request.status === "FIRST_CONFIRMED").length}</strong></div>
          <div><span>充值成功累计</span><strong>{money.format(rechargeData.totalCompletedAmount)}</strong></div>
        </div>
        <div className="recharge-audit-list">
          {rechargeData.requests.map((request) => <div className="recharge-audit-row" key={request.id}>
            <div><strong>{request.user.name}</strong><small>{request.user.username} · {request.user.team}</small></div>
            <div><span>{money.format(request.baseAmount)} 套餐 · {money.format(request.priceMier)} 米儿</span><b>到账 {money.format(request.amount)}（档位赠送 {money.format(request.bonusAmount)}{request.isFirstRecharge ? `，首充奖励 ${money.format(request.firstRechargeBonus)}` : ""}）</b></div>
            <div><span>申请时间</span><b>{new Date(request.createdAt).toLocaleString("zh-CN", { hour12: false })}</b></div>
            <div className={`recharge-status recharge-${request.status.toLowerCase()}`}>{request.status === "PENDING" ? "待首次确认" : request.status === "FIRST_CONFIRMED" ? `已由 ${request.firstConfirmedBy ?? "管理员"} 首次确认` : request.status === "COMPLETED" ? `充值成功 · ${request.completedBy ?? "管理员"}` : "已驳回"}</div>
            <div className="recharge-audit-actions">
              {request.status === "PENDING" && <><button className="final" onClick={() => { if (window.confirm(`确认一键审核并向 ${request.user.name} 发放 ${money.format(request.amount)} 竞猜币？此操作将直接完成审核与到账。`)) onReviewRecharge(request.id, "ONE_CLICK_CONFIRM"); }}>一键审核并发放</button><button onClick={() => onReviewRecharge(request.id, "FIRST_CONFIRM")}>首次确认</button><button className="reject" onClick={() => onReviewRecharge(request.id, "REJECT")}>驳回</button></>}
              {request.status === "FIRST_CONFIRMED" && <><button className="final" onClick={() => { if (window.confirm(`确认二次审核并向 ${request.user.name} 发放 ${money.format(request.amount)} 竞猜币（含赠送 ${money.format(request.bonusAmount)}）？`)) onReviewRecharge(request.id, "FINAL_CONFIRM"); }}>二次确认并发放</button><button className="reject" onClick={() => onReviewRecharge(request.id, "REJECT")}>驳回</button></>}
            </div>
          </div>)}
          {rechargeData.requests.length === 0 && <div className="bet-detail-empty">暂无充值申请</div>}
        </div>
        <div className="admin-warning">可使用“一键审核并发放”直接完成审核与到账，也可保留首次、二次确认流程。充值金额仅在本页单独统计，不纳入后台净额。</div>
      </section>
    </div>}

    {adminTab === "TREASURY" && <div className="admin-grid">
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>运营资金</small><h3>后台净额明细</h3></div><span>充值金额独立统计，不计入本页</span></div>
        {treasury ? <>
          <div className="treasury-summary">
            <div className="treasury-rake"><span>累计单场抽水</span><strong>+{money.format(treasury.rake)}</strong></div>
            <div className="treasury-pool"><span>单场盘口累计注入</span><strong>-{money.format(treasury.marketInjection)}</strong></div>
            <div className="treasury-pool"><span>未结算过关奖池占用</span><strong>-{money.format(treasury.parlayPool)}</strong></div>
            <div className="treasury-net"><span>后台净额</span><strong>{money.format(treasury.total)}</strong></div>
          </div>
          <div className="admin-warning">计算公式：后台净额 = 累计单场抽水 − 单场盘口累计注入 − 所有未结算过关奖池。门票额外注入包含在过关奖池内。</div>
          <div className="treasury-columns">
            <section>
              <h4>单场抽水收入</h4>
              <div className="treasury-list">
                {treasury.rakeEntries.map((entry) => <div key={entry.id}><span><strong>{entry.note ?? "单场竞猜后台抽水"}</strong><small>{entry.reference.replace("house-rake:", "比赛：")} · {new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></span><b>+{money.format(entry.amount)}</b></div>)}
                {treasury.rakeEntries.length === 0 && <p>暂无已结算比赛抽水</p>}
              </div>
            </section>
            <section>
              <h4>单场盘口注入支出</h4>
              <div className="treasury-list">
                {treasury.marketInjections.map((entry) => <div key={entry.id}><span><strong>{entry.note ?? "单场盘口注入"}</strong><small>{new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></span><b>-{money.format(entry.amount)}</b></div>)}
                {treasury.marketInjections.length === 0 && <p>暂无单场盘口注入</p>}
              </div>
            </section>
            <section>
              <h4>未结算过关奖池</h4>
              <div className="treasury-list">
                {treasury.parlayRounds.map((round) => <div key={`${round.scope}-${round.dayKey}`}><span><strong>{parlayPeriodLabel(round.scope, round.dayKey)} {parlayScopeLabel(round.scope)} · {round.marketCount} 场</strong><small>基础 {money.format(round.basePool)} + 结转 {money.format(round.carryover)} + {round.entryCount} 张门票 × {money.format(round.ticketContribution)}；额外注入 {money.format(round.ticketBonus)}</small></span><b>-{money.format(round.pool)}</b></div>)}
                {treasury.parlayRounds.length === 0 && <p>当前没有未结算过关奖池</p>}
              </div>
            </section>
          </div>
        </> : <div className="bet-detail-empty">正在读取后台净额明细…</div>}
      </section>
    </div>}

    {adminTab === "RULES" && <div className="admin-grid">
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>多场过关</small><h3>门票、分档奖池与动态加成</h3></div><span>3 场起，6 场及以上共用一档</span></div>
        <div className="form-grid parlay-settings-form">
          <label>门票价格<input type="number" min="1" value={ticket} onChange={(event) => setTicket(Number(event.target.value))} /></label>
          <label>门票奖池加成倍数<input type="number" min="0" max="100" step="0.1" value={bonusMultiplier} onChange={(event) => setBonusMultiplier(Number(event.target.value))} /></label>
          <div className="parlay-ticket-preview"><span>每张门票计入奖池</span><strong>{money.format(perTicketPoolIncrease)} 竞猜币</strong><small>{money.format(ticket)} ×（1 + {bonusMultiplier}）</small></div>
          <label>3 场基础奖池<input type="number" min="0" step="1" value={basePools.three} onChange={(event) => setBasePools((current) => ({ ...current, three: Number(event.target.value) }))} /></label>
          <label>4 场基础奖池<input type="number" min="0" step="1" value={basePools.four} onChange={(event) => setBasePools((current) => ({ ...current, four: Number(event.target.value) }))} /></label>
          <label>5 场基础奖池<input type="number" min="0" step="1" value={basePools.five} onChange={(event) => setBasePools((current) => ({ ...current, five: Number(event.target.value) }))} /></label>
          <label>6 场及以上基础奖池<input type="number" min="0" step="1" value={basePools.sixPlus} onChange={(event) => setBasePools((current) => ({ ...current, sixPlus: Number(event.target.value) }))} /></label>
        </div>
        <div className="admin-warning">当前奖池 = 对应场次数的基础奖池 + 结转奖池 + 参与门票数 × 每张门票计入奖池金额。例如门票 100、加成 0.5 时，每张门票使奖池增加 150 竞猜币。</div>
        <button className="admin-primary" onClick={submitParlaySettings}>保存全部过关参数</button>
      </section>
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>独立周玩法</small><h3>本周 A 组过关参数</h3></div><span>A 组 6 场全部确认后开放</span></div>
        <div className="form-grid parlay-settings-form">
          <label>门票价格<input type="number" min="1" step="1" value={weeklyParlayForm.ticket} onChange={(event) => setWeeklyParlayForm((current) => ({ ...current, ticket: Number(event.target.value) }))} /></label>
          <label>基础奖池<input type="number" min="0" step="1" value={weeklyParlayForm.basePool} onChange={(event) => setWeeklyParlayForm((current) => ({ ...current, basePool: Number(event.target.value) }))} /></label>
          <label>门票奖池加成倍数<input type="number" min="0" max="100" step="0.1" value={weeklyParlayForm.bonusMultiplier} onChange={(event) => setWeeklyParlayForm((current) => ({ ...current, bonusMultiplier: Number(event.target.value) }))} /></label>
          <div className="parlay-ticket-preview"><span>每张门票计入 A 组奖池</span><strong>{money.format(ticketPoolContribution(weeklyParlayForm.ticket, Math.round(weeklyParlayForm.bonusMultiplier * 10_000)))} 竞猜币</strong><small>与其他过关独立计算</small></div>
        </div>
        <button className="admin-primary" onClick={() => submitWeeklyParlaySettings("A")}>保存本周 A 组参数</button>
      </section>
      <section className="admin-card admin-wide">
        <div className="admin-card-head"><div><small>独立周玩法</small><h3>本周 B 组过关参数</h3></div><span>B 组 6 场全部确认后开放</span></div>
        <div className="form-grid parlay-settings-form">
          <label>门票价格<input type="number" min="1" step="1" value={weeklyBParlayForm.ticket} onChange={(event) => setWeeklyBParlayForm((current) => ({ ...current, ticket: Number(event.target.value) }))} /></label>
          <label>基础奖池<input type="number" min="0" step="1" value={weeklyBParlayForm.basePool} onChange={(event) => setWeeklyBParlayForm((current) => ({ ...current, basePool: Number(event.target.value) }))} /></label>
          <label>门票奖池加成倍数<input type="number" min="0" max="100" step="0.1" value={weeklyBParlayForm.bonusMultiplier} onChange={(event) => setWeeklyBParlayForm((current) => ({ ...current, bonusMultiplier: Number(event.target.value) }))} /></label>
          <div className="parlay-ticket-preview"><span>每张门票计入 B 组奖池</span><strong>{money.format(ticketPoolContribution(weeklyBParlayForm.ticket, Math.round(weeklyBParlayForm.bonusMultiplier * 10_000)))} 竞猜币</strong><small>与其他过关独立计算</small></div>
        </div>
        <button className="admin-primary" onClick={() => submitWeeklyParlaySettings("B")}>保存本周 B 组参数</button>
      </section>
      <section className="admin-card">
        <div className="admin-card-head"><div><small>比赛奖励</small><h3>点券奖励参数</h3></div><span>结算时自动发放</span></div>
        <div className="form-grid ratio-form">
          <label>小局基础奖<input type="number" min="0" step="1" value={pointRewardForm.smallGameWinPoints} onChange={(event) => setPointRewardForm((current) => ({ ...current, smallGameWinPoints: Number(event.target.value) }))} /><em>点券</em></label>
          <label>联姻加成奖<input type="number" min="0" step="1" value={pointRewardForm.allianceGameWinPoints} onChange={(event) => setPointRewardForm((current) => ({ ...current, allianceGameWinPoints: Number(event.target.value) }))} /><em>点券</em></label>
          <label>BO2/BO3 胜场奖<input type="number" min="0" step="1" value={pointRewardForm.seriesWinPoints} onChange={(event) => setPointRewardForm((current) => ({ ...current, seriesWinPoints: Number(event.target.value) }))} /><em>点券</em></label>
        </div>
        <div className="admin-warning">小局基础奖发给该局获胜队员；联姻加成奖发给获胜队所在联姻大组成员；BO2/BO3 胜场奖仅在系列赛分出胜负时额外发给胜队队员。</div>
        <button className="admin-primary" onClick={submitPointRewards}>保存点券奖励参数</button>
      </section>
      <section className="admin-card">
        <div className="admin-card-head"><div><small>动态奖池</small><h3>结算比例</h3></div><span className={ratioForm.returnPercent + ratioForm.recoveryPercent + ratioForm.prizePercent === 100 ? "ratio-ok" : "ratio-error"}>合计 {ratioForm.returnPercent + ratioForm.recoveryPercent + ratioForm.prizePercent}%</span></div>
        <div className="form-grid ratio-form">
          <label>本金返还<input type="number" min="0" max="100" value={ratioForm.returnPercent} onChange={(event) => setRatioForm((current) => ({ ...current, returnPercent: Number(event.target.value) }))} /><em>%</em></label>
          <label>后台抽水<input type="number" min="0" max="100" value={ratioForm.recoveryPercent} onChange={(event) => setRatioForm((current) => ({ ...current, recoveryPercent: Number(event.target.value) }))} /><em>%</em></label>
          <label>用户奖励<input type="number" min="0" max="100" value={ratioForm.prizePercent} onChange={(event) => setRatioForm((current) => ({ ...current, prizePercent: Number(event.target.value) }))} /><em>%</em></label>
        </div>
        <button className="admin-primary" onClick={submitRatios}>保存结算比例</button>
      </section>
    </div>}
  </section>;
}
