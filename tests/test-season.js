import assert from "node:assert";
import {
  SEASONS,
  seasonOf,
  seasonSortValue,
  currentSeason,
  shiftSeason,
  seasonRange,
  seasonPeriod,
  formatDate,
  buildSeasonReport,
  listSeasons,
  buildSeasonChampions,
} from "../src/core/season.js";

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

const ts = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

check("seasonOf 四季划分", () => {
  assert.strictEqual(seasonOf(ts(2026, 4, 15)).code, "2026-spring");
  assert.strictEqual(seasonOf(ts(2026, 7, 1)).code, "2026-summer");
  assert.strictEqual(seasonOf(ts(2026, 10, 16)).code, "2026-autumn");
  assert.strictEqual(seasonOf(ts(2026, 12, 5)).code, "2026-winter");
  assert.strictEqual(seasonOf(ts(2026, 3, 1)).code, "2026-spring");
  assert.strictEqual(seasonOf(ts(2026, 5, 31, 23, 59)).code, "2026-spring");
});

check("冬季跨年：1、2 月算上一年的冬季", () => {
  assert.strictEqual(seasonOf(ts(2027, 1, 20)).code, "2026-winter");
  assert.strictEqual(seasonOf(ts(2027, 2, 28)).code, "2026-winter");
  // 3 月就开新赛季了
  assert.strictEqual(seasonOf(ts(2027, 3, 1)).code, "2027-spring");
});

check("seasonOf 月份边界精准", () => {
  assert.strictEqual(seasonOf(ts(2026, 5, 31, 23, 59, 59)).key, "spring");
  assert.strictEqual(seasonOf(ts(2026, 6, 1, 0, 0, 1)).key, "summer");
  assert.strictEqual(seasonOf(ts(2026, 8, 31, 23, 59, 59)).key, "summer");
  assert.strictEqual(seasonOf(ts(2026, 9, 1, 0, 0, 1)).key, "autumn");
  assert.strictEqual(seasonOf(ts(2026, 11, 30, 23, 59, 59)).key, "autumn");
  assert.strictEqual(seasonOf(ts(2027, 2, 28, 23, 59, 59)).key, "winter");
});

check("seasonOf 脏数据返回 null", () => {
  assert.strictEqual(seasonOf(NaN), null);
  assert.strictEqual(seasonOf(0), null);
  assert.strictEqual(seasonOf("2026-10-16"), null);
  assert.strictEqual(seasonOf(undefined), null);
});

check("seasonSortValue 保证时间顺序：秋 < 冬 = 次年 1 月 < 次年春", () => {
  const autumn = seasonSortValue(seasonOf(ts(2026, 10, 1)));
  const winterDec = seasonSortValue(seasonOf(ts(2026, 12, 1)));
  const winterJan = seasonSortValue(seasonOf(ts(2027, 1, 15)));
  const nextSpring = seasonSortValue(seasonOf(ts(2027, 3, 1)));
  assert.ok(autumn < winterDec);
  // 12 月和次年 1 月同属一个冬季，编号必须相同，否则冬季会被劈成两个赛季
  assert.strictEqual(winterDec, winterJan);
  assert.ok(winterJan < nextSpring);
});

check("currentSeason 与 shiftSeason 翻页", () => {
  const autumn = currentSeason(ts(2026, 10, 16));
  assert.strictEqual(autumn.code, "2026-autumn");
  assert.strictEqual(shiftSeason(autumn, -1).code, "2026-summer");
  assert.strictEqual(shiftSeason(autumn, 1).code, "2026-winter");
  assert.strictEqual(shiftSeason(autumn, 2).code, "2027-spring");
  assert.strictEqual(shiftSeason(shiftSeason(autumn, -4), 0).code, "2025-autumn");
  // 季末翻页跨年不出错
  assert.strictEqual(shiftSeason(seasonOf(ts(2026, 12, 1)), 1).code, "2027-spring");
  assert.strictEqual(shiftSeason(seasonOf(ts(2026, 1, 1)), -1).code, "2025-autumn");
});

