"""
生成 PWA 图标：黑桃标。

为什么手写光栅化而不是用现成库：
- 项目里没有任何图形依赖（不要为了几张图标往 devDependencies 塞 sharp/pillow）；
- 轮廓自己用贝塞尔定义，比找素材更可控，也不会踩版权。

形状为什么改成贝塞尔：
  最早用「一个三角 + 两个圆」拼黑桃，圆与三角只能靠遮挡衔接，
  翼显得又胖又钝、桃梗像根柱子从圆底下戳出来 —— 缩小后就是一朵梅花。
  真黑桃是「上半陡、下缘缓、收进凹腰、梗再外扩」，没有解析式能表达，只能用曲线。

用法（项目根目录）：
    python3 .workbuddy/scripts/make-pwa-icons.py                 # 按 PALETTE 出四张正式图
    python3 .workbuddy/scripts/make-pwa-icons.py --compare       # 三套配色并排出对比图到 /tmp

产出（全部落在 public/，由 webpack 原样拷到 dist/）：
    icon-192.png            常规图标
    icon-512.png            常规大图标（安装弹窗 / 启动画面）
    icon-maskable-512.png   maskable：满幅底色 + 图形缩到安全区（安卓会裁成圆形/水滴）
    apple-touch-icon.png    iOS 主屏图标（180，iOS 自己裁圆角，所以不能带透明角）
"""

import math
import os
import struct
import sys
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC = os.path.join(ROOT, "public")

MASTER = 1024   # 主渲染尺寸，之后盒式降采样到各档
SS = 4          # 每个像素纵向 4 个子采样行；水平方向按区间重叠精确计算
SEG = 80        # 每段贝塞尔的折线细分数

# 黑桃轮廓，24×24 网格，y 向下。顶点点在 (12, 1.8)，沿左侧下行、绕梗底、再沿右侧上行闭合。
# 关键四段：翼外缘（陡）、翼底（缓弧）、收进凹腰（内凹）、梗（向下外扩）。
# ⚠️ 梗两侧的控制点 x 必须单调内收。若写成「先外扩再回勾」，谷底会鼓出两个尖包，
#    看着像条裤子 —— 这个坑踩过一次。
SPADE_PATH = [
    ("M", 12.0, 1.8),
    ("C", 9.4, 5.4, 3.0, 8.0, 3.0, 13.0),      # 左翼外缘
    ("C", 3.0, 15.4, 5.1, 17.6, 7.8, 17.6),    # 左翼底部
    ("C", 9.3, 17.6, 10.0, 17.0, 10.3, 16.2),  # 收到凹腰左侧
    ("C", 10.2, 17.8, 9.6, 20.0, 8.6, 21.6),   # 梗左侧
    ("L", 15.4, 21.6),                          # 梗底
    ("C", 14.4, 20.0, 13.8, 17.8, 13.7, 16.2), # 梗右侧
    ("C", 14.0, 17.0, 14.7, 17.6, 16.2, 17.6), # 凹腰右侧到右翼底
    ("C", 18.9, 17.6, 21.0, 15.4, 21.0, 13.0), # 右翼底部到外缘
    ("C", 21.0, 8.0, 14.6, 5.4, 12.0, 1.8),    # 右翼外缘回桃尖
]

# 三套配色。bg/bg2 是底色的亮端与暗端，fg_* 是图形的竖直渐变，
# rim 是图形外侧那圈细亮线（None = 不画），lit 是左上受光的高光色。
PALETTES = {
    "navy-gold": {
        "bg": (38, 58, 96), "bg2": (8, 13, 26),
        "fg_top": (238, 211, 156), "fg_mid": (205, 165, 99), "fg_bot": (160, 118, 56),
        "rim": (250, 232, 190), "lit": (255, 245, 218),
    },
    "ivory-navy": {
        "bg": (252, 249, 242), "bg2": (222, 214, 196),
        "fg_top": (46, 71, 116), "fg_mid": (29, 46, 82), "fg_bot": (16, 27, 50),
        "rim": None, "lit": (255, 255, 255),
    },
    "crimson-ivory": {
        "bg": (128, 30, 36), "bg2": (52, 10, 14),
        "fg_top": (251, 245, 231), "fg_mid": (240, 230, 210), "fg_bot": (214, 199, 173),
        "rim": None, "lit": (255, 255, 255),
    },
}

