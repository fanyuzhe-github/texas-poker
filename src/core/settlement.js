/**
 * 结算核心：纯函数，不依赖 Vue / DOM，方便单独验证与复用。
 * 内部统一用「分」参与运算，避免浮点误差导致平账失败。
 */
import { toCents, fromCents } from "./money.js";

/**
 * 校验本局录入的剩余筹码总额是否与投入总额一致。
 * 用每人各自的 buyIn（初始筹码 + 加买）来平账，支持中途加买的场景。
 * @param {Array<{chips: number|string, buyIn: number|string}>} players
 */
export function validateChips(players) {
  const list = Array.isArray(players) ? players : [];
  const expected = list.reduce((acc, player) => acc + toCents(player.buyIn), 0);
  const actual = list.reduce((acc, player) => acc + toCents(player.chips), 0);

  return {
    valid: actual === expected,
    expected: fromCents(expected),
    actual: fromCents(actual),
    diff: fromCents(actual - expected),
  };
}

/**
 * 计算每个人的本局盈亏与胜负。
 * @returns {Array<{name, seatNum, chips, buyIn, delta, result}>}
 */
export function calcOutcome(players) {
  const list = Array.isArray(players) ? players : [];
  return list.map((player) => {
    const delta = toCents(player.chips) - toCents(player.buyIn);
    return {
      name: player.name,
      seatNum: player.seatNum,
      chips: fromCents(toCents(player.chips)),
      buyIn: fromCents(toCents(player.buyIn)),
      delta: fromCents(delta),
      result: delta > 0 ? "win" : delta < 0 ? "lose" : "deuce",
    };
  });
}

/**
 * 生成转账方案：赢家与输家贪心配对，直到一方全部结清。
 *
 * 修复了原递归实现的两个缺陷：
 *  1. 某个赢家被结清后就整体 return，导致后续赢家拿不到钱；
 *  2. 人道模式下输家归零后不会被移除，tolerance 恒为 0 会死循环爆栈。
 *
 * @param {Array<{name, delta}>} records calcOutcome 的结果
 * @param {boolean} humane 人道模式：让输得多的先付清
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
export function buildTransfers(records, humane = false) {
  const list = Array.isArray(records) ? records : [];

  const winners = list
    .filter((item) => toCents(item.delta) > 0)
    .map((item) => ({ name: item.name, cents: toCents(item.delta) }))
    .sort((a, b) => b.cents - a.cents); // 赢得多的优先收款

  const losers = list
    .filter((item) => toCents(item.delta) < 0)
    .map((item) => ({ name: item.name, cents: toCents(item.delta) }))
    // 人道模式：输得多的优先付清；普通模式：输得少的优先付清
    .sort((a, b) => (humane ? a.cents - b.cents : b.cents - a.cents));

  const transfers = [];
  let w = 0;
  let l = 0;

  while (w < winners.length && l < losers.length) {
    const winner = winners[w];
    const loser = losers[l];

    if (winner.cents === 0) {
      w += 1;
      continue;
    }
    if (loser.cents === 0) {
      l += 1;
      continue;
    }

    const amount = Math.min(winner.cents, -loser.cents);
    transfers.push({
      from: loser.name,
      to: winner.name,
      amount: fromCents(amount),
    });

    winner.cents -= amount;
    loser.cents += amount;

    if (winner.cents === 0) w += 1;
    if (loser.cents === 0) l += 1;
  }

  return transfers;
}

/**
 * 一步到位完成本局结算。
 * @returns {{valid, diff, expected, actual, records, transfers}}
 */
export function settleGame(players, humane = false) {
  const check = validateChips(players);
  const records = calcOutcome(players);
  const transfers = check.valid ? buildTransfers(records, humane) : [];

  return {
    ...check,
    records,
    transfers,
  };
}

/** 把转账方案渲染成可直接发给牌友的文本 */
export function formatTransfers(transfers) {
  if (!Array.isArray(transfers) || transfers.length === 0) {
    return "本局无需转账";
  }
  return transfers
    .map(
      (item, index) =>
        `${index + 1}. ${item.from} → ${item.to}  ${item.amount.toFixed(2)} 元`
    )
    .join("\n");
}
