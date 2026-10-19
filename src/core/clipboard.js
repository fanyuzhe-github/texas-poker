/**
 * 复制文本到剪贴板，带降级方案（非 HTTPS 环境下 Clipboard API 不可用）。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  if (!text) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn("[clipboard] Clipboard API 不可用，尝试降级", error);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch (error) {
    console.error("[clipboard] 复制失败", error);
    return false;
  }
}
