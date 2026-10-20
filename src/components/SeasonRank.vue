<template>
  <div class="season">
    <!-- 赛季切换 -->
    <div class="season__bar">
      <el-button
        size="mini"
        icon="el-icon-arrow-left"
        @click="shift(-1)"
      ></el-button>
      <el-select v-model="code" size="small" class="season__select">
        <el-option
          v-for="item in options"
          :key="item.code"
          :label="optionLabel(item)"
          :value="item.code"
        />
      </el-select>
      <el-button
        size="mini"
        icon="el-icon-arrow-right"
        @click="shift(1)"
      ></el-button>
      <span class="season__meta">{{ period }}</span>
      <el-tag v-if="isCurrentSeason" size="mini" type="success">进行中</el-tag>
      <el-tag v-else-if="report.games" size="mini" type="info"
        >已收官 · {{ report.games }} 局</el-tag
      >
    </div>

    <template v-if="!report.games">
      <div class="season__empty">
        <i class="el-icon-trophy"></i>
        <p>{{ active.label }} 还没有牌局记录</p>
      </div>
    </template>

    <template v-else>
      <!-- 冠军 -->
      <div class="champion">
        <i class="el-icon-trophy champion__icon"></i>
        <div class="champion__body">
          <span class="champion__label">赛季冠军</span>
          <div class="champion__name">
            {{ report.champion.name }}
            <em :class="signClass(report.champion.score)">{{
              formatSigned(report.champion.score)
            }}</em>
            <el-tag
              v-if="report.champion.current && report.champion.current.times"
              size="mini"
              :type="
                report.champion.current.type === 'win' ? 'danger' : 'success'
              "
              effect="plain"
              >{{ formatStreak(report.champion.current) }}</el-tag
            >
          </div>
          <span class="champion__meta"
            >{{ report.champion.games }} 局 ·
            {{ recordOf(report.champion) }} · 胜率
            {{ winRateOf(report.champion) }} · 本季最长
            {{ formatStreak(report.champion.longestWin) }}</span
          >
        </div>
      </div>

      <div class="metrics">
        <div class="metric">
          <span class="metric__label">本季局数</span>
          <span class="metric__value">{{ report.games }} 局</span>
        </div>
        <div class="metric">
          <span class="metric__label">上桌人数</span>
          <span class="metric__value">{{ report.ranking.length }} 人</span>
        </div>
        <div class="metric">
          <span class="metric__label">赛季流水</span>
          <span class="metric__value">{{ format(report.turnover) }}</span>
        </div>
        <div class="metric">
          <span class="metric__label">单局最猛</span>
          <span class="metric__value metric__value--sm">
            {{ report.bestRound.group }}
            <em class="is-up">{{
              formatSigned(report.bestRound.delta)
            }}</em>
          </span>
        </div>
        <div class="metric">
          <span class="metric__label">单局最惨</span>
          <span class="metric__value metric__value--sm">
            {{ worstRound.group }}
            <em class="is-down">{{ formatSigned(worstRound.delta) }}</em>
          </span>
        </div>
        <div class="metric">
          <span class="metric__label">赛季最长连胜</span>
          <span class="metric__value metric__value--sm">
            {{ streakLeaderName }}
            <em class="is-up">{{
              formatStreak(streakLeaderRun)
            }}</em>
            <i class="metric__time">{{
              streakLeaderAmount
            }}</i>
          </span>
        </div>
      </div>

      <div class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ active.label }} 赛季榜</span>
          <span class="panel__hint">按主账号汇总，展开看子账号明细</span>
        </div>
        <el-table :data="report.ranking" size="small">
          <el-table-column type="expand">
            <template slot-scope="scope">
              <div
                v-if="!scope.row.children.length"
                class="sub-empty"
              >
                该账号本季没有子账号参赛
              </div>
              <div v-else class="sub-block">
                <div
                  v-for="child in scope.row.children"
                  :key="child.name"
                  class="sub-row"
                >
                  <span class="sub-row__name">{{ child.name }}</span>
                  <span class="sub-row__record"
                    >{{ recordOf(child) }} · {{ child.games }} 局</span
                  >
                  <span :class="signClass(child.score)">{{
                    formatSigned(child.score)
                  }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="名次" :width="isMobile ? 48 : 56">
            <template slot-scope="scope">
              <span :class="rankClass(scope.$index)">{{ scope.$index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="玩家" :min-width="isMobile ? 92 : 110">
            <template slot-scope="scope">
              <span>{{ scope.row.name }}</span>
              <el-tag
                v-if="scope.row.children.length"
                size="mini"
                type="info"
                class="name-tag"
                >{{ scope.row.children.length }} 子账号</el-tag
              >
            </template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="出勤" width="72">
            <template slot-scope="scope">{{ scope.row.games }} 局</template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="胜 / 负 / 平" width="100">
            <template slot-scope="scope">{{ recordOf(scope.row) }}</template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="胜率" width="70">
            <template slot-scope="scope">{{ winRateOf(scope.row) }}</template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="连胜状态" width="104">
            <template slot-scope="scope">
              <div :class="streakClass(scope.row.current)">
                {{ formatStreak(scope.row.current) }}
              </div>
              <div class="streak-sub">
                最长 {{ formatStreak(scope.row.longestWin) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="最佳单局" width="92">
            <template slot-scope="scope">
              <span :class="signClass(scope.row.bestDelta)">{{
                formatSigned(scope.row.bestDelta)
              }}</span>
            </template>
          </el-table-column>
          <el-table-column label="赛季积分" :width="isMobile ? 84 : 92">
            <template slot-scope="scope">
              <span :class="signClass(scope.row.score)">{{
                formatSigned(scope.row.score)
              }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel">
        <div class="panel__head">
          <span class="panel__title">{{ active.label }} 盈亏分布</span>
          <span class="panel__hint">红赚绿亏</span>
        </div>
        <div ref="barChart" class="chart"></div>
      </div>
    </template>

    <!-- 历届回顾 -->
    <div class="panel" v-if="champions.length">
      <div class="panel__head">
        <span class="panel__title">历届回顾</span>
        <span class="panel__hint">点任意一行即可跳到该赛季</span>
      </div>
      <el-table
        :data="champions"
        size="small"
        :row-class-name="championRowClass"
        @row-click="pickSeason"
      >          <el-table-column label="赛季" width="88">
          <template slot-scope="scope">{{ scope.row.label }}</template>
        </el-table-column>
        <el-table-column v-if="!isMobile" label="区间" min-width="170">
          <template slot-scope="scope">{{ scope.row.period }}</template>
        </el-table-column>
        <el-table-column label="局数" width="70">
          <template slot-scope="scope">{{ scope.row.games }} 局</template>
        </el-table-column>
        <el-table-column label="冠军" min-width="90">
          <template slot-scope="scope">{{
            scope.row.champion ? scope.row.champion.name : "—"
          }}</template>
        </el-table-column>
        <el-table-column label="冠军积分" width="92">
          <template slot-scope="scope">
            <span :class="signClass(scoreOf(scope.row.champion))">{{
              formatSigned(scoreOf(scope.row.champion))
            }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="panel__sub">
        跨赛季积分对比 · 每条线是各账号在当季的独立积分（赛季之间不累计）
      </div>
      <div ref="crossChart" class="chart chart--cross"></div>
    </div>
  </div>
</template>

<script>
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  buildSeasonReport,
  buildSeasonChampions,
  buildSeasonTimeline,
  listSeasons,
  currentSeason,
  shiftSeason,
  seasonPeriod,
  seasonSortValue,
} from "../core/season";
import { formatStreak } from "../core/streak";
import { format, formatSigned, toCents, fromCents } from "../core/money";
import responsive from "../mixins/responsive";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

const UP = "#f5222d";
const DOWN = "#13ce66";
const CROSS_PALETTE = [
  "#409eff",
  "#e6a23c",
  "#7c3aed",
  "#00bcd4",
  "#ff7c43",
  "#2f54eb",
  "#eb2f96",
  "#909399",
];

export default {
  name: "SeasonRank",
  mixins: [responsive],
  props: {
    history: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] },
  },
  data() {
    return {
      code: null,
      extra: [], // 用户手动翻到的、流水里还没数据的赛季
      charts: {},
    };
  },
  computed: {
    seasons() {
      return listSeasons(this.history);
    },
    options() {
      const map = new Map();
      [...this.seasons, ...this.extra].forEach((item) =>
        map.set(item.code, item)
      );
      return Array.from(map.values()).sort(
        (a, b) => seasonSortValue(b) - seasonSortValue(a)
      );
    },
    active() {
      return (
        this.options.find((item) => item.code === this.code) ||
        currentSeason() ||
        null
      );
    },
    isCurrentSeason() {
      const now = currentSeason();
      return !!now && !!this.active && now.code === this.active.code;
    },
    period() {
      return seasonPeriod(this.active);
    },
    report() {
      return buildSeasonReport(this.history, this.players, this.active);
    },
    champions() {
      return buildSeasonChampions(this.history, this.players);
    },
    cross() {
      return buildSeasonTimeline(this.history, this.players);
    },
    /** 单局最惨：从榜单各行的最差单局里挑，不必为此改 season.js */
    worstRound() {
      const rows = this.report.ranking || [];
      if (!rows.length) return { group: "—", delta: 0 };
      return rows.reduce(
        (acc, row) => (row.worstDelta < acc.delta ? { group: row.name, delta: row.worstDelta } : acc),
        { group: rows[0].name, delta: rows[0].worstDelta }
      );
    },
    streakLeaderName() {
      return this.report.streakLeader ? this.report.streakLeader.name : "—";
    },
    streakLeaderRun() {
      return this.report.streakLeader ? this.report.streakLeader.run : null;
    },
    streakLeaderAmount() {
      return this.streakLeaderRun
        ? formatSigned(fromCents(this.streakLeaderRun.cents))
        : "";
    },
  },
  watch: {
    code() {
      this.renderCharts();
    },
    history() {
      this.renderCharts();
    },
    players() {
      this.renderCharts();
    },
  },
  created() {
    this.code = currentSeason() ? currentSeason().code : null;
  },
  mounted() {
    window.addEventListener("resize", this.resizeCharts);
    this.renderCharts();
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resizeCharts);
    this.disposeCharts();
  },
  methods: {
    format,
    formatSigned,
    formatStreak,
    optionLabel(item) {
      const now = currentSeason();
      const suffix = now && now.code === item.code ? "（进行中）" : "";
      return `${item.label}${suffix}`;
    },
    recordOf(row) {
      const result = row.raceResult || {};
      return `${result.win || 0} / ${result.lose || 0} / ${result.deuce || 0}`;
    },
    winRateOf(row) {
      const result = row.raceResult || {};
      const total =
        (result.win || 0) + (result.lose || 0) + (result.deuce || 0);
      if (!total) return "—";
      return `${(((result.win || 0) / total) * 100).toFixed(1)}%`;
    },
    scoreOf(row) {
      return row ? Number(row.score) || 0 : 0;
    },
    signClass(value) {
      const cents = toCents(value);
      if (cents > 0) return "is-up";
      if (cents < 0) return "is-down";
      return "";
    },
    rankClass(index) {
      if (index === 0) return "rank rank--gold";
      if (index === 1) return "rank rank--silver";
      if (index === 2) return "rank rank--bronze";
      return "rank";
    },
    streakClass(run) {
      if (!run || !run.times) return "streak streak--idle";
      return run.type === "win" ? "streak streak--win" : "streak streak--lose";
    },
    championRowClass({ row }) {
      return row.code === this.code ? "is-active" : "";
    },
    /** 左右翻赛季：翻到没有数据的赛季也允许，只是显示空态 */
    shift(offset) {
      const next = shiftSeason(this.active, offset);
      if (!next) return;
      if (!this.options.some((item) => item.code === next.code))
        this.extra.push(next);
      this.code = next.code;
    },
    pickSeason(row) {
      this.code = row.code;
    },

    renderCharts() {
      this.$nextTick(() => {
        this.renderBar();
        this.renderCross();
        this.resizeCharts();
      });
    },
    mountChart(refName, key) {
      const el = this.$refs[refName];
      if (!el) return null;
      if (this.charts[key]) this.charts[key].dispose();
      const chart = echarts.init(el);
      this.charts[key] = chart;
      return chart;
    },

    renderBar() {
      if (!this.report.games) return;
      const chart = this.mountChart("barChart", "bar");
      if (!chart) return;
      const rows = this.report.ranking.slice().reverse();

      chart.setOption(
        {
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const row = rows[params.dataIndex];
              if (!row) return "";
              return [
                `<b>${row.name}</b>`,
                `积分：<b class="${
                  row.score >= 0 ? "is-up" : "is-down"
                }">${formatSigned(row.score)}</b>`,
                `战绩：${this.recordOf(row)}`,
                `出勤：${row.games} 局`,
                `状态：${formatStreak(row.current)} · 本季最长 ${formatStreak(
                  row.longestWin
                )}`,
              ].join("<br/>");
            },
          },
          grid: { left: 8, right: 56, top: 12, bottom: 8, containLabel: true },
          xAxis: {
            type: "value",
            axisLabel: { color: "#909399", fontSize: 11 },
            splitLine: { lineStyle: { type: "dashed", color: "#ebeef5" } },
          },
          yAxis: {
            type: "category",
            data: rows.map((row) => row.name),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: "#606266", fontSize: 12 },
          },
          series: [
            {
              type: "bar",
              barMaxWidth: 18,
              label: { show: true, fontSize: 11 },
              data: rows.map((row) => ({
                value: row.score,
                itemStyle: {
                  color: row.score >= 0 ? UP : DOWN,
                  borderRadius: row.score >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
                },
                label: {
                  show: true,
                  position: row.score >= 0 ? "right" : "left",
                  color: row.score >= 0 ? UP : DOWN,
                  formatter: formatSigned(row.score),
                },
              })),
            },
          ],
        },
        true
      );
    },

    renderCross() {
      const chart = this.mountChart("crossChart", "cross");
      if (!chart) return;
      const { labels, series } = this.cross;

      chart.setOption(
        {
          color: CROSS_PALETTE,
          tooltip: { trigger: "axis" },
          legend: { type: "scroll", top: 0, itemGap: 12 },
          grid: { left: 8, right: 44, top: 44, bottom: 8, containLabel: true },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: labels,
            axisLine: { lineStyle: { color: "#dcdfe6" } },
            axisLabel: { color: "#909399", fontSize: 11 },
          },
          yAxis: {
            type: "value",
            axisLabel: { color: "#909399", fontSize: 11 },
            splitLine: { lineStyle: { type: "dashed", color: "#ebeef5" } },
          },
          series: series.map((item, index) => ({
            name: item.name,
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: 5,
            lineStyle: { width: 2 },
            data: item.data,
            markLine:
              index === 0
                ? {
                    silent: true,
                    symbol: "none",
                    label: { show: false },
                    lineStyle: { color: "#c0c4cc", width: 1 },
                    data: [{ yAxis: 0 }],
                  }
                : undefined,
          })),
        },
        true
      );
    },

    resizeCharts() {
      Object.keys(this.charts).forEach((key) => {
        const chart = this.charts[key];
        if (chart && !chart.isDisposed()) chart.resize();
      });
    },
    disposeCharts() {
      Object.keys(this.charts).forEach((key) => {
        const chart = this.charts[key];
        if (chart && !chart.isDisposed()) chart.dispose();
      });
      this.charts = {};
    },
  },
};
</script>

