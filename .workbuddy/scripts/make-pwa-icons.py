"""
生成 PWA 图标：深海军蓝圆角方块 + 香槟金黑桃（与顶栏 .hero__mark 的 ♠ 同一套观感）。

为什么手写光栅化而不是用现成库：
- 项目里没有任何图形依赖（不要为了三张图标往 devDependencies 塞 sharp/pillow）；
- 黑桃用经典心形隐函数旋转 180° 得到，比找素材更可控，也不会踩版权。

用法（项目根目录）：
    python3 .workbuddy/scripts/make-pwa-icons.py

产出（全部落在 public/，由 webpack 原样拷到 dist/）：
    icon-192.png            常规图标
    icon-512.png            常规大图标（安装弹窗 / 启动画面）
    icon-maskable-512.png   maskable：满幅底色 + 图形缩到安全区（安卓会裁成圆形/水滴）
    apple-touch-icon.png    iOS 主屏图标（180，iOS 自己裁圆角，所以不能带透明角）
"""

import math
import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC = os.path.join(ROOT, "public")

# 主题色（见 src/styles/theme.css）
NAVY_TOP = (41, 65, 104)      # --pk-navy-3
NAVY_BOTTOM = (17, 28, 49)    # --pk-navy-1
GOLD_TOP = (233, 203, 138)    # 香槟金高光
GOLD_BOTTOM = (195, 144, 47)  # --pk-gold

MASTER = 1024  # 主渲染尺寸，之后盒式降采样到各档
SS = 2         # 每像素 2x2 超采样，负责边缘抗锯齿


def clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def lerp(a, b, t):
    return a + (b - a) * t


def in_rounded_rect(x, y, radius):
    """x/y ∈ [-1,1]，判定是否落在圆角方块内（radius 也是 [-1,1] 归一化半径）。"""
    dx = abs(x) - (1 - radius)
    dy = abs(y) - (1 - radius)
    if dx <= 0 or dy <= 0:
        return True
    return dx * dx + dy * dy <= radius * radius


def in_spade(u, v):
    """
    黑桃 = 上方三角 + 两个圆瓣 + 底部桃梗（u/v ∈ 约 [-1,1]，v 轴向上）。

    不用心形隐函数：那个公式的圆瓣会撑得过宽，缩小到 48px 时糊成一团。
    三角的底角正好落在圆心 —— 圆自然把三角的尖角盖住，两翼就有了想要的圆滑外扩。
    """
    for cx in (-0.43, 0.43):
        if (u - cx) ** 2 + (v + 0.33) ** 2 <= 0.43 ** 2:
            return True

    # 顶点 (0, 0.90)，底边 v=-0.33 处半宽 0.43
    if -0.33 <= v <= 0.90:
        half = 0.43 * (0.90 - v) / (0.90 + 0.33)
        if abs(u) <= half:
            return True

    # 桃梗：从两瓣相切的凹口一直往下，略微外扩当底座。
    # 起点必须高过两圆相切点（v=-0.33），否则凹口会留下一道细黑缝。
    if -0.97 <= v <= -0.30:
        t = (v + 0.30) / -0.67
        if abs(u) <= 0.09 + 0.09 * t:
            return True
    return False


def render_master(full_bleed, graphic_scale):
    """
    @param full_bleed 满幅（maskable 用）：角落不切圆角、底色铺到底
    @param graphic_scale 黑桃在画面里占多大（0.5 = 半幅宽）
    """
    size = MASTER
    buf = bytearray(size * size * 4)
    corner = 0.0 if full_bleed else 0.30  # 归一化半径（视觉上约 22% 圆角）

    step = 1.0 / SS
    for py in range(size):
        row = py * size * 4
        for px in range(size):
            cov_bg = 0
            cov_fg = 0
            for sy in range(SS):
                for sx in range(SS):
                    # 归一化到 [-1,1]，y 轴向上
                    fx = (px + (sx + 0.5) * step) / size
                    fy = (py + (sy + 0.5) * step) / size
                    x = fx * 2 - 1
                    y = 1 - fy * 2

                    inside_bg = True if full_bleed else in_rounded_rect(x, y, corner)
                    if not inside_bg:
                        continue
                    cov_bg += 1

                    u = x / graphic_scale
                    v = (y + 0.02) / graphic_scale
                    if in_spade(u, v):
                        cov_fg += 1

            total = SS * SS
            if cov_bg == 0:
                continue  # 透明角

            t = clamp01((py / size) * 0.85 + (px / size) * 0.15)
            bg = [lerp(NAVY_TOP[i], NAVY_BOTTOM[i], t) for i in range(3)]

            if cov_fg:
                gt = clamp01(1 - (py / size))
                gold = [lerp(GOLD_BOTTOM[i], GOLD_TOP[i], gt) for i in range(3)]
                a = cov_fg / total
                bg = [lerp(bg[i], gold[i], a) for i in range(3)]

            alpha = 255 if full_bleed else round(255 * cov_bg / total)
            i = row + px * 4
            buf[i] = round(bg[0])
            buf[i + 1] = round(bg[1])
            buf[i + 2] = round(bg[2])
            buf[i + 3] = alpha
    return buf


def downsample(src, src_size, dst_size):
    if dst_size == src_size:
        return bytes(src)
    scale = src_size / dst_size
    out = bytearray(dst_size * dst_size * 4)
    for dy in range(dst_size):
        y0 = int(dy * scale)
        y1 = max(y0 + 1, int((dy + 1) * scale))
        for dx in range(dst_size):
            x0 = int(dx * scale)
            x1 = max(x0 + 1, int((dx + 1) * scale))
            # 预乘 alpha 再平均，否则透明角的边缘会发黑
            r = g = b = a = 0.0
            n = 0
            for sy in range(y0, y1):
                base = sy * src_size * 4
                for sx in range(x0, x1):
                    i = base + sx * 4
                    av = src[i + 3] / 255
                    r += src[i] * av
                    g += src[i + 1] * av
                    b += src[i + 2] * av
                    a += av
                    n += 1
            o = (dy * dst_size + dx) * 4
            if a <= 0:
                continue
            out[o] = min(255, round(r / a))
            out[o + 1] = min(255, round(g / a))
            out[o + 2] = min(255, round(b / a))
            out[o + 3] = min(255, round(255 * a / n))
    return bytes(out)


def write_png(path, size, pixels):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: none
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)
    print(f"  {os.path.basename(path):24s} {size}x{size}  {len(png) / 1024:.1f} KB")


def main():
    os.makedirs(PUBLIC, exist_ok=True)
    print("渲染主图（1024）…")
    normal = render_master(full_bleed=False, graphic_scale=0.70)
    maskable = render_master(full_bleed=True, graphic_scale=0.56)

    print("写出：")
    write_png(os.path.join(PUBLIC, "icon-512.png"), 512, downsample(normal, MASTER, 512))
    write_png(os.path.join(PUBLIC, "icon-192.png"), 192, downsample(normal, MASTER, 192))
    write_png(
        os.path.join(PUBLIC, "icon-maskable-512.png"), 512,
        downsample(maskable, MASTER, 512),
    )
    write_png(
        os.path.join(PUBLIC, "apple-touch-icon.png"), 180,
        downsample(maskable, MASTER, 180),
    )


if __name__ == "__main__":
    main()
