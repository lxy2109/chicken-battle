/**
 * 把生图产出的假透明棋盘格 / 纯白底抠成真 Alpha。
 * 只从画面边缘洪水填充，避免挖掉白眼珠这类内部浅色区域。
 * 取代原 knock-alpha.py（开发机无 Python）。
 */
const path = require("path");
const png = require("./png.cjs");

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

    // 洪水填充后残留的一圈浅色描边毛刺，再剥三层。
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
        else if (a === "--chroma") chroma = String(args[++i] || "magenta");
        else if (a.startsWith("--chroma=")) chroma = a.slice(9);
        else if (a === "--trim") pad = Number(args[++i] || 16);
        else if (a.startsWith("--trim=")) pad = Number(a.slice(7));
        else files.push(a);
    }
    if (!files.length) {
        console.error("用法: node tools/knock-alpha.cjs [--chroma magenta] [--trim 16] <png...>");
        process.exit(1);
    }
    for (const file of files) {
        let img = png.decode(file);
        const total = img.width * img.height;
        const cleared = chroma === "magenta" ? knockMagenta(img) : knock(img);
        if (pad > 0) {
            const trimmed = png.trim(img, pad);
            if (trimmed) img = trimmed;
        }
        png.encode(file, img);
        console.log(`${path.basename(file)}\t清除 ${cleared}/${total} (${(100 * cleared / total).toFixed(1)}%)  → ${img.width}x${img.height}`);
    }
}

module.exports = { knock, knockMagenta };

if (require.main === module) main();
