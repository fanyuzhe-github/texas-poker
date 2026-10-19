/**
 * 校验脚本 —— 用项目自己的 core 函数把生成的数据跑一遍，确认每个模块都吃得到东西。
 *
 * 用法：
 *   cd <项目根>
 *   node .workbuddy/scripts/verify-test-data.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "pkverify-"));
readdirSync(join(ROOT, "src/core"))
  .filter((f) => f.endsWith(".js"))
  .forEach((f) => copyFileSync(join(ROOT, "src/core", f), join(work, f)));
readdirSync(work).forEach((f) =>
  execFileSync("perl", ["-pi", "-e", 's/(from\\s+"\\.\\/[A-Za-z0-9_-]+)"/$1.js"/g', join(work, f)])
);

const load = (m) => import(join(work, m));
const { buildMainRanking } = await load("ranking.js");
const { buildRecords } = await load("records.js");
const { buildDashboard } = await load("stats.js");
const { listSeasons, buildSeasonReport, buildSeasonChampions } = await load("season.js");
const { buildAchievements, buildMedalWall, groupAchievements } = await load("achievements.js");
const { isAvatarUnlocked, avatarCardOptions, countUnlockedAvatars, CARD_POOL_TOTAL } = await load("avatar.js");
const { normalizeCardState } = await load("cards.js");
const { tierOf, tierLabel, TIERS } = await load("tier.js");

const data = JSON.parse(readFileSync(join(ROOT, ".workbuddy/testdata/poker-test-data.json"), "utf8"));
const players = data.players;
const history = data.history;
const cards = normalizeCardState(data.cards);

let bad = 0;
const fail = (m) => { bad += 1; console.log("  [FAIL] " + m); };

/* 1. 零和 */
console.log("=== 1. 流水自检 ===");
let issue = 0;
history.forEach((g) => {
  const sum = g.records.reduce((a, r) => a + Math.round(r.delta * 100), 0);
  if (sum !== 0) { issue += 1; fail(`${g.id} 零和不平 ${sum} 分`); }
  if (g.records.some((r) => r.chips < 0)) { issue += 1; fail(`${g.id} 筹码为负`); }
});
if (!issue) console.log(`  ${history.length} 局全部零和，筹码非负`);
else bad += issue;

/* 2. 总榜 + 段位（12 档） */
console.log("\n=== 2. 总榜（主账号归集）与段位 ===");
const ranking = buildMainRanking(players);
const hit = new Set();
ranking.forEach((r) => {
  const t = tierOf(r.score);
  if (t) hit.add(t.id);
  const kid = r.children && r.children.length ? ` （${r.children.map((c) => c.name).join(" / ")}）` : "";
  console.log(`  ${String(r.score).padStart(7)}  ${String(tierLabel(r.score)).padEnd(6, "　")}  ${r.name}${kid}`);
});
console.log(`  段位命中 ${hit.size}/${TIERS.length} 档`);
if (hit.size < 6) fail(`段位只覆盖 ${hit.size} 档，看不出层次`);

/* 3. 记录榜 14 项 */
console.log("\n=== 3. 记录榜（14 项）===");
const recs = buildRecords(history, players);
let covered = 0;
recs.forEach((row) => {
  const l = row.leader;
  if (l) covered += 1;
  console.log(`  ${l ? "●" : "○"} ${row.title.padEnd(6, "　")} ${l ? `${l.name} · ${l.text}` : "（未触发）"}`);
});
console.log(`  覆盖 ${covered}/${recs.length}`);
if (covered < recs.length) fail(`${recs.length - covered} 项没有数据`);

