/**
 * 把一张网格排布的图标大图切成独立 PNG。
 * 生图按「均匀网格 + 白底」出稿，这里等分裁格后各自抠底再收紧包围盒。
 *
 * 用法: node tools/slice-sheet.cjs <sheet.png> <cols> <rows> <outDir> <name1,name2,...>
 */
const fs = require("fs");
const path = require("path");
const png = require("./png.cjs");
const { knock } = require("./knock-alpha.cjs");

function main() {
    const [sheet, colsArg, rowsArg, outDir, nameArg] = process.argv.slice(2);
    if (!sheet || !colsArg || !rowsArg || !outDir || !nameArg) {
        console.error("用法: node tools/slice-sheet.cjs <sheet.png> <cols> <rows> <outDir> <name1,name2,...>");
        process.exit(1);
    }
    const cols = Number(colsArg);
    const rows = Number(rowsArg);
    const names = nameArg.split(",").map(s => s.trim()).filter(Boolean);
    if (names.length !== cols * rows) {
        console.error(`名字数量 ${names.length} 与格数 ${cols * rows} 不一致`);
        process.exit(1);
    }

    const img = png.decode(sheet);
    knock(img);
    const cw = Math.floor(img.width / cols);
    const chh = Math.floor(img.height / rows);
    fs.mkdirSync(outDir, { recursive: true });

    let empty = 0;
    names.forEach((name, i) => {
        const cx = (i % cols) * cw;
        const cy = Math.floor(i / cols) * chh;
        const cell = png.trim(png.crop(img, cx, cy, cw, chh), 2);
        if (!cell) {
            console.error(`第 ${i + 1} 格 (${name}) 抠完是空的，检查生图是否越格`);
            empty += 1;
            return;
        }
        const dest = path.join(outDir, name + ".png");
        png.encode(dest, cell);
        console.log(`${name}.png\t${cell.width}x${cell.height}`);
    });
    if (empty) process.exit(1);
}

main();
