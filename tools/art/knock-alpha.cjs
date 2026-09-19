/**
 * 把生图产出的假透明棋盘格 / 纯白底抠成真 Alpha。
 * 只从画面边缘洪水填充，避免挖掉白眼珠这类内部浅色区域。
 * 取代原 knock-alpha.py（开发机无 Python）。
 */
const path = require("path");
const png = require("./png.cjs");
const { keyCheckerboard, optsForName } = require("./key-checkerboard.cjs");

const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
];

function isBackdrop(r, g, b, avgMin) {
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const avg = (r + g + b) / 3;
    return sat <= 14 && Math.abs(r - b) <= 12 && avg >= avgMin;
}

function isMagenta(r, g, b, tol) {
    const score = (r + b) * 0.5 - g;
    const rbGap = Math.abs(r - b);
    return score >= 80 - tol * 0.4 && rbGap <= 70 + tol && g <= 155 + tol * 0.3 && r >= 120 && b >= 110;
}

/** 品红底洪水填充，专给敌人小招式贴纸用。 */
function knockMagenta(img, tol = 54) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    function push(x, y, loose) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i]) return;
        const d = i * 4;
        if (data[d + 3] < 8) {
            seen[i] = 1;
            return;
        }
        if (!isMagenta(data[d], data[d + 1], data[d + 2], loose ? tol + 28 : tol)) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    // 边缘带播种（外圈常有黑格线，不能只靠最外 1px）
    const band = Math.max(2, Math.floor(Math.min(w, h) * 0.04));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x >= band && y >= band && x < w - band && y < h - band) continue;
            push(x, y, false);
        }
    }

    let cleared = 0;
    while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, false);
    }

    for (let pass = 0; pass < 4; pass++) {
        const halo = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const d = i * 4;
                if (data[d + 3] === 0) continue;
                if (!isMagenta(data[d], data[d + 1], data[d + 2], tol + 36)) continue;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (data[(ny * w + nx) * 4 + 3] === 0) {
                        halo.push(i);
                        break;
                    }
                }
            }
        }
        if (!halo.length) break;
        for (const i of halo) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

function satAvg(r, g, b) {
    return { sat: Math.max(r, g, b) - Math.min(r, g, b), avg: (r + g + b) / 3 };
}

/** 只认亮白/浅灰底，不把米黄羽毛、眼白当背景。 */
function isBgWhite(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    // 更严：avg 要够白、饱和极低，避免白袍/白毛边缘被当底。
    return sat <= 12 && avg >= 236 && Math.abs(r - b) <= 10;
}

function isNearWhite(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    return sat <= 14 && avg >= 228 && Math.abs(r - b) <= 12;
}

function isBorderGrid(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    return sat <= 20 && avg >= 40 && avg < 236;
}

/** 黑底（生图常用纯黑/深灰底板）。 */
function isBgBlack(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    return avg <= 28 && sat <= 18;
}

function isNearBlack(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    return avg <= 42 && sat <= 22;
}

/** 角色本体色（非底板白/黑），用来保护白衣服不被近白扩张吃掉。 */
function isSubjectColor(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    if (avg <= 36 && sat <= 20) return false; // 黑底
    if (sat <= 12 && avg >= 236) return false; // 白底
    if (sat <= 14 && avg >= 228 && Math.abs(r - b) <= 12) return false;
    return true;
}

/** 脚下浅绿/灰绿椭圆阴影（低饱和），不碰高饱和绿袍/绿盔。 */
function isGroundShadow(r, g, b, loose) {
    const avg = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const gDom = g - Math.max(r, b);
    // 含偏暗的苔藓绿阴影盘（medic raw 常见 avg~70-120）。
    if (loose) {
        return gDom >= 3 && avg >= 55 && avg <= 200 && sat <= 75 && r >= 40 && b >= 35 && g < 210;
    }
    return gDom >= 6 && avg >= 70 && avg <= 185 && sat <= 60 && r >= 50 && b >= 45 && g < 200;
}

function isKeyedMagenta(r, g, b) {
    return r >= 200 && b >= 200 && g <= 70 && (r - g) >= 120 && (b - g) >= 120;
}

function paintMagenta(data, d) {
    data[d] = 255;
    data[d + 1] = 0;
    data[d + 2] = 255;
    data[d + 3] = 255;
}

/**
 * 标记「角色色」像素并向外扩几圈，白袍/白毛落在保护区里就不会被近白扩张抠掉。
 */
function buildSubjectMask(img, dilate = 3) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const d = i * 4;
        if (data[d + 3] < 8) continue;
        if (isSubjectColor(data[d], data[d + 1], data[d + 2])) mask[i] = 1;
    }
    for (let pass = 0; pass < dilate; pass++) {
        const next = Buffer.from(mask);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (mask[i]) continue;
                const d = i * 4;
                if (data[d + 3] < 8) continue;
                // 只把白/浅色扩进保护区，不把底板黑扩进去。
                if (!isNearWhite(data[d], data[d + 1], data[d + 2]) && !isBgWhite(data[d], data[d + 1], data[d + 2])) {
                    // 白毛外还有米/灰描边
                    const { sat, avg } = satAvg(data[d], data[d + 1], data[d + 2]);
                    if (!(sat <= 40 && avg >= 160)) continue;
                }
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (mask[ny * w + nx]) {
                        next[i] = 1;
                        break;
                    }
                }
            }
        }
        mask = next;
    }
    return mask;
}

