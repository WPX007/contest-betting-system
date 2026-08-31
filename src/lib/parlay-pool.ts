export type ParlayBasePools = {
  three: number;
  four: number;
  five: number;
  sixPlus: number;
};

export function basePoolForMarketCount(pools: ParlayBasePools, marketCount: number) {
  if (marketCount <= 3) return pools.three;
  if (marketCount === 4) return pools.four;
  if (marketCount === 5) return pools.five;
  return pools.sixPlus;
}

export function ticketPoolContribution(ticketStake: number, bonusBps: number) {
  return Math.round(ticketStake * (10_000 + bonusBps) / 10_000);
}

export function calculateParlayPool(input: {
  basePool: number;
  carryover: number;
  ticketStake: number;
  ticketPoolBonusBps: number;
  entryCount: number;
}) {
  return input.basePool
    + input.carryover
    + input.entryCount * ticketPoolContribution(input.ticketStake, input.ticketPoolBonusBps);
}
