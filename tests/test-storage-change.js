/**
 * 本地改动广播：云备份的自动上传全靠它（实时同步已停用，现在只服务 Gist）。
 * 改动点散落在 25 处 save* 调用里，这里守住「一处不漏 + 不该响时不响」。
 */

/* 在 import storage.js 之前把 localStorage 装好（ESM import 会提升，只能动态 import） */
const store = new Map();
let failNextWrite = false;
global.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (failNextWrite) throw new Error("QuotaExceededError");
      store.set(key, value);
    },
    removeItem: (key) => store.delete(key),
  },
};

const originalWarn = console.warn;
let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    originalWarn(`✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

(async () => {
  const storage = await import("../src/core/storage.js");

  /* ---------- 1. 四个写入口都要发信号，且 kind 对得上 ---------- */
  const seen = [];
  const off = storage.onLocalChange((kind) => seen.push(kind));
  check("订阅返回取消函数", typeof off === "function");

  storage.savePlayers([{ name: "三哥" }]);
  storage.saveHistory([]);
  storage.saveSettings({ baseChips: 10 });
  storage.saveCards({});

  check("players 写入会通知", seen[0] === "players", `实际 ${seen[0]}`);
  check("history 写入会通知", seen[1] === "history", `实际 ${seen[1]}`);
  check("settings 写入会通知", seen[2] === "settings", `实际 ${seen[2]}`);
  check("cards 写入会通知", seen[3] === "cards", `实际 ${seen[3]}`);
  check("四个口子一共响 4 次", seen.length === 4, `实际 ${seen.length} 次`);

  /* ---------- 2. 取消订阅后不再响 ---------- */
  off();
  storage.savePlayers([]);
  check("取消订阅后不再通知", seen.length === 4, `实际变成 ${seen.length} 次`);

  /* ---------- 3. 落盘失败时不通知（没写进去就别去同步） ---------- */
  const seen2 = [];
  const off2 = storage.onLocalChange((kind) => seen2.push(kind));
  failNextWrite = true;
  const okWrite = storage.savePlayers([{ name: "阿伟" }]);
  failNextWrite = false;
  check("写入失败返回 false", okWrite === false);
  check("写入失败不通知", seen2.length === 0, `实际 ${seen2.length} 次`);
  off2();

  /* ---------- 4. mute 里不响，出来之后要响 ---------- */
  const seen3 = [];
  const off3 = storage.onLocalChange((kind) => seen3.push(kind));
  storage.muteLocalChange(() => {
    storage.savePlayers([]);
    storage.saveHistory([]);
    storage.saveSettings({});
    storage.saveCards({});
  });
  check("mute 内四个写入全不通知", seen3.length === 0, `实际 ${seen3.length} 次`);
  storage.savePlayers([]);
  check("mute 出来后恢复正常通知", seen3.length === 1, `实际 ${seen3.length} 次`);
  off3();

  /* ---------- 5. mute 嵌套：内层出来不能提前解锁 ---------- */
  const seen4 = [];
  const off4 = storage.onLocalChange(() => seen4.push(1));
  storage.muteLocalChange(() => {
    storage.muteLocalChange(() => {
      storage.savePlayers([]);
    });
    // 还在外层 mute 里，仍然不该响
    storage.saveHistory([]);
  });
  check("嵌套 mute 内层也不响", seen4.length === 0, `实际 ${seen4.length} 次`);
  off4();

  /* ---------- 6. mute 里抛错也不能把 mute 卡住 ---------- */
  const seen5 = [];
  const off5 = storage.onLocalChange(() => seen5.push(1));
  let threw = false;
  try {
    storage.muteLocalChange(() => {
      throw new Error("boom");
    });
  } catch (error) {
    threw = true;
  }
  check("mute 内异常照样往外抛", threw);
  storage.savePlayers([]);
  check("异常后 mute 已解锁", seen5.length === 1, `实际 ${seen5.length} 次`);
  off5();

  /* ---------- 7. 订阅回调自己炸了不能连累落盘 ---------- */
  const off6 = storage.onLocalChange(() => {
    throw new Error("订阅方炸了");
  });
  const saved = storage.savePlayers([{ name: "小美" }]);
  check("回调炸了写入仍然成功", saved === true);
  const raw = store.get("allPlayers");
  check("回调炸了数据确实落盘了", raw && raw.includes("小美"));
  off6();

  /* ---------- 8. 非函数不能订阅，也不能炸 ---------- */
  const off7 = storage.onLocalChange("not a function");
  check("非函数订阅返回可调用的空函数", typeof off7 === "function");
  off7();

  console.log(`\n结果：${pass} 项通过，${fail} 项失败\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
