/**
 * 用现有敌人立绘 / 套装立绘生成攻击序列帧。
 *
 * 每张完整动作图固定 1024×64，横向 16 帧，每帧 64×64。
 * 角色身份必须跟立绘一致，所以从原图做姿态变换，而不是另画一只鸡。
 *
 * 用法: node tools/gen-strike-sheets.cjs
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
const SHEET_H = 64;
const FRAMES = 16;
const CELL = 64;
const STYLES = ["peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"];
// 普攻 attack 不在这里生成：Boss/套装后续会单独加 anim/<key>/attack.png，运行时有图才播。

const SKIP_CHICKEN = new Set([
    "eye", "figma_face_dumb", "figma_shadow",
    "wing_front", "leg_front", "wing_back", "leg_back", "head", "neck", "body"
]);

/**
 * 立绘朝左。+angle 顺时针（头往下啄），+dx 向右，+dy 向下。
 * 比战斗里的程序动画更夸张：预备拉满、接触瞬间拉得像橡皮、再过冲收回。
 * smear 给冲刺类招拖残影。t 是帧号 0..15。
 */
const ACTIONS = {
    peck: {
        smear: 1,
        keys: [
            { t: 0, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 },
            { t: 3, angle: -28, sx: 0.72, sy: 1.32, dx: 8, dy: -4 },
            { t: 6, angle: 48, sx: 1.42, sy: 0.58, dx: -16, dy: 8 },
            { t: 8, angle: 56, sx: 1.5, sy: 0.52, dx: -18, dy: 9 },
            { t: 11, angle: -12, sx: 0.86, sy: 1.18, dx: -2, dy: -2 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    jump: {
        smear: 1,
        keys: [
            { t: 0, angle: 0, sx: 1.38, sy: 0.58, dx: 0, dy: 10 },
            { t: 3, angle: -22, sx: 0.62, sy: 1.48, dx: -2, dy: -16 },
            { t: 6, angle: -28, sx: 0.7, sy: 1.4, dx: -6, dy: -18 },
            { t: 9, angle: 38, sx: 0.82, sy: 1.22, dx: -14, dy: -4 },
            { t: 12, angle: 12, sx: 1.42, sy: 0.56, dx: -6, dy: 10 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    dive: {
        smear: 2,
        keys: [
            { t: 0, angle: -18, sx: 0.74, sy: 1.36, dx: 2, dy: -10 },
            { t: 4, angle: -42, sx: 0.62, sy: 1.5, dx: 0, dy: -18 },
            { t: 7, angle: 62, sx: 1.18, sy: 0.72, dx: -12, dy: 0 },
            { t: 11, angle: 78, sx: 1.34, sy: 0.6, dx: -16, dy: 8 },
            { t: 13, angle: 28, sx: 1.48, sy: 0.5, dx: -10, dy: 10 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    leap: {
        smear: 2,
        keys: [
            { t: 0, angle: 6, sx: 1.4, sy: 0.56, dx: 0, dy: 10 },
            { t: 3, angle: -32, sx: 0.56, sy: 1.56, dx: 0, dy: -18 },
            { t: 6, angle: -8, sx: 0.7, sy: 1.38, dx: 0, dy: -20 },
            { t: 9, angle: 42, sx: 0.78, sy: 1.28, dx: -8, dy: -6 },
            { t: 12, angle: 22, sx: 1.56, sy: 0.46, dx: -4, dy: 11 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    charge: {
        smear: 2,
        keys: [
            { t: 0, angle: 10, sx: 1.18, sy: 0.78, dx: 10, dy: 5 },
            { t: 3, angle: 18, sx: 0.7, sy: 1.22, dx: 12, dy: 4 },
            { t: 6, angle: 28, sx: 1.7, sy: 0.5, dx: -18, dy: 6 },
            { t: 9, angle: 24, sx: 1.62, sy: 0.54, dx: -20, dy: 5 },
            { t: 12, angle: -18, sx: 0.82, sy: 1.2, dx: 10, dy: 1 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    tail: {
        smear: 2,
        keys: [
            { t: 0, angle: -36, sx: 0.82, sy: 1.24, dx: 8, dy: -2 },
            { t: 3, angle: -70, sx: 0.74, sy: 1.32, dx: 10, dy: -2, ease: "linear" },
            { t: 8, angle: 260, sx: 0.88, sy: 1.16, dx: -6, dy: 0, ease: "linear" },
            { t: 11, angle: 400, sx: 1.22, sy: 0.78, dx: -14, dy: 4 },
            { t: 13, angle: 24, sx: 1.36, sy: 0.68, dx: -6, dy: 6 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    combo: {
        smear: 1,
        keys: [
            { t: 0, angle: -18, sx: 0.82, sy: 1.2, dx: 4, dy: -2 },
            { t: 2, angle: 40, sx: 1.36, sy: 0.62, dx: -12, dy: 7 },
            { t: 4, angle: -8, sx: 0.9, sy: 1.12, dx: 2, dy: 0 },
            { t: 6, angle: 48, sx: 1.44, sy: 0.56, dx: -15, dy: 8 },
            { t: 8, angle: -6, sx: 0.88, sy: 1.14, dx: 0, dy: 0 },
            { t: 11, angle: 58, sx: 1.56, sy: 0.48, dx: -18, dy: 9 },
            { t: 13, angle: 14, sx: 1.18, sy: 0.82, dx: -6, dy: 3 },
            { t: 15, angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 }
        ]
    },
    feint: {
        smear: 2,
        keys: [
            { t: 0, angle: 16, sx: 1.28, sy: 0.7, dx: -10, dy: 5, alpha: 1 },
            { t: 3, angle: 28, sx: 1.36, sy: 0.62, dx: -14, dy: 6, alpha: 0.9 },
            { t: 6, angle: -24, sx: 0.48, sy: 1.18, dx: 12, dy: -10, alpha: 0.18 },
            { t: 9, angle: -12, sx: 0.86, sy: 1.2, dx: 14, dy: -8, alpha: 0.75 },
            { t: 12, angle: 44, sx: 1.4, sy: 0.6, dx: -16, dy: 7, alpha: 1 },
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

/** 脚钉在格子底边附近，绕脚转、压扁、挪位。 */
function renderFrame(src, pose) {
    const out = Buffer.alloc(CELL * CELL * 4);
    const margin = 5;
    const inner = CELL - margin * 2;
    const fit = Math.min(inner / src.width, inner / src.height) * 0.7;
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
    for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
            const px = x + 0.5 - (pivotX + pose.dx);
            const py = y + 0.5 - (pivotY + pose.dy);
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
    const x0 = frame * CELL;
    for (let y = 0; y < CELL; y++) {
        cell.copy(sheet.data, (y * SHEET_W + x0) * 4, y * CELL * 4, (y + 1) * CELL * 4);
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

function makeSheet(src, style) {
    const action = ACTIONS[style];
    const sheet = { width: SHEET_W, height: SHEET_H, data: Buffer.alloc(SHEET_W * SHEET_H * 4) };
    const smears = action.smear || 0;
    const cells = [];
    for (let i = 0; i < FRAMES; i++) cells.push(renderFrame(src, poseAt(action.keys, i)));
    for (let i = 0; i < FRAMES; i++) {
        const cell = Buffer.alloc(CELL * CELL * 4);
        for (let s = smears; s >= 1; s--) {
            const prev = cells[i - s];
            if (prev) over(cell, prev, 0.38 / s);
        }
        over(cell, cells[i], 1);
        blitCell(sheet, i, cell);
    }
    return sheet;
}

function main() {
    const chars = listCharacters();
    if (!chars.length) throw new Error("没有找到立绘");
    fs.mkdirSync(OUT, { recursive: true });
    writeJson(OUT + ".meta", dirMeta(uuidFor("dir:anim")));

    let count = 0;
    for (const { key, src } of chars) {
        const raw = png.decode(src);
        const trimmed = png.trim(raw, 1);
        if (!trimmed) throw new Error(`${key} 抠完是空的`);
        const dir = path.join(OUT, key);
        fs.mkdirSync(dir, { recursive: true });
        writeJson(dir + ".meta", dirMeta(uuidFor("dir:" + key)));
        for (const style of STYLES) {
            const sheet = makeSheet(trimmed, style);
            if (sheet.width !== SHEET_W || sheet.height !== SHEET_H) {
                throw new Error(`${key}/${style} 尺寸不是 ${SHEET_W}x${SHEET_H}`);
            }
            const dest = path.join(dir, style + ".png");
            png.encode(dest, sheet);
            const uuid = uuidFor(key + "/" + style);
            writeJson(dest + ".meta", spriteMeta(uuid, style, SHEET_W, SHEET_H));
            count += 1;
            process.stdout.write(`\r${count}/${chars.length * STYLES.length} ${key}/${style}   `);
        }
    }
    console.log(`\nstrike sheets ${count} 张，角色 ${chars.length}，动作 ${STYLES.length}`);
}

main();
