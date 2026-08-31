import { z } from "zod";
import { isConflicted, validateStake } from "./settlement";

export const placeBetSchema = z.object({
  marketId: z.string().min(1),
  optionId: z.string().min(1),
  stake: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

export type Actor = {
  userId: string;
  role: "VIEWER" | "PLAYER" | "CAPTAIN" | "SCOREKEEPER" | "OPS_ADMIN" | "SUPER_ADMIN";
  teamId?: string;
  allianceKey?: string;
  balance: number;
};

export type BetMarket = {
  id: string;
  status: "OPEN" | "CLOSED" | "SETTLED" | "VOIDED";
  closesAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeAllianceKey: string;
  awayAllianceKey: string;
};

export function assertBetAllowed(input: unknown, actor: Actor, market: BetMarket, now = new Date()) {
  const bet = placeBetSchema.parse(input);
  if (market.status !== "OPEN" || market.closesAt <= now) {
    throw new Error("该盘口当前不可下注");
  }
  if (actor.role === "SCOREKEEPER" || actor.role === "OPS_ADMIN" || actor.role === "SUPER_ADMIN") {
    throw new Error("赛事管理角色不得参与盘口竞猜");
  }
  if (isConflicted(actor.teamId, actor.allianceKey, market.homeTeamId, market.awayTeamId, market.homeAllianceKey, market.awayAllianceKey)) {
    throw new Error("参赛选手不得竞猜本人或联姻战队的比赛");
  }
  const stakeCheck = validateStake(actor.balance, bet.stake);
  if (!stakeCheck.valid) {
    throw new Error(stakeCheck.message);
  }
  return bet;
}

export function assertSameMarketOption(existingOptionIds: string[], nextOptionId: string) {
  if (existingOptionIds.some((optionId) => optionId !== nextOptionId)) {
    throw new Error("同一场比赛只能选择一种结果，首次下注后只能对原结果加注");
  }
}

export function reconciliation(totalPool: number, returned: number, prizes: number, recovery: number) {
  return {
    isBalanced: totalPool === returned + prizes + recovery,
    delta: totalPool - returned - prizes - recovery,
  };
}
