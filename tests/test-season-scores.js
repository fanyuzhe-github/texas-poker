/**
 * buildSeasonScores：段位用的「当前赛季积分」
 */
import { buildSeasonScores } from "../src/core/season.js";

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label} → 期望 ${b}，实际 ${a}`);
  }
}

const players = [
  { name: "三哥", parent: null, isMain: true, score: 0 },
  { name: "小号", parent: "三哥", score: 0 },
  { name: "老陈", parent: null, score: 0 },
];

const at = (y, m, d) => new Date(y, m - 1, d, 20, 0, 0).getTime();
const rec = (name, delta) => ({
  name,
  chips: 10 + delta,
  delta,
  result: delta > 0 ? "win" : delta < 0 ? "lose" : "deuce",
});
const round = (time, records) => ({ time, baseChips: 10, records });

const NOW = at(2026, 10, 15); // 2026 秋（9~11 月）

console.log("\n[1] 只统计当前赛季，子账号归集到主账号");
const history = [
  round(at(2026, 10, 1), [rec("小号", 5), rec("老陈", -5)]),
  round(at(2026, 10, 8), [rec("三哥", 3), rec("老陈", -3)]),
  round(at(2026, 7, 10), [rec("小号", 100), rec("老陈", -100)]), // 夏季，不算
];
const scores = buildSeasonScores(history, players, NOW);
check("三哥组 = 子号 5 + 自己 3", scores.get("三哥"), 8);
check("老陈 = -5 + -3", scores.get("老陈"), -8);
check("子账号不单独成条目", scores.has("小号"), false);
check("夏季那 100 分被排除", scores.get("小号"), undefined);

console.log("\n[2] 本赛季没上过桌的账号不在表里（取不到即 0 分）");
check("路人查不到", buildSeasonScores(history, players, NOW).has("路人"), false);

console.log("\n[3] 冬季跨年：12 月与次年 2 月同属一个赛季");
const winterNow = at(2026, 1, 15); // 2026-01 → 归 2025 冬
const winterHistory = [
  round(at(2025, 12, 20), [rec("老陈", 7), rec("三哥", -7)]),
  round(at(2026, 2, 10), [rec("老陈", 2), rec("三哥", -2)]),
];
const ws = buildSeasonScores(winterHistory, players, winterNow);
check("跨年两段合在一起", ws.get("老陈"), 9);
check("对手同步 -9", ws.get("三哥"), -9);

console.log("\n[4] 空数据 / 无赛季");
check("空流水返回空表", buildSeasonScores([], players, NOW).size, 0);
check("玩家表为空也能跑", buildSeasonScores(history, [], NOW).get("老陈"), -8);

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
