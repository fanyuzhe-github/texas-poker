/**
 * 「创造新纪录 +5 券」单测：
 *  records.js 的 buildNewRecords（对比前后两份记录榜）
 *  + cards.js 的 TICKET_RULES 里那条 record 规则。
 *
 * 运行：cd /tmp/pokertest && node test-record-tickets.js
 */
import assert from "node:assert/strict";
import { buildRecords, buildNewRecords } from "../src/core/records.js";
import { grantTickets, TICKET_RULES } from "../src/core/cards.js";

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    fn();
    pass += 1;
  } catch (error) {
    fail += 1;
    console.error(`✗ ${label}\n  ${error.message}`);
  }
}

/** 三个独立号，底注 10（一桌 30） */
const NAMES = ["阿甲", "阿乙", "阿丙"];
const players = NAMES.map((name) => ({
  name,
  parent: null,
  isMain: false,
  score: 0,
}));

/**
 * 造一局：直接给每人点筹码（合计必须是 30），delta / result 自己推。
 * @param {object} chipsByName 名字 → 剩余筹码
 */
function round(id, time, chipsByName) {
  return {
    id,
    time,
    baseChips: 10,
    records: NAMES.map((name, index) => {
      const chips = chipsByName[name];
      const delta = chips - 10;
      return {
        name,
        seatNum: index + 1,
        chips,
        delta,
        result: delta > 0 ? "win" : delta < 0 ? "lose" : "deuce",
      };
    }),
    transfers: [],
  };
}

const DAY1 = Date.UTC(2026, 9, 17, 12, 0); // 本地 2026-10-17 20:00
const DAY2 = Date.UTC(2026, 9, 18, 12, 0);

const g1 = round("g1", DAY1, { 阿甲: 30, 阿乙: 0, 阿丙: 0 }); // 阿甲 +20，其余输光
const g2 = round("g2", DAY1 + 3600 * 1000, { 阿甲: 0, 阿乙: 15, 阿丙: 15 }); // 同日：阿甲再输一局
const g3 = round("g3", DAY2, { 阿甲: 0, 阿乙: 30, 阿丙: 0 }); // 次日：阿乙 +20（与阿甲纪录打平）

const leaderOf = (history, key) => {
  const item = buildRecords(history, players).find((row) => row.key === key);
  return item ? item.leader : null;
};

/* ------------------------------------------------------------------ */

check("规则表里确实有「创造新纪录」，5 券、按项叠加", () => {
  const rule = TICKET_RULES.find((item) => item.key === "record");
  assert.ok(rule, "缺少 record 规则");
  assert.equal(rule.tickets, 5);
  assert.equal(rule.times({ newRecords: 3 }), 3);
  assert.equal(rule.check({ newRecords: 0 }), false);
  assert.equal(rule.check({ newRecords: 2 }), true);
});

check("同一份流水对比：没有新纪录", () => {
  assert.deepEqual(buildNewRecords([g1], [g1], players), {});
});

check("空流水 → 第一局：有人登榜，且不超过记录项数", () => {
  const map = buildNewRecords([], [g1], players);
  const total = Object.values(map).reduce((sum, entry) => sum + entry.count, 0);
  assert.ok(total > 0, "第一局应当创造纪录");
  assert.ok(total <= buildRecords([g1], players).length, "不能超过记录项数");
  assert.ok(map["阿甲"].count > 0, "通吃的阿甲该有纪录");
  // 明细要带标题，结算面板靠它写清"创造了什么新纪录"
  assert.equal(map["阿甲"].items.length, map["阿甲"].count, "明细条数要等于项数");
  assert.ok(
    map["阿甲"].items.every((item) => item.title && item.title.trim()),
    "每一项都要有标题"
  );
});

check("赛季被稀释不算刷新（按 dir 判方向）", () => {
  // 阿甲同一天再输一局：赛季累计被摊薄，数值是往下走的
  assert.ok(
    leaderOf([g1, g2], "bestSeason").value <
      leaderOf([g1], "bestSeason").value,
    "赛季最高被稀释"
  );

  const map = buildNewRecords([g1], [g1, g2], players);
  assert.equal(map["阿甲"], undefined, "数值变差不该发券");
  assert.ok((map["阿乙"] || {}).count > 0, "阿乙确实刷新了纪录（翻盘王）");
});

