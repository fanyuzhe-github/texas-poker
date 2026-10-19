<template>
  <div
    v-if="visible && results.length"
    ref="stage"
    class="cdo"
    :class="{
      'cdo--legend': legendStar === 5,
      'cdo--epic': legendStar === 4,
      'cdo--closing': closing,
    }"
    @click="onClickStage"
  >
      <!-- 星幕背景 -->
      <div class="cdo__bg">
        <span
          v-for="(s, i) in stars"
          :key="`star-${i}`"
          class="cdo__star"
          :style="s"
        />
      </div>
      <i class="cdo__nebula cdo__nebula--a" />
      <i class="cdo__nebula cdo__nebula--b" />

      <!-- 1. 聚能：灵球吸能量 -->
      <div v-if="phase === 'charge'" class="cdo__charge">
        <span
          v-for="(p, i) in sparks"
          :key="`spark-${i}`"
          class="cdo__spark"
          :style="p"
        />
        <i class="cdo__ring cdo__ring--1" />
        <i class="cdo__ring cdo__ring--2" />
        <i class="cdo__ring cdo__ring--3" />
        <div class="cdo__ball"><i class="cdo__ball-core" /></div>
      </div>

      <!-- 2. 爆闪 + 放射光 -->
      <div v-if="phase !== 'charge'" class="cdo__flash" />
      <div v-if="phase !== 'charge'" class="cdo__burst" />

      <!-- 3. 卡牌 -->
      <div v-if="phase !== 'charge'" class="cdo__body">
        <transition name="cdo-banner">
          <div v-if="legendStar >= 4" class="cdo__banner" :class="`is-s${legendStar}`">
            {{ legendStar === 5 ? "★★★★★ 传说降临" : "★★★★ 史诗现世" }}
          </div>
        </transition>

        <div
          class="cdo__cards"
          :class="isTen ? 'cdo__cards--ten' : 'cdo__cards--one'"
        >
          <div
            v-for="(item, index) in results"
            :key="`card-${index}`"
            class="cdo__slot"
            :class="`is-s${item.star}`"
          >
            <span
              class="cdo__halo"
              :style="{ animationDelay: `${openAt[index]}ms` }"
            />
            <span
              v-if="item.star >= 4"
              class="cdo__rays"
              :style="{ animationDelay: `${openAt[index]}ms` }"
            />
            <div
              class="cdo__card"
              :class="{ 'is-open': opened[index] }"
              :style="cardStyle(index)"
            >
              <div class="cdo__face cdo__face--back">
                <span class="cdo__back-ring" />
                <span class="cdo__back-star">★</span>
              </div>
              <div class="cdo__face cdo__face--front">
                <card-tile :card="item.card" :badge="badgeOf(item)" />
              </div>
            </div>
          </div>
        </div>

        <transition name="cdo-summary">
          <div v-if="phase === 'done'" class="cdo__summary" @click.stop>
            <span class="cdo__summary-item">
              最高 <b :class="`is-s${top.star}`">{{ top.star }}★</b>
              {{ top.card.name }}
            </span>
            <span class="cdo__summary-item">新卡 <b>{{ newCount }}</b> 张</span>
            <span class="cdo__summary-item">碎片 <b class="is-shard">+{{ shardTotal }}</b></span>
            <el-button type="warning" size="small" @click.stop="close">收下</el-button>
          </div>
        </transition>
      </div>

      <div class="cdo__hint">{{ hintText }}</div>
    </div>
</template>

<script>
import CardTile from "./CardTile.vue";

/** 卡背入场 */
const DEAL_DUR = 520;
const STAGGER_DEAL = 60;
/** 翻牌 */
const FLIP_DUR = 620;
const STAGGER_FLIP = 120;
/** 4★/5★ 出场多留一拍，让光效有时间炸开 */
const PAUSE_RARE = 380;
/** 聚能时长 */
const CHARGE_DUR = 900;

