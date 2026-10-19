/**
 * 数据备份：导出 / 导入，防止清缓存导致战绩全丢。
 */
import {
  SCHEMA_VERSION,
  loadPlayers,
  loadHistory,
  loadSettings,
  savePlayers,
  saveHistory,
  saveSettings,
  loadCards,
  saveCards,
  normalizePlayer,
} from "./storage";
import { format } from "./money";
import { buildMainRanking } from "./ranking";
import { normalizeCardState, mergeCardStates } from "./cards";

/** 组装一份完整备份数据 */
export function buildBackup() {
  return {
    app: "texas-poker",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    players: loadPlayers(),
    history: loadHistory(),
    settings: loadSettings(),
    // 卡包是随机事件的结果，不备份就永久丢失（重放 history 算不回来）
    cards: loadCards(),
  };
}

/** 触发浏览器下载 */
export function downloadFile(filename, content, mime = "application/json") {
  // 加 BOM，避免 Excel 打开 CSV 时中文乱码
  const body = mime.includes("csv") ? `\uFEFF${content}` : content;
  const blob = new Blob([body], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportJson() {
  const stamp = timestamp();
  downloadFile(`德州记账备份_${stamp}.json`, JSON.stringify(buildBackup(), null, 2));
}

export function exportCsv() {
  const stamp = timestamp();
  const ranking = buildMainRanking(loadPlayers());
  const rows = [
    ["排名", "主账号", "子账号", "胜场", "负场", "平局", "胜率", "积分"],
  ];

  ranking.forEach((main, index) => {
    const stat = (player) => {
      const result = player.raceResult || {};
      const total = (result.win || 0) + (result.lose || 0) + (result.deuce || 0);
      return {
        win: result.win || 0,
        lose: result.lose || 0,
        deuce: result.deuce || 0,
        rate: total ? `${(((result.win || 0) / total) * 100).toFixed(1)}%` : "—",
      };
    };

    // 主账号行：积分是名下所有子账号的汇总
    const mainStat = stat(main);
    rows.push([
      index + 1,
      main.name,
      "",
      mainStat.win,
      mainStat.lose,
      mainStat.deuce,
      mainStat.rate,
      format(main.score),
    ]);

    // 子账号明细行
    (main.children || []).forEach((child) => {
      const childStat = stat(child);
      rows.push([
        "",
        main.name,
        child.name,
        childStat.win,
        childStat.lose,
        childStat.deuce,
        childStat.rate,
        format(child.score),
      ]);
    });
  });

  // 追加对局流水
  const history = loadHistory();
  if (history.length) {
    rows.push([]);
    rows.push(["对局时间", "玩家", "座位号", "剩余筹码", "本局盈亏"]);
    history.forEach((game) => {
      game.records.forEach((record) => {
        rows.push([
          new Date(game.time).toLocaleString("zh-CN"),
          record.name,
          record.seatNum,
          format(record.chips),
          format(record.delta),
        ]);
      });
    });
  }

  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell == null ? "" : cell);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(",")
    )
    .join("\r\n");

  downloadFile(`德州记账数据_${stamp}.csv`, csv, "text/csv");
}

/**
 * 解析备份文件文本。
 * @returns {{ok: boolean, data?: object, error?: string}}
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: "文件不是合法的 JSON 格式" };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "文件内容不是一个对象" };
  }
  if (!Array.isArray(data.players) && !Array.isArray(data.history)) {
    return { ok: false, error: "文件里没有找到玩家或历史数据，可能不是本项目导出的备份" };
  }
  return { ok: true, data };
}

/**
 * 落地备份数据。
 * @param {object} data parseBackup 通过的 data
 * @param {'replace'|'merge'} mode 覆盖或合并
 * @returns {{players: number, history: number}}
 */
export function applyBackup(data, mode = "replace") {
  const incomingPlayers = (Array.isArray(data.players) ? data.players : [])
    .map((item, index) => normalizePlayer(item, index))
    .filter((player) => player.name);

  const incomingHistory = Array.isArray(data.history) ? data.history : [];

  let players;
  let history;

  if (mode === "merge") {
    const currentPlayers = loadPlayers();
    const names = new Set(currentPlayers.map((player) => player.name));
    players = currentPlayers.concat(
      incomingPlayers.filter((player) => !names.has(player.name))
    );

    const currentHistory = loadHistory();
    const ids = new Set(currentHistory.map((game) => game.id));
    history = currentHistory
      .concat(incomingHistory.filter((game) => !ids.has(String(game.id))))
      .sort((a, b) => b.time - a.time);
  } else {
    players = dedupePlayers(incomingPlayers);
    history = incomingHistory;
  }

  savePlayers(players);
  saveHistory(history);
  if (data.settings && typeof data.settings === "object") {
    saveSettings(data.settings);
  }

  // 卡包：覆盖模式直接替换；合并模式按人把券、碎片、卡牌并起来
  const incomingCards = normalizeCardState(data.cards);
  const cards =
    mode === "merge" ? mergeCardStates(loadCards(), incomingCards) : incomingCards;
  saveCards(cards);

  return {
    players: players.length,
    history: history.length,
    cards: Object.keys(cards.players).length,
  };
}

function dedupePlayers(list) {
  const seen = new Set();
  return list.filter((player) => {
    if (seen.has(player.name)) return false;
    seen.add(player.name);
    return true;
  });
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}
