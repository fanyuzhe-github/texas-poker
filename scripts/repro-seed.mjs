import { drawCards, emptyCardState, emptyPlayerCards, mulberry32 } from "../src/core/cards.js";

console.log("=== A. mulberry32(1) 前 12 个输出（所有玩家的起点）===");
const r = mulberry32(1);
const seq = []; for (let i=0;i<12;i++) seq.push(r().toFixed(4));
console.log("  " + seq.join(" "));
console.log("  平均值 " + (seq.reduce((a,b)=>a+Number(b),0)/12).toFixed(4) + "（理应≈0.5）");

console.log("");
console.log("=== B. 8 个玩家各自首抽十连（seed 全是出厂值 1）===");
const names = ["三哥","老陈","洋洋","闹闹","小聪明","风沙狂舞","糊涂蛋","牌桌老炮"];
const first = {};
names.forEach((n) => {
  let st = emptyCardState();
  st.players[n] = { ...emptyPlayerCards(), tickets: 1000 };
  const res = drawCards(st, n, 10);
  const ids = res.results.map((x) => x.card.id);
  first[n] = ids;
  console.log("  " + n.padEnd(6) + " " + ids.join(" "));
});

const uniq = new Set(names.map((n) => first[n].join("|")));
console.log("");
console.log("  >>> 8 个玩家的十连结果共有 " + uniq.size + " 种（正常应为 8 种）");
const dupIdx = [];
for (let i=0;i<10;i++) { const set = new Set(names.map((n)=>first[n][i])); if (set.size===1) dupIdx.push(i+1); }
console.log("  >>> 完全相同的抽位：" + (dupIdx.length? "第 "+dupIdx.join("/")+" 抽" : "无"));
const allFirst4 = names.map((n)=>first[n].slice(0,4).join(","));
console.log("  >>> 前四张集合种类：" + new Set(allFirst4).size);