function polar(count, minDist, step) {
  return Array.from({ length: count }, (unused, i) => {
    const angle = (i / count) * Math.PI * 2;
    const dist = minDist + (i % 4) * step;
    return {
      "--tx": `${(Math.cos(angle) * dist).toFixed(1)}px`,
      "--ty": `${(Math.sin(angle) * dist).toFixed(1)}px`,
      animationDelay: `${((i % 6) * 0.09).toFixed(2)}s`,
    };
  });
}

export default {
  name: "CardDrawStage",
  components: { CardTile },
  props: {
    visible: { type: Boolean, default: false },
    /** drawCards 的结果：[{ card, star, dup }] */
    results: { type: Array, default: () => [] },
  },
  data() {
    return {
      phase: "charge",
      opened: [],
      openAt: [],
      dealDelay: [],
      legendStar: 0,
      closing: false,
      timers: [],
    };
  },
  computed: {
    isTen() {
      return this.results.length > 1;
    },
    stars() {
      // 黄金角撒点，看起来比随机更均匀；用固定算法避免每次渲染闪位
      return Array.from({ length: 48 }, (unused, i) => {
        const angle = i * 2.399963;
        const radio = ((i * 37) % 100) / 100;
        return {
          width: `${i % 7 === 0 ? 3 : 2}px`,
          height: `${i % 7 === 0 ? 3 : 2}px`,
          left: `${(50 + Math.cos(angle) * radio * 47).toFixed(2)}%`,
          top: `${(48 + Math.sin(angle) * radio * 45).toFixed(2)}%`,
          animationDelay: `${((i % 10) * 0.23).toFixed(2)}s`,
        };
      });
    },
    sparks() {
      return polar(18, 150, 26);
    },
    top() {
      return (
        this.results.reduce(
          (best, item) => (!best || item.star > best.star ? item : best),
          null
        ) || { card: { name: "" }, star: 0 }
      );
    },
    newCount() {
      return this.results.filter((item) => !item.dup).length;
    },
    shardTotal() {
      return this.results.reduce((sum, item) => sum + (item.dup || 0), 0);
    },
    hintText() {
      if (this.phase === "charge") return "正在凝聚卡力…";
      if (this.phase === "done") return "点击任意位置收下";
      return "点击任意位置跳过";
    },
  },
  watch: {
    visible(value) {
      // 关闭时不清状态：淡出过程中还要保持"全部翻开"的样子，
      // 下一次打开由 play() 统一重置
      if (value) {
        this.play();
        this.$nextTick(this.toBody);
      }
    },
  },
  mounted() {
    if (this.visible) {
      this.play();
      this.$nextTick(this.toBody);
    }
    // capture 阶段抢在 el-drawer 之前处理 Esc，否则按一下会把抽屉一起关了
    document.addEventListener("keydown", this.onKeydown, true);
  },
  beforeDestroy() {
    this.clearTimers();
    document.removeEventListener("keydown", this.onKeydown, true);
    const el = this.$refs.stage;
    if (el && el.parentNode === document.body) {
      document.body.removeChild(el);
    }
  },
  methods: {
    onKeydown(event) {
      if (!this.visible || event.key !== "Escape") return;
      // 必须 immediate：el-drawer 的 Esc 是同一个 document 上的监听，
      // 普通 stopPropagation 挡不住同节点的其它监听器
      event.stopImmediatePropagation();
      event.preventDefault();
      if (this.phase === "done") this.close();
      else this.finish();
    },
    /**
     * 整个挂到 body 上：祖先（el-drawer）一旦带 transform，
     * position:fixed 就会以它为基准而不是视口，全屏遮罩会歪掉。
     */
    toBody() {
      const el = this.$refs.stage;
      if (el && el.parentNode && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    },
    badgeOf(item) {
      return item.dup ? `+${item.dup} 碎片` : "NEW";
    },
    cardStyle(index) {
      // 只有发牌用 CSS 变量延迟。翻牌不能带 delay：
      // animation-delay 从「class 加上那一刻」起算，再叠加 openAt 会让最后几张拖到几秒后才翻。
      return { "--deal-delay": `${this.dealDelay[index]}ms` };
    },
    play() {
      this.clearTimers();
      this.closing = false;
      const list = this.results || [];
      const count = list.length;

      this.phase = "charge";
      this.legendStar = 0;
      this.opened = list.map(() => false);
      this.dealDelay = list.map((unused, i) => i * STAGGER_DEAL);

      // 卡背基本站定后才开始翻
      let cursor = (count - 1) * STAGGER_DEAL + DEAL_DUR * 0.7 + 160;
      const delayList = [];
      list.forEach((item) => {
        delayList.push(Math.round(cursor));
        cursor += STAGGER_FLIP + (item.star >= 4 ? PAUSE_RARE : 0);
      });
      this.openAt = delayList;

      this.after(CHARGE_DUR, () => {
        this.phase = "reveal";
      });

      list.forEach((item, index) => {
        this.after(CHARGE_DUR + delayList[index], () => {
          this.$set(this.opened, index, true);
          if (item.star >= 4 && item.star > this.legendStar) {
            this.legendStar = item.star;
          }
        });
      });

      const end = delayList[count - 1] + FLIP_DUR;
      this.after(CHARGE_DUR + end + 320, () => {
        this.phase = "done";
      });
    },
    /** 跳过：已翻开的保持原节奏，没翻的立刻补上 */
    finish() {
      this.clearTimers();
      // 还没亮光的卡把光效延迟清零，否则光会继续等原本的排期
      this.openAt = this.openAt.map((delay, index) =>
        this.opened[index] ? delay : 0
      );
      this.opened = this.results.map(() => true);
      const best = this.top;
      if (best.star >= 4) this.legendStar = best.star;
      this.phase = "done";
    },
    onClickStage() {
      if (this.phase === "done") this.close();
      else this.finish();
    },
    close() {
      this.clearTimers();
      this.closing = true;
      // 淡出后再交给父组件收 visible：舞台根节点挂在 body 上，
      // 用 <transition> 的收尾在这里不可靠（会卡住不消失）
      this.after(300, () => {
        this.closing = false;
        this.$emit("close");
      });
    },
    after(ms, fn) {
      const id = setTimeout(() => {
        this.timers = this.timers.filter((item) => item !== id);
        fn();
      }, ms);
      this.timers.push(id);
      return id;
    },
    clearTimers() {
      this.timers.forEach((id) => clearTimeout(id));
      this.timers = [];
    },
  },
};
</script>

<style scoped>
/**
 * 抽卡演出舞台。
 * 三段式：charge（灵球聚能）→ 爆闪 → reveal（发牌 + 3D 翻牌）→ done（结算）。
 * 动画全部交给 CSS，Vue 只按时间点切换 phase / opened；
 * 中途点一下 skip 会把没翻开的牌一次性补齐，不会留下半成品状态。
 */
.cdo {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3500;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  background: radial-gradient(
    circle at 50% 38%,
    #2c3173 0%,
    #1b1c4a 38%,
    #0b0b22 72%,
    #05050d 100%
  );
}
.cdo::after {
  /* 演出结束铺一层暖色，衬得卡牌更像战利品 */
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s ease;
  background: radial-gradient(
    circle at 50% 44%,
    rgba(255, 214, 120, 0.22) 0%,
    rgba(255, 214, 120, 0) 60%
  );
}
.cdo--legend::after {
  opacity: 1;
}
.cdo--epic::after {
  opacity: 0.7;
}

/* ---------- 背景 ---------- */
.cdo__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
/* 四周压一圈暗角，聚能球才够跳 */
.cdo__bg::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    circle at 50% 45%,
    rgba(0, 0, 0, 0) 32%,
    rgba(0, 0, 0, 0.5) 100%
  );
}
.cdo__star {
  position: absolute;
  border-radius: 50%;
  background: #fff;
  opacity: 0.15;
  animation: cdo-twinkle 2.6s ease-in-out infinite;
}
.cdo__nebula {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.5;
}
.cdo__nebula--a {
  width: 460px;
  height: 460px;
  left: -120px;
  top: -60px;
  background: radial-gradient(circle, #4a3f9e 0%, rgba(74, 63, 158, 0) 70%);
  animation: cdo-drift 14s ease-in-out infinite alternate;
}
.cdo__nebula--b {
  width: 520px;
  height: 520px;
  right: -160px;
  bottom: -140px;
  background: radial-gradient(circle, #8c4a2f 0%, rgba(140, 74, 47, 0) 70%);
  animation: cdo-drift 18s ease-in-out infinite alternate-reverse;
}

/* ---------- 聚能 ---------- */
.cdo__charge {
  position: relative;
  width: 200px;
  height: 200px;
  animation: cdo-charge-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
}
.cdo__ball {
  position: absolute;
  top: 26px;
  left: 26px;
  width: 148px;
  height: 148px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(
    #ff6b6b 0 47%,
    #23232b 47% 53%,
    #f5f5f7 53% 100%
  );
  box-shadow: 0 0 40px rgba(255, 130, 130, 0.35),
    inset 0 -16px 32px rgba(0, 0, 0, 0.3);
  animation: cdo-ball 0.86s ease-in-out infinite alternate;
}
.cdo__ball::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 62px;
  height: 62px;
  margin: -31px 0 0 -31px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 6px #23232b, inset 0 0 12px rgba(0, 0, 0, 0.25);
}
.cdo__ball-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, #ffe08a 60%, #fff 100%);
  z-index: 2;
  animation: cdo-core 0.86s ease-in-out infinite alternate;
}
.cdo__ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid transparent;
}
.cdo__ring--1 {
  top: -16px;
  left: -16px;
  right: -16px;
  bottom: -16px;
  border-top-color: #ffd77a;
  border-left-color: rgba(255, 215, 122, 0.3);
  animation: cdo-spin 1.5s linear infinite;
}
.cdo__ring--2 {
  top: -34px;
  left: -34px;
  right: -34px;
  bottom: -34px;
  border-bottom-color: #9db4ff;
  border-right-color: rgba(157, 180, 255, 0.25);
  animation: cdo-spin 2.4s linear infinite reverse;
}
.cdo__ring--3 {
  top: -52px;
  left: -52px;
  right: -52px;
  bottom: -52px;
  border-top-color: rgba(255, 255, 255, 0.5);
  border-right-color: rgba(255, 255, 255, 0.12);
  animation: cdo-spin 3.4s linear infinite;
}
.cdo__spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: #ffe08a;
  box-shadow: 0 0 8px 2px rgba(255, 224, 138, 0.75);
  animation: cdo-converge 1.05s ease-in infinite;
}

