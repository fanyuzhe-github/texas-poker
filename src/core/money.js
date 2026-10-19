/**
 * 金额工具：内部一律换算成「分」做整数运算，彻底避开 JS 浮点误差。
 * 对外暴露的仍然是「元」为单位的 Number。
 */

/** 元 -> 分（整数） */
export function toCents(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 分 -> 元 */
export function fromCents(cents) {
  return Math.round(cents) / 100;
}

/** 规整为两位小数的「元」 */
export function yuan(value) {
  return fromCents(toCents(value));
}

/** a + b */
export function add(a, b) {
  return fromCents(toCents(a) + toCents(b));
}

/** a - b */
export function sub(a, b) {
  return fromCents(toCents(a) - toCents(b));
}

/** 求和 */
export function sum(list) {
  const safeList = Array.isArray(list) ? list : [];
  return fromCents(safeList.reduce((acc, item) => acc + toCents(item), 0));
}

/** 金额相等判断（避免 0.1 + 0.2 !== 0.3） */
export function equals(a, b) {
  return toCents(a) === toCents(b);
}

/** 格式化为固定两位小数字符串，用于展示 */
export function format(value) {
  return toCents(value) / 100 === 0
    ? "0.00"
    : (toCents(value) / 100).toFixed(2);
}

/** 带符号展示，用于盈亏 */
export function formatSigned(value) {
  const cents = toCents(value);
  if (cents === 0) return "0.00";
  return (cents > 0 ? "+" : "-") + format(Math.abs(cents / 100));
}

/**
 * 输入框净化：只允许数字与最多两位小数，并裁剪到 [min, max]。
 * 返回字符串，保证 el-input 的 v-model 不会被强制转成 number 导致光标跳动。
 */
export function sanitizeAmountInput(raw, min = 0, max = Infinity) {
  const rawText = String(raw == null ? "" : raw);
  // 负数直接压回下限，否则负号会被过滤掉变成正数（"-5" -> "5"）
  if (rawText.trim().startsWith("-")) return String(min);

  let text = rawText
    .replace(/[^\d.]/g, "") // 只保留数字和小数点
    .replace(/\.{2,}/g, ".") // 多个小数点合并
    .replace(/^0+(\d)/, "$1") // 去掉前导 0
    .replace(/^\./, "0."); // .5 -> 0.5

  const matched = text.match(/^\d*(\.?\d{0,2})/);
  text = matched ? matched[0] : "";

  if (text === "" || text === ".") return text;

  const num = parseFloat(text);
  if (!Number.isFinite(num)) return "";
  if (num > max) return String(max);
  if (num < min) return String(min);
  return text;
}
