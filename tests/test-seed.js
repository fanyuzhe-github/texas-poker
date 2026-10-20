/**
 * 抽卡种子：每个玩家的序列必须互不相同。
 * 回归背景：emptyPlayerCards 出厂 seed 恒为 1，seedFrom 又从未被调用，
 * 导致所有新号第一抽共用同一条序列 —— 8 个人的十连一字不差。
 */
import assert from "node:assert";
import {
  mulberry32,
  seedFrom,
  initialSeedFor,
  emptyPlayerCards,
  emptyCardState,
  drawCards,
  FRESH_SEED,
} from "../src/core/cards.js";
import { CARD_TOTAL } from "../src/core/cardPool.js";

let pass = 0;
let fail = 0;

function check(title, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${title}`);
  } catch (err) {
    fail += 1;
    console.log(`  ✗ ${title}\n      ${err.message}`);
  }
}

function group(title) {
  console.log(`\n${title}`);
}

function stateOf(name, patch) {
  const st = emptyCardState();
  st.players[name] = { ...emptyPlayerCards(), tickets: 1e9, ...patch };
  return st;
}

function pullIds(name, count = 10, patch) {
  const r = drawCards(stateOf(name, patch), name, count);
  return r.results.map((x) => x.card.id);
}

const NAMES = ["三哥", "老陈", "洋洋", "闹闹", "小聪明", "风沙狂舞", "糊涂蛋", "牌桌老炮"];

group("[1] 出厂号不能共用同一条序列");
check("emptyPlayerCards 的 seed 就是出厂标记", () =>
  assert.strictEqual(emptyPlayerCards().seed, FRESH_SEED)
);
{
  const rows = NAMES.map((n) => pullIds(n).join(","));
  const uniq = new Set(rows);
  check(
    `8 个新号的首次十连互不相同（实际 ${uniq.size} 种）`,
    () => assert.strictEqual(uniq.size, NAMES.length, `只有 ${uniq.size} 种：${rows[0]}`)
  );

  // 逐抽位比对：任何一位上全员撞车都算失败
  const cols = NAMES.map((n) => pullIds(n));
  for (let i = 0; i < 10; i += 1) {
    const set = new Set(cols.map((row) => row[i]));
    check(
      `第 ${i + 1} 抽不是全员同一张`,
      () => assert.ok(set.size > 1, `第 ${i + 1} 抽全员都是 ${cols[0][i]}`)
    );
  }
}

group("[2] 首次抽卡前几张不再固定");
{
  const heads = NAMES.map((n) => pullIds(n, 4).join(","));
  check(
    `8 个号的前四张互不相同（实际 ${new Set(heads).size} 种）`,
    () => assert.strictEqual(new Set(heads).size, NAMES.length)
  );
  // 曾经的经典病灶：seed=1 第二抽必出卡池第一张
  const firstCardOfAll = new Set(NAMES.map((n) => pullIds(n, 1)[0]));
  check(
    `首张卡不是全员 c001（实际 ${firstCardOfAll.size} 种）`,
    () => assert.ok(firstCardOfAll.size > 1, `全员首张都是 ${[...firstCardOfAll][0]}`)
  );
}

group("[3] 播种：由名字派生且可复现");
check("同名同种子", () =>
  assert.strictEqual(initialSeedFor("三哥"), initialSeedFor("三哥"))
);
check("异名异种子", () => assert.notStrictEqual(initialSeedFor("三哥"), initialSeedFor("老陈")));
check(
  "种子绝不等于出厂值（否则下次又被当新号重播种）",
  () => NAMES.forEach((n) => assert.notStrictEqual(initialSeedFor(n), FRESH_SEED))
);
check("空名也能给出合法种子", () => {
  const s = initialSeedFor("");
  assert.ok(Number.isFinite(s) && s > 0 && s !== FRESH_SEED);
});
check("seedFrom 输出落在 uint32", () => {
  const v = seedFrom("abc");
  assert.ok(v >= 0 && v <= 4294967295);
});

group("[4] mulberry32 预热消除了小种子早期偏向");
check("同种子仍完全可复现", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i += 1) assert.strictEqual(a(), b());
});
check("输出仍在 [0,1)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});
check("seed=1 的第一个输出不再是 0.0027 那个坑位", () => {
  // 未预热时 mulberry32(1) 的第二个输出是 0.0027，会把卡钉在卡池第一张
  const rng = mulberry32(1);
  const second = rng();
  assert.ok(second > 0.05, `预热没生效，第二个输出仍是 ${second}`);
});
check("小种子的前 4 个输出不集体偏低", () => {
  [1, 2, 3, 4, 5].forEach((s) => {
    const rng = mulberry32(s);
    const vals = [rng(), rng(), rng(), rng()];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    assert.ok(mean > 0.15, `seed=${s} 前四均值仅 ${mean.toFixed(4)}`);
  });
});

group("[5] 序列持续推进，不会原地打转");
{
  let st = stateOf("甲");
  const rounds = [];
  for (let i = 0; i < 6; i += 1) {
    const r = drawCards(st, "甲", 10);
    st = r.state;
    rounds.push(r.results.map((x) => x.card.id).join(","));
  }
  check(`同一号连续 6 次十连各不相同（实际 ${new Set(rounds).size} 种）`, () =>
    assert.strictEqual(new Set(rounds).size, 6)
  );
  check("抽后 seed 一定大于出厂值", () => assert.ok(st.players["甲"].seed > FRESH_SEED));
}
check("多次抽卡后 seed 永不退回出厂值", () => {
  let st = stateOf("乙");
  for (let i = 0; i < 200; i += 1) {
    st = drawCards(st, "乙", 10).state;
    assert.notStrictEqual(st.players["乙"].seed, FRESH_SEED);
  }
});

group("[6] 老存档不受影响：已有 seed 照旧使用");
check("同 seed 结果可复现", () => {
  const a = pullIds("乙", 10, { seed: 20261017 }).join(",");
  const b = pullIds("乙", 10, { seed: 20261017 }).join(",");
  assert.strictEqual(a, b);
});
check("不同老 seed 给出不同结果", () => {
  const a = pullIds("乙", 10, { seed: 20261017 }).join(",");
  const b = pullIds("乙", 10, { seed: 20261018 }).join(",");
  assert.notStrictEqual(a, b);
});

group("[7] 长期分布仍然均匀（没人被系统性跳过某些卡）");
check("8 个号各抽 600 次，合计覆盖全部卡池", () => {
  const covered = new Set();
  NAMES.forEach((n) => {
    let st = stateOf(n);
    for (let k = 0; k < 60; k += 1) {
      const r = drawCards(st, n, 10);
      st = r.state;
      r.results.forEach((x) => covered.add(x.card.id));
    }
  });
  assert.strictEqual(covered.size, CARD_TOTAL, `只覆盖 ${covered.size}/${CARD_TOTAL}`);
});
check("单人抽 600 次能开出绝大多数卡", () => {
  let st = stateOf("三哥");
  const own = new Set();
  for (let k = 0; k < 60; k += 1) {
    const r = drawCards(st, "三哥", 10);
    st = r.state;
    r.results.forEach((x) => own.add(x.card.id));
  }
  assert.ok(own.size >= CARD_TOTAL - 2, `只开出 ${own.size}/${CARD_TOTAL}`);
});
check("稀有度分布不失控（1★ 占比落在 45%~70%）", () => {
  let st = stateOf("老陈");
  const sc = { 1: 0 };
  let total = 0;
  for (let k = 0; k < 60; k += 1) {
    const r = drawCards(st, "老陈", 10);
    st = r.state;
    r.results.forEach((x) => {
      sc[x.star] = (sc[x.star] || 0) + 1;
      total += 1;
    });
  }
  const ratio = sc[1] / total;
  assert.ok(ratio > 0.45 && ratio < 0.7, `1★ 占 ${(ratio * 100).toFixed(1)}%`);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
