/**
 * 卡图装配：按**卡池自编号**（001 ~ 071）从 `src/assets/cards` 取 PNG。
 *
 * core 层不碰资源，所以拼接逻辑统一放在这里 —— CardTile（卡面）和
 * PlayerAvatar（卡牌头像）共用一份，免得两处各写一套 require。
 *
 * ⚠️ `require.context` 是 webpack 专有 API；如果将来换成 Vite，
 *    这里要改成 `new URL('../assets/cards/xxx.png', import.meta.url)` 的写法。
 */
const artCtx = require.context("../assets/cards", false, /\.png$/);
const artCache = {};

/**
 * @param {string} code 卡池自编号，如 "025"
 * @returns {string} webpack 处理后的图片地址；找不到返回 ""（调用方要能兜底）
 */
export function cardArtUrl(code) {
  const key = String(code || "");
  if (!(key in artCache)) {
    const path = `./${key}.png`;
    artCache[key] = artCtx.keys().includes(path) ? artCtx(path) : "";
  }
  return artCache[key];
}
