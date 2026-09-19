/**
 * 画几条纯几何的 UI 贴图：提示条、进度条填充与外框、等待转圈。
 *
 * 这几样是规整的圆角条和圆环，交给生图工具反而不好使：极端的细长比例出不来，
 * 边缘也不干净。用有符号距离场直接算，描边粗细和圆角半径都能定死，
 * 颜色跟 gen-prefabs 里那套 INK 对齐，和已有素材摆在一起不会花。
 */

/** 与 gen-prefabs 的 INK 同源。 */
const C = {
    line: [26, 18, 11],
    wood: [123, 74, 40],
    woodDark: [62, 40, 20],
    groove: [54, 34, 18],
    toast: [74, 46, 26],
    gold: [247, 206, 75],
    orange: [232, 135, 58],
    cream: [255, 250, 236]
};

/** 描边宽度，和手绘素材那圈粗黑边视觉对齐。 */
const LINE = 3;

function canvas(w, h) {
    return { width: w, height: h, data: Buffer.alloc(w * h * 4) };
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

/** source-over 混合，a 取 0..1。 */
function blend(img, x, y, rgb, a) {
    if (a <= 0) return;
    const o = (y * img.width + x) * 4;
    const sa = img.data[o + 3] / 255;
    const na = a + sa * (1 - a);
    if (na <= 0) return;
    for (let c = 0; c < 3; c++) {
        img.data[o + c] = Math.round((rgb[c] * a + img.data[o + c] * sa * (1 - a)) / na);
    }
    img.data[o + 3] = Math.round(na * 255);
}

/** 圆角矩形的有符号距离，负值在形内。 */
function sdRoundRect(px, py, hw, hh, r) {
    const qx = Math.abs(px) - (hw - r);
    const qy = Math.abs(py) - (hh - r);
    const ax = qx > 0 ? qx : 0;
    const ay = qy > 0 ? qy : 0;
    const outside = Math.sqrt(ax * ax + ay * ay);
    const inside = Math.min(Math.max(qx, qy), 0);
    return outside + inside - r;
}

/** 胶囊（圆头短棒）的有符号距离。 */
function sdCapsule(px, py, ax, ay, bx, by, r) {
    const pax = px - ax;
    const pay = py - ay;
    const bax = bx - ax;
    const bay = by - ay;
    const len = bax * bax + bay * bay;
    const h = len <= 0 ? 0 : clamp01((pax * bax + pay * bay) / len);
    const dx = pax - bax * h;
    const dy = pay - bay * h;
    return Math.sqrt(dx * dx + dy * dy) - r;
}

/** 距离转覆盖率，留一个像素做抗锯齿。 */
function cover(d) {
    return clamp01(0.5 - d);
}

/**
 * 一条带粗黑描边的圆角条。
 * fill 收到 0..1 的纵向位置，返回这一行的颜色，用来铺上下渐变。
 */
function roundBar(w, h, radius, fill) {
    const img = canvas(w, h);
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(radius, hh - 0.5);
    for (let y = 0; y < h; y++) {
        const py = y + 0.5 - hh;
        for (let x = 0; x < w; x++) {
            const px = x + 0.5 - hw;
            const d = sdRoundRect(px, py, hw - 0.5, hh - 0.5, r);
            const outline = cover(d);
            if (outline <= 0) continue;
            blend(img, x, y, C.line, outline);
            const inner = cover(d + LINE);
            if (inner > 0) blend(img, x, y, fill(y / (h - 1)), inner);
        }
    }
    return img;
}

/** 提示条：深棕木牌，压在画面上要盖住底下的东西，所以给足不透明度。 */
function toast(w, h) {
    return roundBar(w, h, h * 0.42, (t) => lerp(
        [C.toast[0] + 16, C.toast[1] + 12, C.toast[2] + 8], C.toast, t
    ));
}

/** 进度条填充：暖黄到橙的纵向渐变，顶部压一道高光。 */
function barFill(w, h) {
    return roundBar(w, h, h * 0.45, (t) => {
        if (t < 0.26) return lerp(C.cream, C.gold, t / 0.26);
        return lerp(C.gold, C.orange, (t - 0.26) / 0.74);
    });
}

/** 进度条外框：木边 + 内凹的槽，填充条盖在它上面。 */
function barFrame(w, h) {
    const img = roundBar(w, h, h * 0.42, (t) => lerp(C.wood, C.woodDark, t));
    const hw = w / 2;
    const hh = h / 2;
    const inset = LINE + 5;
    for (let y = 0; y < h; y++) {
        const py = y + 0.5 - hh;
        for (let x = 0; x < w; x++) {
            const px = x + 0.5 - hw;
            const d = sdRoundRect(px, py, hw - 0.5 - inset, hh - 0.5 - inset, Math.max(2, (hh - inset) * 0.7));
            const a = cover(d);
            if (a > 0) blend(img, x, y, C.groove, a);
        }
    }
    return img;
}

/**
 * 等待转圈：八根羽毛状短棒绕成一圈，亮度沿圈递减，转起来就有拖尾。
 * 中心留空，旋转由代码驱动，所以图本身不带角度暗示。
 */
function spinner(w, h) {
    const img = canvas(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.min(w, h) / 2 - LINE - 1;
    const inner = outer * 0.56;
    const thick = outer * 0.135;
    const N = 8;
    const blades = [];
    for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
        blades.push({
            ax: cx + Math.cos(ang) * inner,
            ay: cy + Math.sin(ang) * inner,
            bx: cx + Math.cos(ang) * outer,
            by: cy + Math.sin(ang) * outer,
            tint: lerp(C.gold, C.orange, i / (N - 1))
        });
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            let best = Infinity;
            let tint = C.gold;
            for (const b of blades) {
                const d = sdCapsule(px, py, b.ax, b.ay, b.bx, b.by, thick);
                if (d < best) {
                    best = d;
                    tint = b.tint;
                }
            }
            const outline = cover(best);
            if (outline <= 0) continue;
            blend(img, x, y, C.line, outline);
            const fill = cover(best + LINE * 0.8);
            if (fill > 0) blend(img, x, y, tint, fill);
        }
    }
    return img;
}

module.exports = { toast, barFill, barFrame, spinner };
