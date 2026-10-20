import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CARD_POOL,
  CARD_TOTAL,
  POOL_BY_STAR,
  cardById,
  STAGE_LABEL,
  typeTone,
} from "../src/core/cardPool.js";
import {
  PITY_3,
  PITY_5,
  SHARD_OF,
  CRAFT_COST,
  TICKETS_PER_PULL,
  TICKETS_PER_TEN,
  TICKET_RULES,
  mulberry32,
  rollStar,
  costOf,
  emptyCardState,
  emptyPlayerCards,
  normalizeCardState,
  playerCards,
  drawCards,
  craftCard,
  buildDex,
  grantTickets,
  addTickets,
  setTickets,
  renameCards,
  removeCards,
  mergeCardStates,
} from "../src/core/cards.js";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

const solo = [{ name: "甲", parent: null }];
const duo = [
  { name: "主", parent: null, isMain: true },
  { name: "子A", parent: "主" },
  { name: "子B", parent: "主" },
];

/** 造一份指定 pity 的存档，用来测保底边界 */
function stateWith(name, patch) {
  return {
    version: 1,
    players: {
      [name]: { ...emptyPlayerCards(), tickets: 9999, seed: 20261017, ...patch },
    },
    log: [],
  };
}

function record(name, result, chips, base = 10) {
  return { name, result, chips, delta: chips - base };
}

console.log("卡牌收集系统");

/* ---------------- 卡池 ---------------- */

check("卡池 71 张，五档数量 30/20/12/6/3", () => {
  assert.strictEqual(CARD_TOTAL, 71);
  assert.strictEqual(CARD_POOL.length, 71);
  assert.strictEqual(POOL_BY_STAR[1].length, 30);
  assert.strictEqual(POOL_BY_STAR[2].length, 20);
  assert.strictEqual(POOL_BY_STAR[3].length, 12);
  assert.strictEqual(POOL_BY_STAR[4].length, 6);
  assert.strictEqual(POOL_BY_STAR[5].length, 3);
});

check("编号与 id 唯一且不跳号", () => {
  const ids = new Set(CARD_POOL.map((c) => c.id));
  assert.strictEqual(ids.size, 71);
  CARD_POOL.forEach((card, index) => {
    assert.strictEqual(card.no, index + 1);
    assert.strictEqual(card.code, String(index + 1).padStart(3, "0"));
    assert.ok(card.name && card.type && card.flavor);
    assert.ok(STAGE_LABEL[card.star]);
    assert.strictEqual(cardById(card.id).name, card.name);
  });
});

check("稀有度与形态一一对应", () => {
  assert.strictEqual(STAGE_LABEL[1], "基础形态");
  assert.strictEqual(STAGE_LABEL[3], "最终进化");
  assert.strictEqual(STAGE_LABEL[5], "传说");
});

check("每张卡都有全国图鉴号，且互不重复", () => {
  const missing = CARD_POOL.filter((c) => !c.dex).map((c) => c.name);
  assert.deepStrictEqual(missing, [], `缺图鉴号：${missing.join("、")}`);
  const seen = new Map();
  CARD_POOL.forEach((c) => {
    assert.ok(
      !seen.has(c.dex),
      `图鉴号 ${c.dex} 重复：${seen.get(c.dex)} / ${c.name}`
    );
    seen.set(c.dex, c.name);
  });
});

check("卡图与卡池自编号一一对应（71 个 png 都在）", () => {
  // 相对本文件定位，换机器 / 换 checkout 路径都能跑。
  // ⚠️ 必须走 fileURLToPath —— URL.pathname 不解码，中文路径会变成 %E5%89%8D… 直接 ENOENT
  const dir = fileURLToPath(new URL("../src/assets/cards", import.meta.url));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
  assert.strictEqual(files.length, CARD_TOTAL);
  const lack = CARD_POOL.filter((c) => !files.includes(`${c.code}.png`));
  assert.deepStrictEqual(lack.map((c) => c.code), []);
});

check("未知道属性回落到 normal，不会拿到 undefined", () => {
  assert.strictEqual(typeTone("火"), "fire");
  assert.strictEqual(typeTone("不存在的属性"), "normal");
});

check("cardById 认不出脏 id 返回 null", () => {
  assert.strictEqual(cardById("c999"), null);
  assert.strictEqual(cardById(""), null);
  assert.strictEqual(cardById(undefined), null);
});

/* ---------------- 随机与保底 ---------------- */

check("mulberry32 同种子序列完全一致（可复现）", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i += 1) assert.strictEqual(a(), b());
});