PALETTE = "navy-gold"


def clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def in_rounded_rect(x, y, radius):
    """x/y ∈ [-1,1]，判定是否落在圆角方块内（radius 也是 [-1,1] 归一化半径）。"""
    dx = abs(x) - (1 - radius)
    dy = abs(y) - (1 - radius)
    if dx <= 0 or dy <= 0:
        return True
    return dx * dx + dy * dy <= radius * radius


def flatten(path, per_seg=SEG):
    """把 M/L/C 路径展平成折线点列（24 网格坐标）。"""
    pts = []
    cur = (0.0, 0.0)
    for seg in path:
        cmd = seg[0]
        if cmd == "M" or cmd == "L":
            cur = (seg[1], seg[2])
            pts.append(cur)
            continue
        x1, y1, x2, y2, x3, y3 = seg[1:]
        x0, y0 = cur
        for i in range(1, per_seg + 1):
            t = i / per_seg
            mt = 1.0 - t
            a = mt * mt * mt
            b = 3.0 * mt * mt * t
            c = 3.0 * mt * t * t
            d = t * t * t
            pts.append(
                (
                    a * x0 + b * x1 + c * x2 + d * x3,
                    a * y0 + b * y1 + c * y2 + d * y3,
                )
            )
        cur = (x3, y3)
    return pts


def normalized_spade(scale):
    """24 网格 → 以图标中心为原点的 [-1,1] 坐标（y 向上），再按 scale 缩放。

    横向额外乘 0.78：24 网格里的轮廓偏方（宽/高 ≈ 0.97），
    直接照搬会显得矮胖，压一点才像字体里那个 ♠。
    """
    out = []
    for x, y in flatten(SPADE_PATH):
        nx = (x - 12.0) / 9.9 * 0.78
        ny = -(y - 11.7) / 9.9
        out.append((nx * scale, ny * scale))
    return out


def coverage(points, size, ss=SS):
    """扫描线填充，返回 size×size 的浮点覆盖率（0..1）。

    纵向 ss 个子采样行求平均；横向直接用区间与像素的重叠长度，
    所以水平方向的抗锯齿是解析的，不靠采样。
    """
    n = len(points)
    edges = []
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        if y1 != y2:  # 水平边对射线法无贡献
            edges.append((x1, y1, x2, y2))

    buf = [0.0] * (size * size)
    half = size / 2.0

    for py in range(size):
        base = py * size
        for k in range(ss):
            fy = (py + (k + 0.5) / ss) / size
            y = 1.0 - fy * 2.0
            xs = []
            for x1, y1, x2, y2 in edges:
                if (y1 <= y < y2) or (y2 <= y < y1):
                    xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
            if len(xs) < 2:
                continue
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                a = (xs[i] + 1.0) * half
                b = (xs[i + 1] + 1.0) * half
                if b <= a:
                    continue
                i0 = max(0, int(a))
                i1 = min(size - 1, int(b))
                for px in range(i0, i1 + 1):
                    lo = a if a > px else float(px)
                    hi = b if b < px + 1 else float(px + 1)
                    if hi > lo:
                        buf[base + px] += hi - lo

    norm = 1.0 / ss
    for i in range(len(buf)):
        v = buf[i] * norm
        buf[i] = 1.0 if v > 1.0 else v
    return buf


