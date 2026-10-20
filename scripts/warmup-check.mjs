import { mulberry32, seedFrom } from "../src/core/cards.js";

console.log("=== 低种子偏向检测：前 2 个输出的均值（跑 1..2000 号种子）===");
function probe(seed, warm){
  const r = mulberry32(seed); if(warm){r();r();}
  return [r(), r()];
}
[0,1,2].forEach((w)=>{
  let s1=0,s2=0,n=0;
  for(let s=1;s<=2000;s++){ const v=probe(s,w===1); s1+=v[0]; s2+=v[1]; n++; }
  console.log("  warmup="+w+"  第1个均值 "+(s1/n).toFixed(4)+"  第2个均值 "+(s2/n).toFixed(4));
});

console.log("");
console.log("=== 具体看几个小种子的第 1、2 个输出 ===");
[1,2,3,4,5].forEach((s)=>{
  const a=mulberry32(s); const raw=[a(),a()];
  const b=mulberry32(s); b();b(); const warm=[b(),b()];
  console.log("  seed="+s+"  原始 "+raw.map(x=>x.toFixed(4)).join(" / ")+"   预热后 "+warm.map(x=>x.toFixed(4)).join(" / "));
});

console.log("");
console.log("=== seedFrom 对不同名字的分散度 ===");
const names=["三哥","老陈","洋洋","闹闹","小聪明","风沙狂舞","糊涂蛋","牌桌老炮"];
const seeds=names.map(n=>seedFrom(n+"#cards"));
console.log("  "+seeds.join(" "));
console.log("  唯一数 "+new Set(seeds).size+"/"+names.length);
console.log("  是否有 1（会撞上出厂值）："+seeds.includes(1));
