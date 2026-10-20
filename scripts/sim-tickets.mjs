import { grantTickets } from "../src/core/cards.js";
const names = ["A", "B", "C", "D", "E", "F"];
const players = names.map((n) => ({ name: n, parent: "", isMain: false }));
const stakeYuan = 100;
function buildRecords(winner) {
  return names.map((n) => {
    const isW = n === winner;
    const others = names.filter((x) => x !== n).length;
    return { name: n, chips: isW ? 600 : 0, delta: isW ? 500 : -100, result: isW ? "win" : "lose" };
  });
}
function show(title, newRecords, newMedals, prevBusted) {
  const recs = buildRecords("A");
  const { grants, byName } = grantTickets({ records: recs, players, baseChips: stakeYuan, prevBusted: prevBusted || {}, newRecords, newMedals });
  const vals = names.map((n) => byName[n] || 0);
  const sum = vals.reduce((a, b) => a + b, 0);
  console.log(title);
  console.log("  逐人:", vals.join(" / "), "| 合计", sum, "| 人均", (sum / names.length).toFixed(2));
  console.log("  " + JSON.stringify(grants.find((g) => g.name === "A").reasons.map((r) => r.label + "=" + r.tickets)));
}
console.log("=== 6人桌，每局到底发多少券 ===");
show("[首局] 记录5项+勋章6枚", { A: 5, B: 5, C: 5, D: 5, E: 5, F: 5 }, { A: 6, B: 4, C: 4, D: 3, E: 3, F: 2 });
show("[第10局] 记录1项+勋章1枚", { A: 1 }, { A: 1 });
show("[稳态] 无记录无勋章", {}, {});
show("[稳态+翻盘]", {}, {}, { B: true });