check("mulberry32 输出落在 [0,1)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

check("3★ 保底：第 10 抽必出 3★ 及以上", () => {
  const rng = mulberry32(12345);
  for (let i = 0; i < 30; i += 1) {
    assert.ok(rollStar(rng, PITY_3 - 1, 0) >= 3);
  }
});

check("5★ 硬天井：连续 59 抽没出，第 60 抽必出", () => {
  const rng = mulberry32(999);
  assert.strictEqual(rollStar(rng, 0, PITY_5 - 1), 5);
});

check("软保底：第 50 抽之后 5★ 概率明显上升", () => {
  const count = (startPity) => {
    const rng = mulberry32(2026);
    let hit = 0;
    for (let i = 0; i < 3000; i += 1) {
      if (rollStar(rng, 0, startPity) === 5) hit += 1;
    }
    return hit;
  };
  const normal = count(0);
  const boosted = count(PITY_5 - 5);
  assert.ok(boosted > normal * 2, `软保底没生效：${normal} vs ${boosted}`);
});

check("抽卡价目：单抽 3 券，十连 27 券（打折）", () => {
  assert.strictEqual(costOf(1), TICKETS_PER_PULL);
  assert.strictEqual(costOf(3), 9);
  assert.strictEqual(costOf(10), TICKETS_PER_TEN);
  assert.ok(TICKETS_PER_TEN < TICKETS_PER_PULL * 10);
});

/* ---------------- 抽卡 ---------------- */

check("券不够：返回 ok=false 且不动存档", () => {
  const before = setTickets(emptyCardState(), "甲", 2);
  const result = drawCards(before, "甲", 1);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.need, 3);
  assert.strictEqual(result.state.players["甲"].tickets, 2);
  assert.strictEqual(before.players["甲"].tickets, 2, "原存档不该被改");
});

check("抽卡是纯函数：不修改传入的 state", () => {
  const before = stateWith("甲", { pity5: 0 });
  const snapshot = JSON.stringify(before);
  const result = drawCards(before, "甲", 10);
  assert.strictEqual(result.state.players["甲"].tickets, 9999 - TICKETS_PER_TEN);
  assert.strictEqual(JSON.stringify(before), snapshot);
});

check("十连必出至少一张 3★ 及以上", () => {
  let state = stateWith("甲", { pity3: 0, pity5: 0 });
  for (let i = 0; i < 30; i += 1) {
    const result = drawCards(state, "甲", 10);
    state = result.state;
    const best = result.results.reduce((a, b) => (b.star > a.star ? b : a));
    assert.ok(best.star >= 3, `第 ${i} 轮十连最高只有 ${best.star}★`);
  }
});

check("连续 60 抽内必出 5★（软保底加硬天井）", () => {
  let state = stateWith("甲", { pity3: 0, pity5: 0 });
  let seen = false;
  for (let i = 0; i < 60; i += 1) {
    const result = drawCards(state, "甲", 1);
    state = result.state;
    if (result.results[0].star === 5) seen = true;
  }
  assert.ok(seen, "60 抽都没见到 5★");
});

check("出 5★ 后天井计数归零，不是每 60 抽固定给一张", () => {
  const result = drawCards(stateWith("甲", { pity5: PITY_5 - 1 }), "甲", 1);
  assert.strictEqual(result.results[0].star, 5);
  assert.strictEqual(result.state.players["甲"].pity5, 0);
});

check("3★ 保底命中后 pity3 归零，1★ 会累加", () => {
  const low = drawCards(stateWith("甲", { pity5: 0 }), "甲", 1);
  const star = low.results[0].star;
  assert.strictEqual(
    low.state.players["甲"].pity3,
    star >= 3 ? 0 : 1
  );
});

check("重复卡转碎片，首次不转", () => {
  // 1★ 只有 30 张，抽满 30 次以上一定会撞到重复
  let state = stateWith("甲", {});
  let shardTotal = 0;
  for (let i = 0; i < 40; i += 1) {
    const result = drawCards(state, "甲", 1);
    state = result.state;
    shardTotal += result.results[0].dup;
  }
  assert.ok(shardTotal > 0, "40 抽居然一张重复都没有");
  assert.strictEqual(state.players["甲"].shards, shardTotal);
  const dex = buildDex(state, "甲");
  assert.ok(dex.duplicates > 0);
});

check("碎片数值与星级对应：1★=1，5★=100", () => {
  assert.strictEqual(SHARD_OF[1], 1);
  assert.strictEqual(SHARD_OF[5], 100);
});

