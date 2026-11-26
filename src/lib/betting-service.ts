import { z } from "zod";
import { validateStake } from "./settlement";

export const placeBetSchema = z.object({
  marketId: z.string().min(1),
  optionId: z.string().min(1),
  stake: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

export type Actor = {
  userId: string;
  role: "VIEWER" | "PLAYER" | "CAPTAIN" | "SCOREKEEPER" | "OPS_ADMIN" | "SUPER_ADMIN";
  balance: number;
};

export type BetMarket = {
  id: string;
  status: "OPEN" | "CLOSED" | "SETTLED" | "VOIDED";
  closesAt: Date;
};

export function assertBetAllowed(input: unknown, actor: Actor, market: BetMarket, now = new Date()) {
  const bet = placeBetSchema.parse(input);
  if (market.status !== "OPEN" || market.closesAt <= now) {
    throw new Error("该盘口当前不可下注");
  }
  if (actor.role === "OPS_ADMIN" || actor.role === "SUPER_ADMIN") {
    throw new Error("赛事管理角色不得参与盘口竞猜");
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

export function assertOwnTeamBetOption(
  teamId: string | null,
  match: { homeTeamId: string; awayTeamId: string },
  optionKey: "home" | "draw" | "away",
) {
  if (!teamId) return;
  const requiredOption = teamId === match.homeTeamId ? "home" : teamId === match.awayTeamId ? "away" : null;
  if (requiredOption && optionKey !== requiredOption) {
    throw new Error("自己上场的比赛只能竞猜本队 2:0 获胜（客队显示为 0:2）");
  }
}

export function reconciliation(totalPool: number, returned: number, prizes: number, recovery: number) {
  return {
    isBalanced: totalPool === returned + prizes + recovery,
    delta: totalPool - returned - prizes - recovery,
  };
}
