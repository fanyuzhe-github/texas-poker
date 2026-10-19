<template>
  <div v-if="!hasData" class="dashboard__empty">
    <i class="el-icon-pie-chart"></i>
    <p>还没有对局流水，先结算几局再来看图表</p>
  </div>

  <div v-else class="dashboard">
    <div class="metrics">
      <div class="metric">
        <span class="metric__label">总对局</span>
        <span class="metric__value">{{ summary.games }} 局</span>
      </div>
      <div class="metric">
        <span class="metric__label">参与玩家</span>
        <span class="metric__value">{{ summary.playerCount }} 人</span>
      </div>
      <div class="metric">
        <span class="metric__label">累计流水</span>
        <span class="metric__value">{{ format(summary.turnover) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">场均波动</span>
        <span class="metric__value">{{ format(summary.avgSwing) }}</span>
      </div>
      <div class="metric">
        <span class="metric__label">当前领跑</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(summary.bestPlayer) }}
          <em :class="signClass(scoreOf(summary.bestPlayer))">{{
            formatSigned(scoreOf(summary.bestPlayer))
          }}</em>
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">当前垫底</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(summary.worstPlayer) }}
          <em :class="signClass(scoreOf(summary.worstPlayer))">{{
            formatSigned(scoreOf(summary.worstPlayer))
          }}</em>
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">单局最猛</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(summary.bestRound) }}
          <em class="is-up">{{ formatSigned(deltaOf(summary.bestRound)) }}</em>
          <i class="metric__time">{{ timeOf(summary.bestRound) }}</i>
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">单局最惨</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(summary.worstRound) }}
          <em class="is-down">{{
            formatSigned(deltaOf(summary.worstRound))
          }}</em>
          <i class="metric__time">{{ timeOf(summary.worstRound) }}</i>
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">连胜进行中</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(streakSummary.hot) }}
          <em class="is-up">{{ formatStreak(runOf(streakSummary.hot)) }}</em>
          <i class="metric__time">{{
            amountOf(streakSummary.hot)
          }}</i>
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">连败进行中</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(streakSummary.cold) }}
          <em class="is-down">{{ formatStreak(runOf(streakSummary.cold)) }}</em>
          <i class="metric__time">{{
            amountOf(streakSummary.cold)
          }}</i>
        </span>
      </div>
      <div class="metric">
        <span class="metric__label">历史最长连胜</span>
        <span class="metric__value metric__value--sm">
          {{ nameOf(streakSummary.best) }}
          <em class="is-up">{{ formatStreak(runOf(streakSummary.best)) }}</em>
          <i class="metric__time">{{
            roundOf(streakSummary.best)
          }}</i>
        </span>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head">
        <span class="panel__title">资金曲线</span>
        <span class="panel__hint"
          >逐局重放流水，看每个人的累计盈亏走势（终点即总榜积分）</span
        >
      </div>
      <div ref="timelineChart" class="chart chart--tall"></div>
    </div>

    <el-row :gutter="16">
      <el-col :span="14">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">总榜盈亏</span>
            <span class="panel__hint">主账号汇总，红赚绿亏</span>
          </div>
          <div ref="scoreChart" class="chart"></div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">胜负构成</span>
            <span class="panel__hint">全场胜 / 负 / 平</span>
          </div>
          <div ref="pieChart" class="chart"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">连胜态势</span>
            <span class="panel__hint"
              >深色是当前正在进行的连胜/连败，浅色是个人最长连击纪录</span
            >
          </div>
          <div ref="streakChart" class="chart chart--streak"></div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">近况</span>
            <span class="panel__hint"
              >最近 {{ recentLimit }} 局，左旧右新，鼠标悬停看明细</span
            >
          </div>
          <div class="form-list">
            <div v-for="row in streaks" :key="row.name" class="form-row">
              <span class="form-row__name" :title="row.name">{{
                row.name
              }}</span>
              <span class="form-row__dots">
                <i
                  v-for="(item, index) in row.recent"
                  :key="index"
                  :class="dotClass(item.result)"
                  :title="dotTitle(item)"
                ></i>
              </span>
              <span :class="['form-row__state', streakStateClass(row)]">{{
                formatStreak(row.current)
              }}</span>
            </div>
            <div class="form-legend">
              <span><i class="dot dot--win"></i>胜</span>
              <span><i class="dot dot--lose"></i>负</span>
              <span><i class="dot dot--deuce"></i>平</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">出勤榜</span>
            <span class="panel__hint">上榜次数越多说明越常在</span>
          </div>
          <div ref="attendChart" class="chart"></div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">每局规模</span>
            <span class="panel__hint">桌上总投入（柱）与在场人数（线）</span>
          </div>
          <div ref="flowChart" class="chart"></div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { buildDashboard } from "../core/stats";