check("抽卡日志按时间倒序保留，最多 60 条", () => {
  let state = stateWith("甲", {});
  for (let i = 0; i < 40; i += 1) {
    state = drawCards(state, "甲", 10).state;
  }
  assert.strictEqual(state.log.length, 60);
  assert.ok(state.log[0].time >= state.log[59].time);
});

check("没选玩家（空名字）不抽卡", () => {
  const result = drawCards(stateWith("甲", {}), "", 1);
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.results, []);
});

/* ---------------- 合成 ---------------- */

check("碎片够才能合成，扣掉对应碎片", () => {
  const before = stateWith("甲", { shards: 10 });
  const target = POOL_BY_STAR[1][0];
  const result = craftCard(before, "甲", target.id);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.players["甲"].shards, 10 - CRAFT_COST[1]);
  assert.strictEqual(result.state.players["甲"].owned[target.id], 1);
});

check("碎片不够：合成失败且不动存档", () => {
  const before = stateWith("甲", { shards: 1 });
  const result = craftCard(before, "甲", POOL_BY_STAR[1][0].id);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "碎片不够");
  assert.strictEqual(result.state.players["甲"].shards, 1);
});

check("合成不存在的卡直接拒绝", () => {
  const result = craftCard(stateWith("甲", { shards: 9999 }), "甲", "c999");
  assert.strictEqual(result.ok, false);
});

check("5★ 合成最贵，且明显贵于 1★", () => {
  assert.ok(CRAFT_COST[5] > CRAFT_COST[4]);
  assert.ok(CRAFT_COST[4] > CRAFT_COST[1]);
});

/* ---------------- 图鉴 ---------------- */

check("图鉴进度：71 张里收集 2 张", () => {
  const state = stateWith("甲", {
    owned: { [POOL_BY_STAR[1][0].id]: 1, [POOL_BY_STAR[5][0].id]: 3 },
  });
  const dex = buildDex(state, "甲");
  assert.strictEqual(dex.total, 71);
  assert.strictEqual(dex.ownedCount, 2);
  assert.strictEqual(dex.percent, 2.8);
  assert.strictEqual(dex.byStar[5].owned, 1);
  assert.strictEqual(dex.byStar[5].total, 3);
  // 同一张卡有 3 张，重复数算 2
  assert.strictEqual(dex.duplicates, 2);
});

check("空存档图鉴进度为 0，不会除零", () => {
  const dex = buildDex(emptyCardState(), "甲");
  assert.strictEqual(dex.percent, 0);
  assert.strictEqual(dex.ownedCount, 0);
});

/* ---------------- 奖券发放 ---------------- */

check("上桌 +1，赢 +1", () => {
  const { grants } = grantTickets({
    records: [record("甲", "win", 15)],
    players: solo,
    baseChips: 10,
  });
  assert.strictEqual(grants.length, 1);
  assert.strictEqual(grants[0].tickets, 2);
  assert.deepStrictEqual(grants[0].reasons.map((r) => r.key), ["showUp", "win"]);
});

check("单局赢到 2 倍底注才算大赢", () => {
  const small = grantTickets({
    records: [record("甲", "win", 25)], // +15，不到 20
    players: solo,
    baseChips: 10,
  });
  assert.strictEqual(small.grants[0].tickets, 2);

  const big = grantTickets({
    records: [record("甲", "win", 30)], // +20，正好 2 倍
    players: solo,
    baseChips: 10,
  });
  assert.strictEqual(big.grants[0].tickets, 3);
  assert.ok(big.grants[0].reasons.some((r) => r.key === "bigWin"));
});

check("输光给安慰券（chips<=0 且真的亏了）", () => {
  const { grants } = grantTickets({
    records: [record("甲", "lose", 0)],
    players: solo,
    baseChips: 10,
  });
  assert.strictEqual(grants[0].tickets, 2);
  assert.ok(grants[0].reasons.some((r) => r.key === "busted"));
});

check("底注为 0 的脏数据不会把全场判成输光", () => {
  const { grants } = grantTickets({
    records: [{ name: "甲", result: "lose", chips: 0, delta: -10 }],
    players: solo,
    baseChips: 0,
  });
  assert.strictEqual(grants[0].tickets, 1, "只该拿上桌那 1 张");
  assert.ok(!grants[0].reasons.some((r) => r.key === "busted"));
});

check("没输光就不发安慰券（chips 还有剩）", () => {
  const { grants } = grantTickets({
    records: [record("甲", "lose", 5)],
    players: solo,
    baseChips: 10,
  });
  assert.strictEqual(grants[0].tickets, 1);
});

