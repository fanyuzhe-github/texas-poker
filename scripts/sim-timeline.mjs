import { drawCards, emptyCardState, emptyPlayerCards, grantTickets, TICKETS_PER_TEN, TICKETS_PER_PULL } from "../src/core/cards.js";
import { CARD_POOL } from "../src/core/cardPool.js";
const TOTAL = CARD_POOL.length;
const names = ["A","B","C","D","E","F"];
const players = names.map((n) => ({ name: n, parent: "", isMain: false }));
const ME = "A";
function scene(g) {
  if (g === 1) return { rec: 5, med: 6 };
  if (g === 2) return { rec: 2, med: 2 };
  if (g === 3) return { rec: 1, med: 1 };
  if (g === 4) return { rec: 0, med: 1 };
  if (g <= 10) return { rec: g % 2 ? 1 : 0, med: g % 3 === 0 ? 1 : 0 };
  if (g <= 24) return { rec: g % 4 === 0 ? 1 : 0, med: g % 6 === 0 ? 1 : 0 };
  return { rec: g % 10 === 0 ? 1 : 0, med: g % 14 === 0 ? 1 : 0 };
}
function run() {
  let state = emptyCardState();
  state.players[ME] = { ...emptyPlayerCards(), tickets: 0, seed: 12345 };
  const owned = new Set();
  let g = 0, totalPulls = 0;
  const rows = [];
  for (let week = 1; week <= 12; week += 1) {
    let weekPulls = 0, weekTickets = 0;
    for (let i = 0; i < 4; i += 1) {
      g += 1;
      const s = scene(g);
      const recs = names.map((n) => ({ name: n, chips: n === ME ? 600 : 0, delta: n === ME ? 500 : -100, result: n === ME ? "win" : "lose" }));
      const { byName } = grantTickets({ records: recs, players, baseChips: 100, prevBusted: {}, newRecords: { [ME]: s.rec }, newMedals: { [ME]: s.med } });
      const got = byName[ME] || 0;
      weekTickets += got;
      state.players[ME] = { ...state.players[ME], tickets: state.players[ME].tickets + got };
    }
    while (state.players[ME].tickets >= TICKETS_PER_TEN) {
      const r = drawCards(state, ME, 10);
      state = r.state;
      r.results.forEach((x) => owned.add(x.card.id));
      weekPulls += 10; totalPulls += 10;
    }
    while (state.players[ME].tickets >= TICKETS_PER_PULL) {
      const r = drawCards(state, ME, 1);
      state = r.state;
      r.results.forEach((x) => owned.add(x.card.id));
      weekPulls += 1; totalPulls += 1;
    }
    rows.push({ week, got: weekTickets, pulls: weekPulls, own: owned.size, pct: Math.round((owned.size / TOTAL) * 100), bank: state.players[ME].tickets });
  }
  return rows;
}
const r = run();
console.log("周 | 本周收券 | 本周抽数 | 图鉴张数 | 拥有率 | 周末余券");
r.forEach((x) => console.log(String(x.week).padStart(2) + " | " + String(x.got).padStart(8) + " | " + String(x.pulls).padStart(8) + " | " + String(x.own).padStart(8) + " | " + (x.pct + "%").padStart(5) + " | " + String(x.bank).padStart(6)));