<style scoped>
.season {
  padding: 0 20px 24px;
}
.season__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.season__select {
  width: 150px;
}
.season__meta {
  font-size: 12px;
  color: #909399;
}
.season__empty {
  height: 40vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #909399;
}
.season__empty i {
  font-size: 40px;
  color: #c0c4cc;
}

.champion {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(120deg, #fdf6e3, #fff8ea);
  border: 1px solid #f3e3c3;
  margin-bottom: 14px;
}
.champion__icon {
  font-size: 30px;
  color: #e6a23c;
}
.champion__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.champion__label {
  font-size: 12px;
  color: #a1793c;
}
.champion__name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.champion__name em {
  font-style: normal;
  font-weight: 700;
}
.champion__meta {
  font-size: 12px;
  color: #909399;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.metric {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric__label {
  font-size: 12px;
  color: #909399;
}
.metric__value {
  font-size: 19px;
  font-weight: 600;
  color: #303133;
}
.metric__value--sm {
  font-size: 14px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.metric__value em {
  font-style: normal;
  font-weight: 700;
}
.metric__time {
  font-style: normal;
  font-size: 11px;
  color: #c0c4cc;
  font-weight: normal;
}

.streak {
  font-weight: 600;
  line-height: 1.4;
}
.streak--win {
  color: #f5222d;
}
.streak--lose {
  color: #13ce66;
}
.streak--idle {
  color: #c0c4cc;
  font-weight: normal;
}
.streak-sub {
  font-size: 11px;
  color: #c0c4cc;
  line-height: 1.4;
}

.panel {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px 14px 14px;
  margin-bottom: 16px;
}
.panel__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.panel__title {
  font-size: 14px;
  font-weight: 600;
}
.panel__hint {
  font-size: 12px;
  color: #909399;
}
.chart {
  width: 100%;
  height: 260px;
}
.panel__sub {
  font-size: 12px;
  color: #909399;
  margin: 10px 0 0;
}
.chart--cross {
  margin-top: 14px;
  height: 240px;
}

.name-tag {
  margin-left: 5px;
}
.rank {
  font-weight: 600;
  color: #909399;
}
.rank--gold {
  color: #e6a23c;
}
.rank--silver {
  color: #909399;
}
.rank--bronze {
  color: #b8824c;
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
.sub-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  line-height: 1.9;
}
.sub-row__name {
  min-width: 84px;
}
.sub-row__record {
  color: #909399;
  font-size: 12px;
}

/* 手机：三个指标并排会让「老张 +30.00」竖着排，改成一列整行读 */
@media (max-width: 768px) {
  .metrics {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .metric {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
  }
  .champion {
    padding: 12px 14px;
  }
}
</style>

<style>
.season .el-table tr.is-active {
  background: #ecf5ff;
  cursor: pointer;
}
.season .el-table__row {
  cursor: pointer;
}
.is-up {
  color: #f5222d;
}
.is-down {
  color: #13ce66;
}
</style>