check("翻盘：上一局输光 + 本局赢 = +2", () => {
  const { grants } = grantTickets({
    records: [record("甲", "win", 15)],
    players: solo,
    baseChips: 10,
    prevBusted: { 甲: true },
  });
  assert.strictEqual(grants[0].tickets, 4); // 上桌1 赢1 翻盘2
  assert.ok(grants[0].reasons.some((r) => r.key === "comeback"));
});

check("上一局输光但本局没赢，不算翻盘", () => {
  const { grants } = grantTickets({
    records: [record("甲", "lose", 5)],
    players: solo,
    baseChips: 10,
    prevBusted: { 甲: true },
  });
  assert.ok(!grants[0].reasons.some((r) => r.key === "comeback"));
});

check("勋章按枚数叠加：2 枚 = +4", () => {
  const { grants } = grantTickets({
    records: [record("甲", "win", 15)],
    players: solo,
    baseChips: 10,
    newMedals: { 甲: 2 },
  });
  assert.strictEqual(grants[0].tickets, 6);
  const medal = grants[0].reasons.find((r) => r.key === "medal");
  assert.strictEqual(medal.tickets, 4);
});

check("子账号战绩归集到主账号名下", () => {
  const { grants } = grantTickets({
    records: [record("子A", "win", 15)],
    players: duo,
    baseChips: 10,
  });
  assert.strictEqual(grants.length, 1);
  assert.strictEqual(grants[0].name, "主");
});

check("同一主账号开两个号不叠加券（防刷）", () => {
  const { grants } = grantTickets({
    records: [record("子A", "win", 15), record("子B", "win", 30)],
    players: duo,
    baseChips: 10,
  });
  assert.strictEqual(grants.length, 1);
  // 上桌1 + 赢1 + 大赢1 = 3，而不是两条记录各算一遍变成 5
  assert.strictEqual(grants[0].tickets, 3);
});

check("同组一赢一输光：取最有利的那条，不叠加成 4", () => {
  const { grants } = grantTickets({
    records: [record("子A", "win", 15), record("子B", "lose", 0)],
    players: duo,
    baseChips: 10,
  });
  assert.strictEqual(grants[0].tickets, 3); // 上桌1 + 赢1 + 输光1
});

check("空名单 / 脏记录不会炸", () => {
  assert.deepStrictEqual(grantTickets({}).grants, []);
  assert.deepStrictEqual(grantTickets({ records: [null, {}, { name: "" }] }).grants, []);
  const { grants } = grantTickets({
    records: [{ name: "甲", result: "win", chips: 15, delta: 5 }],
    players: [],
    baseChips: 10,
  });
  assert.strictEqual(grants[0].name, "甲", "没有花名册时按原名归集");
});

check("奖券规则表覆盖全部口径且金额为正", () => {
  assert.ok(TICKET_RULES.length >= 6);
  TICKET_RULES.forEach((rule) => {
    assert.ok(rule.key && rule.label && rule.hint);
    assert.ok(rule.tickets > 0);
  });
  assert.ok(TICKET_RULES.some((r) => r.key === "busted"), "必须有输光安慰券");
});

/* ---------------- 存档读写 ---------------- */

check("normalizeCardState 清洗脏数据", () => {
  const state = normalizeCardState({
    players: {
      甲: { tickets: -5, shards: "x", owned: { c999: 3, [POOL_BY_STAR[1][0].id]: -1 } },
      "": { tickets: 3 },
    },
    log: [{ cardId: "c999", star: 5 }, { cardId: POOL_BY_STAR[1][0].id, star: 1, dup: 1 }],
  });
  assert.strictEqual(state.players["甲"].tickets, 0);
  assert.strictEqual(state.players["甲"].shards, 0);
  assert.deepStrictEqual(state.players["甲"].owned, {});
  assert.strictEqual(state.log.length, 1);
});

check("normalizeCardState 认 null / 字符串 / 数字", () => {
  [null, undefined, "x", 42, []].forEach((raw) => {
    const state = normalizeCardState(raw);
    assert.deepStrictEqual(state.players, {});
    assert.deepStrictEqual(state.log, []);
  });
});

check("addTickets 按人累加，脏数据跳过", () => {
  const state = addTickets(emptyCardState(), [
    { name: "甲", tickets: 3 },
    { name: "乙", tickets: 2 },
    { name: "", tickets: 9 },
    { name: "丙", tickets: -1 },
  ]);
  assert.strictEqual(state.players["甲"].tickets, 3);
  assert.strictEqual(state.players["乙"].tickets, 2);
  assert.strictEqual(state.players["丙"], undefined);
});

