/**
 * 头像核心层：卡牌头像 + 自定义照片 + 默认色块头像 + 本地图片压缩。
 *
 * 玩家的 avatar 字段只有三种取值，除此之外一律按「默认头像」处理：
 *   1. ""                     → 默认：昵称首字 + 由名字哈希出的稳定渐变色
 *   2. "card:c025"            → 卡牌头像（卡池 71 张，图由组件层按编号加载）
 *   3. "data:image/xxx;base64,..." → 用户上传的照片（已压到 96~128 见方）
 *
 * 卡牌头像的解锁：**严格按拥有** —— 只有抽到 / 碎片合成过的卡才能当头像
 * （见 `isAvatarUnlocked`），一张卡没抽过就一个卡牌头像都没有，只能用默认色块或上传。
 * 曾经 1★ 30 张默认全开当兜底，结果「卡包里一张卡却有 30 多个头像」，已取消。
 *
 * 注意：core 目录不引入任何图片文件，卡图路径由组件层拼接。
 * 历史值 "builtin:xxx"（24 只小动物）已下线，normalizeAvatar 会把它清掉回落到默认色块。
 */

import { CARD_POOL, cardById } from "./cardPool";

/* ------------------------------------------------------------------ */
/* 卡牌头像                                                            */
/* ------------------------------------------------------------------ */

/** 头像字段前缀：`card:c025` */
export const CARD_PREFIX = "card:";

/**
 * 星级 → 头像外环颜色。5★ 是彩虹，渐变写不进单个色值，
 * 这里放 "rainbow" 标记，由 PlayerAvatar 换成 conic-gradient。
 */
export const STAR_RING_TONE = {
  1: "#c9ced8",
  2: "#4c8dff",
  3: "#9254de",
  4: "#e8b84b",
  5: "rainbow",
};

/** 卡 id → 头像字段值 */
export function cardAvatarValue(cardId) {
  return `${CARD_PREFIX}${cardId}`;
}

/** 头像字段值 → 卡对象（不是卡牌头像就返回 null） */
export function avatarCardOf(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.indexOf(CARD_PREFIX) !== 0) return null;
  return cardById(text.slice(CARD_PREFIX.length));
}

/**
 * 这张卡能不能当头像：**只认持有数量**，跟星级无关。
 * 碎片不算拥有（`owned` 只记成卡），持有 0 张 / 脏值都视为未解锁。
 *
 * @param {object} card 卡池对象
 * @param {object} owned 该主账号的持有表 { cardId: 数量 }
 */
export function isAvatarUnlocked(card, owned) {
  if (!card) return false;
  const count = owned && typeof owned === "object" ? Number(owned[card.id]) : 0;
  return Number.isFinite(count) && count > 0;
}

/**
 * 头像选择器用的完整候选表（71 张，按编号 = 星级升序）。
 * @param {object} owned 持有表，不传就是全新号：71 张全部 `locked`
 */
export function avatarCardOptions(owned) {
  return CARD_POOL.map((card) => ({
    id: cardAvatarValue(card.id),
    cardId: card.id,
    code: card.code,
    name: card.name,
    star: card.star,
    type: card.type,
    locked: !isAvatarUnlocked(card, owned),
  }));
}

/** 已解锁数量，UI 上显示「已解锁 34 / 71」 */
export function countUnlockedAvatars(owned) {
  return CARD_POOL.reduce(
    (total, card) => total + (isAvatarUnlocked(card, owned) ? 1 : 0),
    0
  );
}


/* ------------------------------------------------------------------ */
/* 默认头像：昵称首字 + 稳定渐变色                                        */
/* ------------------------------------------------------------------ */

/** 12 组渐变，饱和度适中，白底黑字之外都能看清 */
export const AUTO_PALETTE = [
  ["#ff9a76", "#ef5b4c"],
  ["#ffa94d", "#f2761f"],
  ["#ffd43b", "#f0a500"],
  ["#a9e34b", "#5c940d"],
  ["#63e6be", "#0ca678"],
  ["#66d9e8", "#1098ad"],
  ["#74c0fc", "#1c7ed6"],
  ["#a5b4fc", "#5b5bd6"],
  ["#b197fc", "#7048e8"],
  ["#e599f7", "#a61e9d"],
  ["#f783ac", "#c2255c"],
  ["#adb5bd", "#495057"],
];

/** FNV-1a：同一个名字永远得到同一个颜色，改昵称会换色（可接受） */
export function hashName(name) {
  const text = String(name == null ? "" : name);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % AUTO_PALETTE.length;
}

