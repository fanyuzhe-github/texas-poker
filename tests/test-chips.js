/**
 * 筹码计算器：四种实物筹码 ↔ 记分筹码的换算
 * 1000 → 1，500 → 0.5，100 → 0.1，50 → 0.05
 */
import {
  CHIP_DENOMINATIONS,
  emptyCounts,
  normalizeCount,
  amountOf,
  chipsFromCounts,
  countsFromChips,
} from "../src/core/chips.js";

let pass = 0;
let fail = 0;

function check(title, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass += 1;
    console.log(`  ✓ ${title}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${title}\n      期望 ${b}\n      实际 ${a}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

group("面值表");
check(
  "四种面值的换算关系",
  CHIP_DENOMINATIONS.map((d) => [d.label, d.chips]),
  [
    ["1000", 1],
    ["500", 0.5],
    ["100", 0.1],
    ["50", 0.05],
  ]
);
check("空表四个键都为 0", Object.values(emptyCounts()), [0, 0, 0, 0]);

group("数量规整");
check("空值算 0", normalizeCount(""), 0);
check("null 算 0", normalizeCount(null), 0);
check("纯数字", normalizeCount("12"), 12);
check("混入非数字被剔除", normalizeCount("1a2"), 12);
check("负数被压成绝对值数字", normalizeCount("-5"), 5);
check("小数只取整数部分", normalizeCount("3.7"), 37);
check("超长数字截断到 6 位", normalizeCount("1234567890"), 123456);

group("合计换算");
check(
  "3×1000 + 2×500 + 4×100 + 1×50 = 4.45",
  chipsFromCounts({ c1000: 3, c500: 2, c100: 4, c50: 1 }),
  4.45
);
check("全 0 得 0", chipsFromCounts(emptyCounts()), 0);
check("不传参数得 0", chipsFromCounts(), 0);
check("空字符串按 0 算", chipsFromCounts({ c1000: "", c500: "", c100: "", c50: "" }), 0);
check("缺键的脏数据按 0 算", chipsFromCounts({ c1000: 2 }), 2);
check("只有 1 个 50（最小面值）", chipsFromCounts({ c50: 1 }), 0.05);
check("10 个 1000 = 10 筹码", chipsFromCounts({ c1000: 10 }), 10);

group("单面值折算");
check("2 个 500 = 1", amountOf(2, 0.5), 1);
check("3 个 100 = 0.3", amountOf(3, 0.1), 0.3);
check("1 个 50 = 0.05", amountOf(1, 0.05), 0.05);
check("空值 = 0", amountOf("", 1), 0);

group("反向拆分（按底注预填）");
check("底注 10 → 10 个 1000", countsFromChips(10), {
  c1000: 10,
  c500: 0,
  c100: 0,
  c50: 0,
});
check("底注 1.5 → 1×1000 + 1×500", countsFromChips(1.5), {
  c1000: 1,
  c500: 1,
  c100: 0,
  c50: 0,
});
check("底注 0.15 → 1×100 + 1×50", countsFromChips(0.15), {
  c1000: 0,
  c500: 0,
  c100: 1,
  c50: 1,
});
check("底注 0 → 全 0", countsFromChips(0), emptyCounts());
check("负数底注 → 全 0", countsFromChips(-5), emptyCounts());
check("底注 10.05 还原 10.05", chipsFromCounts(countsFromChips(10.05)), 10.05);
check("底注 0.5 还原 0.5", chipsFromCounts(countsFromChips(0.5)), 0.5);

group("往返一致性（0.05 的整数倍都能无损还原）");
const roundTrip = [];
for (let cents = 5; cents <= 2000; cents += 5) {
  const chips = cents / 100;
  if (chipsFromCounts(countsFromChips(chips)) !== chips) {
    roundTrip.push(chips);
  }
}
check("0.05 ~ 20.00 全部无损", roundTrip, []);

group("浮点陷阱");
check("0.1 + 0.05 = 0.15（不出现 0.15000000000000002）", chipsFromCounts({ c100: 1, c50: 1 }), 0.15);
check("0.05 × 3 = 0.15", chipsFromCounts({ c50: 3 }), 0.15);
check("20 个 50 = 1", chipsFromCounts({ c50: 20 }), 1);

console.log(`\n筹码换算测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
