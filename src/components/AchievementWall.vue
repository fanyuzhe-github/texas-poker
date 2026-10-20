<template>
  <div class="medals">
    <div class="summary">
      <div class="summary__head">
        <span class="summary__title">已点亮 {{ progress.unlocked }} / {{ progress.total }} 枚</span>
        <span class="summary__hint"
          >{{ progress.players }} 人有章 · 门槛按底注倍数算，改底注不会影响公平</span
        >
      </div>
      <el-progress
        :percentage="progress.percent"
        :stroke-width="10"
        color="#e6a23c"
      ></el-progress>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="勋章总览" name="overview">
        <div v-if="!hasAny" class="medals__empty">
          <i class="el-icon-medal"></i>
          <p>还没有人点亮任何勋章，打几局就有了</p>
        </div>

        <div v-for="group in groups" :key="group.key" class="section">
          <div class="section__head">
            <span class="section__title">{{ group.title }}</span>
            <span class="section__hint">{{ group.hint }}</span>
          </div>

          <div class="grid">
            <div
              v-for="item in group.items"
              :key="item.key"
              class="medal"
              :class="[
                `medal--${item.kind}`,
                item.unlocked ? '' : 'is-locked',
              ]"
            >
              <div class="medal__badge" :class="tierClass(item.tier)">
                <i :class="item.icon"></i>
              </div>

              <div class="medal__body">
                <div class="medal__title">
                  {{ item.title }}
                  <span class="medal__tier">{{ tierLabel(item.tier) }}</span>
                </div>
                <div class="medal__hint">{{ item.hint }}</div>

                <div v-if="item.first" class="medal__first">
                  <span class="medal__tag">首杀</span>
                  <span class="medal__who">{{ item.first.name }}</span>
                  <span class="medal__value">{{ item.first.text }}</span>
                </div>
                <div v-if="item.first" class="medal__detail">
                  {{ item.first.detail }}
                </div>
                <div v-if="item.owners.length > 1" class="medal__others">
                  另有 {{ item.owners.length - 1 }} 人达成 ·
                  {{ otherNames(item) }}
                </div>
                <div v-if="!item.first" class="medal__locked">尚未解锁</div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="个人墙" name="wall">
        <div v-if="!wall.length" class="medals__empty">
          <i class="el-icon-user"></i>
          <p>暂时没有人拿到勋章</p>
        </div>

        <div v-for="row in wall" :key="row.name" class="person">
          <div class="person__head">
            <span class="person__name">{{ row.name }}</span>
            <span class="person__count">{{ row.count }} 枚</span>
            <span class="person__split"
              >荣誉 {{ row.glory }} · 连胜 {{ row.streak }} · 黑章
              {{ row.dark }}</span
            >
          </div>
          <div class="person__medals">
            <span
              v-for="medal in row.medals"
              :key="medal.key"
              class="chip"
              :class="[
                tierClass(medal.tier),
                medal.kind === 'dark'
                  ? 'chip--dark'
                  : medal.kind === 'streak'
                  ? 'chip--streak'
                  : '',
              ]"
              :title="`${medal.title} · ${medal.detail}`"
            >
              <i :class="medal.icon"></i>
              <span>{{ medal.title }}</span>
            </span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import {
  buildAchievements,
  buildMedalWall,
  groupAchievements,
  achievementProgress,
  tierClass,
  TIER_LABEL,
} from "../core/achievements";

export default {
  name: "AchievementWall",
  props: {
    history: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] },
  },
  data() {
    return {
      tab: "overview",
    };
  },
  computed: {
    achievements() {
      return buildAchievements(this.history, this.players);
    },
    groups() {
      return groupAchievements(this.achievements);
    },
    wall() {
      return buildMedalWall(this.achievements);
    },
    progress() {
      return achievementProgress(this.achievements, this.wall);
    },
    hasAny() {
      return this.achievements.some((item) => item.unlocked);
    },
  },
  methods: {
    tierClass,
    tierLabel(tier) {
      return TIER_LABEL[tier] || TIER_LABEL.bronze;
    },
    /** 首杀之外还有谁也拿到了 */
    otherNames(item) {
      return item.owners
        .slice(1)
        .map((row) => row.name)
        .join("、");
    },
  },
};
</script>

