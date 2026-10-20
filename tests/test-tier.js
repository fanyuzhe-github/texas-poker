import {
  TIERS,
  ZERO_TIER,
  tierIndex,
  tierOf,
  tierLabel,
  tierTone,
  tierRangeText,
  tierTip,
} from "../src/core/tier.js";
import { toCents } from "../src/core/money.js";

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("✓ " + name);
  } else {
    fail++;
    console.log("✗ " + name + (extra ? " → " + extra : ""));
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, "actual=" + actual + " expected=" + expected);
}

/* ---------- 段位表本身 ---------- */
eq("共 12 档（< -100 + 中间 10 档 + > 100）", TIERS.length, 12);
eq("id 唯一", new Set(TIERS.map((t) => t.id)).size, 12);
eq("称号唯一", new Set(TIERS.map((t) => t.label)).size, 12);
ok(
  "每档都有称号 / 吐槽 / 配色",
  TIERS.every((t) => t.label && t.desc && t.tone)
);
ok(
  "配色限五种",
  TIERS.every((t) =>
    ["abyss", "low", "even", "high", "god"].includes(t.tone)
  )
);

/* ---------- 分档边界 ---------- */
const at = (yuan) => tierIndex(toCents(yuan));

eq("-1000 分 → 最低档", at(-1000), 0);
eq("-101 分 → 最低档", at(-101), 0);
eq("-100.01 分 → 最低档", at(-100.01), 0);
eq("-100 分 → 第 2 档（-100~ -80）", at(-100), 1);
eq("-99.99 分 → 第 2 档", at(-99.99), 1);
eq("-80.01 分 → 第 2 档", at(-80.01), 1);
eq("-80 分 → 第 3 档（-80~ -60）", at(-80), 2);
eq("-60 分 → 第 4 档", at(-60), 3);
eq("-40 分 → 第 5 档", at(-40), 4);
eq("-20 分 → 第 6 档", at(-20), 5);
eq("-0.01 分 → 第 7 档（萌新韭菜）", at(-0.01), 6 - 1);
// 分档下标仍是 6（0~20 那一档），只是显示上被「荷官」单独兜走
eq("0 分 → 第 7 档（区间 0~20）", at(0), 6);
eq("20 分 → 第 8 档（奶茶富翁）", at(20), 7);
eq("40 分 → 第 9 档", at(40), 8);
eq("60 分 → 第 10 档", at(60), 9);
eq("80 分 → 第 11 档", at(80), 10);
eq("99.99 分 → 第 11 档", at(99.99), 10);
eq("100 分 → 第 11 档（含 100，不进位）", at(100), 10);
eq("100.01 分 → 最高档", at(100.01), 11);
eq("9999 分 → 最高档", at(9999), 11);

/* ---------- 0 分专属档「荷官」 ---------- */
eq("0 分 → 荷官", tierLabel(0), "荷官");
eq("0 分档的 id", tierOf(0).id, "dealer");
eq("0 分区间文案不套用 0~20", tierRangeText(0), "0 分");
ok("0 分提示说清是发牌的", tierTip(0).includes("发牌"));
eq("荷官不占 12 档", TIERS.length, 12);
ok(
  "荷官的 id / 称号不跟 12 档撞车",
  !TIERS.some((t) => t.id === ZERO_TIER.id || t.label === ZERO_TIER.label)
);
eq("赢 10 块仍算小富即安（0~20 那一档）", tierLabel(10), "小富即安");
eq("输 1 分仍算萌新韭菜", tierLabel(-10), "萌新韭菜");

/* ---------- 称号 / 提示 ---------- */
eq("最低档称号", tierLabel(-500), "人形 ATM");
eq("中间档称号", tierLabel(10), "小富即安");
eq("-90 分称号（对调后）", tierLabel(-90), "慈善赌王");
eq("-70 分称号（对调后）", tierLabel(-70), "散财童子");
eq("-30 分称号", tierLabel(-30), "充值战神");
eq("-10 分称号", tierLabel(-10), "萌新韭菜");
eq("30 分称号", tierLabel(30), "奶茶富翁");
eq("70 分称号", tierLabel(70), "割韭狂魔");
eq("90 分称号", tierLabel(90), "点石成金");
eq("最高档称号", tierLabel(500), "赌神下凡");
eq("配色：深渊", tierTone(-500), "abyss");
eq("配色：封神", tierTone(500), "god");
eq("区间文案：最低档", tierRangeText(-500), "低于 -100 分");
eq("区间文案：最高档", tierRangeText(500), "高于 +100 分");
eq("区间文案：-100 起", tierRangeText(-100), "-100 ~ -80 分");
eq("区间文案：0 ~ 20", tierRangeText(10), "0 ~ +20 分");
eq("区间文案：末档含 100", tierRangeText(100), "+80 ~ +100 分");
ok("提示带吐槽和区间", tierTip(10).includes("踏实") && tierTip(10).includes("分"));
ok("割韭狂魔文案", tierTip(70).includes("镰刀所至"));
ok("点石成金文案", tierTip(90).includes("碰啥啥赢"));
ok("脏数据不炸", tierOf(undefined).label && tierOf(NaN).label);
eq("脏数据按 0 分处理（money.toCents 会先归零）", tierOf(NaN).id, "dealer");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " 项通过，" + fail + " 项失败");
process.exit(fail ? 1 : 0);
