/**
 * 对局流水的容量控制。
 *
 * 早期写法是一条硬砍的静默截断：`[game, ...history].slice(0, 200)`。
 * 它有两条硬伤：
 *
 * 1. **算错账**：赛季积分、全期纪录、勋章重放全都从 history 现算。
 *    第 201 局开始，最老的一局被悄悄扔掉，这些数字整体少算，
 *    而界面上没有任何提示 —— 用户以为自己在看全部历史。
 * 2. **砍得没道理**：200 局撑死一百多 KB，离 localStorage（约 5MB）
 *    和 gist 单文件 1MB 都还远，等于白丢数据换不来任何好处。
 *
 * 现在改成**按体积**限制：从最新一局往前装，装到预算用完为止。
 * 预算按 gist 的实际存储（UTF-8 字节）算，中文按 3 字节，
 * 这样本机存的量天然落在云端能完整装下的范围内。
 *
 * ⚠️ 裁剪只可能砍掉**最老的**几局。当前赛季的流水几乎不可能被砍到
 * （600KB ≈ 800 多局），但全期纪录/勋章一旦真被裁剪就会少算 ——
 * 所以调用方**必须**把 dropped 告诉用户，别再做静默截断。
 */

/**
 * 流水预算（UTF-8 字节）。
 * 留足余量给 players / cards / 其余 key，同时压在 gist 1MB 截断线之下
 * （SNAPSHOT_SIZE_WARN = 900KB，见 sync.js）。
 */
export const HISTORY_MAX_BYTES = 600 * 1024;

let encoder = null;

/**
 * 一局记录占多少字节（UTF-8）。
 * 用 Blob / TextEncoder 而不是 `str.length`：中文在 UTF-16 里算 1 个字符、
 * 存到 gist 里要占 3 字节，按字符数估会严重低估。
 *
 * @param {object} game
 * @returns {number} 序列化失败的一律当 0，宁可少算也不让裁剪逻辑抛错
 */
export function gameBytes(game) {
  let text;
  try {
    text = JSON.stringify(game);
  } catch (error) {
    return 0;
  }
  if (typeof text !== "string") return 0;

  if (typeof TextEncoder === "function") {
    if (!encoder) encoder = new TextEncoder();
    return encoder.encode(text).length;
  }
  // 没有 TextEncoder 的老环境：按 UTF-16 估，只会更早触发裁剪，不会超预算
  return text.length * 2;
}

/**
 * 按体积裁剪流水。
 *
 * @param {Array} list 对局流水，**必须按时间倒序**（新 → 旧，loadHistory 输出即如此）
 * @param {number} [maxBytes] 预算，默认 HISTORY_MAX_BYTES
 * @returns {{list: Array, dropped: number, bytes: number}}
 *   list 是保留的连续前缀（最新的一批），dropped 是被裁掉的局数，bytes 是保留部分占的字节
 */
export function trimHistory(list, maxBytes = HISTORY_MAX_BYTES) {
  const games = Array.isArray(list)
    ? list.filter((game) => game && typeof game === "object")
    : [];

  const budget =
    Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
      ? Math.floor(Number(maxBytes))
      : HISTORY_MAX_BYTES;

  const kept = [];
  let used = 0;
  let dropped = 0;

  for (let index = 0; index < games.length; index += 1) {
    const size = gameBytes(games[index]);

    // 最新一局无论多大都留下：刚结算完就被裁掉，等于这一局白记。
    // 之后一旦超预算就整段截断 —— 只保留连续的最新前缀，不允许中间出现空洞。
    if (kept.length && used + size > budget) {
      dropped = games.length - index;
      break;
    }

    kept.push(games[index]);
    used += size;
  }

  return { list: kept, dropped, bytes: used };
}