<style scoped>
.medals {
  padding: 0 20px 24px;
}

.summary {
  padding: 12px 16px;
  border-radius: 10px;
  background: linear-gradient(120deg, #fdf6e3, #fff8ea);
  border: 1px solid #f3e3c3;
  margin-bottom: 16px;
}
.summary__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.summary__title {
  font-size: 14px;
  font-weight: 600;
  color: #a1793c;
}
.summary__hint {
  font-size: 12px;
  color: #bda374;
}

/* 分区 */
.section {
  margin-bottom: 20px;
}
.section__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  padding-left: 2px;
}
.section__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.section__title::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 12px;
  margin-right: 6px;
  border-radius: 2px;
  background: #409eff;
  vertical-align: -1px;
}
.section__hint {
  font-size: 12px;
  color: #a8abb2;
}

/* 勋章卡 */
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.medal {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #ebeef5;
  background: #fff;
}
.medal--dark {
  border-color: #f0e6e6;
  background: #fffaf9;
}
.medal--streak {
  border-color: #f3e3c3;
  background: #fffdf7;
}
.medal.is-locked {
  opacity: 0.55;
}
.medal__badge {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f4f5;
  border: 1px solid #e4e7ed;
}
.medal__badge i {
  font-size: 20px;
  color: #909399;
}
.medal__body {
  min-width: 0;
  flex: 1;
}
.medal__title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 6px;
}
.medal__tier {
  font-size: 11px;
  font-weight: 400;
  color: #a8abb2;
}
.medal__hint {
  margin-top: 2px;
  font-size: 11px;
  color: #a8abb2;
  line-height: 1.5;
}
.medal__first {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  min-width: 0;
}
.medal__tag {
  flex: none;
  padding: 0 5px;
  border-radius: 3px;
  background: #fdf0e0;
  color: #b88230;
  font-size: 11px;
}
.medal__who {
  color: #303133;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.medal__value {
  flex: none;
  margin-left: auto;
  color: #606266;
}
.medal__detail {
  margin-top: 2px;
  font-size: 11px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.medal__others {
  margin-top: 2px;
  font-size: 11px;
  color: #c0c4cc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.medal__locked {
  margin-top: 6px;
  font-size: 12px;
  color: #c0c4cc;
}

/* 段位色：金 / 银 / 铜 */
.medal__badge.tier--gold i {
  color: #e6a23c;
}
.medal__badge.tier--silver i {
  color: #909399;
}
.medal__badge.tier--bronze i {
  color: #cd7f32;
}
.medal__badge.tier--gold {
  background: #fdf3e2;
  border-color: #f2dcb3;
}
.medal__badge.tier--silver {
  background: #f4f4f5;
  border-color: #dcdfe6;
}
.medal__badge.tier--bronze {
  background: #fdf1e7;
  border-color: #f0d9c2;
}

/* 个人墙 */
.person {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #ebeef5;
  background: #fff;
  margin-bottom: 12px;
}
.person__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.person__name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.person__count {
  font-size: 12px;
  color: #e6a23c;
  font-weight: 600;
}
.person__split {
  font-size: 12px;
  color: #a8abb2;
  margin-left: auto;
}
.person__medals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  color: #606266;
  background: #f4f4f5;
  border: 1px solid #e4e7ed;
}
.chip i {
  font-size: 13px;
  color: #909399;
}
.chip--dark {
  background: #fdf1e7;
  border-color: #f0d9c2;
}
.chip--streak {
  background: #fdf6e3;
  border-color: #f3e3c3;
}
.chip.tier--gold i {
  color: #e6a23c;
}
.chip.tier--silver i {
  color: #909399;
}
.chip.tier--bronze i {
  color: #cd7f32;
}

.medals__empty {
  height: 26vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #909399;
}
.medals__empty i {
  font-size: 40px;
  color: #c0c4cc;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
/* 手机上一列：勋章说明本来就长，两列会把「解锁条件」「首杀记录」挤断行 */
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
