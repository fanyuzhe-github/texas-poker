/**
 * 实物筹码 → 记分筹码 的换算表。
 *
 * 牌桌上真正拿的是 1000 / 500 / 100 / 50 四种面值的实物筹码，
 * 而记账口径（底注、剩余筹码、盈亏）用的是「筹码」这个单位：
 *
 *   实物 1000 → 1     筹码
 *   实物  500 → 0.5   筹码
 *   实物  100 → 0.1   筹码
 *   实物   50 → 0.05  筹码
 *
 * 最小面值 50 正好等于 0.05，换算到「分」全是整数，
 * 所以沿用 money.js 的整数运算，不会出现 0.1 + 0.2 之类的浮点误差。
 */
import { toCents, fromCents } from "./money";

export const CHIP_DENOMINATIONS = [
  { key: "c1000", label: "1000", chips: 1 },
  { key: "c500", label: "500", chips: 0.5 },
  { key: "c100", label: "100", chips: 0.1 },
  { key: "c50", label: "50", chips: 0.05 },
];

/** 四种面值的数量表，全部归零 */
export function emptyCounts() {
  return CHIP_DENOMINATIONS.reduce(
    (acc, item) => ({ ...acc, [item.key]: 0 }),
    {}
  );
}

/** 玩家填的数量 → 非负整数（空值按 0 算，最多认 6 位） */
export function normalizeCount(raw) {
  const text = String(raw == null ? "" : raw).replace(/[^\d]/g, "");
  if (text === "") return 0;
  const num = parseInt(text.slice(0, 6), 10);
  return Number.isFinite(num) ? num : 0;
}

/** 某个面值若干个 → 折合多少筹码 */
export function amountOf(count, chipsPerPiece) {
  return fromCents(normalizeCount(count) * toCents(chipsPerPiece));
}

/** 四个面值的数量表 → 合计筹码数 */
export function chipsFromCounts(counts) {
  const source = counts || {};
  const cents = CHIP_DENOMINATIONS.reduce(
    (acc, item) => acc + normalizeCount(source[item.key]) * toCents(item.chips),
    0
  );
  return fromCents(cents);
}

/**
 * 反向换算：把筹码数拆成各面值的数量（大面值优先）。
 * 开局时用它按底注预填一份数量，玩家只需微调；
 * 底注不是 0.05 的整数倍时，零头会被忽略（本来也没法用实物筹码摆出来）。
 */
export function countsFromChips(chips) {
  const counts = emptyCounts();
  let rest = Math.max(0, toCents(chips));

  CHIP_DENOMINATIONS.forEach((item) => {
    const step = toCents(item.chips);
    const num = Math.floor(rest / step);
    counts[item.key] = num;
    rest -= num * step;
  });

  return counts;
}
