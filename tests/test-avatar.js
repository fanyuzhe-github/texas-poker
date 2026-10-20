/**
 * 头像核心层单测：
 * 卡牌头像（值格式 / 解锁口径 / 候选表）、字段清洗、昵称色块稳定性、存储落盘不受影响。
 */
import assert from "node:assert/strict";
import {
  CARD_PREFIX,
  STAR_RING_TONE,
  AUTO_PALETTE,
  cardAvatarValue,
  avatarCardOf,
  isAvatarUnlocked,
  avatarCardOptions,
  countUnlockedAvatars,
  hashName,
  firstLetter,
  autoAvatar,
  normalizeAvatar,
  resolveAvatar,
  hasCustomAvatar,
  approxBytes,
} from "../src/core/avatar.js";
import { CARD_POOL, cardById, CARD_TOTAL } from "../src/core/cardPool.js";
import { normalizePlayer } from "../src/core/storage.js";
import { createPlayer } from "./Player.js";
import { buildDailyPodium } from "../src/core/ranking.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

/** 造个 owned 表：{ 'c031': 1 } */
const own = (...ids) => ids.reduce((map, id) => ({ ...map, [id]: 1 }), {});

console.log("\n卡牌头像 · 值与解析");

test("cardAvatarValue / avatarCardOf 互为逆运算", () => {
  assert.equal(cardAvatarValue("c031"), "card:c031");
  assert.equal(avatarCardOf("card:c031").name, "皮卡丘");
  assert.equal(avatarCardOf("builtin:bear"), null);
  assert.equal(avatarCardOf(""), null);
  assert.equal(avatarCardOf(null), null);
});

test("resolveAvatar 认出卡牌：带出编号 / 星级 / 卡名，src 留空给组件装配", () => {
  const item = resolveAvatar({ name: "老陈", avatar: "card:c031" });
  assert.equal(item.kind, "card");
  assert.equal(item.code, "031");
  assert.equal(item.star, 2);
  assert.equal(item.cardName, "皮卡丘");
  assert.equal(item.src, ""); // core 不碰图片资源
  assert.equal(item.label, "皮卡丘 · 2★");
});

test("三档优先级：照片 > 卡牌 > 色块，脏值回落色块", () => {
  const photo = resolveAvatar({ name: "张三", avatar: "data:image/png;base64,AA" });
  assert.equal(photo.kind, "photo");
  assert.equal(photo.src, "data:image/png;base64,AA");

  const auto = resolveAvatar({ name: "王五", avatar: "乱码" });
  assert.equal(auto.kind, "auto");
  assert.equal(auto.text, "王");
  assert.equal(auto.code, "");
  assert.equal(auto.star, 0);
});

test("normalizeAvatar：卡池里有的才留，查无此卡一律清掉", () => {
  assert.equal(normalizeAvatar("card:c001"), "card:c001");
  assert.equal(normalizeAvatar("card:c999"), ""); // 卡池只有 71 张
  assert.equal(normalizeAvatar("card:"), "");
  assert.equal(normalizeAvatar("data:image/jpeg;base64,AAAA"), "data:image/jpeg;base64,AAAA");
  assert.equal(normalizeAvatar(""), "");
});

test("老存档的 builtin:xxx（24 只动物）会被清空回落到色块", () => {
  assert.equal(normalizeAvatar("builtin:bear"), "");
  assert.equal(normalizeAvatar("builtin:panda"), "");
  assert.equal(resolveAvatar({ name: "老陈", avatar: "builtin:fox" }).kind, "auto");
});

test("脏数据一律清空，超长字符串也挡住", () => {
  [null, undefined, 123, {}, [], "builtin:unknown", "http://x.com/a.png", "data:image/"]
    .forEach((value) => assert.equal(normalizeAvatar(value), ""));
  assert.equal(normalizeAvatar(`data:image/jpeg;base64,${"A".repeat(300000)}`), "");
});

test("玩家对象进出存储不丢卡牌头像", () => {
  // createPlayer(seatNum, name, buyIn, parent, isMain, avatar)
  const player = normalizePlayer(createPlayer(1, "闹闹", 10, null, false, "card:c031"));
  assert.equal(player.avatar, "card:c031");
  const legacy = normalizePlayer(createPlayer(2, "小号", 10, null, false, "builtin:cat"));
  assert.equal(legacy.avatar, ""); // 老动物头像清空，回落色块
});

test("hasCustomAvatar 只在真挑过头像时为真", () => {
  assert.equal(hasCustomAvatar({ avatar: "card:c001" }), true);
  assert.equal(hasCustomAvatar({ avatar: "" }), false);
  assert.equal(hasCustomAvatar(null), false);
});

console.log("\n卡牌头像 · 解锁口径");

test("严格按拥有：一张卡没有就一个头像都没有", () => {
  const base = CARD_POOL.filter((card) => card.star === 1);
  assert.equal(base.length, 30);
  base.forEach((card) => assert.equal(isAvatarUnlocked(card, {}), false));
  assert.equal(countUnlockedAvatars({}), 0);
  assert.equal(countUnlockedAvatars(), 0); // 全新号
});

