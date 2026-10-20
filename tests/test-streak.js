/**
 * 连胜 / 连败统计单测。
 * 运行前先同步核心文件：见 /tmp/pokertest/README（cp + perl 补 .js 后缀）
 */
import assert from "node:assert";
import {
  buildStreakSequences,
  buildStreakBoard,
  buildStreakSummary,
  foldStreakRuns,
  formatStreak,
  resultType,
} from "../src/core/streak.js";
import { seasonOf, buildSeasonReport } from "../src/core/season.js";

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✗ ${label}`);
    console.log(`      ${error.message}`);
  }
}

const DAY = 86400000;
const ts = (y, m, d) => new Date(y, m - 1, d, 20, 0, 0).getTime();

/** 造一局流水：results 形如 [["闹闹","win",12], ...] */
function round(index, dayOffset, results, baseChips = 10) {
  return {
    time: ts(2026, 1, 1) + dayOffset * DAY,
    records: results.map(([name, result, chips]) => ({
      name,
      result,
      delta: chips - baseChips,
      chips,
    })),
  };
}

/** 单条流水记录 */
function r(name, result, delta) {
  return { name, result, delta, chips: 10 + delta };
}

const players = [
  { name: "老陈", parent: null, isMain: true },
  { name: "陈小号", parent: "老陈" },
  { name: "闹闹", parent: null },
  { name: "风沙狂舞", parent: null },
];

console.log("连胜 / 连败统计");

check("resultType 优先信任 record.result，脏数据才回落到金额符号", () => {
  assert.strictEqual(resultType({ result: "win", delta: 0 }), "win");
  assert.strictEqual(resultType({ result: "lose", delta: 5 }), "lose");
  assert.strictEqual(resultType({ result: "deuce", delta: 9 }), "deuce");
  // 没有 result 字段的老数据
  assert.strictEqual(resultType({ delta: 3 }), "win");
  assert.strictEqual(resultType({ delta: -3 }), "lose");
  assert.strictEqual(resultType({ delta: 0 }), "deuce");
  assert.strictEqual(resultType(null), "deuce");
});

check("foldStreakRuns 连续同类折叠成一段", () => {
  const runs = foldStreakRuns([
    { round: 1, result: "win", cents: 500, time: 1 },
    { round: 2, result: "win", cents: 300, time: 2 },
    { round: 3, result: "lose", cents: -200, time: 3 },
    { round: 4, result: "lose", cents: -100, time: 4 },
  ]);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].type, "win");
  assert.strictEqual(runs[0].times, 2);
  assert.strictEqual(runs[0].cents, 800);
  assert.strictEqual(runs[0].startRound, 1);
  assert.strictEqual(runs[0].endRound, 2);
  assert.strictEqual(runs[1].type, "lose");
  assert.strictEqual(runs[1].cents, -300);
});

check("foldStreakRuns 平局不打断当前段，也不计入次数", () => {
  const runs = foldStreakRuns([
    { round: 1, result: "win", cents: 500, time: 1 },
    { round: 2, result: "deuce", cents: 0, time: 2 },
    { round: 3, result: "win", cents: 300, time: 3 },
  ]);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].times, 2);
  assert.strictEqual(runs[0].cents, 800);
  assert.strictEqual(runs[0].deuces, 1);
  assert.strictEqual(runs[0].endRound, 3);
});

check("foldStreakRuns 空序列 / 全平局 => 没有进行中的连击", () => {
  assert.deepStrictEqual(foldStreakRuns([]), []);
  assert.deepStrictEqual(
    foldStreakRuns([{ round: 1, result: "deuce", cents: 0, time: 1 }]),
    []
  );
});

check("buildStreakSequences 子账号战绩归到主账号，且按时间正序", () => {
  const history = [
    round(1, 10, [
      ["陈小号", "win", 20],
      ["闹闹", "lose", 0],
    ]),
    round(1, 2, [
      ["陈小号", "lose", 0],
      ["闹闹", "win", 20],
    ]), // 故意写在后面，检验排序
  ];
  const seq = buildStreakSequences(history, players);
  const chen = seq.find((item) => item.name === "老陈");
  assert.strictEqual(chen.items.length, 2);
  assert.deepStrictEqual(
    chen.items.map((item) => item.result),
    ["lose", "win"]
  );
  // 子账号不单独成册
  assert.ok(!seq.some((item) => item.name === "陈小号"));
});

check("buildStreakBoard 当前连胜 = 最后一段非平局战绩", () => {
  const history = [
    round(1, 1, [
      ["闹闹", "lose", 0],
      ["风沙狂舞", "win", 20],
    ]),
    round(2, 2, [
      ["闹闹", "win", 20],
      ["风沙狂舞", "lose", 0],
    ]),
    round(3, 3, [
      ["闹闹", "win", 15],
      ["风沙狂舞", "lose", 0],
    ]),
    round(4, 4, [
      ["闹闹", "win", 12],
      ["风沙狂舞", "win", 12],
    ]),
  ];
  const board = buildStreakBoard(history, players);
  const nao = board.find((row) => row.name === "闹闹");
  assert.strictEqual(nao.current.type, "win");
  assert.strictEqual(nao.current.times, 3);
  assert.strictEqual(nao.current.cents, 1700); // 1000 + 500 + 200
  assert.strictEqual(nao.longestWin.times, 3);
  assert.strictEqual(nao.longestLose.times, 1);

  const feng = board.find((row) => row.name === "风沙狂舞");
  assert.strictEqual(feng.current.type, "win");
  assert.strictEqual(feng.current.times, 1);
  assert.strictEqual(feng.longestLose.times, 2);
});

check("buildStreakBoard 连胜排前面、场次多的排前面", () => {
  const history = [
    round(1, 1, [
      ["闹闹", "win", 20],
      ["风沙狂舞", "lose", 0],
    ]),
    round(2, 2, [
      ["闹闹", "win", 20],
      ["风沙狂舞", "lose", 0],
    ]),
    round(3, 3, [
      ["闹闹", "win", 20],
      ["风沙狂舞", "lose", 0],
    ]),
  ];
  const board = buildStreakBoard(history, players);
  assert.strictEqual(board[0].name, "闹闹");
  assert.strictEqual(board[0].current.type, "win");
  assert.strictEqual(board[1].name, "风沙狂舞");
  assert.strictEqual(board[1].current.type, "lose");
});

check("buildStreakBoard bestRun 取赚钱最多的那段，而非最长的", () => {
  const board = buildStreakBoard(
    [
      round(1, 1, [["闹闹", "win", 11]]), // +1
      round(2, 2, [["闹闹", "win", 11]]), // +1
      round(3, 3, [["闹闹", "win", 12]]), // +2
      round(4, 4, [["闹闹", "lose", 0]]),
      round(5, 5, [["闹闹", "win", 19]]), // 单独一局 +9
    ],
    players
  );
  const nao = board.find((row) => row.name === "闹闹");
  assert.strictEqual(nao.longestWin.times, 3);
  assert.strictEqual(nao.bestRun.times, 1);
  assert.strictEqual(nao.bestRun.cents, 900);
  assert.strictEqual(nao.worstRun.cents, -1000);
});

check("buildStreakSummary：连胜最猛 / 连败最惨 / 史上最长", () => {
  const history = [
    round(1, 1, [
      ["闹闹", "win", 12],
      ["风沙狂舞", "lose", 0],
    ]),
    round(2, 2, [
      ["闹闹", "win", 12],
      ["风沙狂舞", "lose", 0],
    ]),
    round(3, 3, [
      ["闹闹", "win", 12],
      ["风沙狂舞", "win", 12],
    ]),
  ];
  const summary = buildStreakSummary(buildStreakBoard(history, players));
  assert.strictEqual(summary.hot.name, "闹闹");
  assert.strictEqual(summary.hot.run.times, 3);
  assert.strictEqual(summary.cold, null); // 风沙最后转胜了，不算连败进行中
  assert.strictEqual(summary.best.name, "闹闹");
  assert.strictEqual(summary.best.run.times, 3);
});

check("buildStreakSummary 空数据不炸", () => {
  const summary = buildStreakSummary(buildStreakBoard([], players));
  assert.strictEqual(summary.hot, null);
  assert.strictEqual(summary.cold, null);
  assert.strictEqual(summary.best, null);
  assert.deepStrictEqual(buildStreakBoard(undefined, undefined), []);
});

check("formatStreak 文案", () => {
  assert.strictEqual(formatStreak({ type: "win", times: 3 }), "3连胜");
  assert.strictEqual(formatStreak({ type: "lose", times: 2 }), "2连败");
  assert.strictEqual(formatStreak(null), "—");
  assert.strictEqual(formatStreak({ type: "win", times: 0 }), "—");
});

check("recent 只保留最后 12 场", () => {
  const history = [];
  for (let i = 1; i <= 20; i += 1) history.push(round(i, i, [["闹闹", "win", 12]]));
  const board = buildStreakBoard(history, players);
  const nao = board.find((row) => row.name === "闹闹");
  assert.strictEqual(nao.recent.length, 12);
  assert.strictEqual(nao.recent[nao.recent.length - 1].round, 20);
  assert.strictEqual(nao.current.times, 20);
});

check("脏数据容忍：空 records / 缺字段 / 未知名字", () => {
  const board = buildStreakBoard(
    [
      { time: ts(2026, 1, 5), records: [] },
      { time: ts(2026, 1, 6), records: null },
      { time: 0, records: [{ name: "路人甲", result: "win", delta: 5, chips: 15 }] },
      null,
    ],
    players
  );
  assert.ok(board.length >= 1);
  board.forEach((row) => {
    assert.ok(typeof row.name === "string");
    assert.ok(Array.isArray(row.recent));
  });
});

check("同一局同组出两个号时按合计金额裁决", () => {
  const history = [
    {
      time: ts(2026, 1, 7),
      records: [
        { name: "陈小号", result: "win", delta: 3, chips: 13 },
        { name: "陈大号", result: "lose", delta: -2, chips: 8 },
      ],
    },
  ];
  const seq = buildStreakSequences(history, [
    { name: "老陈", parent: null, isMain: true },
    { name: "陈小号", parent: "老陈" },
    { name: "陈大号", parent: "老陈" },
  ]);
  assert.strictEqual(seq.length, 1);
  assert.strictEqual(seq[0].name, "老陈");
  assert.strictEqual(seq[0].items[0].result, "win"); // 合计 +1
});

// 冬季跨年：2026-01 与 2026-02 同属「2025 冬」，3 月起进入「2026 春」
check("赛季与连胜联用：一段跨赛季的连胜会被拆成两段", () => {
  const history = [
    { time: ts(2026, 1, 5), records: [r("闹闹", "win", 2)] },
    { time: ts(2026, 2, 10), records: [r("闹闹", "win", 3)] },
    { time: ts(2026, 3, 15), records: [r("闹闹", "win", 1)] },
    { time: ts(2026, 7, 15), records: [r("闹闹", "lose", -10)] },
  ];
  // 第二参数只认「时间戳」或「season 对象」，给个该赛季内的时间点最省事
  const winter = buildSeasonReport(history, players, ts(2026, 1, 5));
  const spring = buildSeasonReport(history, players, ts(2026, 3, 15));

  assert.strictEqual(seasonOf(ts(2026, 1, 5)).code, "2025-winter");
  assert.strictEqual(seasonOf(ts(2026, 3, 15)).code, "2026-spring");
  // 冬季内部是连贯的 2 连胜
  assert.strictEqual(winter.ranking[0].current.times, 2);
  assert.strictEqual(winter.ranking[0].longestWin.times, 2);
  assert.strictEqual(winter.streakLeader.name, "闹闹");
  // 春季重新开局，只有 1 连胜 —— 不会把冬季那两局算进来
  assert.strictEqual(spring.ranking[0].current.type, "win");
  assert.strictEqual(spring.ranking[0].current.times, 1);
  assert.strictEqual(spring.ranking[0].games, 1);
});

check("空赛季的 ranking / streakLeader 为空", () => {
  const report = buildSeasonReport([], players, ts(2020, 4, 10));
  assert.deepStrictEqual(report.ranking, []);
  assert.strictEqual(report.streakLeader, null);
  assert.strictEqual(report.champion, null);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
