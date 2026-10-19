<template>
  <span
    class="pav"
    :class="[`pav--${sizeName}`, { 'pav--card': resolved.kind === 'card' }]"
    :style="boxStyle"
    :title="tipText"
  >
    <img
      v-if="imgSrc"
      class="pav__img"
      :src="imgSrc"
      :alt="name"
      @error="onError"
    />
    <span v-else class="pav__text" :style="{ background: resolved.bg }">{{
      resolved.text
    }}</span>
    <slot />
  </span>
</template>

<script>
import { resolveAvatar, autoAvatar, STAR_RING_TONE } from "../core/avatar";
import { cardArtUrl } from "../utils/cardArt";

/** 5★ 的彩虹环：渐变只能写在 style 里，core 里存的是 "rainbow" 标记 */
const RING_5 =
  "conic-gradient(from 210deg, #ff6b6b, #ffd43b, #51cf66, #4dabf7, #cc5de8, #ff6b6b)";

/**
 * 通用头像。三种形态按优先级降级：
 *   自定义照片 → 卡牌头像 → 昵称色块
 * 图片加载失败（比如 data URI 被截断）自动退到色块，不留破图。
 *
 * 卡牌头像额外描一圈稀有度光环：1★ 灰 / 2★ 蓝 / 3★ 紫 / 4★ 金 / 5★ 彩虹，
 * 环宽跟着尺寸走（20px 头像 1.5px，领奖台 72px 也才 4px），别在小头像上糊成一团。
 */
export default {
  name: "PlayerAvatar",
  props: {
    name: { type: String, default: "" },
    /** 玩家 avatar 字段：builtin:xxx 或 data:image/... */
    avatar: { type: [String, Object], default: "" },
    size: { type: [Number, String], default: 28 },
    /** 圆角矩形（表格里默认圆形够用，方块留给特殊场合） */
    square: { type: Boolean, default: false },
  },
  data() {
    return { failed: false };
  },
  computed: {
    resolved() {
      if (this.failed) return autoAvatar(this.name);
      if (this.avatar && typeof this.avatar === "object") {
        return resolveAvatar(this.avatar);
      }
      return resolveAvatar({ name: this.name, avatar: this.avatar });
    },
    px() {
      const value = Number(this.size);
      return Number.isFinite(value) && value > 0 ? value : 28;
    },
    /** 卡牌头像的图：core 不碰资源，路径在这里按编号装配 */
    cardArt() {
      return this.resolved.kind === "card" ? cardArtUrl(this.resolved.code) : "";
    },
    imgSrc() {
      return this.resolved.src || this.cardArt;
    },
    /** 环宽跟着尺寸走，小头像不至于被环吃掉 */
    ringPx() {
      return Math.min(4, Math.max(1.5, Math.round(this.px * 0.075 * 10) / 10));
    },
    boxStyle() {
      const radius = this.square ? `${Math.round(this.px / 4)}px` : "50%";
      const base = {
        width: `${this.px}px`,
        height: `${this.px}px`,
        borderRadius: radius,
      };
      if (this.resolved.kind !== "card") return base;
      const star = this.resolved.star;
      const tone = STAR_RING_TONE[star] || STAR_RING_TONE[1];
      return {
        ...base,
        padding: `${this.ringPx}px`,
        background: star >= 5 ? RING_5 : tone,
      };
    },
    textStyle() {
      return { fontSize: `${Math.max(10, Math.round(this.px * 0.42))}px` };
    },
    sizeName() {
      if (this.px <= 24) return "xs";
      if (this.px <= 32) return "sm";
      if (this.px <= 48) return "md";
      return "lg";
    },
    tipText() {
      if (this.resolved.kind === "card") {
        const card = `${this.resolved.cardName} ${this.resolved.star}★`;
        return this.name ? `${this.name} · ${card}` : card;
      }
      return this.resolved.kind === "auto" ? "点击可设置头像" : this.name;
    },
  },
  watch: {
    avatar() {
      this.failed = false;
    },
  },
  methods: {
    onError() {
      this.failed = true;
    },
  },
};
</script>

<style scoped>
.pav {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  vertical-align: middle;
  background: #f2f4f8;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06) inset;
  user-select: none;
  /* 卡牌头像靠 padding 描环，别让环把尺寸撑大 */
  box-sizing: border-box;
}
.pav__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 卡图是透明底的小精灵：白底 + contain，别裁掉翅膀 */
.pav--card .pav__img {
  object-fit: contain;
  background: #fff;
  border-radius: 50%;
}
.pav__text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.18);
}
</style>