def render_master(pal, full_bleed, graphic_scale):
    """
    @param pal 配色
    @param full_bleed 满幅（maskable / iOS 用）：角落不切圆角、底色铺到底
    @param graphic_scale 黑桃在画面里占多大（1.0 = 半幅高）
    """
    size = MASTER
    corner = 0.0 if full_bleed else 0.40

    inner = coverage(normalized_spade(graphic_scale), size)
    rim_cov = None
    if pal["rim"] is not None:
        # 外扩 0.6% 画一圈细亮线：在深底上把轮廓从背景里"拎"出来
        rim_cov = coverage(normalized_spade(graphic_scale * 1.006), size)

    buf = bytearray(size * size * 4)
    for py in range(size):
        row = py * size
        gy = py / size
        for px in range(size):
            fx = px / size
            i = (row + px) * 4

            x = fx * 2.0 - 1.0
            y = 1.0 - gy * 2.0
            if not full_bleed and not in_rounded_rect(x, y, corner):
                continue

            # ---- 底色：左上→右下线性渐变 + 左上柔光 + 四角压暗
            t = clamp01((x + (1.0 - y)) * 0.25 + 0.15)
            bg = mix(pal["bg"], pal["bg2"], t)

            glow = math.exp(-(((x + 0.45) ** 2) + ((y - 0.55) ** 2)) / 0.55) * 0.16
            bg = tuple(bg[c] + (255 - bg[c]) * glow for c in range(3))

            vig = 1.0 - 0.16 * clamp01((x * x + y * y) * 0.62)
            bg = tuple(bg[c] * vig for c in range(3))

            # ---- 黑桃：竖直渐变 + 很弱的左上受光
            a_in = inner[row + px]
            a_rim = rim_cov[row + px] if rim_cov is not None else a_in
            if a_rim > 0.0:
                u = x / graphic_scale
                v = y / graphic_scale
                gt = clamp01(0.5 - v * 0.55)    # 0 = 桃尖附近，1 = 桃梗底部
                if gt < 0.5:
                    fg = mix(pal["fg_top"], pal["fg_mid"], gt * 2.0)
                else:
                    fg = mix(pal["fg_mid"], pal["fg_bot"], (gt - 0.5) * 2.0)
                # 纯竖直渐变会显得扁平像塑料片；补一层很弱的左上受光就够，
                # 再加"右下背光"会在梗附近压出一块不均匀的暗斑，看着发脏。
                lit = clamp01(1.0 - (((u + 0.30) ** 2) + ((v - 0.42) ** 2)) / 1.30)
                fg = mix(fg, pal["lit"], 0.12 * lit)

                c = bg
                if pal["rim"] is not None:
                    c = [c[k] * (1 - a_rim) + pal["rim"][k] * a_rim for k in range(3)]
                if a_in > 0.0:
                    c = [c[k] * (1 - a_in) + fg[k] * a_in for k in range(3)]
                bg = c

            buf[i] = min(255, max(0, round(bg[0])))
            buf[i + 1] = min(255, max(0, round(bg[1])))
            buf[i + 2] = min(255, max(0, round(bg[2])))
            buf[i + 3] = 255
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


def png_bytes(size, pixels):
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
    return png


def write_png(path, size, pixels, quiet=False):
    png = png_bytes(size, pixels)
    with open(path, "wb") as fh:
        fh.write(png)
    if not quiet:
        print(f"  {os.path.basename(path):24s} {size}x{size}  {len(png) / 1024:.1f} KB")


def write_ico(path, entries):
    """写多尺寸 .ico：每档直接塞 PNG（Vista 起浏览器/Windows 都认）。

    浏览器标签页只会用到 16/32，但桌面快捷方式会挑更大的那档，所以一并给 48。
    """
    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    dirs = b""
    blobs = b""
    for size, pixels in entries:
        data = png_bytes(size, pixels)
        dim = 0 if size >= 256 else size  # 256 在 ICO 头里写作 0
        dirs += struct.pack(
            "<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset + len(blobs)
        )
        blobs += data
    with open(path, "wb") as fh:
        fh.write(header + dirs + blobs)
    print(
        f"  {os.path.basename(path):24s} "
        + "/".join(str(s) for s, _ in entries)
        + f"  {(len(header) + len(dirs) + len(blobs)) / 1024:.1f} KB"
    )