/** 头像上的文字：中文取首字，字母取大写首字母 */
export function firstLetter(name) {
  const text = String(name == null ? "" : name).trim();
  if (!text) return "?";
  const chars = Array.from(text);
  const head = chars[0] || "?";
  return /[a-zA-Z]/.test(head) ? head.toUpperCase() : head;
}

/**
 * 默认头像描述。
 * @returns {{kind:'auto', src:string, text:string, bg:string}}
 */
export function autoAvatar(name) {
  const [from, to] = AUTO_PALETTE[hashName(name)];
  return {
    kind: "auto",
    src: "",
    text: firstLetter(name),
    bg: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  };
}

/* ------------------------------------------------------------------ */
/* 字段解析与清洗                                                        */
/* ------------------------------------------------------------------ */

/** 头像字段最大长度：超出说明不是头像，多半是被塞了脏数据 */
const MAX_AVATAR_LEN = 200000;

/**
 * 清洗 avatar 字段。认不出来的值一律清空回落到默认头像，
 * 免得 localStorage 里躺着一段乱码把头像区渲染崩。
 */
export function normalizeAvatar(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > MAX_AVATAR_LEN) return "";

  // 卡牌头像：卡池里查得到才算数（老存档里的 builtin:xxx 会掉到这里被清掉）
  if (text.indexOf(CARD_PREFIX) === 0) {
    return cardById(text.slice(CARD_PREFIX.length)) ? text : "";
  }
  // 只收图片 data URI（ png / jpeg / webp / gif / svg+xml ）
  if (text.startsWith("data:image/") && text.indexOf(",") > 0) return text;
  return "";
}

/**
 * 解析一个玩家的头像。
 * @param {object|string} player 玩家对象，或直接传 avatar 字符串
 * @returns {{kind:'photo'|'card'|'auto', src:string, text:string, bg:string,
 *            code:string, star:number, cardName:string, label:string}}
 *
 * 卡牌头像的 `src` 故意留空：core 不碰图片资源，由 PlayerAvatar 按 `code` 装配。
 */
export function resolveAvatar(player) {
  const source = typeof player === "string" ? { avatar: player } : player || {};
  const name = source.name == null ? "" : source.name;
  const raw = normalizeAvatar(source.avatar);

  if (raw.startsWith("data:image/")) {
    return {
      kind: "photo",
      src: raw,
      text: firstLetter(name),
      bg: "",
      code: "",
      star: 0,
      cardName: "",
      label: "自定义头像",
    };
  }
  if (raw.indexOf(CARD_PREFIX) === 0) {
    const card = cardById(raw.slice(CARD_PREFIX.length));
    if (card) {
      return {
        kind: "card",
        src: "",
        text: "",
        bg: "",
        code: card.code,
        star: card.star,
        cardName: card.name,
        label: `${card.name} · ${card.star}★`,
      };
    }
  }
  return {
    ...autoAvatar(name),
    code: "",
    star: 0,
    cardName: "",
    label: "默认头像",
  };
}

/** 这个玩家有没有自己挑过头像（用于 UI 上显示「清除」按钮） */
export function hasCustomAvatar(player) {
  return normalizeAvatar(player && player.avatar) !== "";
}

/* ------------------------------------------------------------------ */
/* 本地图片上传（依赖 DOM，Node 单测不要调用）                            */
/* ------------------------------------------------------------------ */

export const AVATAR_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 选图上限 8MB
export const AVATAR_MAX_STORE_BYTES = 48000; // 落盘上限 ~48KB，超了再压一档

/** data URL 大致占用的字节数（base64 有 1/3 膨胀 + 头部） */
export function approxBytes(dataUrl) {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) return 0;
  return Math.floor(((String(dataUrl).length - comma - 1) * 3) / 4);
}

/** 居中正方形裁切 + 缩放 + JPEG 压缩 */
function cropToDataUrl(image, size, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  // 白底垫一层：透明 PNG 转 JPEG 时不至于变成黑块
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 把本地图片文件压成可以直接存进 localStorage 的头像 data URL。
 * 头像只要 128 见方就够用（列表里最大也就 40px），压过头只会白占配额。
 *
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
export function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("没有选中图片"));
      return;
    }
    if (!/^image\//.test(file.type)) {
      reject(new Error("请选择图片文件"));
      return;
    }
    if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
      reject(new Error("图片太大了，请选一张 8MB 以内的"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，换一张试试"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("这张图片无法解析，换一张试试"));
      image.onload = () => {
        let dataUrl = cropToDataUrl(image, 128, 0.72);
        // 压完还超标就再降一档，别让头像把 localStorage 撑爆
        if (approxBytes(dataUrl) > AVATAR_MAX_STORE_BYTES) {
          dataUrl = cropToDataUrl(image, 96, 0.6);
        }
        resolve(dataUrl);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