check("seasonRange 冬季跨到次年 2 月底", () => {
  const winter = seasonOf(ts(2026, 12, 15));
  const range = seasonRange(winter);
  assert.strictEqual(formatDate(range.start), "2026-12-01");
  assert.strictEqual(formatDate(range.end - 1), "2027-02-28");

  const summer = seasonOf(ts(2026, 7, 1));
  assert.strictEqual(formatDate(seasonRange(summer).start), "2026-06-01");
  assert.strictEqual(formatDate(seasonRange(summer).end - 1), "2026-08-31");
});

check("seasonPeriod 可读区间", () => {
  assert.strictEqual(seasonPeriod(seasonOf(ts(2026, 10, 1))), "2026-09-01 ~ 2026-11-30");
  assert.strictEqual(seasonPeriod(seasonOf(ts(2026, 12, 1))), "2026-12-01 ~ 2027-02-28");
  assert.strictEqual(seasonPeriod(null), "");
});

check("formatDate 补零", () => {
  assert.strictEqual(formatDate(ts(2026, 1, 5)), "2026-01-05");
  assert.strictEqual(formatDate(NaN), "--");
});

// ---- 赛季榜 ----
const players = [
  { name: "老陈", score: 0, parent: null, isMain: true },
  { name: "老陈小号", score: 0, parent: "老陈" },
  { name: "闹闹", score: 0, parent: null },
];

function round(time, seats) {
  return {
    id: String(time),
    time,
    baseChips: 10,
    records: seats.map(([name, chips]) => ({
      name,
      seatNum: 0,
      chips,
      delta: Math.round((chips - 10) * 100) / 100,
      result: chips > 10 ? "win" : chips < 10 ? "lose" : "deuce",
    })),
    transfers: [],
  };
}

// 2026 秋两局 + 2026 冬一局
const history = [
  round(ts(2026, 10, 5), [["老陈小号", 18], ["闹闹", 2]]),        // 秋：小号 +8，闹闹 -8
  round(ts(2026, 11, 20), [["老陈小号", 4], ["闹闹", 16]]),       // 秋：小号 -6，闹闹 +6
  round(ts(2027, 1, 8), [["老陈小号", 25], ["闹闹", 5]]),         // 冬：小号 +15，闹闹 -5
];

check("buildSeasonReport 只统计本赛季的对局", () => {
  const autumn = buildSeasonReport(history, players, seasonOf(ts(2026, 10, 5)));
  assert.strictEqual(autumn.games, 2);
  assert.strictEqual(autumn.turnover, 40);
  const chen = autumn.ranking.find((row) => row.name === "老陈");
  assert.strictEqual(chen.score, 2); // +8 -6
  assert.deepStrictEqual(chen.raceResult, { win: 1, lose: 1, deuce: 0 });
  assert.strictEqual(chen.games, 2); // 出勤两局
});

check("buildSeasonReport 跨年冬季单独成榜", () => {
  const winter = buildSeasonReport(history, players, seasonOf(ts(2027, 1, 8)));
  assert.strictEqual(winter.games, 1);
  const chen = winter.ranking.find((row) => row.name === "老陈");
  assert.strictEqual(chen.score, 15);
  assert.strictEqual(chen.games, 1);
  // 秋季那两局不能被算进来
  const nao = winter.ranking.find((row) => row.name === "闹闹");
  assert.strictEqual(nao.score, -5);
});

check("buildSeasonReport 子账号归集且保留明细", () => {
  const report = buildSeasonReport(history, players, seasonOf(ts(2026, 10, 5)));
  const chen = report.ranking.find((row) => row.name === "老陈");
  assert.strictEqual(chen.children.length, 1);
  assert.strictEqual(chen.children[0].name, "老陈小号");
  assert.strictEqual(chen.children[0].score, 2);
  // 榜单上不出现子账号本身
  assert.ok(!report.ranking.some((row) => row.name === "老陈小号"));
});

