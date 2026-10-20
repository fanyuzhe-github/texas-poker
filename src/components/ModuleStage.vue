<template>
  <div
    v-if="localVisible"
    ref="stage"
    class="stage"
    :class="{ 'stage--closing': closing }"
  >
    <header class="stage__bar">
      <div class="stage__brand">
        <span class="stage__mark" aria-hidden="true">♠</span>
        <span class="stage__title">数据中心</span>
      </div>

      <nav class="stage__tabs">
        <button
          v-for="item in modules"
          :key="item.key"
          type="button"
          class="stage__tab"
          :class="{ 'is-active': item.key === current }"
          @click="switchTo(item.key)"
        >
          <i :class="item.icon"></i><span>{{ item.label }}</span>
        </button>
      </nav>

      <button type="button" class="stage__close" @click="close">
        <i class="el-icon-close"></i><span>Esc 返回牌桌</span>
      </button>
    </header>

    <div ref="body" class="stage__body">
      <div class="stage__panel">
        <data-dashboard
          v-if="current === 'dashboard'"
          :history="history"
          :players="players"
        />
        <record-board
          v-else-if="current === 'records'"
          :history="history"
          :players="players"
        />
        <season-rank
          v-else-if="current === 'season'"
          :history="history"
          :players="players"
        />
        <div v-else-if="current === 'rank'" class="stage__plain">
          <rank-table :data="ranking" :compact="isCompact" />
        </div>
        <history-panel
          v-else-if="current === 'history'"
          :history="history"
          @remove="$emit('remove-game', $event)"
          @clear="$emit('clear-history')"
        />
        <achievement-wall
          v-else-if="current === 'medals'"
          :history="history"
          :players="players"
        />
        <card-collection
          v-else-if="current === 'cards'"
          :state="cardState"
          :players="players"
          :owner="cardOwner"
          @update="$emit('update-cards', $event)"
          @owner-change="$emit('update-owner', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script>
import DataDashboard from "./DataDashboard.vue";
import RecordBoard from "./RecordBoard.vue";
import SeasonRank from "./SeasonRank.vue";
import HistoryPanel from "./HistoryPanel.vue";
import AchievementWall from "./AchievementWall.vue";
import CardCollection from "./CardCollection.vue";
import RankTable from "./RankTable.vue";
import responsive from "../mixins/responsive";

/** 模块中心里的七个视图，顺序即顶部 Tab 顺序 */
const MODULES = [
  { key: "dashboard", label: "数据看板", icon: "el-icon-pie-chart" },
  { key: "records", label: "记录榜", icon: "el-icon-s-flag" },
  { key: "season", label: "赛季榜", icon: "el-icon-s-data" },
  { key: "rank", label: "总榜", icon: "el-icon-data-analysis" },
  { key: "history", label: "对局流水", icon: "el-icon-time" },
  { key: "medals", label: "勋章墙", icon: "el-icon-medal-1" },
  { key: "cards", label: "卡牌收藏", icon: "el-icon-present" },
];

const CLOSE_MS = 220;