/**
 * 把边缘连通的白底涂成 #FF00FF，不改角色内部浅色。
 * 近白只扩 1 圈，且跳过 subject mask，避免白袍/白毛被掏空。
 */
function whiteToMagenta(img) {
    const { width: w, height: h, data } = img;
    const protect = buildSubjectMask(img, 3);
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let painted = 0;

    function push(x, y, test) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i] || protect[i]) return;
        const d = i * 4;
        if (data[d + 3] === 0) return;
        if (!test(data[d], data[d + 1], data[d + 2])) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    for (let x = 0; x < w; x++) {
        push(x, 0, isBgWhite);
        push(x, h - 1, isBgWhite);
    }
    for (let y = 0; y < h; y++) {
        push(0, y, isBgWhite);
        push(w - 1, y, isBgWhite);
    }
    const band = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x > band && y > band && x < w - 1 - band && y < h - 1 - band) continue;
            push(x, y, isBgWhite);
        }
    }

    while (head < tail) {
        const i = queue[head++];
        paintMagenta(data, i * 4);
        painted += 1;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, isBgWhite);
    }

    // 近白只扩 1 圈，且必须「多数邻域已是品红/透明」且无主体色邻接。
    const extra = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const d = i * 4;
            if (data[d + 3] === 0 || seen[i] || protect[i]) continue;
            if (!isNearWhite(data[d], data[d + 1], data[d + 2])) continue;
            let mag = 0;
            let subj = 0;
            let tot = 0;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                const nd = ni * 4;
                tot += 1;
                if (data[nd + 3] === 0 || isKeyedMagenta(data[nd], data[nd + 1], data[nd + 2])) mag += 1;
                else if (protect[ni] || isSubjectColor(data[nd], data[nd + 1], data[nd + 2])) subj += 1;
            }
            if (mag >= 3 && subj === 0 && tot >= 4) extra.push(i);
        }
    }
    for (const i of extra) {
        seen[i] = 1;
        paintMagenta(data, i * 4);
        painted += 1;
    }

    const gridDepth = Math.min(4, Math.max(2, Math.floor(Math.min(w, h) * 0.02)));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x >= gridDepth && y >= gridDepth && x < w - gridDepth && y < h - gridDepth) continue;
            const i = y * w + x;
            const d = i * 4;
            if (data[d + 3] === 0 || seen[i] || protect[i]) continue;
            if (!isBorderGrid(data[d], data[d + 1], data[d + 2])) continue;
            seen[i] = 1;
            paintMagenta(data, d);
            painted += 1;
        }
    }
    return painted;
}

function knockKeyedMagentaPixels(img) {
    const { width: w, height: h, data } = img;
    const protect = buildSubjectMask(img, 2);
    let cleared = 0;
    for (let i = 0; i < w * h; i++) {
        const d = i * 4;
        if (data[d + 3] === 0) continue;
        if (!isKeyedMagenta(data[d], data[d + 1], data[d + 2])) continue;
        data.fill(0, d, d + 4);
        cleared += 1;
    }
    // 品红晕边只 1 遍，且跳过保护区（白衣服描边）。
    const halo = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (protect[i]) continue;
            const d = i * 4;
            if (data[d + 3] === 0) continue;
            const r = data[d];
            const g = data[d + 1];
            const b = data[d + 2];
            if (!(g < 90 && r > 180 && b > 180 && (r - g) > 80 && (b - g) > 80)) continue;
            let nextClear = false;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                if (data[(ny * w + nx) * 4 + 3] === 0) {
                    nextClear = true;
                    break;
                }
            }
            if (nextClear) halo.push(i);
        }
    }
    for (const i of halo) {
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
    }
    return cleared;
}

/** 边缘连通黑底 → 透明。 */
function knockBlack(img) {
    const { width: w, height: h, data } = img;
    const protect = buildSubjectMask(img, 2);
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let cleared = 0;

    function push(x, y, loose) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i] || protect[i]) return;
        const d = i * 4;
        if (data[d + 3] < 8) return;
        const test = loose ? isNearBlack : isBgBlack;
        if (!test(data[d], data[d + 1], data[d + 2])) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    for (let x = 0; x < w; x++) {
        push(x, 0, false);
        push(x, h - 1, false);
    }
    for (let y = 0; y < h; y++) {
        push(0, y, false);
        push(w - 1, y, false);
    }

    while (head < tail) {
        const i = queue[head++];
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, true);
    }
    return cleared;
}

/**
 * 清脚下浅绿椭圆。只从下半部边缘启动，避免绿衣服被连坐。
 */
function knockGroundShadow(img) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let cleared = 0;
    const y0 = Math.floor(h * 0.55);

    function push(x, y, loose) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        if (y < y0 - 6) return;
        const i = y * w + x;
        if (seen[i]) return;
        const d = i * 4;
        if (data[d + 3] < 8) return;
        if (!isGroundShadow(data[d], data[d + 1], data[d + 2], loose)) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    for (let x = 0; x < w; x++) {
        for (let y = y0; y < h; y++) push(x, y, false);
    }
    for (let y = y0; y < h; y++) {
        push(0, y, false);
        push(w - 1, y, false);
    }

    while (head < tail) {
        const i = queue[head++];
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, true);
    }
    return cleared;
}

