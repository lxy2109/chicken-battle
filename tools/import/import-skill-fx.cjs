/**
 * 绝招小特效贴图导入（全屏立绘已退役）。
 *
 * 现网资源：
 *   game/image/texture/skill/skill_mini_{style}.png  — 不透明漫画小印记
 *   game/image/texture/common/particle_skill_spark.png
 *   game/image/texture/common/particle_skill_puff.png
 *
 * 生图 → temp/skill-mini-gen → 强抠透明 + 灰边 choke → 缩到 ≤256 → 覆盖 bundle。
 * 用法: node tools/import-skill-fx.cjs [genDir]
 */
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");
const { keyCheckerboard } = require("../art/key-checkerboard.cjs");
const uuids = require("../art/art-uuids.cjs");

const ROOT = path.resolve(__dirname, "../..");
const GEN = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(ROOT, "temp", "skill-mini-gen");

/** 源文件名 → [资源名, 子目录, 最大边] */
const MAP = [
    ["3.png", "skill_mini_peck", "skill", 256],
    ["6.png", "skill_mini_jump", "skill", 256],
    ["2.png", "skill_mini_dive", "skill", 256],
    ["5.png", "skill_mini_leap", "skill", 256],
    ["4.png", "skill_mini_charge", "skill", 256],
    ["10.png", "skill_mini_tail", "skill", 256],
    ["7.png", "skill_mini_combo", "skill", 256],
    ["8.png", "skill_mini_feint", "skill", 256],
    ["9.png", "particle_skill_spark", "common", 128],
    ["1.png", "particle_skill_puff", "common", 128]
];

const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
];

/** 中性灰晕（排除暖奶油、偏紫填色）。 */
function isGrayish(r, g, b) {
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const avg = (r + g + b) / 3;
    const warm = Math.max(0, r - b);
    if (b - r > 8 || b - g > 8) return false;
    if (warm > 12) return false;
    return sat <= 24 && avg >= 170;
}

/**
 * 贴透明的灰晕 / 白边硬抠；半透明一律清掉，印记要硬边。
 */
function hardDespill(img, passes = 4) {
    const { width: w, height: h, data } = img;
    let killed = 0;
    for (let pass = 0; pass < passes; pass++) {
        const kill = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const d = i * 4;
                if (data[d + 3] === 0) continue;
                let near0 = false;
                let near0n = 0;
                for (const [dx, dy] of DIRS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] === 0) {
                        near0 = true;
                        near0n += 1;
                    }
                }
                if (!near0) continue;
                const r = data[d];
                const g = data[d + 1];
                const b = data[d + 2];
                const a = data[d + 3];
                const sat = Math.max(r, g, b) - Math.min(r, g, b);
                const avg = (r + g + b) / 3;
                if (a < 200) {
                    kill.push(i);
                    continue;
                }
                if (isGrayish(r, g, b)) {
                    kill.push(i);
                    continue;
                }
                if (avg >= 235 && sat <= 40) {
                    kill.push(i);
                    continue;
                }
                if (near0n >= 5 && (sat <= 50 || avg >= 220)) {
                    kill.push(i);
                }
            }
        }
        for (const i of kill) {
            data.fill(0, i * 4, i * 4 + 4);
            killed += 1;
        }
    }
    return killed;
}

/** 半透明 → 清掉或拉满，避免发灰糊边。 */
function hardenAlpha(img, thr = 180) {
    const { data } = img;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) {
        const a = data[i];
        if (a === 0) continue;
        if (a < thr) {
            data.fill(0, i - 3, i + 1);
            n += 1;
        }
        else if (a < 255) {
            data[i] = 255;
        }
    }
    return n;
}

function rewriteMeta(metaFile, name, w, h, uuid) {
    const hw = w / 2;
    const hh = h / 2;
    let meta;
    if (fs.existsSync(metaFile)) {
        meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    }
    else {
        meta = {
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
                    userData: {}
                }
            },
            userData: {
                type: "sprite-frame",
                fixAlphaTransparencyArtifacts: false,
                hasAlpha: true,
                redirect: uuid + "@6c48a",
                compressSettings: { useCompressTexture: true, presetId: "chicken-web" }
            }
        };
    }
    const sub = meta.subMetas;
    const frameKey = Object.keys(sub).find(k => sub[k].importer === "sprite-frame");
    const texKey = Object.keys(sub).find(k => sub[k].importer === "texture");
    if (texKey) sub[texKey].displayName = name;
    if (frameKey) sub[frameKey].displayName = name;
    const u = sub[frameKey].userData;
    Object.assign(u, {
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
        imageUuidOrDatabaseUri: (meta.uuid || uuid) + "@6c48a",
        atlasUuid: "",
        packable: true,
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
    });
    meta.userData = meta.userData || {};
    meta.userData.hasAlpha = true;
    meta.userData.type = "sprite-frame";
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
}

function processOne(srcName, name, kind, maxEdge) {
    const src = path.join(GEN, srcName);
    if (!fs.existsSync(src)) {
        console.warn("skip missing", srcName);
        return false;
    }
    let img = png.decode(src);
    keyCheckerboard(img, {
        hard: 0.32,
        loose: 0.16,
        interior: true,
        holeMin: 24,
        choke: 5,
        chokeScore: 0.22,
        keepTop: 1,
        dustFloor: 80
    });
    hardDespill(img, 5);
    hardenAlpha(img, 160);
    const trimmed = png.trim(img, 1);
    if (trimmed) img = trimmed;
    hardDespill(img, 2);
    hardenAlpha(img, 170);

    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    if (tw !== img.width || th !== img.height) img = png.resize(img, tw, th);
    hardDespill(img, 3);
    hardenAlpha(img, 200);

    const dir = path.join(ROOT, "assets/bundle/game/image/texture", kind);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, name + ".png");
    png.encode(dest, img);
    const uuid = uuids[name];
    if (!uuid) throw new Error("missing uuid " + name);
    rewriteMeta(dest + ".meta", name, img.width, img.height, uuid);

    let softA = 0;
    let grayE = 0;
    const { width: w, height: h, data } = img;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const d = (y * w + x) * 4;
            const a = data[d + 3];
            if (a === 0) continue;
            if (a < 250) softA += 1;
            let near0 = false;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h || data[(ny * w + nx) * 4 + 3] === 0) {
                    near0 = true;
                    break;
                }
            }
            if (near0 && isGrayish(data[d], data[d + 1], data[d + 2])) grayE += 1;
        }
    }
    console.log(
        `${name.padEnd(24)} ${img.width}x${img.height}  softLeft=${softA} grayEdge=${grayE}`
    );
    return true;
}

let done = 0;
for (const row of MAP) {
    if (processOne(...row)) done += 1;
}
console.log(`imported ${done}/${MAP.length} skill mini fx (hard-key)`);
