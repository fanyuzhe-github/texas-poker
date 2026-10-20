import { drawCards, emptyCardState, emptyPlayerCards, TICKETS_PER_TEN } from "../src/core/cards.js";
import { CARD_POOL } from "../src/core/cardPool.js";

const TOTAL = CARD_POOL.length;
function sim(seedStart) {
  let state = emptyCardState();
  state.players["T"] = { ...emptyPlayerCards(), tickets: 1e9, seed: seedStart };
  const owned = new Set();
  let pulls = 0;
  while (owned.size < TOTAL && pulls < 8000) {
    const r = drawCards(state, "T", 10);
    state = r.state;
    r.results.forEach((x) => { owned.add(x.card.id); pulls += 1; });
  }
  return { pulls, tickets: seedStart };
}
const runs = [];
for (let s = 1; s <= 400; s += 1) { state0(); runs.push(sim((s * 7919) % 2147483647).pulls); }
function state0() {}
runs.sort((a, b) => a - b);
const q = (p) => runs[Math.floor(runs.length * p)];
const avg = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
console.log("=== 集齐 71 张需要多少抽（始终十连）===");
console.log("最快", q(0.05), "中位", q(0.5), "最慢", q(0.95), "平均", avg);
const perPull = TICKETS_PER_TEN / 10;
console.log("十连后每抽实际成本", perPull, "券");
[q(0.05), q(0.5), q(0.95)].forEach((n) => console.log("  " + n + " 抽 → " + Math.round(n * perPull) + " 券"));
console.log("");
console.log("=== 每局平均进账 → 需要多少局/多少晚(一晚4局) ===");
const need = Math.round(q(0.5) * perPull);
[2.5, 3.5, 5, 8, 12].forEach((r) => {
  const games = Math.ceil(need / r);
  console.log("每局 " + r + " 券 → " + games + " 局 = " + (games / 4).toFixed(1) + " 晚 = 每周2晚的话 " + (games / 8).toFixed(1) + " 周");
});