test("抽到几张就是几个头像（1★ 也要真抽到）", () => {
  assert.equal(countUnlockedAvatars(own("c001")), 1);
  assert.equal(countUnlockedAvatars({ c001: 1, c031: 3 }), 2);
  assert.equal(countUnlockedAvatars({ c001: 0 }), 0); // 持有 0 张
});

test("任意星级都要真抽到，光有碎片不算", () => {
  const pika = cardById("c031"); // 皮卡丘 2★（1★ 30 张，2★ 从 031 开始）
  assert.equal(pika.star, 2);
  assert.equal(isAvatarUnlocked(pika, {}), false);
  assert.equal(isAvatarUnlocked(pika, own("c031")), true);
  assert.equal(isAvatarUnlocked(pika, { c031: 0 }), false); // 持有 0 张
  assert.equal(isAvatarUnlocked(pika, { c031: "x" }), false); // 脏值
});

test("5★ 传说：抽到才解锁，抽到一张就永久解锁", () => {
  const mew = cardById("c071");
  assert.equal(mew.star, 5);
  assert.equal(isAvatarUnlocked(mew, {}), false);
  assert.equal(isAvatarUnlocked(mew, own("c071")), true);
  assert.equal(countUnlockedAvatars(own("c071")), 1);
});

test("候选表 71 张，按编号升序（= 星级从低到高）", () => {
  const options = avatarCardOptions({});
  assert.equal(options.length, CARD_TOTAL);
  assert.equal(options.length, 71);
  options.forEach((item, index) => {
    assert.equal(item.id, `card:${CARD_POOL[index].id}`);
    assert.equal(item.code, CARD_POOL[index].code);
    assert.ok(item.id.startsWith(CARD_PREFIX));
  });
  const stars = options.map((item) => item.star);
  assert.deepEqual(stars, [...stars].sort((a, b) => a - b));
});

test("候选表的 locked 跟着 owned 走", () => {
  const options = avatarCardOptions(own("c031"));
  const pika = options.find((item) => item.cardId === "c031");
  assert.equal(pika.locked, false);
  assert.equal(pika.name, "皮卡丘");
  const lockedCount = options.filter((item) => item.locked).length;
  assert.equal(lockedCount, 70); // 71 - 1(皮卡丘)：1★ 不再默认全开
});

test("星级都有对应的外环配色名", () => {
  [1, 2, 3, 4, 5].forEach((star) => {
    assert.ok(STAR_RING_TONE[star], `${star}★ 没有环色`);
  });
  assert.equal(new Set(Object.values(STAR_RING_TONE)).size, 5);
});

console.log("\n默认色块头像");

test("同一个名字永远同一个颜色", () => {
  const first = autoAvatar("沙河彭于晏");
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(autoAvatar("沙河彭于晏"), first);
  }
  assert.equal(first.kind, "auto");
  assert.equal(first.src, "");
});

test("不同名字尽量分散到不同颜色", () => {
  const names = ["张三", "李四", "王五", "赵六", "钱七", "孙八", "周九", "吴十"];
  const colors = new Set(names.map((name) => hashName(name)));
  assert.ok(colors.size >= 5, `8 个人只分到 ${colors.size} 种颜色`);
});

test("配色 index 一定落在调色板范围内", () => {
  ["", "a", "很长的名字测试", "🍎", "123"].forEach((name) => {
    const index = hashName(name);
    assert.ok(index >= 0 && index < AUTO_PALETTE.length);
  });
});

test("首字：中文取首字，英文转大写，空串给问号", () => {
  assert.equal(firstLetter("沙河彭于晏"), "沙");
  assert.equal(firstLetter(" Tom "), "T");
  assert.equal(firstLetter(""), "?");
  assert.equal(firstLetter(null), "?");
  assert.equal(firstLetter("🍎苹果"), "🍎"); // 表情符号按整字符取，不拆代理对
});

console.log("\n透传");

test("领奖台把卡牌头像原样带上去", () => {
  const ranking = [
    { name: "甲", score: 10, chips: 20, avatar: "card:c031", raceResult: { win: 1, lose: 0, deuce: 0 } },
    { name: "乙", score: 5, chips: 15, avatar: "", raceResult: { win: 0, lose: 1, deuce: 0 } },
  ];
  const podium = buildDailyPodium(ranking, ranking);
  const top = podium.find((item) => item.rank === 1);
  assert.equal(top.name, "甲");
  assert.equal(top.avatar, "card:c031");
  const second = podium.find((item) => item.rank === 2);
  assert.equal(second.avatar, "");
});

test("data URL 字节数估算靠谱", () => {
  // 4 个 base64 字符 = 3 字节
  const dataUrl = "data:image/jpeg;base64,AAAAAAAA";
  assert.equal(approxBytes(dataUrl), 6);
  assert.equal(approxBytes(""), 0);
});

console.log(`\n头像单测通过 ${passed} 项\n`);