/* ---------- 爆闪 ---------- */
.cdo__flash {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  pointer-events: none;
  animation: cdo-flash 0.6s ease-out forwards;
}
.cdo__burst {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 220vmax;
  height: 220vmax;
  margin: -110vmax 0 0 -110vmax;
  pointer-events: none;
  opacity: 0;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 255, 255, 0.5) 0deg 3deg,
    rgba(255, 255, 255, 0) 3deg 14deg
  );
  -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 26%);
  mask-image: radial-gradient(circle, #000 0%, transparent 26%);
  animation: cdo-burst 1.5s cubic-bezier(0.15, 0.7, 0.2, 1) forwards;
}

/* ---------- 卡牌 ---------- */
.cdo__body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
/* 矮屏整体等比缩小：卡内部是按 179 宽排的，直接压卡宽会把文字挤爆，
   缩 transform 才能保住排版 */
@media (max-height: 700px) {
  .cdo__body {
    transform: scale(0.82);
  }
}
@media (max-height: 560px) {
  .cdo__body {
    transform: scale(0.62);
  }
}
.cdo__cards {
  display: grid;
  justify-content: center;
  gap: 16px;
  animation: cdo-rise 0.5s ease-out both;
}
.cdo__cards--ten {
  /* 卡宽上限 152；只有窄屏才压，正常屏始终 152 */
  grid-template-columns: repeat(5, min(179px, calc((100vw - 96px) / 5)));
}
.cdo__cards--one {
  grid-template-columns:
    min(232px, calc((100vw - 120px) * 0.75));
}
.cdo__slot {
  position: relative;
  perspective: 900px;
}
.cdo__card {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  transform-style: preserve-3d;
  animation: cdo-deal 520ms cubic-bezier(0.2, 0.85, 0.3, 1) var(--deal-delay)
    both;
}
.cdo__card.is-open {
  animation: cdo-flip 620ms cubic-bezier(0.4, 0.05, 0.2, 1) both;
}
.cdo__face {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 12px;
  backface-visibility: hidden;
  overflow: hidden;
}
.cdo__face--back {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 215, 122, 0.4);
  background: radial-gradient(circle at 50% 32%, #453191 0%, #1b1140 70%);
  box-shadow: inset 0 0 26px rgba(120, 90, 255, 0.45);
}
.cdo__back-ring {
  position: absolute;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  border: 2px solid rgba(255, 215, 122, 0.55);
  box-shadow: 0 0 0 6px rgba(255, 215, 122, 0.12);
  animation: cdo-spin 6s linear infinite;
}
.cdo__back-star {
  position: relative;
  font-size: 34px;
  color: #ffd77a;
  text-shadow: 0 0 14px rgba(255, 215, 122, 0.8);
}
.cdo__face--front {
  transform: rotateY(180deg);
  background: #fff;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
}
/* Tile 自带 aspect-ratio，这里只要撑满面板 */
.cdo__face--front .tile {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  cursor: default;
}