/**
 * 填内部小透明洞（抠过头留下的白袍窟窿）。
 * 只修不贴边、面积小于 maxPx 的岛，用邻域不透明色均值回填。
 */
function fillInteriorHoles(img, maxPx = 900) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let filled = 0;

    for (let sy = 1; sy < h - 1; sy++) {
        for (let sx = 1; sx < w - 1; sx++) {
            const start = sy * w + sx;
            if (seen[start] || data[start * 4 + 3] >= 8) continue;
            let head = 0;
            let tail = 0;
            queue[tail++] = start;
            seen[start] = 1;
            const cells = [];
            let border = false;
            while (head < tail) {
                const i = queue[head++];
                cells.push(i);
                const x = i % w;
                const y = (i - x) / w;
                if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) border = true;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const ni = ny * w + nx;
                    if (seen[ni]) continue;
                    if (data[ni * 4 + 3] >= 8) continue;
                    seen[ni] = 1;
                    queue[tail++] = ni;
                }
            }
            if (border || cells.length < 2 || cells.length > maxPx) continue;

            for (const i of cells) {
                const x = i % w;
                const y = (i - x) / w;
                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                let n = 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        const d = (ny * w + nx) * 4;
                        if (data[d + 3] < 16) continue;
                        r += data[d];
                        g += data[d + 1];
                        b += data[d + 2];
                        a += data[d + 3];
                        n += 1;
                    }
                }
                if (!n) continue;
                const d = i * 4;
                data[d] = Math.round(r / n);
                data[d + 1] = Math.round(g / n);
                data[d + 2] = Math.round(b / n);
                data[d + 3] = Math.max(200, Math.round(a / n));
                filled += 1;
            }
        }
    }
    return filled;
}

/** 白底 → 品红 → 抠品红。角色身上的白/米黄不会被当成底。 */
function knockWhiteViaMagenta(img) {
    whiteToMagenta(img);
    return knockKeyedMagentaPixels(img);
}

/** 边缘采样：品红棚 / 白棚 / 黑棚。优先品红（与黑衣不冲突）。 */
function detectPlateMode(img) {
    const { width: w, height: h, data } = img;
    let black = 0;
    let white = 0;
    let magenta = 0;
    let other = 0;
    const band = Math.max(2, Math.floor(Math.min(w, h) * 0.03));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x >= band && y >= band && x < w - band && y < h - band) continue;
            const d = (y * w + x) * 4;
            if (data[d + 3] < 8) {
                black += 1; // 已透明当黑棚
                continue;
            }
            const r = data[d];
            const g = data[d + 1];
            const b = data[d + 2];
            if (isMagenta(r, g, b, 70)) {
                magenta += 1;
                continue;
            }
            const { sat, avg } = satAvg(r, g, b);
            if (avg <= 50 && sat <= 30) black += 1;
            else if (avg >= 210 && sat <= 30) white += 1;
            else other += 1;
        }
    }
    // 品红优先：只要边缘品红明显多于黑/白就走品红键
    if (magenta > black && magenta > white && magenta > other * 0.35) return "magenta";
    if (white > black * 1.2 && white > other && white > magenta) return "white";
    return "black";
}

function isMagentaPlate(r, g, b, loose) {
    return isMagenta(r, g, b, loose ? 90 : 54);
}

/** 脚下阴影/地面盘（含薄荷绿椭圆）。绝不当主体核；不把黑衣/黑羽当影。 */
function isFootShadowColor(r, g, b, loose) {
    const avg = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const gDom = g - Math.max(r, b);
    if (loose) {
        // 薄荷绿 / 灰绿盘（要有一点绿偏，避免炭灰身体）
        if (gDom >= 3 && avg >= 40 && avg <= 200 && sat <= 90 && g < 220) return true;
        // 深灰地面垫：略亮于纯黑衣，且不能太像平涂黑羽
        if (avg >= 32 && avg <= 100 && sat <= 28 && gDom >= 0 && gDom <= 14) return true;
        return false;
    }
    return gDom >= 4 && avg >= 50 && avg <= 185 && sat <= 70 && r >= 30 && b >= 25 && g < 210;
}

/** 彩色/结构主体（皮肤、花纹、道具）。脚下绿影、品红棚底不算。纯黑不算（要靠膨胀进核）。 */
function isChromaCore(r, g, b) {
    if (isFootShadowColor(r, g, b, true)) return false;
    // 品红/热粉棚底绝不当主体（否则整片品红进核，抠不动）
    if (isMagenta(r, g, b, 70)) return false;
    const { sat, avg } = satAvg(r, g, b);
    // 纯黑/近黑底板色不当种子，否则整片黑底都会变核
    if (avg <= 40 && sat <= 25) return false;
    if (sat >= 18) return true;
    if (avg >= 145 && avg <= 250 && sat >= 5 && (r - b) >= 3) return true;
    if (avg >= 35 && avg <= 170 && sat >= 12 && r >= g && r >= b) return true;
    // 浅灰描边 / 米白面料也可作种子
    if (avg >= 160 && sat <= 40) return true;
    return false;
}

