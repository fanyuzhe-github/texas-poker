<template>
  <div
    v-if="visible"
    ref="stage"
    class="pod"
    :class="{
      'pod--done': phase === 'done',
      'pod--prized': !!drawnCard,
      'pod--closing': closing,
      'pod--drawing': drawing,
    }"
    @click="onClickStage"
  >
    <!-- 星幕 + 顶部聚光 -->
    <div class="pod__bg">
      <span
        v-for="(s, i) in stars"
        :key="`star-${i}`"
        class="pod__star"
        :style="s"
      />
      <i class="pod__nebula pod__nebula--a" />
      <i class="pod__nebula pod__nebula--b" />
    </div>
    <i class="pod__beam" />
    <i class="pod__beam pod__beam--side" />
    <i class="pod__floor" />

    <!-- 标题 -->
    <div class="pod__head">
      <div class="pod__title">今日结算</div>
      <div class="pod__sub">{{ todayText }} · {{ ranking.length }} 人上桌</div>
    </div>

    <!-- 领奖台：展示顺序 亚军 - 冠军 - 季军 -->
    <div class="pod__stage">
      <div
        v-for="item in podium"
        :key="`slot-${item.rank}`"
        class="pod__slot"
        :class="[`pod__slot--${item.rank}`, `is-s${item.rank}`]"
        :style="{ animationDelay: `${riseAt[item.rank] || 0}ms` }"
      >
        <div v-if="item.rank === 1" class="pod__crown">
          <svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">
            <path
              d="M4 34 L10 8 L22 20 L32 4 L42 20 L54 8 L60 34 Z"
              fill="url(#podGold)"
              stroke="#fff3c4"
              stroke-width="1.5"
            />
            <circle cx="32" cy="26" r="3.4" fill="#fff" opacity=".85" />
            <circle cx="12" cy="14" r="2.6" fill="#fff" opacity=".7" />
            <circle cx="52" cy="14" r="2.6" fill="#fff" opacity=".7" />
            <defs>
              <linearGradient id="podGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#fff6cf" />
                <stop offset="55%" stop-color="#ffd76a" />
                <stop offset="100%" stop-color="#e8a020" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div class="pod__plate">
          <i class="pod__halo" />
          <i v-if="item.rank === 1" class="pod__rays" />
          <player-avatar
            class="pod__avatar"
            :name="item.name"
            :avatar="item.avatar"
            :size="item.rank === 1 ? 72 : 52"
          />
          <div class="pod__name">
            {{ item.name }}
            <em v-if="item.parent" class="pod__parent">{{ item.parent }}</em>
          </div>
          <div class="pod__score">{{ format(item.score) }} 分</div>
          <div class="pod__record">
            {{ item.win }}胜 {{ item.lose }}负 {{ item.deuce }}平
          </div>
          <div class="pod__medal">
            {{ item.rank === 1 ? "今日之星" : `今日第 ${item.rank} 名` }}
          </div>
        </div>

        <div class="pod__pillar">
          <span class="pod__rank">{{ item.rank }}</span>
        </div>
      </div>
    </div>

    <!-- 彩带 -->
    <div v-if="showConfetti" class="pod__confetti">
      <span
        v-for="(c, i) in confetti"
        :key="`cf-${i}`"
        class="pod__cf"
        :style="c"
      />
    </div>

    <!-- 冠军奖励 -->
    <transition name="pod-rise">
      <div v-if="phase === 'done'" class="pod__reward">
        <template v-if="champion">
          <div class="pod__reward-title">
            {{ champion.name }} 的冠军奖励
          </div>
          <div v-if="claimed" class="pod__reward-done">
            今日免费抽卡已领取
          </div>
          <div v-else class="pod__reward-tip">今日冠军专属 · 免费抽卡 1 次</div>

          <el-button
            v-if="!claimed"
            type="warning"
            icon="el-icon-magic-stick"
            class="pod__claim"
            @click.stop="claimPrize"
            >立即免费抽卡</el-button
          >

          <div v-if="drawnCard" class="pod__prize">
            <card-tile :card="drawnCard.card" :badge="prizeBadge" />
            <div class="pod__prize-text">
              已收入 <b>{{ champion.owner }}</b> 的卡包
            </div>
          </div>
        </template>
      </div>
    </transition>

    <div class="pod__hint">{{ hintText }}</div>

    <card-draw-stage
      :visible="stageVisible"
      :results="drawResults"
      @close="onStageClose"
    />
  </div>
