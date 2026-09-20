/**
 * 把生图的 4×4 或横向条整理成 1024×1024、16 帧（每格 256×256）。
 * 生图本身就是 1024 的 4×4，不再压成 64，战斗里才不会糊。
 *
 * style 为 idle / peck / jump / dive / leap / charge / tail / combo / feint，
 * 以及后续 Boss/套装普攻 attack。
 *
 * 用法:
 *   node tools/import-strike-gen.cjs <src.png> <charKey> <style>
 *   node tools/import-strike-gen.cjs --dir temp/strike-gen/raw
 *     （目录里文件名 charKey.style.png）
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");
const { knockWhiteViaMagenta } = require("../art/knock-alpha.cjs");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "assets/bundle/game/image/anim");
const SHEET_W = 1024;
const SHEET_H = 1024;
const FRAMES = 16;
const COLS = 4;
const CELL = 256;
const PAD = 12;

function uuidFor(seed) {
    const h = crypto.createHash("md5").update("chicken-strike:" + seed).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function dirMeta(uuid) {
    return {
        ver: "1.2.0",
        importer: "directory",
        imported: true,
        uuid,
        files: [],
        subMetas: {},
        userData: {}
    };
}

function spriteMeta(uuid, name, w, h) {
    const hw = w / 2;
    const hh = h / 2;
    return {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid,
        files: [".json", ".png"],
        subMetas: {
            "6c48a": {
                importer: "texture",
                uuid: uuid + "@6c48a",
                displayName: name,
                id: "6c48a",
                name: "texture",
                ver: "1.0.22",
                imported: true,
                files: [".json"],
                subMetas: {},
                userData: {
                    wrapModeS: "clamp-to-edge",
                    wrapModeT: "clamp-to-edge",
                    minfilter: "linear",
                    magfilter: "linear",
                    mipfilter: "none",
                    premultiplyAlpha: false,
                    anisotropy: 1,
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid,
                    visible: false
                }
            },
            f9941: {
                importer: "sprite-frame",
                uuid: uuid + "@f9941",
                displayName: name,
                id: "f9941",
                name: "spriteFrame",
                ver: "1.0.12",
                imported: true,
                files: [".json"],
                subMetas: {},
                userData: {
                    trimType: "none",
                    trimThreshold: 1,
                    rotated: false,
                    offsetX: 0,
                    offsetY: 0,
                    trimX: 0,
                    trimY: 0,
                    width: w,
                    height: h,
                    rawWidth: w,
                    rawHeight: h,
                    borderTop: 0,
                    borderBottom: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid + "@6c48a",
                    atlasUuid: "",
                    packable: false,
                    pixelsToUnit: 100,
                    pivotX: 0.5,
                    pivotY: 0.5,
                    meshType: 0,
                    vertices: {
                        rawPosition: [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        indexes: [0, 1, 2, 2, 1, 3],
                        uv: [0, h, w, h, 0, 0, w, 0],
                        nuv: [0, 0, 1, 0, 0, 1, 1, 1],
                        minPos: [-hw, -hh, 0],
                        maxPos: [hw, hh, 0]
                    }
                }
            }
        },
        userData: {
            type: "sprite-frame",
            redirect: uuid + "@6c48a",
            hasAlpha: true,
            fixAlphaTransparencyArtifacts: false,
            compressSettings: {
                useCompressTexture: true,
                presetId: "chicken-web"
            }
        }
    };
}

function emptyCell() {
    return { width: CELL, height: CELL, data: Buffer.alloc(CELL * CELL * 4) };
}

function fitCell(img) {
    const trimmed = png.trim(img, 1) || img;
    if (!trimmed.width || !trimmed.height) return emptyCell();
    const pad = PAD;
    const inner = CELL - pad * 2;
    const scale = Math.min(inner / trimmed.width, inner / trimmed.height, 1);
    const w = Math.max(1, Math.round(trimmed.width * scale));
    const h = Math.max(1, Math.round(trimmed.height * scale));
    const fitted = (w === trimmed.width && h === trimmed.height) ? trimmed : png.resize(trimmed, w, h);
    const out = emptyCell();
    const ox = Math.floor((CELL - w) / 2);
    const oy = CELL - pad - h;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const s = (y * w + x) * 4;
            const d = ((y + Math.max(0, oy)) * CELL + (x + ox)) * 4;
            if (y + oy < 0 || y + oy >= CELL) continue;
            fitted.data.copy(out.data, d, s, s + 4);
        }
    }
    return out;
}

function cellsFrom(img) {
    const ratio = img.width / img.height;
    if (ratio >= 6) {
        const cw = Math.floor(img.width / FRAMES);
        const ch = img.height;
        return Array.from({ length: FRAMES }, (_, i) => png.crop(img, i * cw, 0, cw, ch));
    }
    const cols = 4;
    const rows = 4;
    const cw = Math.floor(img.width / cols);
    const ch = Math.floor(img.height / rows);
    const cells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) cells.push(png.crop(img, c * cw, r * ch, cw, ch));
    }
    return cells;
}

function compose(cells) {
    const sheet = { width: SHEET_W, height: SHEET_H, data: Buffer.alloc(SHEET_W * SHEET_H * 4) };
    cells.slice(0, FRAMES).forEach((cell, i) => {
        const fitted = fitCell(cell);
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x0 = col * CELL;
        const y0 = row * CELL;
        for (let y = 0; y < CELL; y++) {
            fitted.data.copy(sheet.data, ((y0 + y) * SHEET_W + x0) * 4, y * CELL * 4, (y + 1) * CELL * 4);
        }
    });
    return sheet;
}

function decodeAny(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".png") return png.decode(file);
    throw new Error("只支持 PNG，先把生图转成 png: " + file);
}

function importOne(src, key, style) {
    const img = decodeAny(src);
    const cells = cellsFrom(img);
    // 先把每格白底涂成品红再抠，避免白羽毛 / 眼白被当成底。
    for (const cell of cells) knockWhiteViaMagenta(cell);
    const sheet = compose(cells);
    const dir = path.join(OUT, key);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dir + ".meta")) {
        fs.writeFileSync(dir + ".meta", JSON.stringify(dirMeta(uuidFor("dir:" + key)), null, 4) + "\n");
    }
    if (!fs.existsSync(OUT + ".meta")) {
        fs.writeFileSync(OUT + ".meta", JSON.stringify(dirMeta(uuidFor("dir:anim")), null, 4) + "\n");
    }
    const dest = path.join(dir, style + ".png");
    png.encode(dest, sheet);
    fs.writeFileSync(dest + ".meta", JSON.stringify(spriteMeta(uuidFor(key + "/" + style), style, SHEET_W, SHEET_H), null, 4) + "\n");
    console.log(key + "/" + style, SHEET_W + "x" + SHEET_H);
}

function main() {
    const arg = process.argv[2];
    if (arg === "--dir") {
        const dir = process.argv[3];
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".png"));
        for (const f of files) {
            const m = f.match(/^([^.]+)\.(\w+)\.png$/);
            if (!m) {
                console.warn("skip", f);
                continue;
            }
            importOne(path.join(dir, f), m[1], m[2]);
        }
        return;
    }
    const [src, key, style] = process.argv.slice(2);
    if (!src || !key || !style) {
        console.error("用法: node tools/import-strike-gen.cjs <src.png> <charKey> <style>");
        process.exit(1);
    }
    importOne(src, key, style);
}

if (require.main === module) main();
module.exports = { importOne };
