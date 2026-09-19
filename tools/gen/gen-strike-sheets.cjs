/**
 * 【备用】用立绘仿射变换生成序列帧。正式资源请走生图：
 *   node tools/gen/gen-strike-prompts.cjs
 *   （refs + prompts → raw → import-strike-gen）
 *
 * 整张 1024×1024，4×4 共 16 帧，每格 256×256。
 * 仅在生图未到位、或要快速占位时使用。
 *
 * 用法: node tools/gen-strike-sheets.cjs
 *       node tools/gen-strike-sheets.cjs set_rookie idle peck
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "assets/bundle/game/image/anim");
const CHICKEN = path.join(ROOT, "assets/bundle/game/image/actor");
const EQUIP = path.join(ROOT, "assets/bundle/game/image/equip");

const SHEET_W = 1024;
const SHEET_H = 1024;
const FRAMES = 16;
const COLS = 4;
const CELL = 256;
const STYLES = ["idle", "peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"];

const SKIP_CHICKEN = new Set([
    "eye", "figma_face_dumb", "figma_shadow",
    "wing_front", "leg_front", "wing_back", "leg_back", "head", "neck", "body"
]);

function isMinionKey(key) {
    return key.startsWith("warmup_") || /^s\d+_warmup$/.test(key);
}

/**
 * 立绘朝左。+angle 顺时针（头往下啄），+dx 向右，+dy 向下。
 * 关键帧只做「预备 → 发力 → 过冲 → 收回」，中间帧 smoothstep 插值，避免 AI 表那种跳帧。
 * smear 给冲刺类拖残影。t 是帧号 0..15。
 */
