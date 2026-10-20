import assert from "node:assert";
import {
  buildDashboard,
  buildTimeline,
  buildScoreBars,
  buildSummary,
  buildAttendance,
  buildResultPie,
  sortByTime,
  formatClock,
} from "../src/core/stats.js";

let pass = 0;
function check(label, fn) {
  try {
    fn();
    pass += 1;
  } catch (error) {
    console.error(`✗ ${label}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

const players = [
  { name: "老陈", score: 0, parent: null, isMain: true, raceResult: { win: 0, lose: 0, deuce: 0 } },
  { name: "老陈小号", score: 0, parent: "老陈", raceResult: { win: 0, lose: 0, deuce: 0 } },
  { name: "闹闹", score: 0, parent: null, raceResult: { win: 0, lose: 0, deuce: 0 } },
  { name: "风沙狂舞", score: 0, parent: null, raceResult: { win: 0, lose: 0, deuce: 0 } },
];

/** 造一局：chips 平账（总和 = 底注 × 人数），delta = chips - 底注 */
function round(time, base, seats) {
  const records = seats.map(([name, chips]) => ({
    name,
    seatNum: 0,
    chips,
    delta: Math.round((chips - base) * 100) / 100,
    result: chips > base ? "win" : chips < base ? "lose" : "deuce",
  }));
  return { id: `g${time}`, time, baseChips: base, records, transfers: [] };
}

// 3 局：老陈小号 +5、-3，闹闹 -5、-2，风沙狂舞 0、+5
const history = [
  round(3000, 10, [["老陈小号", 15], ["闹闹", 5], ["风沙狂舞", 10]]),
  round(1000, 10, [["老陈小号", 7], ["闹闹", 8], ["风沙狂舞", 15]]),
  round(2000, 10, [["闹闹", 12], ["风沙狂舞", 8]]),
];

check("sortByTime 按时间正序", () => {
  assert.deepStrictEqual(sortByTime(history).map((r) => r.time), [1000, 2000, 3000]);
});

check("sortByTime 容忍脏数据", () => {
  // 没有 records 的条目不算对局，直接丢掉
  assert.deepStrictEqual(
    sortByTime([null, { time: 1 }, 3, { time: 2, records: [] }]).map((r) => r.time),
    [2]
  );
  assert.deepStrictEqual(sortByTime(undefined), []);
});

check("buildTimeline 把子账号的战绩归到主账号", () => {
  const { labels, series } = buildTimeline(history, players);
  assert.deepStrictEqual(labels, ["#1", "#2", "#3"]);
  const names = series.map((s) => s.name).sort();
  assert.deepStrictEqual(names, ["老陈", "闹闹", "风沙狂舞"]);

  const chen = series.find((s) => s.name === "老陈");
  assert.deepStrictEqual(chen.data, [-3, -3, 2]); // 第1局 -3，第2局 0，第3局 +5
});

check("buildTimeline 未上桌的人累计值保持不变", () => {
  const { series } = buildTimeline(history, players);
  const feng = series.find((s) => s.name === "风沙狂舞");
  // 第 2 局他没上桌，累计就该停在上一个值不动
  assert.deepStrictEqual(feng.data, [5, 3, 3]);
});

check("buildTimeline 无浮点误差", () => {
  const tricky = [
    round(1, 10, [["闹闹", 10.1], ["风沙狂舞", 9.9]]),
    round(2, 10, [["闹闹", 10.2], ["风沙狂舞", 9.8]]),
  ];
  const { series } = buildTimeline(tricky, players);
  const nao = series.find((s) => s.name === "闹闹");
  assert.strictEqual(Math.round(nao.data[0] * 100), 10);
  assert.strictEqual(Math.round(nao.data[1] * 100), 30); // 0.1 + 0.2 不能变成 0.30000000000000004
});

check("buildTimeline 空数据返回空结构", () => {
  const result = buildTimeline([], players);
  assert.deepStrictEqual(result.series, []);
  assert.deepStrictEqual(result.labels, []);
});

check("buildScoreBars 汇总主账号积分并带胜负场次", () => {
  const source = players.map((p) => ({ ...p }));
  source[1].score = 2;
  source[1].raceResult = { win: 1, lose: 1, deuce: 1 };
  source[2].score = -7;
  source[2].raceResult = { win: 0, lose: 2, deuce: 0 };
  const bars = buildScoreBars(source);
  assert.strictEqual(bars.length, 3); // 三个顶层：老陈(汇总)、闹闹、风沙狂舞
  const chen = bars.find((b) => b.name === "老陈");
  assert.strictEqual(chen.score, 2);
  assert.strictEqual(chen.games, 3);
  assert.ok(bars[0].score >= bars[1].score);
});

check("buildAttendance 统计出场次数（按主账号去重）", () => {
  const list = buildAttendance(history, players);
  const chen = list.find((item) => item.name === "老陈");
  assert.strictEqual(chen.games, 2); // 只在前两局上桌
  assert.strictEqual(list[0].games >= list[list.length - 1].games, true);
});

check("buildResultPie 汇总胜负平", () => {
  const source = players.map((p) => ({
    ...p,
    raceResult: { win: 1, lose: 2, deuce: 1 },
  }));
  const pie = buildResultPie(source);
  // 主账号「老陈」= 自己 + 小号，所以是 2 胜；另外两个独立号各 1 胜
  assert.strictEqual(pie[0].value, 4);
  assert.strictEqual(pie[1].value, 8);
  assert.strictEqual(pie[2].value, 4);
});

check("buildSummary 关键指标", () => {
  const summary = buildSummary(history, players);
  assert.strictEqual(summary.games, 3);
  assert.strictEqual(summary.playerCount, 3); // 老陈 / 闹闹 / 风沙狂舞
  assert.strictEqual(summary.turnover, 80); // 30 + 30 + 20
  assert.strictEqual(summary.bestRound.name, "风沙狂舞");
  assert.strictEqual(summary.bestRound.delta, 5);
  assert.strictEqual(summary.worstRound.name, "闹闹"); // 5 - 10 = -5
  assert.strictEqual(summary.worstRound.delta, -5);
  assert.strictEqual(typeof summary.avgSwing, "number");
});

check("buildSummary 空历史不炸", () => {
  const summary = buildSummary([], players);
  assert.strictEqual(summary.games, 0);
  assert.strictEqual(summary.bestRound, null);
  assert.strictEqual(summary.avgSwing, 0);
});

check("buildDashboard 汇总出口", () => {
  const data = buildDashboard(history, players);
  assert.strictEqual(data.hasData, true);
  assert.ok(data.scores.length > 0);
  assert.strictEqual(data.flow.seats.length, 3);
  assert.strictEqual(buildDashboard([], players).hasData, false);
});

check("formatClock 输出 MM-DD HH:mm", () => {
  assert.match(formatClock(new Date(2026, 9, 16, 9, 5).getTime()), /^10-16 09:05$/);
  assert.strictEqual(formatClock(NaN), "--");
});

console.log(`stats 测试通过 ${pass} 项`);