import {
  buildStreakBoard,
  buildStreakSummary,
  formatStreak,
  RECENT_LIMIT,
} from "../core/streak";
import { format, formatSigned, fromCents } from "../core/money";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  CanvasRenderer,
]);

// 资金曲线刻意避开红 / 绿：这两个颜色在别处已经代表「赚 / 亏」，混用会歧义
const PALETTE = [
  "#409eff",
  "#e6a23c",
  "#7c3aed",
  "#00bcd4",
  "#ff7c43",
  "#2f54eb",
  "#eb2f96",
  "#909399",
];
const UP = "#f5222d"; // 涨红
const DOWN = "#13ce66"; // 跌绿

export default {
  name: "DataDashboard",
  props: {
    history: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] },
  },
  data() {
    return {
      recentLimit: RECENT_LIMIT,
      charts: {},
    };
  },
  computed: {
    dashboard() {
      return buildDashboard(this.history, this.players);
    },
    hasData() {
      return this.dashboard.hasData;
    },
    summary() {
      return this.dashboard.summary;
    },
    streaks() {
      return buildStreakBoard(this.history, this.players);
    },
    streakSummary() {
      return buildStreakSummary(this.streaks);
    },
  },
  watch: {
    history() {
      this.renderCharts();
    },
    players() {
      this.renderCharts();
    },
  },
  mounted() {
    window.addEventListener("resize", this.resizeCharts);
    // 全屏容器里挂载即已布局完成，不必再等抽屉动画的 opened 事件
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
    nameOf(item) {
      return item ? item.name || item.group || "—" : "—";
    },
    scoreOf(item) {
      return item ? Number(item.score) || 0 : 0;
    },
    deltaOf(item) {
      return item ? Number(item.delta) || 0 : 0;
    },
    timeOf(item) {
      return item && item.time ? item.time : "";
    },
    /** 摘要项 -> 它那一段连胜/连败 */
    runOf(item) {
      return item && item.run ? item.run : null;
    },
    amountOf(item) {
      const run = this.runOf(item);
      return run ? formatSigned(fromCents(run.cents)) : "";
    },
    roundOf(item) {
      const run = this.runOf(item);
      if (!run) return "";
      return run.startRound === run.endRound
        ? `第 ${run.startRound} 局`
        : `第 ${run.startRound}-${run.endRound} 局`;
    },
    dotClass(result) {
      return `dot dot--${result}`;
    },
    dotTitle(item) {
      return `第 ${item.round} 局 · ${item.time} · ${formatSigned(item.delta)}`;
    },
    streakStateClass(row) {
      const run = row.current;
      if (!run || !run.times) return "form-row__state--idle";
      return run.type === "win"
        ? "form-row__state--win"
        : "form-row__state--lose";
    },
    signClass(value) {
      const cents = Math.round(value * 100);
      if (cents > 0) return "is-up";
      if (cents < 0) return "is-down";
      return "";
    },

    /** 容器已有真实宽高时才画，尺寸为 0 会画出空白图 */
    renderCharts() {
      if (!this.hasData) return;
      this.$nextTick(() => {
        this.renderTimeline();
        this.renderScores();
        this.renderPie();
        this.renderFlow();
        this.renderAttendance();
        this.renderStreak();
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

    renderTimeline() {
      const chart = this.mountChart("timelineChart", "timeline");
      if (!chart) return;
      const { labels, times, series } = this.dashboard.timeline;

      chart.setOption(
        {
          color: PALETTE,
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "line" },
            formatter: (params) => {
              if (!params.length) return "";
              const index = params[0].dataIndex;
              const head = `第 ${index + 1} 局 · ${times[index] || ""}`;
              const rows = params
                .slice()
                .sort((a, b) => b.value - a.value)
                .map(
                  (item) =>
                    `${item.marker}${item.seriesName}
                    <b class="${item.value >= 0 ? "is-up" : "is-down"}">
                      ${formatSigned(item.value)}
                    </b>`
                );
              return [head, ...rows].join("<br/>");
            },
          },
          legend: { type: "scroll", top: 0, itemGap: 12 },
          grid: { left: 8, right: 16, top: 44, bottom: 8, containLabel: true },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: labels,
            axisLine: { lineStyle: { color: "#dcdfe6" } },
            axisLabel: { color: "#909399", fontSize: 11 },
          },
          yAxis: {
            type: "value",
            axisLabel: {
              color: "#909399",
              fontSize: 11,
              formatter: (value) => (value > 0 ? `+${value}` : `${value}`),
            },
            splitLine: { lineStyle: { type: "dashed", color: "#ebeef5" } },
          },
          series: series.map((item, index) => ({
            name: item.name,
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: labels.length > 30 ? 0 : 5,
            lineStyle: { width: 2 },
            emphasis: { focus: "series" },
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

    renderScores() {
      const chart = this.mountChart("scoreChart", "scores");
      if (!chart) return;
      // 横向柱状图从上往下看，得分高的要排在最上面，所以倒序喂数据
      const rows = this.dashboard.scores.slice().reverse();

      chart.setOption(
        {
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const row = rows[params.dataIndex];
              if (!row) return "";
              return [
                `<b>${row.name}</b>`,
                `累计：<b class="${row.score >= 0 ? "is-up" : "is-down"}">
                  ${formatSigned(row.score)}</b>`,
                `战绩：${row.win} 胜 ${row.lose} 负 ${row.deuce} 平`,
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
                // 负数的柱子从 0 轴往左长，标签得跟到柱子左端去，否则贴着 0 轴
                label: {
                  show: true,
                  position: row.score >= 0 ? "right" : "left",
                  fontSize: 11,
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

    renderPie() {
      const chart = this.mountChart("pieChart", "pie");
      if (!chart) return;
      // 0 场的分段不画，否则环上会冒出一条 "平 0%" 的引线
      const data = this.dashboard.pie.filter((item) => item.value > 0);
      const total = data.reduce((acc, item) => acc + item.value, 0);

      chart.setOption(
        {
          color: [UP, DOWN, "#c0c4cc"],
          title: total
            ? {
                text: `${total}`,
                subtext: "总场次",
                left: "center",
                top: "36%",
                textAlign: "center",
                textStyle: {
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#303133",
                },
                subtextStyle: { fontSize: 11, color: "#909399" },
              }
            : undefined,
          tooltip: {
            trigger: "item",
            formatter: (params) =>
              `${params.name}：${params.value} 场（${params.percent}%）`,
          },
          legend: { bottom: 0, itemGap: 16, textStyle: { fontSize: 12 } },
          series: [
            {
              type: "pie",
              radius: ["42%", "66%"],
              center: ["50%", "44%"],
              avoidLabelOverlap: true,
              itemStyle: { borderColor: "#fff", borderWidth: 2 },
              label: {
                show: true,
                formatter: "{b} {d}%",
                fontSize: 11,
                color: "#606266",
              },
              data,
            },
          ],
        },
        true
      );
    },

    renderFlow() {
      const chart = this.mountChart("flowChart", "flow");
      if (!chart) return;
      const { labels, amount, seats } = this.dashboard.flow;

      chart.setOption(
        {
          tooltip: {
            trigger: "axis",
            formatter: (params) => {
              if (!params.length) return "";
              const head = `第 ${params[0].dataIndex + 1} 局`;
              const rows = params.map((item) => {
                const value =
                  item.seriesName === "在场人数"
                    ? `${item.value} 人`
                    : format(item.value);
                return `${item.marker}${item.seriesName} <b>${value}</b>`;
              });
              return [head, ...rows].join("<br/>");
            },
          },
          legend: { top: 0, itemGap: 16, textStyle: { fontSize: 12 } },
          grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
          xAxis: {
            type: "category",
            data: labels,
            axisLine: { lineStyle: { color: "#dcdfe6" } },
            axisLabel: { color: "#909399", fontSize: 11 },
          },
          yAxis: [
            {
              type: "value",
              axisLabel: { color: "#909399", fontSize: 11 },
              splitLine: { lineStyle: { type: "dashed", color: "#ebeef5" } },
            },
            {
              type: "value",
              min: 0,
              axisLabel: { color: "#909399", fontSize: 11 },
              splitLine: { show: false },
            },
          ],
          series: [
            {
              name: "桌上总投入",
              type: "bar",
              barMaxWidth: 22,
              itemStyle: { color: "#409eff", borderRadius: [4, 4, 0, 0] },
              data: amount,
            },
            {
              name: "在场人数",
              type: "line",
              yAxisIndex: 1,
              smooth: true,
              symbolSize: 5,
              lineStyle: { width: 2, color: "#e6a23c" },
              itemStyle: { color: "#e6a23c" },
              data: seats,
            },
          ],
        },
        true
      );
    },

    renderAttendance() {
      const chart = this.mountChart("attendChart", "attend");
      if (!chart) return;
      const rows = this.dashboard.attendance.slice().reverse();

      chart.setOption(
        {
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const row = rows[params.dataIndex];
              const total = this.dashboard.summary.games || 1;
              return row
                ? `<b>${row.name}</b><br/>出勤 ${row.games} 局（${(
                    (row.games / total) *
                    100
                  ).toFixed(0)}%）`
                : "";
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
              itemStyle: { color: "#7c3aed", borderRadius: [0, 4, 4, 0] },
              label: {
                show: true,
                position: "right",
                fontSize: 11,
                color: "#606266",
                formatter: "{c} 局",
              },
              data: rows.map((row) => row.games),
            },
          ],
        },
        true
      );
    },

    /**
     * 连胜态势：浅色的柱子是「个人最长连击纪录」，深红/深绿叠在上面的是「当前连击」。
     * 当前是连胜就往右画（正），连败往左画（负），和历史纪录同框对比最直观。
     */
    renderStreak() {
      const chart = this.mountChart("streakChart", "streak");
      if (!chart) return;
      const rows = this.streaks.slice().reverse();

      const recordOf = (row) =>
        Math.max(
          row.longestWin ? row.longestWin.times : 0,
          row.longestLose ? row.longestLose.times : 0
        );
      const currentValue = (row) => {
        const run = row.current;
        if (!run || !run.times) return 0;
        return run.type === "win" ? run.times : -run.times;
      };

      chart.setOption(
        {
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const row = rows[params.dataIndex];
              if (!row) return "";
              const lines = [`<b>${row.name}</b>`];
              if (row.current && row.current.times) {
                lines.push(
                  `当前：<b class="${
                    row.current.type === "win" ? "is-up" : "is-down"
                  }">${formatStreak(row.current)}</b>
                  （${formatSigned(fromCents(row.current.cents))}，
                  第 ${row.current.startRound}-${row.current.endRound} 局）`
                );
              } else {
                lines.push("当前：暂无进行中的连击");
              }
              if (row.longestWin)
                lines.push(
                  `最长连胜：${formatStreak(row.longestWin)}
                  （${formatSigned(fromCents(row.longestWin.cents))}）`
                );
              if (row.longestLose)
                lines.push(
                  `最长连败：<b class="is-down">${formatStreak(
                    row.longestLose
                  )}</b>（${formatSigned(fromCents(row.longestLose.cents))}）`
                );
              return lines.join("<br/>");
            },
          },
          grid: { left: 8, right: 56, top: 12, bottom: 8, containLabel: true },
          xAxis: {
            type: "value",
            axisLabel: {
              color: "#909399",
              fontSize: 11,
              formatter: (value) => `${Math.abs(value)}`,
            },
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
              name: "最长纪录",
              type: "bar",
              barWidth: 14,
              silent: true,
              z: 1,
              itemStyle: {
                color: "rgba(64,158,255,0.16)",
                borderRadius: [0, 4, 4, 0],
              },
              data: rows.map((row) => recordOf(row)),
            },
            {
              name: "当前",
              type: "bar",
              barWidth: 14,
              barGap: "-100%",
              z: 2,
              data: rows.map((row) => {
                const value = currentValue(row);
                const up = value > 0;
                const color = value === 0 ? "#c0c4cc" : up ? UP : DOWN;
                return {
                  value,
                  itemStyle: {
                    color,
                    borderRadius: up ? [0, 4, 4, 0] : [4, 0, 0, 4],
                  },
                  label: {
                    show: value !== 0,
                    position: up ? "right" : "left",
                    fontSize: 11,
                    color,
                    formatter: () => formatStreak(row.current),
                  },
                };
              }),
            },
          ],
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
.dashboard {
  padding: 0 20px 24px;
}
.dashboard__empty {
  height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  gap: 10px;
}
.dashboard__empty i {
  font-size: 48px;
  color: #c0c4cc;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.metric {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.metric__label {
  font-size: 12px;
  color: #909399;
}
.metric__value {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  margin-bottom: 6px;
}
.panel__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.panel__hint {
  font-size: 12px;
  color: #909399;
}
.chart {
  width: 100%;
  height: 280px;
}
.chart--tall {
  height: 320px;
}
.chart--streak {
  height: 300px;
}

/* 近况格子 */
.form-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.form-row__name {
  width: 68px;
  flex: none;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.form-row__dots {
  display: flex;
  gap: 3px;
  flex: 1;
  flex-wrap: wrap;
}
.form-row__state {
  width: 48px;
  flex: none;
  text-align: right;
  font-weight: 600;
}
.form-row__state--win {
  color: #f5222d;
}
.form-row__state--lose {
  color: #13ce66;
}
.form-row__state--idle {
  color: #c0c4cc;
  font-weight: normal;
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: #dcdfe6;
}
.dot--win {
  background: #f5222d;
}
.dot--lose {
  background: #13ce66;
}
.dot--deuce {
  background: #c0c4cc;
}
.form-legend {
  display: flex;
  gap: 14px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
  font-size: 12px;
  color: #909399;
}
.form-legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>

<style>
/* tooltip 由 echarts 渲染到 body 上，不在 scoped 作用域内，单独写一份 */
.chart-tooltip-up {
  color: #f5222d;
}
.is-up {
  color: #f5222d;
}
.is-down {
  color: #13ce66;
}
</style>