/* ---------- 稀有度光效 ---------- */
.cdo__halo {
  position: absolute;
  top: -8px;
  left: -8px;
  right: -8px;
  bottom: -8px;
  border-radius: 18px;
  pointer-events: none;
  opacity: 0;
  box-shadow: 0 0 24px 6px rgba(255, 255, 255, 0.35);
  animation: cdo-halo 1.4s ease-out both;
}
.is-s1 .cdo__halo {
  box-shadow: 0 0 18px 4px rgba(210, 214, 220, 0.35);
}
.is-s2 .cdo__halo {
  box-shadow: 0 0 22px 5px rgba(99, 153, 34, 0.5);
}
.is-s3 .cdo__halo {
  box-shadow: 0 0 26px 6px rgba(56, 138, 221, 0.6);
}
.is-s4 .cdo__halo {
  box-shadow: 0 0 32px 8px rgba(127, 119, 221, 0.7);
}
.is-s5 .cdo__halo {
  box-shadow: 0 0 46px 12px rgba(255, 196, 76, 0.85);
  animation: cdo-halo-legend 2.2s ease-in-out infinite both;
}
.cdo__rays {
  position: absolute;
  top: -72px;
  left: -72px;
  right: -72px;
  bottom: -72px;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  -webkit-mask-image: radial-gradient(circle, transparent 38%, #000 56%);
  mask-image: radial-gradient(circle, transparent 38%, #000 56%);
  animation: cdo-rays 2.4s ease-out both;
}
.is-s4 .cdo__rays {
  background: repeating-conic-gradient(
    from 0deg,
    rgba(167, 158, 255, 0.55) 0deg 5deg,
    rgba(167, 158, 255, 0) 5deg 18deg
  );
  animation-name: cdo-rays, cdo-spin-slow;
  animation-duration: 2.4s, 14s;
  animation-iteration-count: 1, infinite;
  animation-timing-function: ease-out, linear;
  animation-fill-mode: both, none;
}
.is-s5 .cdo__rays {
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 204, 92, 0.7) 0deg 4deg,
    rgba(255, 204, 92, 0) 4deg 15deg
  );
  animation-name: cdo-rays, cdo-spin-slow;
  animation-duration: 2.4s, 9s;
  animation-iteration-count: 1, infinite;
  animation-timing-function: ease-out, linear;
  animation-fill-mode: both, none;
}