export default {
  name: "ModuleStage",
  mixins: [responsive],
  components: {
    DataDashboard,
    RecordBoard,
    SeasonRank,
    HistoryPanel,
    AchievementWall,
    CardCollection,
    RankTable,
  },
  props: {
    visible: { type: Boolean, default: false },
    /** 打开时落在哪个模块；不传就用上次那个 */
    module: { type: String, default: "" },
    history: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] },
    /** 总榜数据，只在「总榜」视图里用 */
    ranking: { type: Array, default: () => [] },
    cardState: { type: Object, default: null },
    /** 卡牌收藏里正在看谁的卡包 */
    cardOwner: { type: String, default: "" },
  },
  data() {
    return {
      modules: MODULES,
      current: "dashboard",
      localVisible: false,
      closing: false,
      timer: null,
    };
  },
  watch: {
    visible(value) {
      if (value) {
        if (this.module) this.current = this.module;
        this.closing = false;
        this.localVisible = true;
        this.$nextTick(this.toBody);
        document.body.style.overflow = "hidden";
        return;
      }
      // 先淡出再摘掉节点，直接消失太生硬
      if (!this.localVisible) return;
      this.closing = true;
      this.timer = window.setTimeout(() => {
        this.closing = false;
        this.localVisible = false;
        document.body.style.overflow = "";
      }, CLOSE_MS);
    },
    module(value) {
      if (value) this.current = value;
    },
    current() {
      // 换模块回到顶部，否则会从上一屏的中间开始看
      const el = this.$refs.body;
      if (el) el.scrollTop = 0;
    },
  },
  mounted() {
    // 冒泡阶段监听：抽卡演出 / 领奖台在 capture 阶段先吃掉 Esc，不会连本层一起关
    document.addEventListener("keydown", this.onKeydown);
    if (this.visible) {
      if (this.module) this.current = this.module;
      this.localVisible = true;
      this.$nextTick(this.toBody);
    }
  },
  beforeDestroy() {
    document.removeEventListener("keydown", this.onKeydown);
    if (this.timer) window.clearTimeout(this.timer);
    document.body.style.overflow = "";
    const el = this.$refs.stage;
    if (el && el.parentNode === document.body) {
      document.body.removeChild(el);
    }
  },
  methods: {
    switchTo(key) {
      if (this.current === key) return;
      this.current = key;
    },
    close() {
      this.$emit("update:visible", false);
    },
    onKeydown(event) {
      if (!this.localVisible || event.key !== "Escape") return;
      this.close();
    },
    toBody() {
      const el = this.$refs.stage;
      if (el && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    },
  },
};
</script>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: var(--pk-bg);
  animation: stage-in 0.22s ease;
}
/* 入场只做位移，不碰 opacity：节流时元素会永久隐身 */
@keyframes stage-in {
  from {
    transform: translateY(14px);
  }
  to {
    transform: translateY(0);
  }
}
.stage--closing {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.stage__bar {
  flex: none;
  height: 58px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 18px;
  background: var(--pk-surface);
  border-bottom: 1px solid var(--pk-line);
}
.stage__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.stage__mark {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  font-size: 15px;
  color: #f4dfae;
  background: linear-gradient(150deg, var(--pk-navy-2), var(--pk-navy-1));
}
.stage__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--pk-ink);
  letter-spacing: 0.02em;
}
.stage__tabs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
}
.stage__tabs::-webkit-scrollbar {
  display: none;
}
.stage__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  flex: none;
  border: 1px solid transparent;
  border-radius: var(--pk-radius-sm);
  background: transparent;
  color: var(--pk-ink-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s, color 0.16s, border-color 0.16s;
}
.stage__tab i {
  font-size: 14px;
  color: var(--pk-ink-3);
  transition: color 0.16s;
}
.stage__tab:hover {
  background: var(--pk-surface-2);
  color: var(--pk-ink);
}
.stage__tab.is-active {
  background: var(--pk-primary-soft);
  border-color: #dbe3fb;
  color: var(--pk-primary);
  font-weight: 500;
}
.stage__tab.is-active i {
  color: var(--pk-primary);
}
.stage__tab:focus-visible {
  outline: none;
  border-color: #b9c8f5;
  box-shadow: 0 0 0 3px rgba(58, 85, 200, 0.14);
}
.stage__close {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--pk-line-strong);
  border-radius: var(--pk-radius-sm);
  background: var(--pk-surface);
  color: var(--pk-ink-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.16s, color 0.16s, border-color 0.16s;
}
.stage__close:hover {
  background: var(--pk-primary-soft);
  border-color: #c3cff5;
  color: var(--pk-primary);
}
.stage__close i {
  font-size: 13px;
}

.stage__body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.stage__panel {
  max-width: 1560px;
  margin: 0 auto;
  padding: 18px 20px 24px;
  background: var(--pk-surface);
  border: 1px solid var(--pk-line);
  border-radius: var(--pk-radius-lg);
  box-shadow: var(--pk-shadow-1);
}
.stage__plain {
  padding: 4px 0;
}
@media (max-width: 1366px) {
  .stage__body {
    padding: 16px;
  }
  .stage__panel {
    padding: 16px;
  }
}

/* 窄屏：品牌 + 关闭挤一行，Tab 换到第二行横向滚 —— 原来三者同行，
   Tab 被压到只剩两三个图标可见 */
@media (max-width: 768px) {
  .stage__bar {
    height: auto;
    padding: 8px 12px 6px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stage__brand {
    flex: 1;
    min-width: 0;
  }
  .stage__title {
    font-size: 14px;
  }
  .stage__tabs {
    order: 3;
    flex: 0 0 100%;
    gap: 4px;
    padding-bottom: 2px;
  }
  .stage__tab {
    height: 30px;
    padding: 0 10px;
    font-size: 12.5px;
  }
  /* 角落里只留一个关闭图标，长文案在手机上纯占位 */
  .stage__close {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
  .stage__close span {
    display: none;
  }
  .stage__body {
    padding: 10px;
  }
  .stage__panel {
    padding: 12px;
    border-radius: 12px;
  }
}
</style>