/** 可当作「衣服面料」扩进核：黑衣、白衣、灰描边（非脚下绿影/品红棚）。 */
function isFabricForCore(r, g, b) {
    if (isFootShadowColor(r, g, b, true)) return false;
    if (isMagenta(r, g, b, 70)) return false;
    const { sat, avg } = satAvg(r, g, b);
    // 黑/深灰面料（高领、黑裤、黑毛）
    if (avg <= 95 && sat <= 45) return true;
    // 白/浅灰面料
    if (avg >= 170 && sat <= 45) return true;
    // 中灰描边
    if (sat <= 35 && avg >= 90 && avg <= 180) return true;
    return false;
}

/**
 * 主体核（双层深色）：
 * - 彩色/浅色 = 种子
 * - 纯黑 (avg≤18)：从种子短距灌入 → 黑高领/黑衣（贴黑底也能护）
 * - 脏灰 (18–34)：永不进核 → 生图脏雾/深灰棚，靠边缘洪水清
 * - 炭灰 (34–55)：中距灌入 → warmup 黑鸡等
 * - 白/浅灰面料：长距灌入
 */
function buildCoreMask(img, dilate = 6) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    const mask = new Uint8Array(n);
    const dist = new Uint16Array(n);
    dist.fill(0xffff);
    const q = new Int32Array(n * 2);
    let head = 0;
    let tail = 0;

    const MAX_HARD_BLACK = 34; // 纯黑衣/袖/鞋（大面积黑衫需要更长）
    const MAX_CHARCOAL = 92; // 炭灰羽
    const MAX_FABRIC = 120;

    function push(i, d) {
        if (d >= dist[i]) return;
        dist[i] = d;
        mask[i] = 1;
        q[tail++] = i;
        q[tail++] = d;
    }

    for (let i = 0; i < n; i++) {
        const p = i * 4;
        if (data[p + 3] < 10) continue;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        if (isFootShadowColor(r, g, b, true)) continue;
        if (isMagenta(r, g, b, 70)) continue; // 品红棚绝不当种子
        if (isChromaCore(r, g, b)) {
            push(i, 0);
            continue;
        }
        const { sat, avg } = satAvg(r, g, b);
        if (avg >= 100 && sat <= 50) push(i, 0); // 白/浅灰种子
        else if (avg >= 75 && sat >= 16 && sat <= 140) push(i, 0); // 排除超高饱和品红
    }

    while (head < tail) {
        const i = q[head++];
        const d0 = q[head++];
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            const p = ni * 4;
            if (data[p + 3] < 10) continue;
            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];
            if (isFootShadowColor(r, g, b, true)) continue;
            if (isMagenta(r, g, b, 70)) continue; // 不向品红棚膨胀

            const { sat, avg } = satAvg(r, g, b);
            let maxD;
            if (isChromaCore(r, g, b) || (avg >= 100 && sat <= 50)) {
                maxD = MAX_FABRIC;
            } else if (avg <= 18 && sat <= 22) {
                // 纯黑衣/描边
                maxD = MAX_HARD_BLACK;
            } else if (avg <= 34 && sat <= 26) {
                // 脏灰棚雾：跳过，不进核
                continue;
            } else if (avg <= 56 && sat <= 36) {
                maxD = MAX_CHARCOAL;
            } else if (isFabricForCore(r, g, b)) {
                maxD = MAX_FABRIC;
            } else {
                continue;
            }
            const nd = d0 + 1;
            if (nd > maxD) continue;
            if (avg <= 18 && sat <= 22 && nd > MAX_HARD_BLACK) continue;
            push(ni, nd);
        }
    }

    // 浅色描边扩几圈，不进纯黑/脏灰/品红
    let m = mask;
    for (let pass = 0; pass < Math.min(4, dilate); pass++) {
        const next = Uint8Array.from(m);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (m[i]) continue;
                const p = i * 4;
                if (data[p + 3] < 10) continue;
                const r = data[p];
                const g = data[p + 1];
                const b = data[p + 2];
                if (isFootShadowColor(r, g, b, true)) continue;
                if (isMagenta(r, g, b, 70)) continue;
                const { sat, avg } = satAvg(r, g, b);
                if (avg <= 40 && sat <= 28) continue;
                if (!isFabricForCore(r, g, b) && !isChromaCore(r, g, b)) continue;
                let hit = false;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (m[ny * w + nx]) {
                        hit = true;
                        break;
                    }
                }
                if (hit) next[i] = 1;
            }
        }
        m = next;
    }
    return m;
}

function isBlackPlate(r, g, b, loose) {
    const { sat, avg } = satAvg(r, g, b);
    // 含脏灰雾。黑衣靠 core；loose 略宽清脏边，勿到 40（会啃炭灰羽边缘）
    if (loose) return avg <= 34 && sat <= 22;
    return avg <= 28 && sat <= 20;
}