const ACTIONS = {
    idle: {
        smear: 0,
        keys: [
            { t: 0, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 },
            { t: 4, angle: -3, sx: 0.97, sy: 1.04, dx: 0, dy: -3 },
            { t: 8, angle: 0, sx: 1.02, sy: 0.97, dx: 0, dy: 2 },
            { t: 12, angle: 3, sx: 0.98, sy: 1.03, dx: 0, dy: -2 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    peck: {
        smear: 1,
        keys: [
            { t: 0, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 },
            { t: 3, angle: -22, sx: 0.88, sy: 1.14, dx: 6, dy: -2 },
            { t: 6, angle: 36, sx: 1.22, sy: 0.78, dx: -12, dy: 6 },
            { t: 8, angle: 44, sx: 1.28, sy: 0.72, dx: -14, dy: 7 },
            { t: 11, angle: -8, sx: 0.94, sy: 1.08, dx: -2, dy: -1 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    jump: {
        smear: 1,
        keys: [
            { t: 0, angle: 0, sx: 1.18, sy: 0.78, dx: 0, dy: 8 },
            { t: 3, angle: -14, sx: 0.82, sy: 1.22, dx: -2, dy: -14 },
            { t: 6, angle: -18, sx: 0.86, sy: 1.18, dx: -4, dy: -16 },
            { t: 9, angle: 22, sx: 0.92, sy: 1.1, dx: -10, dy: -4 },
            { t: 12, angle: 8, sx: 1.2, sy: 0.76, dx: -4, dy: 8 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    dive: {
        smear: 2,
        keys: [
            { t: 0, angle: -12, sx: 0.88, sy: 1.16, dx: 2, dy: -8 },
            { t: 4, angle: -28, sx: 0.78, sy: 1.28, dx: 0, dy: -14 },
            { t: 7, angle: 42, sx: 1.12, sy: 0.84, dx: -10, dy: 2 },
            { t: 11, angle: 52, sx: 1.2, sy: 0.76, dx: -12, dy: 6 },
            { t: 13, angle: 16, sx: 1.18, sy: 0.78, dx: -6, dy: 6 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    leap: {
        smear: 2,
        keys: [
            { t: 0, angle: 4, sx: 1.2, sy: 0.76, dx: 0, dy: 8 },
            { t: 3, angle: -22, sx: 0.76, sy: 1.28, dx: 0, dy: -16 },
            { t: 6, angle: -6, sx: 0.84, sy: 1.2, dx: 0, dy: -18 },
            { t: 9, angle: 28, sx: 0.88, sy: 1.14, dx: -6, dy: -4 },
            { t: 12, angle: 14, sx: 1.24, sy: 0.72, dx: -2, dy: 8 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    charge: {
        smear: 2,
        keys: [
            { t: 0, angle: 8, sx: 1.1, sy: 0.88, dx: 8, dy: 4 },
            { t: 3, angle: 14, sx: 0.86, sy: 1.12, dx: 10, dy: 2 },
            { t: 6, angle: 20, sx: 1.36, sy: 0.72, dx: -14, dy: 4 },
            { t: 9, angle: 16, sx: 1.3, sy: 0.76, dx: -16, dy: 3 },
            { t: 12, angle: -10, sx: 0.92, sy: 1.1, dx: 6, dy: 0 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    tail: {
        smear: 2,
        keys: [
            { t: 0, angle: -24, sx: 0.9, sy: 1.12, dx: 6, dy: -2 },
            { t: 3, angle: -48, sx: 0.86, sy: 1.16, dx: 8, dy: -2, ease: "linear" },
            { t: 8, angle: 200, sx: 0.94, sy: 1.08, dx: -4, dy: 0, ease: "linear" },
            { t: 11, angle: 320, sx: 1.12, sy: 0.88, dx: -10, dy: 3 },
            { t: 13, angle: 16, sx: 1.16, sy: 0.84, dx: -4, dy: 4 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    combo: {
        smear: 1,
        keys: [
            { t: 0, angle: -12, sx: 0.92, sy: 1.1, dx: 3, dy: -1 },
            { t: 2, angle: 28, sx: 1.18, sy: 0.8, dx: -8, dy: 5 },
            { t: 4, angle: -6, sx: 0.96, sy: 1.06, dx: 1, dy: 0 },
            { t: 6, angle: 34, sx: 1.22, sy: 0.76, dx: -11, dy: 6 },
            { t: 8, angle: -4, sx: 0.94, sy: 1.08, dx: 0, dy: 0 },
            { t: 11, angle: 42, sx: 1.28, sy: 0.7, dx: -14, dy: 7 },
            { t: 13, angle: 10, sx: 1.1, sy: 0.9, dx: -4, dy: 2 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    feint: {
        smear: 1,
        keys: [
            { t: 0, angle: 12, sx: 1.14, sy: 0.84, dx: -8, dy: 4, alpha: 1 },
            { t: 3, angle: 20, sx: 1.18, sy: 0.8, dx: -10, dy: 5, alpha: 0.95 },
            { t: 6, angle: -16, sx: 0.7, sy: 1.12, dx: 10, dy: -8, alpha: 0.35 },
            { t: 9, angle: -8, sx: 0.92, sy: 1.1, dx: 12, dy: -6, alpha: 0.85 },
            { t: 12, angle: 32, sx: 1.2, sy: 0.78, dx: -12, dy: 5, alpha: 1 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0, alpha: 1 }
        ]
    }
};

function uuidFor(seed) {
    const h = crypto.createHash("md5").update("chicken-strike:" + seed).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function poseAt(keys, frame) {
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1].t <= frame) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    if (a === b || b.t === a.t) {
        return { angle: a.angle, sx: a.sx, sy: a.sy, dx: a.dx, dy: a.dy, alpha: a.alpha == null ? 1 : a.alpha };
    }
    const u = (frame - a.t) / (b.t - a.t);
    const s = b.ease === "linear" ? u : u * u * (3 - 2 * u);
    return {
        angle: lerp(a.angle, b.angle, s),
        sx: lerp(a.sx, b.sx, s),
        sy: lerp(a.sy, b.sy, s),
        dx: lerp(a.dx, b.dx, s),
        dy: lerp(a.dy, b.dy, s),
        alpha: lerp(a.alpha == null ? 1 : a.alpha, b.alpha == null ? 1 : b.alpha, s)
    };
}

function sampleBilinear(img, x, y) {
    if (x < 0 || y < 0 || x >= img.width - 1e-6 || y >= img.height - 1e-6) {
        return [0, 0, 0, 0];
    }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(img.width - 1, x0 + 1);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wx = x - x0;
    const wy = y - y0;
    const i00 = (y0 * img.width + x0) * 4;
    const i10 = (y0 * img.width + x1) * 4;
    const i01 = (y1 * img.width + x0) * 4;
    const i11 = (y1 * img.width + x1) * 4;
    const a00 = img.data[i00 + 3];
    const a10 = img.data[i10 + 3];
    const a01 = img.data[i01 + 3];
    const a11 = img.data[i11 + 3];
    const a = a00 * (1 - wx) * (1 - wy) + a10 * wx * (1 - wy) + a01 * (1 - wx) * wy + a11 * wx * wy;
    if (a < 1) return [0, 0, 0, 0];
    const ch = (c) => {
        const v = img.data[i00 + c] * a00 * (1 - wx) * (1 - wy)
            + img.data[i10 + c] * a10 * wx * (1 - wy)
            + img.data[i01 + c] * a01 * (1 - wx) * wy
            + img.data[i11 + c] * a11 * wx * wy;
        return Math.round(v / a);
    };
    return [ch(0), ch(1), ch(2), Math.round(a)];
}

/**
 * 清掉立绘脚下的浅绿椭圆阴影。
 * 只从画面底部/边缘洪水，且只认低饱和薄荷绿，避免吃绿袍/绿盔（s1 等）。
 */
function stripGroundShadow(img) {
    const { width: w, height: h, data } = img;
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    let cleared = 0;

    function isShadow(r, g, b, loose) {
        const avg = (r + g + b) / 3;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const gDom = g - Math.max(r, b);
        if (loose) {
            return gDom >= 4 && avg >= 95 && avg <= 200 && sat <= 70 && r >= 70 && b >= 55;
        }
        return gDom >= 8 && avg >= 110 && avg <= 185 && sat <= 55 && r >= 85 && b >= 65 && g < 200;
    }

    function push(x, y, loose) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (seen[i]) return;
        const d = i * 4;
        if (data[d + 3] < 8) return;
        if (!isShadow(data[d], data[d + 1], data[d + 2], loose)) return;
        seen[i] = 1;
        queue[tail++] = i;
    }

    // 只从下 35% 与四边启动，阴影一定贴地。
    const y0 = Math.floor(h * 0.62);
    for (let x = 0; x < w; x++) {
        for (let y = y0; y < h; y++) push(x, y, false);
        push(x, h - 1, false);
    }
    for (let y = y0; y < h; y++) {
        push(0, y, false);
        push(w - 1, y, false);
    }

    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        // 不向上蔓延超过启动带太多，防止绿衣服被连坐。
        if (y < y0 - 8) continue;
        data.fill(0, i * 4, i * 4 + 4);
        cleared += 1;
        for (const [dx, dy] of DIRS) push(x + dx, y + dy, true);
    }
    return cleared;
}

/** 脚钉在格子底边附近，绕脚转、压扁、挪位。 */
function renderFrame(src, pose) {
    const out = Buffer.alloc(CELL * CELL * 4);
    const margin = 14;
    const inner = CELL - margin * 2;
    const fit = Math.min(inner / src.width, inner / src.height) * 0.92;
    const baseW = src.width * fit;
    const baseH = src.height * fit;
    const pivotX = CELL / 2;
    const pivotY = CELL - margin;
    const rad = pose.angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const sx = pose.sx;
    const sy = pose.sy;
    const alpha = pose.alpha;
    // 位移按格尺寸缩放（关键帧按 64 格标定，这里乘 4）。
    const dx = pose.dx * (CELL / 64);
    const dy = pose.dy * (CELL / 64);
    for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
            const px = x + 0.5 - (pivotX + dx);
            const py = y + 0.5 - (pivotY + dy);
            const rx = px * cos + py * sin;
            const ry = -px * sin + py * cos;
            const lx = rx / sx;
            const ly = ry / sy;
            const u = (lx + baseW / 2) / baseW * src.width;
            const v = (ly + baseH) / baseH * src.height;
            const [r, g, b, a] = sampleBilinear(src, u, v);
            if (a < 1) continue;
            const o = (y * CELL + x) * 4;
            out[o] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = Math.round(a * alpha);
        }
    }
    return out;
}

function blitCell(sheet, frame, cell) {
    const col = frame % COLS;
    const row = Math.floor(frame / COLS);
    const x0 = col * CELL;
    const y0 = row * CELL;
    for (let y = 0; y < CELL; y++) {
        cell.copy(sheet.data, ((y0 + y) * SHEET_W + x0) * 4, y * CELL * 4, (y + 1) * CELL * 4);
    }
}

function over(dst, src, alpha) {
    for (let i = 0; i < dst.length; i += 4) {
        const sa = src[i + 3] * alpha / 255;
        if (sa < 0.01) continue;
        const da = dst[i + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA < 0.01) continue;
        dst[i] = Math.round((src[i] * sa + dst[i] * da * (1 - sa)) / outA);
        dst[i + 1] = Math.round((src[i + 1] * sa + dst[i + 1] * da * (1 - sa)) / outA);
        dst[i + 2] = Math.round((src[i + 2] * sa + dst[i + 2] * da * (1 - sa)) / outA);
        dst[i + 3] = Math.round(outA * 255);
    }
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

function writeJson(file, obj) {
    fs.writeFileSync(file, JSON.stringify(obj, null, 4) + "\n");
}

function listCharacters() {
    const out = [];
    for (const file of fs.readdirSync(CHICKEN)) {
        if (!file.endsWith(".png")) continue;
        const key = file.slice(0, -4);
        if (SKIP_CHICKEN.has(key)) continue;
        out.push({ key, src: path.join(CHICKEN, file) });
    }
    for (const file of fs.readdirSync(EQUIP)) {
        if (!file.startsWith("set_") || !file.endsWith(".png")) continue;
        out.push({ key: file.slice(0, -4), src: path.join(EQUIP, file) });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
}

function prepareSource(file) {
    const raw = png.decode(file);
    stripGroundShadow(raw);
    const trimmed = png.trim(raw, 1);
    if (!trimmed) throw new Error(`${file} 抠完是空的`);
    return trimmed;
}

function makeSheet(src, style) {
    const action = ACTIONS[style];
    if (!action) throw new Error("未知动作 " + style);
    const sheet = { width: SHEET_W, height: SHEET_H, data: Buffer.alloc(SHEET_W * SHEET_H * 4) };
    const smears = action.smear || 0;
    const cells = [];
    for (let i = 0; i < FRAMES; i++) cells.push(renderFrame(src, poseAt(action.keys, i)));
    for (let i = 0; i < FRAMES; i++) {
        const cell = Buffer.alloc(CELL * CELL * 4);
        for (let s = smears; s >= 1; s--) {
            const prev = cells[i - s];
            if (prev) over(cell, prev, 0.28 / s);
        }
        over(cell, cells[i], 1);
        blitCell(sheet, i, cell);
    }
    return sheet;
}

function stylesFor(key) {
    if (isMinionKey(key)) return ["idle", "peck"];
    return STYLES;
}

function main() {
    const args = process.argv.slice(2);
    let chars = listCharacters();
    let onlyStyles = null;
    if (args.length) {
        const key = args[0];
        chars = chars.filter(c => c.key === key);
        if (!chars.length) throw new Error("找不到角色 " + key);
        if (args.length > 1) onlyStyles = args.slice(1);
    }
    if (!chars.length) throw new Error("没有找到立绘");
    fs.mkdirSync(OUT, { recursive: true });
    if (!fs.existsSync(OUT + ".meta")) writeJson(OUT + ".meta", dirMeta(uuidFor("dir:anim")));

    let count = 0;
    let total = 0;
    for (const { key } of chars) total += (onlyStyles || stylesFor(key)).length;

    for (const { key, src } of chars) {
        const trimmed = prepareSource(src);
        const dir = path.join(OUT, key);
        fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(dir + ".meta")) writeJson(dir + ".meta", dirMeta(uuidFor("dir:" + key)));
        const styles = onlyStyles || stylesFor(key);
        for (const style of styles) {
            const sheet = makeSheet(trimmed, style);
            const dest = path.join(dir, style + ".png");
            png.encode(dest, sheet);
            const uuid = uuidFor(key + "/" + style);
            writeJson(dest + ".meta", spriteMeta(uuid, style, SHEET_W, SHEET_H));
            count += 1;
            process.stdout.write(`\r${count}/${total} ${key}/${style}   `);
        }
        // 小怪包只保留 idle+peck，清掉旧的多余招式文件。
        if (!onlyStyles && isMinionKey(key)) {
            for (const style of STYLES) {
                if (style === "idle" || style === "peck") continue;
                const extra = path.join(dir, style + ".png");
                if (fs.existsSync(extra)) fs.unlinkSync(extra);
                if (fs.existsSync(extra + ".meta")) fs.unlinkSync(extra + ".meta");
            }
        }
    }
    console.log(`\nstrike sheets ${count} 张，角色 ${chars.length}`);
}

main();
