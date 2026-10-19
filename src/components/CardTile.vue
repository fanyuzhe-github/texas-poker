<template>
  <div class="tile" :class="[`tile--s${card.star}`, { 'tile--dim': dim }]">
    <div class="tile__head">
      <span class="tile__no"
        >{{ noText
        }}<em v-if="!dim && dexText" class="tile__dex">{{ dexText }}</em></span
      >
      <span class="tile__type" :class="`is-${tone}`">{{ dim ? "?" : card.type }}</span>
    </div>

    <div class="tile__art">
      <img
        v-if="art"
        class="tile__img"
        :class="{ 'is-dim': dim }"
        :src="art"
        :alt="dim ? '' : card.name"
        draggable="false"
      />
      <span v-else class="tile__ball">{{ dim ? "?" : card.type.charAt(0) }}</span>
    </div>

    <div class="tile__name">{{ dim ? "？？？" : card.name }}</div>
    <div class="tile__foot">
      <span class="tile__stars">{{ starText }}</span>
      <span class="tile__stage">{{ dim ? "未收集" : card.stage }}</span>
    </div>

    <span v-if="badge" class="tile__badge">{{ badge }}</span>
  </div>
</template>

<script>
import { typeTone } from "../core/cardPool";
import { cardArtUrl } from "../utils/cardArt";

/**
 * 卡面：卡图 = dream-world 官方插画光栅化后的 256px PNG（见 .workbuddy/scripts/svg2png.js）。
 * 为什么不是 SVG：`file://` 下 Chromium 禁止 `<img>` 加载本地 SVG，而 dist 双击就要能用。
 */
export default {
  name: "CardTile",
  props: {
    card: { type: Object, required: true },
    /** 未收集：图鉴里灰显，名字和属性都打码 */
    dim: { type: Boolean, default: false },
    /** 右上角角标，如 NEW / +3 碎片 */
    badge: { type: String, default: "" },
  },
  computed: {
    tone() {
      return typeTone(this.card.type);
    },
    art() {
      return cardArtUrl(this.card && this.card.code);
    },
    /**
     * 主编号 = 卡池自编号 001~071（连续、按稀有度分档，一眼看得出在第几档）。
     * 真实全国图鉴号降级成后面的小字副标 —— 它跨世代会跳号，当主编号显得乱。
     */
    noText() {
      return `No.${this.card.code}`;
    },
    /** 副标：真实全国图鉴号，纯装饰，认不出的卡不显示 */
    dexText() {
      const dex = Number(this.card && this.card.dex) || 0;
      return dex ? `#${String(dex).padStart(3, "0")}` : "";
    },
    starText() {
      return "★".repeat(Math.max(0, Number(this.card.star) || 0));
    },
  },
};
</script>

<style scoped>
/**
 * 尺寸按用户截图 1:1 对齐：卡 179×239、比例 1:1.335（aspect-ratio: 3/4）。
 * 列宽在 CardCollection 里固定成 179px，所以这里的比例只负责「高度 = 宽 × 1.335」，
 * 多出来的高度全部给图区（flex:1）。内边距/字号也按截图收紧了，图区能到 157。
 */
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box; /* 不加这行 aspect-ratio 只算内容区，外框比例会变成 1.335 */
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  border: 1px solid #e4e7ed;
  padding: 10px 10px 9px;
  background: linear-gradient(180deg, #ffffff 0%, #fdfdfd 100%);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  overflow: hidden;
}
.tile:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}
/* 5★ 给一道金边，图鉴一眼扫到最稀有的那几张 */
.tile--s5 {
  border-color: #f0c78a;
  box-shadow: 0 0 0 1px rgba(240, 199, 138, 0.5) inset;
}
.tile--dim {
  background: #fafafa;
  border-style: dashed;
}
.tile--dim .tile__name,
.tile--dim .tile__art {
  color: #c0c4cc;
}
/* 未收集：保留卡池自编号（方便说「我还差 045」），但整体压暗 */
.tile--dim .tile__no {
  color: #c0c4cc;
}
.tile--dim .tile__art {
  background: none;
}

