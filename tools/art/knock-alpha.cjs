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
        if (!isMagenta(data[d], data[d + 1], data[d + 2], loose ? tol + 28 : tol)) return;
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
    return sat <= 16 && avg >= 228;
}

function isNearWhite(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    return sat <= 20 && avg >= 215;
}

function isBorderGrid(r, g, b) {
    const { sat, avg } = satAvg(r, g, b);
    return sat <= 24 && avg < 228;
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
 * 把边缘连通的白底涂成 #FF00FF，不改角色内部浅色。
 * 4×4 深色格子线只清最外一圈，避免吃到轮廓线。
 */
function whiteToMagenta(img) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let painted = 0;

    function push(x, y, test) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i]) return;
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
    const band = Math.max(8, Math.floor(Math.min(w, h) * 0.1));
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

    for (let pass = 0; pass < 2; pass++) {
        const extra = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const d = i * 4;
                if (data[d + 3] === 0 || seen[i]) continue;
                if (!isNearWhite(data[d], data[d + 1], data[d + 2])) continue;
                let nextToMagenta = false;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const nd = (ny * w + nx) * 4;
                    if (isKeyedMagenta(data[nd], data[nd + 1], data[nd + 2])) {
                        nextToMagenta = true;
                        break;
                    }
                }
                if (nextToMagenta) extra.push(i);
            }
        }
        if (!extra.length) break;
        for (const i of extra) {
            seen[i] = 1;
            paintMagenta(data, i * 4);
            painted += 1;
        }
    }

    const gridDepth = Math.min(6, Math.max(2, Math.floor(Math.min(w, h) * 0.025)));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x >= gridDepth && y >= gridDepth && x < w - gridDepth && y < h - gridDepth) continue;
            const i = y * w + x;
            const d = i * 4;
            if (data[d + 3] === 0 || seen[i]) continue;
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
    let cleared = 0;
    for (let i = 0; i < w * h; i++) {
        const d = i * 4;
        if (data[d + 3] === 0) continue;
        if (!isKeyedMagenta(data[d], data[d + 1], data[d + 2])) continue;
        data.fill(0, d, d + 4);
        cleared += 1;
    }
    for (let pass = 0; pass < 2; pass++) {
        const halo = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const d = i * 4;
                if (data[d + 3] === 0) continue;
                const r = data[d];
                const g = data[d + 1];
                const b = data[d + 2];
                if (!(g < 110 && r > 160 && b > 160 && (r - g) > 60 && (b - g) > 60)) continue;
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
        if (!halo.length) break;
        for (const i of halo) {
            data.fill(0, i * 4, i * 4 + 4);
            cleared += 1;
        }
    }
    return cleared;
}

/** 白底 → 品红 → 抠品红。角色身上的白/米黄不会被当成底。 */
function knockWhiteViaMagenta(img) {
    whiteToMagenta(img);
    return knockKeyedMagentaPixels(img);
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
        else if (a === "--checker" || a === "--fx") chroma = "checker";
        else if (a === "--chroma") chroma = String(args[++i] || "magenta");
        else if (a.startsWith("--chroma=")) chroma = a.slice(9);
        else if (a === "--trim") pad = Number(args[++i] || 16);
        else if (a.startsWith("--trim=")) pad = Number(a.slice(7));
        else files.push(a);
    }
    if (!files.length) {
        console.error("用法: node tools/art/knock-alpha.cjs [--chroma magenta|via-magenta|checker] [--trim 16] <png...>");
        process.exit(1);
    }
    for (const file of files) {
        let img = png.decode(file);
        const total = img.width * img.height;
        const base = path.basename(file, path.extname(file));
        let cleared;
        if (chroma === "checker" || chroma === "fx") {
            cleared = keyCheckerboard(img, optsForName(base));
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

module.exports = { knock, knockMagenta, whiteToMagenta, knockWhiteViaMagenta, knockInteriorChecker, keyCheckerboard };

if (require.main === module) main();