check("setTickets 不会写成负数", () => {
  assert.strictEqual(setTickets(emptyCardState(), "甲", -8).players["甲"].tickets, 0);
});

check("改名：卡包跟着搬走，券与碎片合并", () => {
  let state = setTickets(emptyCardState(), "甲", 5);
  state = addTickets(state, [{ name: "乙", tickets: 2 }]);
  const card = POOL_BY_STAR[1][0];
  state.players["甲"].owned = { [card.id]: 2 };
  state.players["甲"].shards = 7;

  const next = renameCards(state, "甲", "乙");
  assert.strictEqual(next.players["甲"], undefined);
  assert.strictEqual(next.players["乙"].tickets, 7);
  assert.strictEqual(next.players["乙"].shards, 7);
  assert.strictEqual(next.players["乙"].owned[card.id], 2);
});

check("改名到不存在的名字 / 同名：不会丢卡包", () => {
  const state = setTickets(emptyCardState(), "甲", 4);
  assert.strictEqual(renameCards(state, "甲", "").players["甲"].tickets, 4);
  assert.strictEqual(renameCards(state, "甲", "甲").players["甲"].tickets, 4);
  assert.strictEqual(renameCards(state, "不存在的", "乙").players["乙"], undefined);
});

check("删号：卡包一并清掉", () => {
  const state = setTickets(emptyCardState(), "甲", 4);
  assert.strictEqual(removeCards(state, "甲").players["甲"], undefined);
});

check("mergeCardStates：券与碎片相加，卡牌取较大值，保底取更近的", () => {
  const card = POOL_BY_STAR[1][0];
  const a = setTickets(emptyCardState(), "甲", 10);
  a.players["甲"].owned = { [card.id]: 3 };
  a.players["甲"].shards = 4;
  a.players["甲"].pity5 = 40;

  const b = setTickets(emptyCardState(), "甲", 5);
  b.players["甲"].owned = { [card.id]: 1 };
  b.players["甲"].shards = 6;
  b.players["甲"].pity5 = 12;

  const merged = mergeCardStates(a, b);
  assert.strictEqual(merged.players["甲"].tickets, 15);
  assert.strictEqual(merged.players["甲"].shards, 10);
  assert.strictEqual(merged.players["甲"].owned[card.id], 3);
  assert.strictEqual(merged.players["甲"].pity5, 12);
  assert.strictEqual(a.players["甲"].tickets, 10, "原存档不该被改");
});

check("mergeCardStates：两边各有人时按人并集", () => {
  const merged = mergeCardStates(
    setTickets(emptyCardState(), "甲", 3),
    setTickets(emptyCardState(), "乙", 4)
  );
  assert.strictEqual(merged.players["甲"].tickets, 3);
  assert.strictEqual(merged.players["乙"].tickets, 4);
});

check("playerCards：没存档的人给一份空的，不写回去", () => {
  const me = playerCards(emptyCardState(), "张三");
  assert.strictEqual(me.tickets, 0);
  assert.deepStrictEqual(me.owned, {});
});

/* ---------------- 综合 ---------------- */

check("一晚 4 局：够抽两次单抽，十连还差一点", () => {
  const roster = [
    { name: "主", parent: null, isMain: true },
    { name: "子", parent: "主" },
  ];
  let state = emptyCardState();
  for (let i = 0; i < 4; i += 1) {
    const { grants } = grantTickets({
      records: [record("子", "win", 20)],
      players: roster,
      baseChips: 10,
    });
    state = addTickets(state, grants);
  }
  const tickets = state.players["主"].tickets;
  assert.ok(tickets >= TICKETS_PER_PULL * 2, `4 局只有 ${tickets} 券，连两次单抽都不够`);
  assert.ok(tickets < TICKETS_PER_TEN, "一晚就能十连说明券发太多了");
});

check("攒两晚（11 局）能凑一次十连并拿到 5 张以上", () => {
  const roster = [
    { name: "主", parent: null, isMain: true },
    { name: "子", parent: "主" },
  ];
  let state = emptyCardState();
  for (let i = 0; i < 11; i += 1) {
    const { grants } = grantTickets({
      records: [record("子", "win", 20)],
      players: roster,
      baseChips: 10,
    });
    state = addTickets(state, grants);
  }
  assert.ok(state.players["主"].tickets >= TICKETS_PER_TEN);

  const result = drawCards(state, "主", 10);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results.length, 10);
  const dex = buildDex(result.state, "主");
  assert.ok(dex.ownedCount >= 5, `十连只收到 ${dex.ownedCount} 张`);
});

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed ? 1 : 0);