/* ---------- 横幅 / 结算 ---------- */
.cdo__banner {
  padding: 6px 26px;
  border-radius: 999px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #fff;
  background: linear-gradient(90deg, #7f77dd, #b39ddb);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.cdo__banner.is-s5 {
  background: linear-gradient(90deg, #f3b32c, #ffd97a, #f3b32c);
  color: #5a3c00;
  animation: cdo-banner-shine 1.6s linear infinite;
}
.cdo__summary {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 22px;
  border-radius: 999px;
  cursor: default;
  font-size: 14px;
  color: #e6e8f2;
  background: rgba(12, 14, 38, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(4px);
}
.cdo__summary b {
  font-size: 17px;
  color: #fff;
}
.cdo__summary b.is-s3 {
  color: #7ab8ff;
}
.cdo__summary b.is-s4 {
  color: #b3aaff;
}
.cdo__summary b.is-s5 {
  color: #ffcf5c;
}
.cdo__summary b.is-shard {
  color: #ffb347;
}
.cdo__hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 26px;
  text-align: center;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.4);
}

/* ---------- 过渡 ---------- */
.cdo {
  transition: opacity 0.3s ease;
}
.cdo--closing {
  opacity: 0;
}
.cdo-banner-enter-active,
.cdo-summary-enter-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.cdo-banner-enter,
.cdo-summary-enter {
  opacity: 0;
  transform: translateY(-12px);
}
.cdo-summary-enter {
  transform: translateY(14px);
}

/* ---------- 关键帧 ---------- */
@keyframes cdo-twinkle {
  0%,
  100% {
    opacity: 0.12;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.25);
  }
}
@keyframes cdo-drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(40px, 30px, 0) scale(1.15);
  }
}
@keyframes cdo-charge-in {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes cdo-ball {
  from {
    transform: scale(1) rotate(-6deg);
    filter: brightness(1);
  }
  to {
    transform: scale(1.08) rotate(6deg);
    filter: brightness(1.35);
  }
}
@keyframes cdo-core {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 1;
  }
}
@keyframes cdo-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes cdo-spin-slow {
  to {
    transform: rotate(360deg);
  }
}
@keyframes cdo-converge {
  0% {
    transform: translate(var(--tx), var(--ty)) scale(0.3);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translate(0, 0) scale(1.1);
    opacity: 0;
  }
}
@keyframes cdo-flash {
  0% {
    opacity: 0.95;
  }
  40% {
    opacity: 0.35;
  }
  100% {
    opacity: 0;
  }
}
@keyframes cdo-burst {
  0% {
    opacity: 0;
    transform: scale(0.2) rotate(0deg);
  }
  18% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: scale(1.1) rotate(28deg);
  }
}
@keyframes cdo-rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}
@keyframes cdo-deal {
  0% {
    opacity: 0;
    transform: translate3d(0, 90px, 0) rotateY(180deg) scale(0.55);
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
@keyframes cdo-flip {
  0% {
    transform: rotateY(0deg) scale(1);
  }
  45% {
    transform: rotateY(90deg) scale(1.14);
  }
  100% {
    transform: rotateY(180deg) scale(1);
  }
}
@keyframes cdo-halo {
  0% {
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0.55;
  }
}
@keyframes cdo-halo-legend {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
  }
}
@keyframes cdo-rays {
  0% {
    opacity: 0;
    transform: none;
  }
  22% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
    transform: none;
  }
}
@keyframes cdo-banner-shine {
  0% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.25);
  }
  100% {
    filter: brightness(1);
  }
}
</style>