check("打平不算新纪录（数值没动）", () => {
  // 阿乙次日 +20，与阿甲的「单局最高 / 当日最高」正好打平
  assert.equal(leaderOf([g1], "bestRound").value, 20);
  assert.equal(leaderOf([g1, g3], "bestRound").value, 20);
  assert.equal(leaderOf([g1, g3], "bestRunMoney").value, 20);

  const map = buildNewRecords([g1], [g1, g3], players);
  assert.equal(map["阿甲"], undefined, "阿甲的纪录没被超过，不该发券");
  assert.ok((map["阿乙"] || {}).count > 0, "阿乙靠翻盘拿了纪录");
});

check("发券：刷新 N 项 → 5N 券，理由里带「创造新纪录」", () => {
  const { grants } = grantTickets({
    records: g1.records,
    players,
    baseChips: 10,
    newRecords: { 阿甲: 2, 阿乙: 1 },
  });
  const jia = grants.find((item) => item.name === "阿甲");
  const yi = grants.find((item) => item.name === "阿乙");
  const reason = jia.reasons.find((item) => item.key === "record");
  assert.ok(reason, "阿甲应有 record 理由");
  assert.equal(reason.label, "创造新纪录 ×2");
  assert.equal(reason.tickets, 10);
  assert.equal(jia.tickets, 13); // 上桌 1 + 赢 1 + 大赢 1 + 纪录 10
  assert.equal(yi.reasons.find((item) => item.key === "record").tickets, 5);
});

check("发券：没刷新纪录就不给这条券", () => {
  const { grants } = grantTickets({
    records: g1.records,
    players,
    baseChips: 10,
    newRecords: {},
  });
  const jia = grants.find((item) => item.name === "阿甲");
  assert.equal(jia.reasons.some((item) => item.key === "record"), false);
  assert.equal(jia.tickets, 3); // 上桌 + 赢 + 大赢
});

check("子账号上的纪录归到主账号", () => {
  const roster = [
    { name: "大号", parent: null, isMain: true, score: 0 },
    { name: "小号", parent: "大号", isMain: false, score: 0 },
    { name: "阿乙", parent: null, isMain: false, score: 0 },
    { name: "阿丙", parent: null, isMain: false, score: 0 },
  ];
  // 把 g1 里的「阿甲」换成「小号」
  const game = {
    ...g1,
    records: g1.records.map((record) =>
      record.name === "阿甲" ? { ...record, name: "小号" } : record
    ),
  };
  const map = buildNewRecords([], [game], roster);
  assert.ok((map["大号"] || {}).count > 0, "纪录应归到主账号「大号」");
  assert.equal(map["小号"], undefined, "不该记在子账号头上");
});


check("发券：传 {count, items} 时把纪录名摊进 detail", () => {
  const { grants } = grantTickets({
    records: g1.records,
    players,
    baseChips: 10,
    newRecords: {
      阿甲: {
        count: 2,
        items: [{ title: "单局最大赢家" }, { title: "单日最高盈利" }],
      },
    },
    newMedals: { 阿甲: { count: 1, items: [{ title: "五路财神" }] } },
  });
  const jia = grants.find((item) => item.name === "阿甲");
  const record = jia.reasons.find((item) => item.key === "record");
  const medal = jia.reasons.find((item) => item.key === "medal");

  assert.equal(record.detailLabel, "新纪录");
  assert.deepEqual(record.details, ["单局最大赢家", "单日最高盈利"]);
  assert.equal(record.tickets, 10);

  assert.equal(medal.detailLabel, "点亮勋章");
  assert.deepEqual(medal.details, ["五路财神"]);
  assert.equal(medal.tickets, 2);
});