check("buildSeasonReport 单局极值", () => {
  const report = buildSeasonReport(history, players, seasonOf(ts(2026, 10, 5)));
  const chen = report.ranking.find((row) => row.name === "老陈");
  assert.strictEqual(chen.bestDelta, 8);
  assert.strictEqual(chen.worstDelta, -6);
  assert.strictEqual(report.bestRound.delta, 8);
  assert.strictEqual(report.bestRound.group, "老陈");
});

check("buildSeasonReport 冠军取积分最高者", () => {
  const report = buildSeasonReport(history, players, seasonOf(ts(2026, 10, 5)));
  assert.strictEqual(report.champion.name, "老陈"); // +2 > -2
  const winter = buildSeasonReport(history, players, seasonOf(ts(2027, 1, 8)));
  assert.strictEqual(winter.champion.name, "老陈");
});

check("buildSeasonReport 空赛季 / 脏输入不炸", () => {
  const empty = buildSeasonReport(history, players, "2099-spring");
  assert.strictEqual(empty.games, 0);
  assert.deepStrictEqual(empty.ranking, []);
  assert.strictEqual(empty.champion, null);
  assert.deepStrictEqual(buildSeasonReport([], [], null).ranking, []);
  assert.deepStrictEqual(buildSeasonReport(undefined, undefined, undefined).games, 0);
});

check("listSeasons 倒序且补上当前赛季", () => {
  const seasons = listSeasons(history, ts(2026, 10, 16));
  assert.deepStrictEqual(seasons.map((s) => s.code), ["2026-winter", "2026-autumn"]);
  assert.deepStrictEqual(listSeasons([], ts(2026, 10, 16)).map((s) => s.code), ["2026-autumn"]);
  assert.deepStrictEqual(listSeasons([]).map((s) => s.code), [currentSeason().code]);
});

check("buildSeasonChampions 历届回顾只列有牌局的赛季", () => {
  const list = buildSeasonChampions(history, players);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].label, "2026 冬"); // 倒序，最近赛季在前
  assert.strictEqual(list[0].champion.name, "老陈");
  assert.match(list[0].period, /^2026-12-01/);
  assert.strictEqual(list[1].games, 2);
});

check("SEASONS 定义完整不重复", () => {
  assert.strictEqual(SEASONS.length, 4);
  const months = SEASONS.flatMap((item) => item.months);
  assert.strictEqual(new Set(months).size, 12);
});

check("整整一个年度四赛季端到端", () => {
  const all = [
    round(ts(2026, 4, 1), [["闹闹", 20], ["老陈小号", 0]]),
    round(ts(2026, 7, 1), [["闹闹", 15], ["老陈小号", 5]]),
    round(ts(2026, 10, 5), [["老陈小号", 18], ["闹闹", 2]]),
    round(ts(2027, 1, 8), [["老陈小号", 25], ["闹闹", 5]]),
  ];
  const seasons = listSeasons(all, ts(2027, 1, 8));
  assert.deepStrictEqual(seasons.map((s) => s.code), [
    "2026-winter",
    "2026-autumn",
    "2026-summer",
    "2026-spring",
  ]);
  // 四个赛季各自独立，积分不串台
  assert.strictEqual(buildSeasonReport(all, players, seasonOf(ts(2026, 4, 1))).champion.score, 10);
  assert.strictEqual(buildSeasonReport(all, players, seasonOf(ts(2026, 7, 1))).champion.score, 5);
  assert.strictEqual(buildSeasonReport(all, players, seasonOf(ts(2026, 10, 5))).champion.score, 8);
  assert.strictEqual(buildSeasonReport(all, players, seasonOf(ts(2027, 1, 8))).champion.score, 15);
});

console.log(`season 测试通过 ${pass} 项`);
