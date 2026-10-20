import {
  applyOutcome,
  buildMainRanking,
  selectableNames,
  childrenOf,
  isGroupOnly,
} from "../src/core/ranking.js";

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}\n      实际: ${a}\n      期望: ${b}`);
  }
}

const mk = (name, parent, score, raceResult) => ({
  name,
  parent: parent || null,
  score,
  raceResult: raceResult || { win: 0, lose: 0, deuce: 0 },
  lastState: "deuce",
  stateTimes: 0,
  raceDate: 0,
});

console.log("\n[1] 子账号上桌：战绩记在子账号，主账号不重复累加");
{
  const players = [mk("张三", null, 0), mk("三哥", "张三", 0)];
  const next = applyOutcome(players, [
    { name: "三哥", delta: 8, result: "win" },
  ]);
  const main = next.find((p) => p.name === "张三");
  const sub = next.find((p) => p.name === "三哥");
  check("子账号积分 +8", sub.score, 8);
  check("主账号自身不加分（避免翻倍）", main.score, 0);
  check("主账号自身不计场次", main.raceResult.win, 0);
  // 汇总值由 buildMainRanking 在展示时算出
  const ranking = buildMainRanking(next);
  const shown = ranking.find((r) => r.name === "张三");
  check("展示时主账号汇总为 +8", shown.score, 8);
  check("展示时主账号胜场 1", shown.raceResult.win, 1);
  check("展示时连胜状态", shown.stateTimes, 1);
}

console.log("\n[2] 多个子账号同场，汇总不翻倍");
{
  const players = [
    mk("张三", null, 0),
    mk("三哥", "张三", 0),
    mk("小张", "张三", 0),
  ];
  const next = applyOutcome(players, [
    { name: "三哥", delta: 5, result: "win" },
    { name: "小张", delta: -5, result: "lose" },
  ]);
  const subA = next.find((p) => p.name === "三哥");
  const subB = next.find((p) => p.name === "小张");
  check("子账号 A 记 +5", subA.score, 5);
  check("子账号 B 记 -5", subB.score, -5);

  const ranking = buildMainRanking(next);
  const main = ranking.find((r) => r.name === "张三");
  check("主账号汇总积分 = 5 + (-5) = 0", main.score, 0);
  check("主账号胜场 1（不翻倍）", main.raceResult.win, 1);
  check("主账号负场 1（不翻倍）", main.raceResult.lose, 1);
}

console.log("\n[2b] 连续两局不翻倍（回归用例）");
{
  let players = [mk("张三", null, 0), mk("三哥", "张三", 0)];
  players = applyOutcome(players, [{ name: "三哥", delta: 5, result: "win" }]);
  players = applyOutcome(players, [{ name: "三哥", delta: -2, result: "lose" }]);
  const ranking = buildMainRanking(players);
  const main = ranking.find((r) => r.name === "张三");
  check("两局后主账号 5-2=3", main.score, 3);
  check("胜场 1", main.raceResult.win, 1);
  check("负场 1", main.raceResult.lose, 1);
  check("子账号自身 3", players.find((p) => p.name === "三哥").score, 3);
}

console.log("\n[3] 浮点金额不产生误差");
{
  const players = [mk("张三", null, 0), mk("三哥", "张三", 0)];
  let list = players;
  list = applyOutcome(list, [{ name: "三哥", delta: 0.1, result: "win" }]);
  list = applyOutcome(list, [{ name: "三哥", delta: 0.2, result: "win" }]);
  const sub = list.find((p) => p.name === "三哥");
  check("子账号 0.1 + 0.2 = 0.3", sub.score, 0.3);
  const shown = buildMainRanking(list).find((r) => r.name === "张三");
  check("展示汇总也是 0.3", shown.score, 0.3);
}

console.log("\n[4] buildMainRanking 汇总名下所有子账号");
{
  const players = [
    mk("张三", null, 0, { win: 2, lose: 0, deuce: 0 }),
    mk("三哥", "张三", 12.5, { win: 1, lose: 0, deuce: 0 }),
    mk("小张", "张三", -3.25, { win: 0, lose: 1, deuce: 0 }),
    mk("李四", null, 7, { win: 1, lose: 0, deuce: 0 }),
  ];
  const ranking = buildMainRanking(players);
  check("只列主账号", ranking.map((r) => r.name), ["张三", "李四"]);
  const zhang = ranking.find((r) => r.name === "张三");
  check("主账号积分 = 0 + 12.5 - 3.25", zhang.score, 9.25);
  check("主账号胜场汇总", zhang.raceResult.win, 3);
  check("主账号负场汇总", zhang.raceResult.lose, 1);
  check("children 明细个数", zhang.children.length, 2);
  check("按积分降序", ranking[0].name, "张三");
}

console.log("\n[5] 主账号自身历史积分也要计入");
{
  // 张三在挂子账号之前自己上过桌，攒了 5 分
  const players = [mk("张三", null, 5), mk("三哥", "张三", 10)];
  const ranking = buildMainRanking(players);
  check("5 + 10 = 15", ranking[0].score, 15);
}

console.log("\n[6] selectableNames 也包含主账号（主账号可上桌）");
{
  const players = [
    mk("张三", null, 0),
    mk("三哥", "张三", 0),
    mk("李四", null, 0), // 独立玩家，无子账号
  ];
  // 保持原列表顺序：三哥(index1) 在 李四(index2) 之前
  check("可上桌名单", selectableNames(players), ["张三", "三哥", "李四"]);
  check("张三是分组容器", isGroupOnly(players[0], players), true);
  check("李四不是分组容器", isGroupOnly(players[2], players), false);
  check("childrenOf 取值", childrenOf(players, "张三").length, 1);
}

console.log("\n[7] 防御：parent 指向不存在的账号 → 降级为独立玩家");
{
  const players = [mk("孤儿", "不存在的主账号", 9)];
  const ranking = buildMainRanking(players);
  check("不会消失，作为独立玩家出现", ranking.map((r) => r.name), ["孤儿"]);
  check("积分保留", ranking[0].score, 9);
}

console.log("\n[8] 无主账号时不影响原有行为");
{
  const players = [mk("甲", null, 0), mk("乙", null, 0)];
  const next = applyOutcome(players, [
    { name: "甲", delta: 6, result: "win" },
    { name: "乙", delta: -6, result: "lose" },
  ]);
  check("甲 +6", next.find((p) => p.name === "甲").score, 6);
  check("乙 -6", next.find((p) => p.name === "乙").score, -6);
  check("可选名单全员", selectableNames(players), ["甲", "乙"]);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
