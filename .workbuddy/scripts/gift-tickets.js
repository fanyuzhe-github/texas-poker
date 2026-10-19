/**
 * 给某个玩家发奖券（临时调试用，不走 UI）。
 *
 * 用法：浏览器 DevTools → Console → 粘贴整段 → 回车。
 * 改顶部 NAME / AMOUNT 即可。**不用刷新页面**：
 * 脚本会同时改内存里的 Vue 状态（界面立刻变）和 localStorage（刷新后还在）。
 *
 * 说明：卡包挂在「主账号」上，目标若是别人的子账号，券会自动发到它的主账号名下
 * （与 grantTickets 的归集口径一致），控制台会打印实际收到券的名字。
 */
(function giftTickets() {
  var NAME = "范宇哲";
  var AMOUNT = 1000;

  var CARDS_KEY = "poker:cards";
  var PLAYERS_KEY = "allPlayers";
  var EMPTY_BAG = {
    tickets: 0,
    owned: {},
    shards: 0,
    pity3: 0,
    pity5: 0,
    pulls: 0,
    seed: 1,
  };

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  // 页面上的 GameDetail 实例（拿不到就纯改存档，退回"刷新后生效"）
  function findGameDetail() {
    var app = document.querySelector("#app");
    var root = app && app.__vue__;
    if (!root) return null;
    var found = null;
    (function walk(vm) {
      (vm.$children || []).forEach(function (child) {
        if (child.$options && child.$options.name === "GameDetail") found = child;
        walk(child);
      });
    })(root);
    return found;
  }

  // 1. 先算归属：子账号 → 主账号
  var vm = findGameDetail();
  var roster = read(PLAYERS_KEY, []) || [];
  var target = NAME;
  for (var i = 0; i < roster.length; i += 1) {
    var item = roster[i];
    if (item && item.name === NAME && item.parent) {
      target = item.parent;
      break;
    }
  }

  // 2. 优先用内存里的卡牌状态（这样界面不用刷新就更新）
  var state = vm && vm.cardState ? vm.cardState : read(CARDS_KEY, null);
  if (!state || typeof state !== "object") {
    state = { version: 1, players: {}, log: [] };
  }
  if (!state.players || typeof state.players !== "object") state.players = {};
  if (!Array.isArray(state.log)) state.log = [];

  var bag = state.players[target];
  if (!bag) {
    bag = JSON.parse(JSON.stringify(EMPTY_BAG));
    if (vm) vm.$set(state.players, target, bag);
    else state.players[target] = bag;
  }

  var before = Number(bag.tickets) || 0;
  bag.tickets = before + AMOUNT;

  // 3. 落盘（内存与存档一致，刷新不丢）
  var saved = write(CARDS_KEY, state);

  console.log(
    "[gift] 已给「" +
      target +
      "」发 " +
      AMOUNT +
      " 张奖券：" +
      before +
      " → " +
      bag.tickets +
      (saved ? "（已写入存档）" : "（⚠️ 存档写入失败，只在内存里）") +
      (vm ? "，界面已更新" : "，刷新页面后生效")
  );
})();