/* 4. 赛季 */
console.log("\n=== 4. 赛季 ===");
const seasons = listSeasons(history, Date.now());
console.log("  " + seasons.map((s) => s.label).join(" / "));
if (seasons.length < 4) fail("赛季不足 4 个，翻页测不全");
seasons.forEach((s) => {
  const rep = buildSeasonReport(history, players, s);
  const c = rep.champion;
  console.log(`  ${s.label}：${rep.games} 局 · 流水 ${rep.turnover} · 冠军 ${c ? `${c.name} ${c.score}` : "—"}${rep.season && rep.season.code === seasons[0].code ? "（进行中）" : "（已封榜）"}`);
});
const champs = buildSeasonChampions(history, players);
console.log(`  历史冠军 ${champs.length} 位：${champs.map((c) => `${c.name}(${c.label || ""})`).join(" / ") || "—"}`);
if (!champs.length) fail("没有封榜赛季，赛季冠军勋章测不到");

/* 5. 看板 */
console.log("\n=== 5. 数据看板 ===");
const d = buildDashboard(history, players);
console.log(`  资金曲线 ${d.timeline.series.length} 条 / ${d.timeline.labels.length} 点`);
console.log(`  积分柱 ${d.scores.length} 人 · 出勤 ${d.attendance.length} 人 · 胜负饼 ${d.pie.length} 份 · 局用筹 ${Array.isArray(d.flow) ? d.flow.length + " 点" : JSON.stringify(d.flow).slice(0, 70)}`);
console.log(`  摘要：${d.summary.games} 局 / ${d.summary.playerCount} 人 / 流水 ${d.summary.turnover} / 均波动 ${d.summary.avgSwing}`);
if (!d.timeline.series.length || d.timeline.labels.length < 5) fail("资金曲线点数太少");
if (!d.pie.length) fail("胜负饼没数据");

/* 6. 勋章 */
console.log("\n=== 6. 勋章墙 ===");
const achList = buildAchievements(history, players, { cards });
const lit = achList.filter((m) => m.unlocked); // 点亮数看 def 上的 unlocked
const wall = buildMedalWall(achList); // 墙是按人聚合的
console.log(`  共 ${achList.length} 枚，点亮 ${lit.length} 枚，上榜 ${wall.length} 人`);
if (lit.length < 8) fail(`勋章只点亮 ${lit.length} 枚，墙看不出层次`);
groupAchievements(achList).forEach((g) => {
  const on = g.items.filter((m) => m.unlocked).length;
  console.log(`    ${g.label || g.key}：${on}/${g.items.length}  ${g.items.filter((m) => m.unlocked).map((m) => m.title).join("、")}`);
});
console.log("  每人：" + wall.map((w) => `${w.name} ${w.count}枚(荣${w.glory}/连${w.streak}/黑${w.dark})`).join(" · "));

/* 7. 卡包 / 头像 */
console.log("\n=== 7. 卡包与头像解锁 ===");
Object.entries(cards.players).forEach(([name, p]) => {
  const own = Object.keys(p.owned || {}).length;
  const unlocked = countUnlockedAvatars(p.owned);
  const lockedInPicker = avatarCardOptions(p.owned).filter((o) => o.locked).length;
  console.log(`  ${name.padEnd(5, "　")}：${String(own).padStart(2)} 张 → ${unlocked} 个头像可选（锁 ${lockedInPicker}），${p.tickets} 券，${p.shards} 碎片`);
  if (own !== unlocked) fail(`${name} 拥有数与解锁数不一致，「严格按拥有」口径被破坏`);
});
// 头像必须落在自己（或主账号）真有的卡上
players.filter((p) => p.avatar && p.avatar.startsWith("card:")).forEach((p) => {
  const ownerName = p.parent || p.name;
  const bag = (cards.players[ownerName] || {}).owned || {};
  const cardId = p.avatar.slice(5);
  if (!((bag[cardId] || 0) > 0)) fail(`${p.name} 用了不属于 ${ownerName} 的卡头像 ${cardId}`);
});

console.log(bad === 0 ? "\n全部通过" : `\n有 ${bad} 处需要处理`);
process.exit(bad === 0 ? 0 : 1);
