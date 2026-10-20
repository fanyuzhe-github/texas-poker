import { drawCards, emptyCardState, emptyPlayerCards, initialSeedFor } from "../src/core/cards.js";
import { CARD_POOL, CARD_TOTAL } from "../src/core/cardPool.js";

const names = ["三哥","老陈","洋洋","闹闹","小聪明","风沙狂舞","糊涂蛋","牌桌老炮"];

console.log("=== C. 每人抽 600 次，看各自图鉴覆盖与稀有度分布 ===");
const starAcc = {}; const covered = new Set();
names.forEach((n) => {
  let st = emptyCardState();
  st.players[n] = { ...emptyPlayerCards(), tickets: 1e9 };
  const own = new Set(); const sc = {};
  for (let k=0;k<60;k++){ const r = drawCards(st, n, 10); st = r.state; r.results.forEach((x)=>{ own.add(x.card.id); sc[x.star]=(sc[x.star]||0)+1; starAcc[x.star]=(starAcc[x.star]||0)+1; }); }
  own.forEach((id)=>covered.add(id));
  const dist = [1,2,3,4,5].map((s)=>s+"★"+(((sc[s]||0)/600)*100).toFixed(1)+"%").join(" ");
  console.log("  "+n.padEnd(6)+" 拥有 "+String(own.size).padStart(2)+"/"+CARD_TOTAL+"  "+dist);
});
console.log("");
console.log("  >>> 8 人合计覆盖 " + covered.size + "/" + CARD_TOTAL + " 张（有人抽不到的卡 = " + (CARD_TOTAL-covered.size) + "）");
const tot = Object.values(starAcc).reduce((a,b)=>a+b,0);
console.log("  >>> 总体稀有度 " + [1,2,3,4,5].map((s)=>s+"★"+(((starAcc[s]||0)/tot)*100).toFixed(2)+"%").join(" ") + "（期望 60/25/10/4/1 受保底影响略有出入）");

console.log("");
console.log("=== D. 同一玩家连续 5 次十连，序列必须持续推进（不能原地重复）===");
let st = emptyCardState();
st.players["甲"] = { ...emptyPlayerCards(), tickets: 1e9 };
const rounds = [];
for (let k=0;k<5;k++){ const r = drawCards(st, "甲", 10); st = r.state; rounds.push(r.results.map((x)=>x.card.id).join(",")); }
rounds.forEach((s,i)=>console.log("  第"+(i+1)+"次: "+s));
console.log("  >>> 不重复的轮数：" + new Set(rounds).size + "/5");
console.log("  >>> 每次抽后 seed：" + [1,2,3,4,5].map((i)=>i).length + " 轮已跑，末 seed=" + st.players["甲"].seed + "（必须 > 1）");

console.log("");
console.log("=== E. 老存档（seed 已是正常值）行为不变：同 seed 结果可复现 ===");
function run(seed){ let s = emptyCardState(); s.players["乙"]={...emptyPlayerCards(), tickets:1e9, seed}; const r=drawCards(s,"乙",10); return r.results.map((x)=>x.card.id).join(","); }
console.log("  seed=20261017 第一次: " + run(20261017));
console.log("  seed=20261017 第二次: " + run(20261017));
console.log("  >>> 可复现：" + (run(20261017)===run(20261017)));