</template>

<script>
import CardTile from "./CardTile.vue";
import CardDrawStage from "./CardDrawStage.vue";
import PlayerAvatar from "./PlayerAvatar.vue";
import { buildDailyPodium } from "../core/ranking";
import { normalizeCardState, drawCards } from "../core/cards";
import { format } from "../core/money";

/** 三个人依次升起的时刻（毫秒），冠军压轴 */
const RISE_AT = { 3: 260, 2: 620, 1: 1000 };
/** 冠军登顶后放彩带、落皇冠 */
const CELEBRATE_AT = 1560;
const DONE_AT = 1900;

export default {
  name: "DailyPodium",
  components: { CardTile, CardDrawStage, PlayerAvatar },
  props: {
    visible: { type: Boolean, default: false },
    /** 今日榜（已按积分降序） */
    ranking: { type: Array, default: () => [] },
    /** 全量玩家，用来把领奖的子账号归到主账号 */
    players: { type: Array, default: () => [] },
    /** 卡牌存档 */
    state: { type: Object, default: null },
    /** 今天是否已经领过冠军奖励 */
    claimed: { type: Boolean, default: false },
  },
  data() {
    return {
      phase: "rise",
      showConfetti: false,
      stageVisible: false,
      drawing: false, // 抽卡演出期间把领奖台压暗（比 stageVisible 晚 0.3s 收，避开演出淡出）
      closing: false,
      drawResults: [],
      timers: [],
      confetti: [],
    };
  },
  computed: {
    podium() {
      return buildDailyPodium(this.ranking, this.players);
    },
    champion() {
      return this.podium.find((item) => item.rank === 1) || null;
    },
    riseAt() {
      return RISE_AT;
    },
    normState() {
      return normalizeCardState(this.state);
    },
    todayText() {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${now.getFullYear()}-${month}-${day}`;
    },
    drawnCard() {
      return this.drawResults[0] || null;
    },
    prizeBadge() {
      if (!this.drawnCard) return "";
      return this.drawnCard.dup ? `+${this.drawnCard.dup} 碎片` : "NEW";
    },
    stars() {
      // 黄金角撒点：比随机均匀，且每次渲染不会跳位
      return Array.from({ length: 54 }, (unused, i) => {
        const angle = i * 2.399963;
        const radio = ((i * 37) % 100) / 100;
        return {
          width: `${i % 7 === 0 ? 3 : 2}px`,
          height: `${i % 7 === 0 ? 3 : 2}px`,
          left: `${(50 + Math.cos(angle) * radio * 48).toFixed(2)}%`,
          top: `${(46 + Math.sin(angle) * radio * 44).toFixed(2)}%`,
          animationDelay: `${((i % 12) * 0.21).toFixed(2)}s`,
        };
      });
    },
    hintText() {
      if (this.phase !== "done") return "点击任意位置跳过演出";
      return this.claimed || !this.champion
        ? "点击任意位置关闭"
        : "领取奖励后可点击任意位置关闭";
    },
  },
  watch: {
    visible(value) {
      if (value) {
        this.play();
        this.$nextTick(this.toBody);
      }
    },
  },
  mounted() {
    // capture 阶段抢在 el-drawer 之前吃掉 Esc，否则一按会把抽屉一起关掉
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
    format,
    play() {
      this.clearTimers();
      this.closing = false;
      this.drawing = false;
      this.phase = "rise";
      this.showConfetti = false;
      this.stageVisible = false;
      this.drawResults = [];
      this.confetti = this.makeConfetti();

      this.after(CELEBRATE_AT, () => {
        this.showConfetti = true;
      });
      this.after(DONE_AT, () => {
        this.phase = "done";
      });
    },
    /** 直接跳到结算：没升完的台子由 CSS 动画自己跑完，不打断 */
    finish() {
      this.clearTimers();
      this.showConfetti = true;
      this.phase = "done";
    },
    close() {
      this.clearTimers();
      this.closing = true;
      // 等淡出走完再真正收起，避免整屏舞台"啪"地消失
      this.after(240, () => {
        // 期间可能又被重新打开（play 会清定时器，这里再兜一层）
        if (!this.visible) return;
        this.closing = false;
        this.$emit("update:visible", false);
      });
    },
    claimPrize() {
      const owner = this.champion && this.champion.owner;
      if (!owner) return;

      // 冠军奖励走 free：不扣奖券，等于白送一抽
      const result = drawCards(this.normState, owner, 1, { free: true });
      if (!result.ok) {
        this.$message.warning("这一抽没能发出去，请稍后再试");
        return;
      }

      this.drawResults = result.results;
      this.$emit("update", result.state);
      this.$emit("claim", owner);
      this.drawing = true;
      this.stageVisible = true;
    },
    onStageClose() {
      this.stageVisible = false;
      // 抽卡舞台要淡出 0.32s，等它收完再把领奖台亮回来，否则两层白雾叠一下
      this.after(340, () => {
        this.drawing = false;
      });
    },
    onClickStage() {
      if (this.stageVisible) return; // 抽卡演出自己处理点击
      if (this.phase === "done") this.close();
      else this.finish();
    },
    onKeydown(event) {
      if (!this.visible || event.key !== "Escape") return;
      if (this.stageVisible) return; // 让抽卡演出先关
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (this.phase === "done") this.close();
      else this.finish();
    },
    /** 全屏遮罩挂到 body，免得祖先的 transform 把 fixed 定位带歪 */
    toBody() {
      const el = this.$refs.stage;
      if (el && el.parentNode && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    },
    after(ms, fn) {
      this.timers.push(window.setTimeout(fn, ms));
    },
    clearTimers() {
      this.timers.forEach((id) => window.clearTimeout(id));
      this.timers = [];
    },
    makeConfetti() {
      const colors = [
        "#ffd76a",
        "#f7b731",
        "#ff8f5e",
        "#7ad3ff",
        "#b388ff",
        "#7ee787",
        "#ff7d9c",
      ];
      return Array.from({ length: 46 }, (unused, i) => {
        const drift = Math.round((i % 5) - 2) * 24;
        return {
          left: `${((i * 97) % 100).toFixed(2)}%`,
          background: colors[i % colors.length],
          width: `${i % 3 === 0 ? 11 : 8}px`,
          height: `${i % 3 === 0 ? 15 : 11}px`,
          animationDelay: `${((i % 9) * 0.12).toFixed(2)}s`,
          animationDuration: `${(2.1 + ((i % 5) * 0.32)).toFixed(2)}s`,
          "--drift": `${drift}px`,
        };
      });
    },
  },
};
</script>

<style scoped>
.pod {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #fff;
  background: radial-gradient(
      circle at 50% 32%,
      #2b2560 0%,
      #171334 42%,
      #080b1b 100%
    )
    #080b1b;
  user-select: none;
}

/* ---------- 背景 ---------- */
.pod__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
.pod__bg::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    circle at 50% 46%,
    rgba(0, 0, 0, 0) 30%,
    rgba(0, 0, 0, 0.55) 100%
  );
}
.pod__star {
  position: absolute;
  border-radius: 50%;
  background: #fff;
  opacity: 0.5;
  animation: pod-twinkle 2.6s ease-in-out infinite;
}
/* 两团星云：给深色底一点层次，免得画面空得发黑 */
.pod__nebula {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  pointer-events: none;
}
.pod__nebula--a {
  width: 46vw;
  height: 46vw;
  left: -12vw;
  top: 4vh;
  background: rgba(96, 78, 220, 0.28);
  animation: pod-float 12s ease-in-out infinite;
}
.pod__nebula--b {
  width: 38vw;
  height: 38vw;
  right: -10vw;
  bottom: -6vh;
  background: rgba(215, 120, 60, 0.2);
  animation: pod-float 15s ease-in-out infinite reverse;
}
@keyframes pod-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(2vw, -3vh, 0) scale(1.08);
  }
}
@keyframes pod-twinkle {
  0%,
  100% {
    opacity: 0.15;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.15);
  }
}

/* 顶部聚光：两道交叉的光柱缓慢呼吸 */
.pod__beam {
  position: absolute;
  top: -18%;
  left: 50%;
  width: 46vw;
  height: 78vh;
  transform: translateX(-50%);
  background: linear-gradient(
    to bottom,
    rgba(255, 240, 190, 0.28) 0%,
    rgba(255, 240, 190, 0.1) 45%,
    rgba(255, 240, 190, 0) 100%
  );
  -webkit-clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
  clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
  animation: pod-beam 3.4s ease-in-out infinite;
  pointer-events: none;
}
.pod__beam--side {
  width: 78vw;
  height: 62vh;
  opacity: 0.5;
  animation-duration: 4.6s;
  animation-direction: alternate;
}
@keyframes pod-beam {
  0%,
  100% {
    opacity: 0.55;
    transform: translateX(-50%) scaleY(1);
  }
  50% {
    opacity: 0.95;
    transform: translateX(-50%) scaleY(1.06);
  }
}
.pod__floor {
  position: absolute;
  left: 50%;
  bottom: 12%;
  width: 120vw;
  height: 34vh;
  transform: translateX(-50%);
  background: radial-gradient(
    ellipse at 50% 0%,
    rgba(255, 216, 122, 0.22) 0%,
    rgba(255, 216, 122, 0) 70%
  );
  pointer-events: none;
}

/* ---------- 标题 ---------- */
.pod__head {
  position: relative;
  z-index: 3;
  text-align: center;
  margin-bottom: 18px;
}
.pod__title {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: 6px;
  background: linear-gradient(180deg, #fff8de 0%, #ffd76a 60%, #eaa22a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 6px 26px rgba(255, 190, 70, 0.35);
}
.pod__sub {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 2px;
}

/* ---------- 领奖台 ---------- */
.pod__stage {
  position: relative;
  z-index: 3;
  transition: transform 0.45s ease-out;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: clamp(10px, 2.6vw, 38px);
  min-height: 46vh;
  padding-bottom: 6px;
}
/* 所有入场动画都不加 fill-mode：动画一旦被节流/暂停，fill 会把元素永久
   钉在 from（opacity: 0 + 下沉 180px），整台领奖台就会"看不见"。 */
.pod__slot {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  width: clamp(146px, 16vw, 212px);
  animation: pod-rise-up 0.9s cubic-bezier(0.18, 0.9, 0.28, 1.08);
}
@keyframes pod-rise-up {
  from {
    transform: translateY(180px) scale(0.9);
  }
  to {
    transform: translateY(0) scale(1);
  }
}

.pod__plate {
  position: relative;
  width: 100%;
  padding: 14px 10px 12px;
  border-radius: 14px;
  text-align: center;
  background: linear-gradient(180deg, #ffffff 0%, #eef1f8 100%);
  color: #23263b;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
}
/* 尺寸由组件 size 属性给，这里只负责台上的摆放和光环 */
.pod__avatar {
  margin-bottom: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35), 0 0 0 2px rgba(255, 255, 255, 0.82);
}
.pod__slot--1 .pod__avatar {
  box-shadow: 0 10px 24px rgba(255, 196, 80, 0.6),
    0 0 0 3px rgba(255, 226, 152, 0.95);
}
.pod__name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pod__parent {
  font-style: normal;
  font-size: 11px;
  font-weight: 500;
  color: #909399;
  margin-left: 4px;
}
.pod__score {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 800;
  color: #d9480f;
}
.pod__record {
  font-size: 12px;
  color: #6b7280;
}
.pod__medal {
  margin-top: 8px;
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #909399;
}

/* 名次配色：金 / 银 / 铜 */
.pod__slot--1 .pod__plate {
  box-shadow: 0 16px 40px rgba(255, 190, 70, 0.45),
    0 0 0 2px rgba(255, 215, 106, 0.9) inset;
  animation: pod-champ-glow 2.8s ease-in-out infinite;
}
@keyframes pod-champ-glow {
  0%,
  100% {
    box-shadow: 0 16px 40px rgba(255, 190, 70, 0.4),
      0 0 0 2px rgba(255, 215, 106, 0.9) inset;
  }
  50% {
    box-shadow: 0 20px 54px rgba(255, 200, 90, 0.72),
      0 0 0 2px rgba(255, 231, 160, 1) inset;
  }
}
.pod__slot--1 .pod__medal {
  background: linear-gradient(135deg, #ffd76a 0%, #e8952a 100%);
}
.pod__slot--2 .pod__medal {
  background: linear-gradient(135deg, #d6dce8 0%, #8b96ab 100%);
}
.pod__slot--3 .pod__medal {
  background: linear-gradient(135deg, #e5a875 0%, #b06f3c 100%);
}

.pod__pillar {
  position: relative;
  width: 76%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px 8px 0 0;
  transition: height 0.5s cubic-bezier(0.3, 0.9, 0.3, 1);
  background: linear-gradient(180deg, #3b3f77 0%, #22244a 100%);
  box-shadow: inset 0 10px 24px rgba(255, 255, 255, 0.08);
}
/* 台沿：比柱体宽出一圈，压在牌面下方 */
.pod__pillar::before {
  content: "";
  position: absolute;
  left: -9%;
  right: -9%;
  top: -5px;
  height: 11px;
  border-radius: 4px;
  background: linear-gradient(180deg, #6f76b8 0%, #3b3f77 100%);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.42);
}
.pod__pillar::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  border-radius: 0 0 2px 2px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.22),
    rgba(255, 255, 255, 0.03)
  );
}
.pod__slot--1 .pod__pillar::after {
  background: linear-gradient(
    180deg,
    rgba(255, 240, 190, 0.55),
    rgba(255, 220, 130, 0.1)
  );
}
.pod__slot--1 .pod__pillar::before {
  background: linear-gradient(180deg, #ffe9a8 0%, #e2a52c 100%);
  box-shadow: 0 6px 18px rgba(255, 190, 70, 0.5);
}
.pod__slot--1 .pod__pillar {
  height: clamp(176px, 26vh, 268px);
  background: linear-gradient(180deg, #f7cf62 0%, #e0a52b 36%, #9c650f 100%);
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.55),
    inset 0 -18px 30px rgba(0, 0, 0, 0.35), 0 0 46px rgba(255, 190, 70, 0.35);
}
.pod__slot--2 .pod__pillar {
  height: clamp(118px, 17vh, 190px);
}
.pod__slot--3 .pod__pillar {
  height: clamp(86px, 12.5vh, 142px);
}
.pod__rank {
  font-size: clamp(46px, 6vw, 74px);
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(180deg, #ffffff 0%, #c9cfe0 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  opacity: 0.92;
}
.pod__slot--1 .pod__rank {
  color: #fff8e2;
  -webkit-text-fill-color: #fff8e2;
  background: none;
  text-shadow: 0 3px 0 rgba(120, 74, 6, 0.55), 0 0 30px rgba(255, 236, 170, 0.55);
}

/* 冠军专属：光环 + 放射线 + 皇冠 */
.pod__halo {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 190%;
  height: 190%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 214, 110, 0.42) 0%,
    rgba(255, 214, 110, 0) 62%
  );
  pointer-events: none;
}
.pod__rays {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 200%;
  height: 200%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0.5;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 226, 150, 0.42) 0deg 2.4deg,
    rgba(255, 226, 150, 0) 2.4deg 15deg
  );
  -webkit-mask-image: radial-gradient(circle, transparent 34%, #000 56%, transparent 92%);
  mask-image: radial-gradient(circle, transparent 34%, #000 56%, transparent 92%);
  animation: pod-spin 24s linear infinite;
}
@keyframes pod-spin {
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

.pod__crown {
  position: relative;
  z-index: 2;
  margin-bottom: 4px;
  animation: pod-crown 1.1s cubic-bezier(0.2, 1.5, 0.4, 1) 1.5s;
  filter: drop-shadow(0 4px 12px rgba(255, 200, 80, 0.7));
}
@keyframes pod-crown {
  0% {
    transform: translateY(-70px) rotate(-18deg) scale(0.7);
  }
  70% {
    transform: translateY(0) rotate(0deg) scale(1.14);
  }
  100% {
    transform: translateY(0) rotate(0deg) scale(1);
  }
}

/* ---------- 彩带 ---------- */
.pod__confetti {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 4;
}
.pod__cf {
  position: absolute;
  top: -24px;
  border-radius: 2px;
  animation-name: pod-fall;
  animation-timing-function: cubic-bezier(0.3, 0.1, 0.6, 1);
  animation-iteration-count: infinite;
}
@keyframes pod-fall {
  0% {
    transform: translate3d(0, 0, 0) rotate(0deg);
    opacity: 0.85;
  }
  8% {
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--drift, 0), 108vh, 0) rotate(680deg);
    opacity: 0.15;
  }
}

/* ---------- 冠军奖励 ---------- */
.pod__reward {
  position: relative;
  z-index: 5;
  margin-top: 18px;
  padding: 14px 22px 16px;
  min-width: 260px;
  text-align: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 226, 150, 0.35);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
}
.pod__reward-title {
  font-size: 15px;
  font-weight: 700;
  color: #ffe6a8;
}
.pod__reward-tip {
  margin: 6px 0 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.pod__reward-done {
  margin: 6px 0 2px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.pod__claim {
  animation: pod-pulse 1.6s ease-in-out infinite;
}
@keyframes pod-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 190, 70, 0.55);
  }
  50% {
    transform: scale(1.04);
    box-shadow: 0 0 0 12px rgba(255, 190, 70, 0);
  }
}
.pod__prize {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
/* 卡面是 CardTile 的子组件，宽度必须在这里夹住，否则会撑满整块奖励卡 */
.pod__prize ::v-deep .tile {
  width: 128px;
  flex: 0 0 auto;
}
.pod__prize-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}
.pod__prize-text b {
  color: #ffd76a;
}

.pod__hint {
  position: absolute;
  bottom: 14px;
  left: 0;
  right: 0;
  z-index: 5;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 1px;
}

/* ---------- 进出场 ---------- */
/* 根节点挂到 body 后，Vue 的 <transition> 收尾容易漏事件（遮罩会卡在 leave 里关不掉），
   所以进出场都由组件自己控制：入场用 animation，离场先加 .pod--closing 再收 visible。 */
.pod {
  /* 入场不做 opacity 动画：动画一旦被节流/暂停会把 opacity 钉在 0，
     整块遮罩就"隐身"了（排查过的坑）。入场直接出现，离场走 transition。 */
  transition: opacity 0.24s ease;
}
.pod--closing {
  opacity: 0;
}
/* 抽卡演出是另一块全屏遮罩（已挂到 body，不继承这里的 opacity），
   它开演时先让领奖台退场，免得两层字叠在一起 */
.pod--drawing {
  opacity: 0.04;
}
.pod-rise-enter-active {
  animation: pod-block-in 0.5s ease-out both;
}
@keyframes pod-block-in {
  from {
    transform: translateY(24px);
  }
  to {
    transform: translateY(0);
  }
}
.pod-rise-leave-active {
  animation: pod-block-in 0.24s ease-in reverse both;
}


.pod--prized {
  justify-content: flex-start;
  padding-top: 22px;
}
.pod--prized .pod__stage {
  min-height: 0;
}
.pod--prized .pod__slot--1 .pod__pillar {
  height: clamp(120px, 16vh, 172px);
}
.pod--prized .pod__slot--2 .pod__pillar {
  height: clamp(84px, 11vh, 122px);
}
.pod--prized .pod__slot--3 .pod__pillar {
  height: clamp(60px, 8vh, 92px);
}

@media (max-height: 720px) {
  .pod__stage {
    min-height: 40vh;
    transform: scale(0.86);
  }
  .pod__title {
    font-size: 32px;
  }
  .pod__hint {
    font-size: 11px;
    bottom: 6px;
  }
  /* 矮屏出一张卡就要多占 ~170px，卡面再收一档 */
  .pod__prize ::v-deep .tile {
    width: 106px;
  }
}
</style>