/** 生图脏深灰雾（avg~35-58），比黑衣略亮；必须带核保护，只清边缘连通块。 */
function isDirtyGrayPlate(r, g, b, loose) {
    const { sat, avg } = satAvg(r, g, b);
    const rb = Math.abs(r - b);
    const rg = Math.abs(r - g);
    const gb = Math.abs(g - b);
    // 低饱和中性灰，排除偏色衣服
    if (rb > 14 || rg > 14 || gb > 14) return false;
    if (loose) return avg >= 28 && avg <= 62 && sat <= 28;
    return avg >= 30 && avg <= 52 && sat <= 22;
}

function isWhitePlate(r, g, b, loose) {
    const { sat, avg } = satAvg(r, g, b);
    if (loose) return avg >= 220 && sat <= 22 && Math.abs(r - b) <= 16;
    return avg >= 236 && sat <= 14 && Math.abs(r - b) <= 12;
}

/** 边缘洪水：只清 test() 为真的像素，遇 core 停。 */
function floodBy(img, core, testSeed, testLoose, haloPasses = 2) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let cleared = 0;

    function push(x, y, loose) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i] || (core && core[i])) return;
        const d = i * 4;
        if (data[d + 3] < 8) {
            seen[i] = 1;
            return;
        }
        const ok = loose ? testLoose(data[d], data[d + 1], data[d + 2])
            : testSeed(data[d], data[d + 1], data[d + 2]);
        if (!ok) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    const band = Math.max(2, Math.floor(Math.min(w, h) * 0.035));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x >= band && y >= band && x < w - band && y < h - band) continue;
            push(x, y, false);
        }
    }
    while (head < tail) {
        const i = queue[head++];
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, true);
    }

    for (let pass = 0; pass < haloPasses; pass++) {
        const halo = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (core && core[i]) continue;
                const d = i * 4;
                if (data[d + 3] < 8) continue;
                if (!testLoose(data[d], data[d + 1], data[d + 2])) continue;
                let edge = false;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] < 8) {
                        edge = true;
                        break;
                    }
                }
                if (edge) halo.push(i);
            }
        }
        if (!halo.length) break;
        for (const i of halo) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/**
 * 脚下阴影：下半区域凡是阴影色都抠，不依赖先透明。
 * 高饱和绿衣服（核内）不碰；低饱和薄荷绿盘 / 深灰垫全清。
 */
function floodFootShadow(img, core) {
    const { width: w, height: h, data } = img;
    const y0 = Math.floor(h * 0.48);
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let cleared = 0;

    function push(x, y, loose) {
        if (x < 0 || y < y0 - 4 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i]) return;
        const d = i * 4;
        if (data[d + 3] < 8) return;
        const r = data[d];
        const g = data[d + 1];
        const b = data[d + 2];
        // 核内：只有「像阴影盘」才抠；高饱和绿袍留下
        if (core && core[i]) {
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            if (sat >= 48) return;
            if (!isFootShadowColor(r, g, b, false)) return;
        } else if (!isFootShadowColor(r, g, b, loose)) {
            return;
        }
        seen[i] = 1;
        queue[tail++] = i;
    }

    // 种子：下半所有阴影色 + 贴透明邻域 + 底边
    for (let y = y0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const d = (y * w + x) * 4;
            if (data[d + 3] < 8) {
                for (const [dx, dy] of DIRS) push(x + dx, y + dy, true);
                continue;
            }
            if (isFootShadowColor(data[d], data[d + 1], data[d + 2], true)) {
                push(x, y, true);
            }
        }
    }
    for (let x = 0; x < w; x++) push(x, h - 1, false);

    while (head < tail) {
        const i = queue[head++];
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        const x = i % w;
        const y = (i - x) / w;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, true);
    }
    return cleared;
}

/**
 * 清脚下残留垫：黑/深灰盘 + 浅绿盘边留下的浅灰/白细条。
 * 只动下半、不进彩色核；独立岛或贴透明的细条清掉。
 */