check("发券：只传数字时不影响券数，明细为空", () => {
  const { grants } = grantTickets({
    records: g1.records,
    players,
    baseChips: 10,
    newRecords: { 阿甲: 3 },
    newMedals: { 阿甲: 2 },
  });
  const jia = grants.find((item) => item.name === "阿甲");
  assert.equal(jia.reasons.find((item) => item.key === "record").tickets, 15);
  assert.deepEqual(jia.reasons.find((item) => item.key === "record").details, []);
  assert.equal(jia.reasons.find((item) => item.key === "medal").tickets, 4);
});

check("发券：count 与 items 都缺失时按 0 处理，不发券", () => {
  const { grants } = grantTickets({
    records: g1.records,
    players,
    baseChips: 10,
    newRecords: { 阿甲: { items: [] } },
  });
  const jia = grants.find((item) => item.name === "阿甲");
  assert.equal(jia.reasons.some((item) => item.key === "record"), false);
});

/* ---------------- 只认单局型纪录（防奖券通胀） ---------------- */

/** 可发券的记录项 key 集合 */
const ticketKeys = () =>
  buildRecords([g1], players)
    .filter((row) => row.ticket !== false)
    .map((row) => row.key);

check("可发券的只有 5 项单局型记录", () => {
  assert.deepEqual(ticketKeys(), [
    "bestRound",
    "biggestLead",
    "worstRound",
    "bestComeback",
    "streakBreaker",
  ]);
});

check("累计型记录（赛季/连胜/最猛一波/输光次数 …）一律不计券", () => {
  const off = buildRecords([g1], players)
    .filter((row) => row.ticket === false)
    .map((row) => row.key);
  ["bestSeason", "longestStreak", "bestRunMoney", "bestRate", "mostBusted"].forEach(
    (key) => assert.ok(off.indexOf(key) >= 0, `${key} 不该发券`)
  );
});

check("第一局：只算单局型，不再一次性 10 项", () => {
  const map = buildNewRecords([], [g1], players);
  const keys = Object.values(map).flatMap((entry) => entry.items.map((i) => i.key));
  assert.deepEqual(keys.sort(), ["bestRound", "biggestLead", "worstRound"].sort());
});

check("第二局打得跟第一局一模一样：一项纪录都不给（不再白送券）", () => {
  // 同样牌面再来一局，累计型数值仍在变大，但这不是「创造新纪录」
  const same = round("same", DAY1 + 3600 * 1000, { 阿甲: 30, 阿乙: 0, 阿丙: 0 });
  assert.deepEqual(buildNewRecords([g1], [g1, same], players), {});
});

check("复制上一局：奖券只剩基础项（上桌 / 赢 / 输光）", () => {
  const same = round("same", DAY1 + 3600 * 1000, { 阿甲: 30, 阿乙: 0, 阿丙: 0 });
  const { grants } = grantTickets({
    records: same.records,
    players,
    baseChips: 10,
    newRecords: buildNewRecords([g1], [g1, same], players),
  });
  const total = grants.reduce((sum, item) => sum + item.tickets, 0);
  assert.equal(total, 7); // 阿甲上桌+赢+大赢=3，阿乙丙各「上桌+输光」=4
  grants.forEach((item) =>
    assert.equal(
      item.reasons.some((r) => r.key === "record"),
      false,
      `${item.name} 不该拿纪录券`
    )
  );
});

check("翻盘王这类单局事件仍照常发券（不是一刀切砍光）", () => {
  // 阿乙 / 阿丙 第一局输光，这一局赢回来 → 翻盘王，属单局事件
  const map = buildNewRecords([g1], [g1, g2], players);
  assert.ok(map["阿乙"].items.some((item) => item.key === "bestComeback"));
});

check("真刷新单局纪录照常发券（+5/项）", () => {
  // 阿甲第一局 +20，这一局 +20 打平不算；改成 +25 才是新纪录
  const g4 = round("g4", DAY2, { 阿甲: 35, 阿乙: 0, 阿丙: 0 });
  const map = buildNewRecords([g1], [g1, g4], players);
  assert.ok(map["阿甲"].items.some((item) => item.key === "bestRound"));
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
