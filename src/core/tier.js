/**
 * 段位：按总榜积分把玩家分档，纯函数，不写存储。
 *
 * 分档口径（单位：元，内部一律换算成「分」做整数比较）：
 *   score < -100        → 最低档（第 0 档）
 *   -100 ≤ score ≤ 100  → 每 20 分一档，共 10 档（-100~-80 / -80~-60 / … / 80~100）
 *   score > 100         → 最高档（最后一档）
 * 合计 12 档。区间一律「含下不含上」，只有最上面的 80~100 含 100（100 之后就归最高档了）。
 */
import { toCents } from "./money";

/** 分档下限 / 上限 / 步长，单位「分」 */
export const TIER_MIN_CENTS = -10000;
export const TIER_MAX_CENTS = 10000;
export const TIER_STEP_CENTS = 2000;

/**
 * 12 档段位，从输到赢排列。
 * tone 只影响配色：abyss 深渊 / low 吃亏 / even 持平 / high 上手 / god 封神。
 */
export const TIERS = [
  {
    id: "atm",
    label: "人形 ATM",
    desc: "提款请排队，他一直在往外吐钱",
    tone: "abyss",
  },
  {
    id: "philanthropist",
    label: "慈善赌王",
    desc: "本场最佳赞助商，没有之一",
    tone: "abyss",
  },
  {
    id: "almsgiver",
    label: "散财童子",
    desc: "输的不是钱，是情怀",
    tone: "low",
  },
  {
    id: "leek",
    label: "资深韭菜",
    desc: "割完一茬，又长一茬",
    tone: "low",
  },
  {
    id: "recharge",
    label: "充值战神",
    desc: "钱包已空，信仰仍在",
    tone: "low",
  },
  {
    id: "almost",
    label: "萌新韭菜",
    desc: "差一点点，就差亿点点",
    tone: "even",
  },
  {
    id: "breakeven",
    label: "小富即安",
    desc: "赢的不多，但赢得踏实",
    tone: "even",
  },
  {
    id: "milktea",
    label: "奶茶富翁",
    desc: "赢的钱刚够加个珍珠",
    tone: "high",
  },
  {
    id: "newrich",
    label: "牌桌新贵",
    desc: "气势起来了，牌也顺了",
    tone: "high",
  },
  {
    id: "harvest",
    label: "割韭狂魔",
    desc: "镰刀所至，寸草不生",
    tone: "high",
  },
  {
    id: "olddog",
    label: "点石成金",
    desc: "金手指，碰啥啥赢",
    tone: "god",
  },
  {
    id: "god",
    label: "赌神下凡",
    desc: "建议限制他上桌的次数",
    tone: "god",
  },
];

/** 中间 10 档的第一档在 TIERS 里的下标（第 0 档是「小于 -100」） */
const FIRST_BAND = 1;
/** 中间 10 档的最后一档下标（最后一档是「大于 100」） */
const LAST_BAND = TIERS.length - 2;

/**
 * 算段位下标。
 * @param {number} cents 积分（分）
 * @returns {number} 0 ~ TIERS.length-1
 */
export function tierIndex(cents) {
  if (!Number.isFinite(cents)) return 0;
  if (cents < TIER_MIN_CENTS) return 0;
  if (cents > TIER_MAX_CENTS) return TIERS.length - 1;
  const band =
    Math.floor((cents - TIER_MIN_CENTS) / TIER_STEP_CENTS) + FIRST_BAND;
  // 100 分整落在 80~100 这一档，不进位到「大于 100」
  return Math.min(band, LAST_BAND);
}

/**
 * 取段位对象。
 * @param {number} score 积分（元，内部转「分」）
 * @returns {object} TIERS 里的某一档
 */
export function tierOf(score) {
  return TIERS[tierIndex(toCents(score))];
}

/** 段位称号 */
export function tierLabel(score) {
  return tierOf(score).label;
}

/** 配色档位，给 CSS 用 */
export function tierTone(score) {
  return tierOf(score).tone;
}

/** 段位区间文案，单位「元」 */
export function tierRangeText(score) {
  const index = tierIndex(toCents(score));
  const min = (TIER_MIN_CENTS + (index - FIRST_BAND) * TIER_STEP_CENTS) / 100;
  if (index === 0) return "低于 -100 分";
  if (index === TIERS.length - 1) return "高于 +100 分";
  if (index === LAST_BAND) return `+${min} ~ +100 分`;
  const max = min + TIER_STEP_CENTS / 100;
  return `${min} ~ ${max > 0 ? "+" + max : max} 分`;
}

/** 悬浮提示：吐槽 + 区间 */
export function tierTip(score) {
  const tier = tierOf(score);
  return `${tier.desc}（${tierRangeText(score)}）`;
}
