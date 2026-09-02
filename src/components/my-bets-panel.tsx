"use client";

import { useState } from "react";

export type BetOrder = {
  id: string;
  marketId: string;
  optionId: string;
  week: number;
  matchup: string;
  optionLabel: string;
  stake: number;
  acceptedOdds: number;
  status: string;
  marketStatus: string;
  won: boolean | null;
  payout: number | null;
  score: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type ParlayOrder = {
  id: string;
  scope: "DAILY" | "WEEKLY" | "WEEKLY_A" | "WEEKLY_B";
  dayKey: string;
  stake: number;
  status: string;
  payout: number | null;
  pool: number;
  closesAt: string;
  createdAt: string;
  legs: Array<{ id: string; matchup: string; optionLabel: string; status: string }>;
};

const money = new Intl.NumberFormat("zh-CN");
const parlayTitle = (order: ParlayOrder) => order.scope === "WEEKLY_A"
  ? `第 ${order.dayKey.match(/\d+/)?.[0] ?? ""} 周 A 组过关`
  : order.scope === "WEEKLY_B"
    ? `第 ${order.dayKey.match(/\d+/)?.[0] ?? ""} 周 B 组过关`
    : order.scope === "WEEKLY"
      ? `第 ${order.dayKey.match(/\d+/)?.[0] ?? ""} 周过关`
      : `${order.dayKey} 今日过关`;

export function MyBetsPanel({ bets, parlays, loading }: { bets: BetOrder[]; parlays: ParlayOrder[]; loading: boolean }) {
  const [kind, setKind] = useState<"SINGLE" | "PARLAY">("SINGLE");
  const orderStatus = (bet: BetOrder) => bet.status === "REFUNDED" ? "已退款" : bet.status === "SETTLED" ? (bet.won ? "已中奖" : "未中奖") : bet.marketStatus === "CLOSED" ? "待结算" : "待封盘";
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">真实订单记录</p><h2>我的竞猜</h2></div><span className="pill">单场 {bets.length} · 过关 {parlays.length}</span></div>
    <div className="order-kind-tabs"><button className={kind === "SINGLE" ? "active" : ""} onClick={() => setKind("SINGLE")}>单场订单</button><button className={kind === "PARLAY" ? "active" : ""} onClick={() => setKind("PARLAY")}>过关订单</button></div>
    {kind === "SINGLE" ? <div className="data-table"><div className="tr th"><span>比赛 / 选项</span><span>下注</span><span>状态</span><span>结算到账</span></div>
      {bets.map((bet) => <div className="tr" key={bet.id}><span><strong>{bet.matchup}</strong><small>第 {bet.week} 周 · {bet.optionLabel} · {new Date(bet.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></span><span>{money.format(bet.stake)}<small>受理 {bet.acceptedOdds.toFixed(2)}×</small></span><span><b className={`status ${bet.status === "SETTLED" ? "settled" : "open"}`}>{orderStatus(bet)}</b><small>{bet.score ?? ""}</small></span><span className={(bet.payout ?? 0) > 0 ? "positive" : ""}>{bet.payout === null ? "—" : `+${money.format(bet.payout)}`}</span></div>)}
      {!loading && bets.length === 0 && <div className="order-empty">暂无单场竞猜订单</div>}
    </div> : <div className="parlay-order-list">
      {parlays.map((order) => <article className="parlay-order-card" key={order.id}><header><div><strong>{parlayTitle(order)}</strong><small>{new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></div><b className={`entry-status-${order.status.toLowerCase()}`}>{order.status === "ACTIVE" ? "进行中" : order.status === "WON" ? "闯关成功" : order.status === "LOST" ? "闯关失败" : "已退款"}</b></header><div>{order.legs.map((leg, index) => <p className={`leg-status-${leg.status.toLowerCase()}`} key={leg.id}><span>{index + 1}. {leg.matchup}</span><strong>{leg.optionLabel}</strong><em>{leg.status === "PENDING" ? "待赛果" : leg.status === "WON" ? "命中" : "未命中"}</em></p>)}</div><footer><span>门票 {money.format(order.stake)} · 截止 {new Date(order.closesAt).toLocaleString("zh-CN", { hour12: false })}</span><strong>{order.payout ? `到账 ${money.format(order.payout)}` : `奖池 ${money.format(order.pool)}`}</strong></footer></article>)}
      {!loading && parlays.length === 0 && <div className="order-empty">暂无过关竞猜订单</div>}
    </div>}
  </section>;
}
