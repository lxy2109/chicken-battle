/**
 * 对已入库的 anim 序列帧就地重抠（每格 knockCharacterCell）。
 * 用于旧表抠脏、或算法升级后批量回炉。有 raw 的优先走 import-strike-gen。
 *
 * 用法:
 *   node tools/art/reknock-anim.cjs
 *   node tools/art/reknock-anim.cjs set_rookie
 *   node tools/art/reknock-anim.cjs set_rookie idle
 */
const fs = require("fs");
const path = require("path");
const png = require("./png.cjs");
const { knockCharacterCell } = require("./knock-alpha.cjs");

const ROOT = path.resolve(__dirname, "../..");
const ANIM = path.join(ROOT, "assets/bundle/game/image/anim");
const CELL = 256;
const COLS = 4;
const FRAMES = 16;

function reknockSheet(file) {
    const img = png.decode(file);
    if (img.width !== 1024 || img.height !== 1024) {
        console.warn("skip size", path.relative(ROOT, file), img.width + "x" + img.height);
        return false;
    }
    let cleared = 0;
    for (let i = 0; i < FRAMES; i++) {
        const col = i % COLS;
        const row = (i / COLS) | 0;
        const x0 = col * CELL;
        const y0 = row * CELL;
        const cell = png.crop(img, x0, y0, CELL, CELL);
        cleared += knockCharacterCell(cell);
        for (let y = 0; y < CELL; y++) {
            cell.data.copy(
                img.data,
                ((y0 + y) * img.width + x0) * 4,
                y * CELL * 4,
                (y + 1) * CELL * 4
            );
        }
    }
    png.encode(file, img);
    console.log(path.relative(ROOT, file).replace(/\\/g, "/"), "cleared~", cleared);
    return true;
}

function main() {
    const [onlyKey, onlyStyle] = process.argv.slice(2);
    if (!fs.existsSync(ANIM)) {
        console.error("no anim dir");
        process.exit(1);
    }
    let n = 0;
    for (const key of fs.readdirSync(ANIM)) {
        const dir = path.join(ANIM, key);
        if (!fs.statSync(dir).isDirectory()) continue;
        if (onlyKey && key !== onlyKey) continue;
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith(".png")) continue;
            const style = f.slice(0, -4);
            if (onlyStyle && style !== onlyStyle) continue;
            if (reknockSheet(path.join(dir, f))) n += 1;
        }
    }
    console.log("reknocked", n, "sheets");
}

if (require.main === module) main();
module.exports = { reknockSheet };