def read_png(path):
    d = open(path, "rb").read()
    i = 8
    w = h = None
    idat = b""
    while i < len(d):
        ln = struct.unpack(">I", d[i:i + 4])[0]
        tag = d[i + 4:i + 8]
        data = d[i + 8:i + 8 + ln]
        i += 12 + ln
        if tag == b"IHDR":
            w, h = struct.unpack(">II", data[:8])
        elif tag == b"IDAT":
            idat += data
    raw = zlib.decompress(idat)
    stride = w * 4
    px = bytearray()
    prev = bytearray(stride)
    p = 0
    for _ in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if f == 1:
            for x in range(4, stride):
                line[x] = (line[x] + line[x - 4]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        px += line
        prev = line
    return w, h, bytes(px)


def preview(png_path, out_path, sizes=(192, 128, 96, 64, 48, 32)):
    """把一张 512 拼成多尺寸对照图：手机桌面上真正看到的就是小尺寸。"""
    w, h, big = read_png(png_path)
    pad = 18
    W = sum(sizes) + pad * (len(sizes) + 1)
    H = max(sizes) + pad * 2
    out = bytearray(W * H * 4)
    for y in range(H):
        for x in range(W):
            i = (y * W + x) * 4
            out[i], out[i + 1], out[i + 2], out[i + 3] = 238, 241, 248, 255
    ox = pad
    for s in sizes:
        oy = pad + (max(sizes) - s) // 2
        for y in range(s):
            for x in range(s):
                sx = int(x * w / s)
                sy = int(y * h / s)
                si = (sy * w + sx) * 4
                di = ((y + oy) * W + ox + x) * 4
                a = big[si + 3] / 255
                for c in range(3):
                    out[di + c] = round(big[si + c] * a + out[di + c] * (1 - a))
                out[di + 3] = 255
        ox += s + pad
    write_png(out_path, W, out, quiet=True)
    return W, H


def main():
    os.makedirs(PUBLIC, exist_ok=True)

    if "--compare" in sys.argv:
        tiles = []
        for name in PALETTES:
            buf = render_master(PALETTES[name], False, 0.64)
            path = f"/tmp/icon-{name}.png"
            write_png(path, 512, downsample(buf, MASTER, 512), quiet=True)
            tiles.append(path)
            print(f"  {name}")
        # 三张 512 横排
        pad = 24
        W = 512 * len(tiles) + pad * (len(tiles) + 1)
        H = 512 + pad * 2
        out = bytearray(W * H * 4)
        for y in range(H):
            for x in range(W):
                i = (y * W + x) * 4
                out[i], out[i + 1], out[i + 2], out[i + 3] = 238, 241, 248, 255
        ox = pad
        for path in tiles:
            w, h, px = read_png(path)
            for y in range(h):
                for x in range(w):
                    si = (y * w + x) * 4
                    di = ((y + pad) * W + ox + x) * 4
                    a = px[si + 3] / 255
                    for c in range(3):
                        out[di + c] = round(px[si + c] * a + out[di + c] * (1 - a))
                    out[di + 3] = 255
            ox += 512 + pad
        write_png("/tmp/icons-compare.png", W, out, quiet=True)
        print(f"对比图：/tmp/icons-compare.png ({W}x{H})")
        return

    pal = PALETTES[PALETTE]
    print("渲染主图（1024）…")
    normal = render_master(pal, full_bleed=False, graphic_scale=0.68)
    maskable = render_master(pal, full_bleed=True, graphic_scale=0.58)
    # iOS 自己裁圆角，底要满幅；但不必缩到 maskable 那么小，留一点呼吸即可
    touch = render_master(pal, full_bleed=True, graphic_scale=0.64)

    print("写出：")
    write_png(os.path.join(PUBLIC, "icon-512.png"), 512, downsample(normal, MASTER, 512))
    write_png(os.path.join(PUBLIC, "icon-192.png"), 192, downsample(normal, MASTER, 192))
    write_png(
        os.path.join(PUBLIC, "icon-maskable-512.png"), 512,
        downsample(maskable, MASTER, 512),
    )
    write_png(
        os.path.join(PUBLIC, "apple-touch-icon.png"), 180,
        downsample(touch, MASTER, 180),
    )

    # 浏览器标签页 / 桌面快捷方式用的 favicon.ico。
    # 图标多小都要认得出：16px 下细节全糊，所以图形占比给得比大图更大一点。
    fav_big = downsample(render_master(pal, False, 0.76), MASTER, 512)
    write_ico(
        os.path.join(PUBLIC, "favicon.ico"),
        [(16, downsample(fav_big, 512, 16)),
         (32, downsample(fav_big, 512, 32)),
         (48, downsample(fav_big, 512, 48))],
    )

    preview(os.path.join(PUBLIC, "icon-512.png"), "/tmp/icon-sizes.png")
    print("多尺寸对照：/tmp/icon-sizes.png")


if __name__ == "__main__":
    main()