function clearDarkFloorPads(img, core) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    const y0 = Math.floor(h * 0.50);
    let cleared = 0;

    function isFloorPad(r, g, b) {
        const { sat, avg } = satAvg(r, g, b);
        const gDom = g - Math.max(r, b);
        // 浅绿/薄荷残边（主目标）
        if (gDom >= 2 && avg >= 40 && avg <= 200 && sat <= 85 && g < 220) return true;
        // 浅灰/脏白细条（阴影盘边缘）
        if (avg >= 120 && avg <= 245 && sat <= 28 && Math.abs(r - b) <= 18) return true;
        // 深色垫：要有绿偏或明显灰垫，不认平涂黑衣/黑羽
        if (avg >= 32 && avg <= 70 && sat <= 36 && gDom >= 2) return true;
        return false;
    }

    for (let i = 0; i < n; i++) {
        if (seen[i] || data[i * 4 + 3] < 10) continue;
        const y = (i / w) | 0;
        if (y < y0) {
            seen[i] = 1;
            continue;
        }
        if (core && core[i]) {
            seen[i] = 1;
            continue;
        }
        const d = i * 4;
        if (!isFloorPad(data[d], data[d + 1], data[d + 2])) continue;

        let head = 0;
        let tail = 0;
        queue[tail++] = i;
        seen[i] = 1;
        const cells = [];
        let touchCore = false;
        let touchBorder = false;
        let touchClear = false;
        while (head < tail) {
            const c = queue[head++];
            cells.push(c);
            const cx = c % w;
            const cy = (c - cx) / w;
            if (cx <= 1 || cy <= 1 || cx >= w - 2 || cy >= h - 2) touchBorder = true;
            for (const [dx, dy] of DIRS) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                if (data[ni * 4 + 3] < 8) touchClear = true;
                if (core && core[ni]) touchCore = true;
                if (seen[ni] || data[ni * 4 + 3] < 10) continue;
                const nd = ni * 4;
                if (!isFloorPad(data[nd], data[nd + 1], data[nd + 2])) continue;
                if (core && core[ni]) {
                    touchCore = true;
                    continue;
                }
                seen[ni] = 1;
                queue[tail++] = ni;
            }
        }
        const maxPad = Math.floor(w * h * 0.10);
        if (cells.length > maxPad) continue;
        // 贴核的大块黑描边留下；细条/贴透明/贴底边清掉
        if (touchCore && !touchBorder && !touchClear && cells.length > 60) continue;
        for (const c of cells) {
            data.fill(0, c * 4, c * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/**
 * 脚底贴地细线：下 18% 区域、贴透明的低饱和细残边（白线/灰线/绿边）。
 * 不进彩色核，避免啃脚爪。
 */
function clearFootFringe(img, core) {
    const { width: w, height: h, data } = img;
    const y0 = Math.floor(h * 0.78);
    let cleared = 0;
    for (let pass = 0; pass < 3; pass++) {
        const kill = [];
        for (let y = y0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (core && core[i]) continue;
                const d = i * 4;
                if (data[d + 3] < 8) continue;
                let touch = false;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] < 8) {
                        touch = true;
                        break;
                    }
                }
                if (!touch) continue;
                const r = data[d];
                const g = data[d + 1];
                const b = data[d + 2];
                if (isChromaCore(r, g, b)) continue;
                const { sat, avg } = satAvg(r, g, b);
                const gDom = g - Math.max(r, b);
                const pad = avg <= 60 && sat <= 40
                    || (gDom >= 2 && sat <= 80 && avg <= 200)
                    || (sat <= 30 && avg >= 100);
                if (pad) kill.push(i);
            }
        }
        if (!kill.length) break;
        for (const i of kill) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/**
 * 清「不贴任何彩色/浅色主体」的深色棚残块。
 * 黑高领贴黄脖/白外套会 touchSubject，保留；孤立深灰雾/底板岛清掉。
 */
function clearOrphanDarkPlate(img) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    let cleared = 0;

    function isDarkBlob(r, g, b) {
        const { sat, avg } = satAvg(r, g, b);
        return avg <= 48 && sat <= 28;
    }

    function isSubjectNeighbor(r, g, b) {
        if (isChromaCore(r, g, b)) return true;
        const { sat, avg } = satAvg(r, g, b);
        // 白袍/浅灰/肤色/羽毛
        if (avg >= 70) return true;
        if (sat >= 25) return true;
        return false;
    }

    for (let i = 0; i < n; i++) {
        if (seen[i] || data[i * 4 + 3] < 10) continue;
        const d0 = i * 4;
        if (!isDarkBlob(data[d0], data[d0 + 1], data[d0 + 2])) {
            seen[i] = 1;
            continue;
        }

        let head = 0;
        let tail = 0;
        queue[tail++] = i;
        seen[i] = 1;
        const cells = [];
        let touchSubject = false;
        while (head < tail) {
            const c = queue[head++];
            cells.push(c);
            const x = c % w;
            const y = (c - x) / w;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                const nd = ni * 4;
                if (data[nd + 3] < 10) continue;
                const r = data[nd];
                const g = data[nd + 1];
                const b = data[nd + 2];
                if (isSubjectNeighbor(r, g, b)) {
                    touchSubject = true;
                    continue;
                }
                if (seen[ni]) continue;
                if (!isDarkBlob(r, g, b)) continue;
                seen[ni] = 1;
                queue[tail++] = ni;
            }
        }
        if (touchSubject) continue;
        // 不贴主体的深色块 = 棚残/脏雾
        for (const c of cells) {
            data.fill(0, c * 4, c * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/** 去掉飞点：只丢面积 < 主块 2% 且 < 120px 的碎岛（脚/道具可能短暂分离时放宽）。 */
function dropDustIslands(img) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    const comps = [];
    for (let i = 0; i < n; i++) {
        if (seen[i] || data[i * 4 + 3] < 10) continue;
        let head = 0;
        let tail = 0;
        queue[tail++] = i;
        seen[i] = 1;
        const cells = [];
        while (head < tail) {
            const c = queue[head++];
            cells.push(c);
            const x = c % w;
            const y = (c - x) / w;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                if (seen[ni] || data[ni * 4 + 3] < 10) continue;
                seen[ni] = 1;
                queue[tail++] = ni;
            }
        }
        comps.push(cells);
    }
    if (comps.length <= 1) return 0;
    comps.sort((a, b) => b.length - a.length);
    const main = comps[0].length;
    const minKeep = Math.max(120, Math.floor(main * 0.02));
    let cleared = 0;
    for (let k = 1; k < comps.length; k++) {
        if (comps[k].length >= minKeep) continue;
        for (const i of comps[k]) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/** 贴透明的底板脏边：只清明显棚色，不啃描边。 */
function despillFringe(img, mode) {
    const { width: w, height: h, data } = img;
    let cleared = 0;
    for (let pass = 0; pass < 2; pass++) {
        const kill = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const d = (y * w + x) * 4;
                if (data[d + 3] < 8) continue;
                let touch = false;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] < 8) {
                        touch = true;
                        break;
                    }
                }
                if (!touch) continue;
                const r = data[d];
                const g = data[d + 1];
                const b = data[d + 2];
                let plate = false;
                if (mode === "magenta") plate = isMagentaPlate(r, g, b, true);
                else if (mode === "white") plate = isWhitePlate(r, g, b, true);
                else {
                    // 黑棚 despill：只清近纯黑/脚下影，不啃炭灰衣
                    plate = isBlackPlate(r, g, b, true) || isFootShadowColor(r, g, b, false);
                }
                // 有颜色的描边、面料核色留下
                if (isChromaCore(r, g, b) || isFabricForCore(r, g, b)) continue;
                if (plate) kill.push(y * w + x);
            }
        }
        if (!kill.length) break;
        for (const i of kill) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/**
 * 角色序列帧抠底：
 * - 品红棚（推荐）：抠品红，黑衣/白袍都安全
 * - 黑棚：只抠边缘连通黑底 + 主体核保护黑衣（易伤，尽量别用）
 * - 白棚：白键 + 主体核
 * - 脚下绿盘、飞点、脏边、内部小洞
 */