.tile__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  line-height: 16px;
  color: #909399;
}
.tile__no {
  font-family: monospace;
}
/* 真实全国图鉴号：副标，比主编号浅一号，不抢视线 */
.tile__dex {
  font-style: normal;
  font-size: 11px;
  color: #b1b3b8;
  margin-left: 5px;
  letter-spacing: 0.2px;
}
.tile__type {
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 16px;
  background: #f1efe8;
  color: #5f5e5a;
}
.tile__type.is-fire { background: #fcebeb; color: #a32d2d; }
.tile__type.is-water { background: #e6f1fb; color: #185fa5; }
.tile__type.is-grass { background: #eaf3de; color: #3b6d11; }
.tile__type.is-electric { background: #faeeda; color: #854f0b; }
.tile__type.is-psychic { background: #fbeaf0; color: #993556; }
.tile__type.is-dragon { background: #eeedfe; color: #534ab7; }
.tile__type.is-steel { background: #f1efe8; color: #444441; }
.tile__type.is-fight { background: #faece7; color: #993c1d; }
.tile__type.is-ghost { background: #eeedfe; color: #3c3489; }
.tile__type.is-fairy { background: #fbeaf0; color: #d4537e; }
.tile__type.is-bug { background: #eaf3de; color: #639922; }
.tile__type.is-rock { background: #f1efe8; color: #5f5e5a; }
.tile__type.is-ground { background: #faeeda; color: #854f0b; }
.tile__type.is-flying { background: #e6f1fb; color: #378add; }
.tile__type.is-poison { background: #fbeaf0; color: #72243e; }
.tile__type.is-normal { background: #f1efe8; color: #5f5e5a; }

.tile__art {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 高度由 aspect-ratio 撑出来的富余空间决定；min-height 是 aspect-ratio 不支持时的兜底 */
  flex: 1;
  min-height: 118px;
  margin: 7px 0;
  border-radius: 8px;
}
/* 稀有度越高，背后那圈光晕越明显 */
.tile--s1 .tile__art { background: radial-gradient(circle at 50% 58%, #f1efe8 0%, rgba(241, 239, 232, 0) 70%); }
.tile--s2 .tile__art { background: radial-gradient(circle at 50% 58%, #eaf3de 0%, rgba(234, 243, 222, 0) 70%); }
.tile--s3 .tile__art { background: radial-gradient(circle at 50% 58%, #e6f1fb 0%, rgba(230, 241, 251, 0) 70%); }
.tile--s4 .tile__art { background: radial-gradient(circle at 50% 58%, #eeedfe 0%, rgba(238, 237, 254, 0) 70%); }
.tile--s5 .tile__art { background: radial-gradient(circle at 50% 58%, #fff3d6 0%, rgba(255, 243, 214, 0) 74%); }

.tile__img {
  /* 256px 原图 撑满画框等比缩放（画框 132px，约 1.9 倍超采样，放大不糊） */
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2px;
  box-sizing: border-box;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.16));
  transition: transform 0.16s ease;
}
.tile:hover .tile__img {
  transform: scale(1.06);
}
/* 未收集：纯剪影，连轮廓都认不出是哪只 */
.tile__img.is-dim {
  filter: grayscale(1) brightness(0) opacity(0.17);
  transform: none;
}

.tile__ball {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 600;
  background: #f5f7fa;
  color: #606266;
}
.tile--s1 .tile__ball { background: #f1efe8; color: #5f5e5a; }
.tile--s2 .tile__ball { background: #eaf3de; color: #3b6d11; }
.tile--s3 .tile__ball { background: #e6f1fb; color: #185fa5; }
.tile--s4 .tile__ball { background: #eeedfe; color: #534ab7; }
.tile--s5 .tile__ball { background: #faeeda; color: #854f0b; }

.tile__name {
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 11px;
  color: #909399;
}
.tile__stars {
  letter-spacing: -1px;
}
.tile--s1 .tile__stars { color: #888780; }
.tile--s2 .tile__stars { color: #639922; }
.tile--s3 .tile__stars { color: #378add; }
.tile--s4 .tile__stars { color: #7f77dd; }
.tile--s5 .tile__stars { color: #ef9f27; }

/**
 * 角标浮在图区右上角（不在卡顶）。放卡顶会盖住头部的图鉴号和属性 pill，
 * 卡一窄就必然重叠 —— 挪到图上反而像卡牌游戏的角标。
 */
.tile__badge {
  position: absolute;
  top: 34px;
  right: 12px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 14px;
  background: rgba(245, 108, 108, 0.94);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
}
</style>
