import { buildDailyPodium, buildTodayRanking } from "../src/core/ranking.js";
import { drawCards, addTickets, emptyCardState } from "../src/core/cards.js";

let pass = 0;
let fail = 0;
function check(label, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✗ ${label}\n      ${error.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "断言失败");
}

function player(name, score, extra = {}) {
  return {
    name,
    score,
    parent: null,
    isMain: false,
    raceResult: { win: 0, lose: 0, deuce: 0 },
    ...extra,
  };
}

console.log("\n今日结算 · 领奖台");

const roster = [
  player("甲", 0, { raceResult: { win: 3, lose: 1, deuce: 0 } }),
  player("乙", 0, { raceResult: { win: 1, lose: 3, deuce: 1 } }),
  player("丙", 0, { raceResult: { win: 2, lose: 2, deuce: 0 } }),
  player("丁", 0, { raceResult: { win: 0, lose: 4, deuce: 0 } }),
  player("子号A", 0, { parent: "甲", raceResult: { win: 5, lose: 0, deuce: 0 } }),
];

const today = [
  player("甲", 30, { raceResult: { win: 3, lose: 1, deuce: 0 } }),
  player("乙", -12, { raceResult: { win: 1, lose: 3, deuce: 1 } }),
  player("丙", 8, { raceResult: { win: 2, lose: 2, deuce: 0 } }),
  player("丁", -20, { raceResult: { win: 0, lose: 4, deuce: 0 } }),
  player("子号A", 55, {
    parent: "甲",
    raceResult: { win: 5, lose: 0, deuce: 0 },
  }),
];
const ranked = buildTodayRanking(today, roster);

check("领奖台展示顺序为 亚军-冠军-季军", () => {
  const podium = buildDailyPodium(ranked, roster);
  assert(podium.length === 3, `应有三人，实际 ${podium.length}`);
  assert(podium[0].rank === 2, `左一应是亚军，实际 ${podium[0].rank}`);
  assert(podium[1].rank === 1, `中间应是冠军，实际 ${podium[1].rank}`);
  assert(podium[2].rank === 3, `右一应是季军，实际 ${podium[2].rank}`);
  assert(podium[1].name === "子号A", `冠军应是子号A，实际 ${podium[1].name}`);
});

check("子账号领奖记到主账号名下", () => {
  const podium = buildDailyPodium(ranked, roster);
  assert(podium[1].owner === "甲", `owner 应是甲，实际 ${podium[1].owner}`);
  assert(podium[1].parent === "甲", "parent 应保留");
});

check("战绩与分数一并带出", () => {
  const podium = buildDailyPodium(ranked, roster);
  const champ = podium[1];
  assert(champ.score === 55, `分数 ${champ.score}`);
  assert(champ.games === 5, `场次 ${champ.games}`);
});

check("不足三人就少给，不硬凑", () => {
  const two = buildDailyPodium(buildTodayRanking(today.slice(0, 2), roster), roster);
  assert(two.length === 2, `应两人，实际 ${two.length}`);
  assert(two.some((i) => i.rank === 1), "要有冠军");
  assert(!two.some((i) => i.rank === 3), "不该有季军");
  assert(buildDailyPodium([], roster).length === 0, "空榜应为空");
});

check("入参非法不炸", () => {
  assert(buildDailyPodium(null, null).length === 0);
  assert(buildDailyPodium(undefined).length === 0);
});

console.log("\n冠军奖励 · 免费抽卡");

function stateWithTickets(name, tickets) {
  return addTickets(emptyCardState(), [{ name, tickets }]);
}

check("free 抽卡不扣券", () => {
  const state = stateWithTickets("甲", 0);
  const result = drawCards(state, "甲", 1, { free: true });
  assert(result.ok, "零券也应能抽");
  assert(result.results.length === 1, "应出一张");
  assert(result.state.players["甲"].tickets === 0, "券数不该变负");
});

check("普通抽卡照旧扣券", () => {
  const state = stateWithTickets("甲", 10);
  const result = drawCards(state, "甲", 1);
  assert(result.ok, "应能抽");
  assert(result.state.players["甲"].tickets === 7, `应剩 7，实际 ${result.state.players["甲"].tickets}`);
});

check("free 抽卡同样推进保底与种子", () => {
  const state = stateWithTickets("甲", 100);
  const result = drawCards(state, "甲", 1, { free: true });
  const me = result.state.players["甲"];
  assert(me.pulls === 1, `pulls 应为 1，实际 ${me.pulls}`);
  assert(me.seed > 1, "种子应前进");
  assert(Object.keys(me.owned).length === 1, "应入库一张卡");
});

check("free 抽卡不会改动传入的存档", () => {
  const state = stateWithTickets("甲", 5);
  drawCards(state, "甲", 1, { free: true });
  assert(state.players["甲"].pulls === 0, "原存档不该被动过");
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
