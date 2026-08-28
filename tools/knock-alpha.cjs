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
    const files = process.argv.slice(2);
    if (!files.length) {
        console.error("用法: node tools/knock-alpha.cjs <png...>");
        process.exit(1);
    }
    for (const file of files) {
        const img = png.decode(file);
        const cleared = knock(img);
        png.encode(file, img);
        const total = img.width * img.height;
        console.log(`${path.basename(file)}\t清除 ${cleared}/${total} (${(100 * cleared / total).toFixed(1)}%)`);
    }
}

module.exports = { knock };

if (require.main === module) main();
