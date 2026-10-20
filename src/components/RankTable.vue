<template>
  <el-table :data="data" size="small" style="width: 100%">
    <el-table-column v-if="showExpand" type="expand">
      <template slot-scope="scope">
        <div v-if="!scope.row.children || !scope.row.children.length" class="sub-empty">
          该主账号下暂无子账号
        </div>
        <div v-else class="sub-block">
          <div class="sub-block__title">子账号明细</div>
          <div
            v-for="child in scope.row.children"
            :key="child.name"
            class="sub-row"
          >
            <span class="sub-row__name">
              <player-avatar
                :name="child.name"
                :avatar="child.avatar"
                :size="20"
              />
              {{ child.name }}
            </span>
            <span class="sub-row__record"
              >{{ formatRecord(child) }} · 胜率
              {{ formatWinRate(child) }}</span
            >
            <span :class="scoreClass(child.score)">{{
              format(child.score)
            }}</span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column type="index" :width="compact ? 36 : 44"></el-table-column>
    <el-table-column label="玩家" :min-width="compact ? 96 : 104">
      <template slot-scope="scope">
        <div class="cell-name">
          <player-avatar
            :name="scope.row.name"
            :avatar="scope.row.avatar"
            :size="24"
          />
          <span class="cell-name__text">{{ scope.row.name }}</span>
          <el-tag
            v-if="scope.row.children && scope.row.children.length"
            size="mini"
            type="info"
            class="name-tag"
            >{{ scope.row.children.length }} 子账号</el-tag
          >
          <el-tag v-else-if="scope.row.parent" size="mini" class="name-tag">{{
            scope.row.parent
          }}</el-tag>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      prop="score"
      label="胜/负"
      :width="compact ? 62 : 66"
      :formatter="formatRecord"
    ></el-table-column>
    <!-- 窄屏收掉「胜率」「状态」两列：留着就得横向拖表格，胜/负本身已经含了这两项的大半信息 -->
    <!-- 「100.0%」实测 48px + 左右各 10px padding，62px 列宽只剩 42 → 必折行，给到 74 才放得下 -->
    <el-table-column
      v-if="!compact"
      prop="score"
      label="胜率"
      width="74"
      class-name="col-winrate"
      :formatter="formatWinRate"
    ></el-table-column>
    <el-table-column v-if="!compact" label="状态" width="62">
      <template slot-scope="scope">
        <span :class="stateClass(scope.row)">{{ formatState(scope.row) }}</span>
      </template>
    </el-table-column>
    <el-table-column
      prop="score"
      label="积分"
      :width="compact ? 80 : 78"
    >
      <template slot-scope="scope">
        <span :class="scoreClass(scope.row.score)">{{
          format(scope.row.score)
        }}</span>
      </template>
    </el-table-column>
  </el-table>
</template>

<script>
import { format, toCents } from "../core/money";
import { formatRecord, formatWinRate, formatState } from "../core/ranking";
import PlayerAvatar from "./PlayerAvatar.vue";

export default {
  name: "RankTable",
  components: { PlayerAvatar },
  props: {
    data: {
      type: Array,
      default: () => [],
    },
    /** 今日榜只列上桌的号，没有子账号明细，不需要展开列 */
    showExpand: {
      type: Boolean,
      default: true,
    },
    /** 窄屏精简：收掉胜率 / 状态两列，让表格不横向滚动 */
    compact: {
      type: Boolean,
      default: false,
    },
  },
  methods: {
    format,
    formatRecord,
    formatWinRate,
    formatState,
    /** 连胜红、连败绿，和其余涨红跌绿的展示保持一致 */
    stateClass(row) {
      const times = Number(row.stateTimes) || 0;
      if (!times) return "state state--idle";
      return row.lastState === "lose"
        ? "state state--lose"
        : "state state--win";
    },
    scoreClass(score) {
      const cents = toCents(score);
      if (cents > 0) return "score score--win";
      if (cents < 0) return "score score--lose";
      return "score";
    },
  },
};
</script>

<style scoped>
/* 头像、名字、标签必须同一个 flex 容器，否则 inline-flex 的基线会让标签整体下沉 */
.cell-name {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.cell-name__text {
  line-height: 1;
}
.name-tag {
  flex: 0 0 auto;
  line-height: 18px;
}
.sub-row__name {
  min-width: 76px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sub-empty {
  padding: 6px 12px 6px 48px;
  font-size: 12px;
  color: #c0c4cc;
}
.sub-block {
  padding: 8px 12px 8px 48px;
  background: #fafafa;
}
.sub-block__title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.sub-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  line-height: 1.9;
}
.sub-row__record {
  color: #909399;
  font-size: 12px;
}
.state {
  font-weight: 600;
}
.state--win {
  color: #f5222d;
}
.state--lose {
  color: #13ce66;
}
.state--idle {
  color: #c0c4cc;
  font-weight: normal;
}
/* 三位数积分 + 两位小数（160.00）在 13px 粗体下宽约 52px，折行会把 0 挤到第二行 */
.score {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* 胜率「100.0%」也不许折行：万一以后改窄列宽，宁可撑破也不换行 */
::v-deep .col-winrate .cell {
  white-space: nowrap;
}
.score--win {
  color: #f56c6c;
  font-weight: 600;
}
.score--lose {
  color: #67c23a;
  font-weight: 600;
}
</style>
