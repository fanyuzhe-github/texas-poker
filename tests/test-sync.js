/**
 * 云同步纯逻辑：打包快照 / 解包校验 / 冲突判定
 */
import {
  buildSnapshot,
  parseSnapshot,
  decideSync,
  snapshotSize,
  isSnapshotTooBig,
  SNAPSHOT_APP,
  SNAPSHOT_VERSION,
} from "../src/core/sync.js";

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label} → 期望 ${b}，实际 ${a}`);
  }
}

const NOW = 1760000000000;

const source = {
  players: [{ name: "三哥", score: 1200 }, { name: "小号", parent: "三哥", score: -300 }],
  history: [{ id: "g1", time: NOW - 1000, records: [] }],
  settings: { baseChips: 10 },
  cards: { tickets: 42, owned: { c001: 2 } },
  daily: { date: "2026-10-19", claimed: true, name: "三哥" },
};

console.log("\n[1] buildSnapshot 打包");
const snap = buildSnapshot(source, NOW);
check("带上应用标识", snap.app, SNAPSHOT_APP);
check("带上快照版本", snap.snapshotVersion, SNAPSHOT_VERSION);
check("时间戳生效", snap.updatedAt, NOW);
check("名册原样带入", snap.players.length, 2);
check("流水原样带入", snap.history.length, 1);
check("设置原样带入", snap.settings.baseChips, 10);
check("卡包原样带入", snap.cards.tickets, 42);
check("daily 不进云", Object.prototype.hasOwnProperty.call(snap, "daily"), false);
check("token 不进云", Object.prototype.hasOwnProperty.call(snap, "token"), false);

console.log("\n[2] buildSnapshot 脏数据兜底");
const empty = buildSnapshot({}, NOW);
check("空对象也要有名册字段", Array.isArray(empty.players), true);
check("空对象流水兜底成数组", empty.history, []);
check(
  "传 null 不崩",
  buildSnapshot(null, NOW).players,
  []
);
const dirty = buildSnapshot({ players: "不是数组", settings: null, cards: 42 }, NOW);
check("players 非数组兜底", dirty.players, []);
check("settings 非对象兜底", dirty.settings, {});
check("cards 非对象兜底", dirty.cards, {});
check("时间非法归零", buildSnapshot(source, "abc").updatedAt, 0);

console.log("\n[3] parseSnapshot 解包");
const okResult = parseSnapshot(JSON.stringify(snap));
check("合法 JSON 解析成功", okResult.ok, true);
check("解析后名册一致", okResult.snapshot.players.length, 2);
check("解析后卡包一致", okResult.snapshot.cards.owned.c001, 2);
check("对象入参也能解析", parseSnapshot(snap).ok, true);

console.log("\n[4] parseSnapshot 拒绝坏数据");
check("空字符串被拒", parseSnapshot("").ok, false);
check("空白字符串被拒", parseSnapshot("   ").ok, false);
check("非法 JSON 被拒", parseSnapshot("{不是 json").ok, false);
check("数组被拒", parseSnapshot("[]").ok, false);
check("null 被拒", parseSnapshot("null").ok, false);
check(
  "别的应用的存档被拒",
  parseSnapshot(JSON.stringify({ app: "other-app", players: [] })).ok,
  false
);
check(
  "缺 players 被拒",
  parseSnapshot(JSON.stringify({ app: SNAPSHOT_APP })).ok,
  false
);
check(
  "players 不是数组被拒",
  parseSnapshot(JSON.stringify({ app: SNAPSHOT_APP, players: {} })).ok,
  false
);
const noHistory = parseSnapshot(JSON.stringify({ app: SNAPSHOT_APP, players: [] }));
check("缺 history 兜底成空数组", noHistory.snapshot.history, []);
check("缺 settings 兜底", noHistory.snapshot.settings, {});
check("失败时给出中文原因", typeof parseSnapshot("").reason, "string");

console.log("\n[5] 往返一致性");
const roundTrip = parseSnapshot(JSON.stringify(buildSnapshot(source, NOW)));
check("往返后流水一致", roundTrip.snapshot.history, source.history);
check("往返后名册一致", roundTrip.snapshot.players, source.players);
check("往返后时间一致", roundTrip.snapshot.updatedAt, NOW);

console.log("\n[6] decideSync 冲突判定");
check("本机更新 → 上传", decideSync(200, 100), "upload");
check("云端更新 → 下载", decideSync(100, 200), "download");
check("时间相同 → 一致", decideSync(200, 200), "same");
check("都是 0 → 一致", decideSync(0, 0), "same");
check("本机没同步过 → 下载", decideSync(0, 123), "download");
check("非法值按 0 处理", decideSync(undefined, null), "same");
check("字符串数字也能比", decideSync("200", "100"), "upload");

console.log("\n[7] 体积判定");
check("小快照不算大", isSnapshotTooBig(snap), false);
check("体积能算出来", snapshotSize(snap) > 0, true);

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
