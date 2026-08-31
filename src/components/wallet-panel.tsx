"use client";

import { useState, type FormEvent } from "react";

export type WalletEntry = {
  id: string;
  title: string;
  reason: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};

export type HouseTreasury = {
  rake: number;
  marketInjection: number;
  parlayPool: number;
  parlayTicketBonus: number;
  total: number;
};

const money = new Intl.NumberFormat("zh-CN");

export function WalletPanel({
  balance,
  points,
  entries,
  loading,
  treasury,
  onExchange,
}: {
  balance: number;
  points: number;
  entries: WalletEntry[];
  loading: boolean;
  treasury?: HouseTreasury | null;
  onExchange?: (points: number) => Promise<boolean>;
}) {
  const [exchangePoints, setExchangePoints] = useState(0);
  const [exchanging, setExchanging] = useState(false);
  const validExchange = Number.isInteger(exchangePoints) && exchangePoints > 0 && exchangePoints <= points;

  async function submitExchange(event: FormEvent) {
    event.preventDefault();
    if (!onExchange || !validExchange) return;
    setExchanging(true);
    try {
      if (await onExchange(exchangePoints)) setExchangePoints(0);
    } finally {
      setExchanging(false);
    }
  }

  return <section className="panel"><div className="wallet-hero"><div><p>{treasury ? "后台竞猜币净额" : "竞猜币可用余额"}</p><strong>{money.format(balance)}</strong><span>{treasury ? `抽水 +${money.format(treasury.rake)} · 单场盘口注入 -${money.format(treasury.marketInjection)} · 未结算过关奖池 -${money.format(treasury.parlayPool)}（其中门票额外注入 -${money.format(treasury.parlayTicketBonus)}）` : "全部变动均记录在账本流水"}</span></div><div><p>点券余额</p><strong>{money.format(points)}</strong><span>用于赛季奖品兑换</span></div></div>
    {!treasury && onExchange && <form className="point-exchange" onSubmit={submitExchange}>
      <div><span>点券兑换竞猜币</span><strong>1 点券 = 5 竞猜币</strong><small>仅支持点券兑换为竞猜币，兑换后不可逆转。</small></div>
      <div className="point-exchange-controls">
        <input type="number" min="1" max={points} step="1" value={exchangePoints || ""} placeholder="输入点券数量" onChange={(event) => setExchangePoints(Number(event.target.value))} />
        <div>{[10, 50, points].map((value, index) => <button type="button" disabled={value <= 0 || value > points} onClick={() => setExchangePoints(value)} key={`${value}-${index}`}>{index === 2 ? "全部" : value}</button>)}</div>
        <button className="point-exchange-submit" type="submit" disabled={!validExchange || exchanging}>{exchanging ? "兑换中…" : validExchange ? `兑换为 ${money.format(exchangePoints * 5)} 竞猜币` : "确认兑换"}</button>
      </div>
    </form>}
    <h2>钱包流水</h2><div className="data-table"><div className="tr th"><span>事项</span><span>时间</span><span>金额</span><span>余额</span></div>{entries.map((item) => <div className="tr" key={item.id}><span>{item.title}</span><span>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</span><span className={item.amount >= 0 ? "positive" : "negative"}>{item.amount > 0 ? "+" : ""}{item.amount}</span><span>{money.format(item.balanceAfter)}</span></div>)}{!loading && entries.length === 0 && <div className="order-empty">{treasury ? "暂无抽水流水。未结算的过关奖池已作为负数计入上方后台净额。" : "暂无钱包流水"}</div>}</div>
  </section>;
}
