/**
 * 响应式开关：只回答一件事 —— 「现在是不是窄屏」。
 *
 * 为什么用 JS 而不是纯 CSS：座位表在窄屏要整体换成卡片列表、弹窗表单要把
 * label 挪到顶部、结算抽屉要占满全宽，这些都不是改个宽度能解决的，
 * 是**结构**要换。结构切换必须知道当前断点，只能由 JS 给。
 *
 * 断点统一定义在这里，别再散落到各组件里。768 = iPad 竖屏以下。
 */
export const MOBILE_MAX = 768;

/**
 * 更宽的一档：768~1024 的平板竖屏。
 * 这些设备不是「手机」，但两栏并排后左栏只剩 ~500px，
 * 座位表 6 列要 616px —— 表格照样被裁，所以座位卡从这里就开始换。
 */
export const COMPACT_MAX = 1024;

export default {
  data() {
    return {
      /** 当前视口宽度；初值给 0，mounted 里立刻量一次 */
      viewportWidth: 0,
      isMobile: false,
      /** 平板及以下：座位表 / 榜单这类「宽度吃紧」的地方走精简结构 */
      isCompact: false,
    };
  },
  mounted() {
    this.measureViewport();
    window.addEventListener("resize", this.measureViewport);
    window.addEventListener("orientationchange", this.measureViewport);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.measureViewport);
    window.removeEventListener("orientationchange", this.measureViewport);
  },
  methods: {
    measureViewport() {
      // 移动端键盘弹起时 innerWidth 不变，这里只关心横向，用 clientWidth 更稳
      const width = window.innerWidth || document.documentElement.clientWidth || 0;
      this.viewportWidth = width;
      this.isMobile = width <= MOBILE_MAX;
      this.isCompact = width <= COMPACT_MAX;
    },
  },
};