function knockCharacterCell(img) {
    let cleared = 0;
    const mode = detectPlateMode(img);
    const core = buildCoreMask(img, 10);

    if (mode === "magenta") {
        cleared += floodBy(
            img,
            core,
            (r, g, b) => isMagentaPlate(r, g, b, false),
            (r, g, b) => isMagentaPlate(r, g, b, true),
            3
        );
        // 品红棚常见黑格线/脏黑边：清边缘连通黑，停在核（护黑衣）
        cleared += floodBy(img, core, isBlackPlate, (r, g, b) => isBlackPlate(r, g, b, true), 2);
        // 热粉变体（R高 B略低）再扫一遍宽松品红
        cleared += floodBy(
            img,
            core,
            (r, g, b) => isMagenta(r, g, b, 40),
            (r, g, b) => isMagenta(r, g, b, 90),
            2
        );
        // 夹在肢体里的品红孤岛（洪水从边够不着）：非核品红直接清
        {
            const { width: w, height: h, data } = img;
            for (let i = 0; i < w * h; i++) {
                if (core[i]) continue;
                const d = i * 4;
                if (data[d + 3] < 8) continue;
                if (isMagenta(data[d], data[d + 1], data[d + 2], 90)) {
                    data.fill(0, d, d + 4);
                    cleared += 1;
                }
            }
        }
    } else if (mode === "white") {
        cleared += floodBy(img, core, isWhitePlate, (r, g, b) => isWhitePlate(r, g, b, true), 2);
        cleared += floodBy(img, core, isBlackPlate, (r, g, b) => isBlackPlate(r, g, b, true), 1);
    } else {
        // 黑棚：先清近黑底，再清脏深灰雾；全程停在 core（护黑衣/黑羽）
        cleared += floodBy(img, core, isBlackPlate, (r, g, b) => isBlackPlate(r, g, b, true), 1);
        cleared += floodBy(
            img,
            core,
            (r, g, b) => isDirtyGrayPlate(r, g, b, false),
            (r, g, b) => isDirtyGrayPlate(r, g, b, true),
            1
        );
    }
    cleared += floodFootShadow(img, core);
    cleared += clearDarkFloorPads(img, core);
    // 格线：最外 2px；品红底也清品红格线
    {
        const { width: w, height: h, data } = img;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (x >= 2 && y >= 2 && x < w - 2 && y < h - 2) continue;
                const i = y * w + x;
                if (core[i]) continue;
                const d = i * 4;
                if (data[d + 3] < 8) continue;
                const r = data[d];
                const g = data[d + 1];
                const b = data[d + 2];
                if (isMagentaPlate(r, g, b, true)) {
                    data.fill(0, d, d + 4);
                    cleared += 1;
                    continue;
                }
                const { sat, avg } = satAvg(r, g, b);
                // 黑棚才清外圈脏黑；品红棚不在外圈狂清黑色（会啃黑描边）
                if (mode === "black" && sat <= 24 && avg <= 40) {
                    data.fill(0, d, d + 4);
                    cleared += 1;
                } else if (sat <= 24 && avg >= 200) {
                    data.fill(0, d, d + 4);
                    cleared += 1;
                }
            }
        }
    }
    cleared += dropDustIslands(img);
    cleared += floodFootShadow(img, core);
    cleared += clearDarkFloorPads(img, core);
    if (mode !== "magenta") cleared += clearFootFringe(img, core);
    // 黑/深灰棚残岛：不贴彩色像素的连通块清掉（黑衣贴黄脸/白袍会留下）
    if (mode === "black") cleared += clearOrphanDarkPlate(img);
    fillInteriorHoles(img, 2500);
    cleared += despillFringe(img, mode);
    if (mode === "magenta") {
        // 品红溢色：贴透明的品红边再清一圈
        const { width: w, height: h, data } = img;
        for (let pass = 0; pass < 2; pass++) {
            const kill = [];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (core[i]) continue;
                    const d = i * 4;
                    if (data[d + 3] < 8) continue;
                    if (!isMagentaPlate(data[d], data[d + 1], data[d + 2], true)) continue;
                    let touch = false;
                    for (const [dx, dy] of DIRS) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] < 8) {
                            touch = true;
                            break;
                        }
                    }
                    if (touch) kill.push(i);
                }
            }
            if (!kill.length) break;
            for (const i of kill) {
                data.fill(0, i * 4, i * 4 + 4);
                cleared += 1;
            }
        }
    }
    return cleared;
}

