export type SettlementInput = {
  totalPool: number;
  winnerPool: number;
  stake: number;
  returnRatio?: number;
  prizeRatio?: number;
};

export type SettlementResult = {
  returnedStake: number;
  prize: number;
  payout: number;
  recovery: number;
};

const asWholeCoin = (value: number) => Math.floor(value);

export function calculateSettlement({
  totalPool,
  winnerPool,
  stake,
  returnRatio = 0.25,
  prizeRatio = 0.7,
}: SettlementInput): SettlementResult {
  if (totalPool < 0 || winnerPool <= 0 || stake < 0) {
    throw new Error("结算参数无效");
  }

  const returnedStake = asWholeCoin(stake * returnRatio);
  const prize = asWholeCoin(totalPool * prizeRatio * (stake / winnerPool));

  return {
    returnedStake,
    prize,
    payout: returnedStake + prize,
    recovery: asWholeCoin(totalPool * (1 - returnRatio - prizeRatio)),
  };
}

export function validateStake(balance: number, stake: number) {
  const cap = balance;
  if (!Number.isInteger(stake) || stake < 50) {
    return { valid: false, cap, message: "单次下注至少为 50 竞猜币" };
  }
  if (stake > balance) {
    return { valid: false, cap, message: "竞猜币余额不足" };
  }
  return { valid: true, cap, message: "" };
}

export function isConflicted(
  viewerTeam: string | undefined,
  viewerAlliance: string | undefined,
  homeTeam: string,
  awayTeam: string,
  homeAlliance: string,
  awayAlliance: string,
) {
  return Boolean(
    viewerTeam &&
      (viewerTeam === homeTeam ||
        viewerTeam === awayTeam ||
        viewerAlliance === homeAlliance ||
        viewerAlliance === awayAlliance),
  );
}
