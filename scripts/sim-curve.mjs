import { drawCards, emptyCardState, emptyPlayerCards, TICKETS_PER_TEN } from "../src/core/cards.js";
import { CARD_POOL } from "../src/core/cardPool.js";
const TOTAL = CARD_POOL.length;
const N = 300;
const snaps = {};
let acc = null;
for (let s = 1; s <= N; s += 1) {
  let state = emptyCardState();
  state.players["T"] = { ...emptyPlayerCards(), tickets: 1e9, seed: (s * 7919) % 2147483647 };
  const owned = new Set();
  let dup = 0, starHits = { 5: 0 };
  for (let p = 1; p <= 40; p += 1) {
    const r = drawCards(state, "T", 10);
    state = r.state;
    r.results.forEach((x) => { if (owned.has(x.card.id)) dup += 1; owned.add(x.card.id); if (x.star === 5) starHits[5] += 1; });
    const key = p * 10;
    (snaps[key] = snaps[key] || { sum: 0, dup: 0, five: 0 });
    snaps[key].sum += owned.size;
    snaps[key].dup += dup;
    snaps[key].five += starHits[5];
  }
}
console.log("抽数 | 拥有张数(均) | 拥有率 | 累计重复率 | 5★累计数");
[10,20,30,50,80,100,150,200,300,400].forEach((k) => {
  const v = snaps[k]; if (!v) return;
  const own = v.sum / N, rate = ((own / TOTAL) * 100).toFixed(0), dp = ((v.dup / k) * 100).toFixed(0);
  console.log(String(k).padStart(4) + " | " + own.toFixed(1).padStart(6) + " | " + (rate + "%").padStart(5) + " | " + (dp + "%").padStart(6) + " | " + (v.five / N).toFixed(2));
});
const perPull = TICKETS_PER_TEN / 10;
console.log("");
console.log("换算券(十连价2.1/抽): 30抽=63券  50抽=105券  100抽=210券  200抽=420券");