/**
 * 清掉环/星等闭合图形内部残留的棋盘格（边缘洪水够不着的洞）。
 * 只清低饱和浅灰，且连通块够大或贴边，避免吃掉小高光。
 */
function knockInteriorChecker(img) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let cleared = 0;

    function isChecker(r, g, b) {
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const avg = (r + g + b) / 3;
        return sat <= 18 && avg >= 200 && avg <= 248;
    }

    function flood(sx, sy) {
        const start = sy * w + sx;
        if (seen[start]) return 0;
        const d0 = start * 4;
        if (data[d0 + 3] < 8 || !isChecker(data[d0], data[d0 + 1], data[d0 + 2])) return 0;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        seen[start] = 1;
        const cells = [];
        while (head < tail) {
            const i = queue[head++];
            cells.push(i);
            const x = i % w;
            const y = (i - x) / w;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                if (seen[ni]) continue;
                const d = ni * 4;
                if (data[d + 3] < 8) continue;
                if (!isChecker(data[d], data[d + 1], data[d + 2])) continue;
                seen[ni] = 1;
                queue[tail++] = ni;
            }
        }
        let border = false;
        for (const i of cells) {
            const x = i % w;
            const y = (i - x) / w;
            if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) {
                border = true;
                break;
            }
        }
        if (!border && cells.length < 80) return 0;
        for (const i of cells) data.fill(0, i * 4, i * 4 + 4);
        return cells.length;
    }

    for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) cleared += flood(x, y);
    }
    return cleared;
}

/** 原地抠底，返回被清掉的像素数。 */
function knock(img, avgMin = 232) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    function push(x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i]) return;
        const d = i * 4;
        if (!isBackdrop(data[d], data[d + 1], data[d + 2], avgMin)) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    for (let x = 0; x < w; x++) {
        push(x, 0);
        push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
        push(0, y);
        push(w - 1, y);
    }

    let cleared = 0;
    while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy);
    }

    for (let pass = 0; pass < 3; pass++) {
        const halo = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const d = i * 4;
                if (data[d + 3] === 0) continue;
                if (!isBackdrop(data[d], data[d + 1], data[d + 2], 220)) continue;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (data[(ny * w + nx) * 4 + 3] === 0) {
                        halo.push(i);
                        break;
                    }
                }
            }
        }
        if (!halo.length) break;
        for (const i of halo) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

function main() {
    const args = process.argv.slice(2);
    let chroma = "";
    let pad = 0;
    const files = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--magenta") chroma = "magenta";
        else if (a === "--via-magenta") chroma = "via-magenta";
        else if (a === "--character" || a === "--strike") chroma = "character";
        else if (a === "--checker" || a === "--fx") chroma = "checker";
        else if (a === "--chroma") chroma = String(args[++i] || "magenta");
        else if (a.startsWith("--chroma=")) chroma = a.slice(9);
        else if (a === "--trim") pad = Number(args[++i] || 16);
        else if (a.startsWith("--trim=")) pad = Number(a.slice(7));
        else files.push(a);
    }
    if (!files.length) {
        console.error("用法: node tools/art/knock-alpha.cjs [--chroma magenta|via-magenta|character|checker] [--trim 16] <png...>");
        process.exit(1);
    }
    for (const file of files) {
        let img = png.decode(file);
        const total = img.width * img.height;
        const base = path.basename(file, path.extname(file));
        let cleared;
        if (chroma === "checker" || chroma === "fx") {
            cleared = keyCheckerboard(img, optsForName(base));
        } else if (chroma === "character" || chroma === "strike") {
            cleared = knockCharacterCell(img);
        } else if (chroma === "via-magenta") {
            cleared = knockWhiteViaMagenta(img);
            cleared += knockInteriorChecker(img);
        } else if (chroma === "magenta") {
            cleared = knockMagenta(img);
        } else {
            cleared = knock(img);
        }
        if (pad > 0) {
            const trimmed = png.trim(img, pad);
            if (trimmed) img = trimmed;
        }
        png.encode(file, img);
        console.log(`${path.basename(file)}\t清除 ${cleared}/${total} (${(100 * cleared / total).toFixed(1)}%)  → ${img.width}x${img.height}`);
    }
}

module.exports = {
    knock,
    knockMagenta,
    whiteToMagenta,
    knockWhiteViaMagenta,
    knockInteriorChecker,
    knockBlack,
    knockGroundShadow,
    knockCharacterCell,
    fillInteriorHoles,
    keyCheckerboard
};

if (require.main === module) main();
