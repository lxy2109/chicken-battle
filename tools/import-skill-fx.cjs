/**
 * 把全屏招式宽银幕贴图拷进 bundle，并写 sprite-frame .meta。
 * 竖屏 720x1280：29–36 主体鸡覆盖 skill_*，37–44 场景底板 skill_bg_*；
 * 45–52 是敌人无底板小贴纸 skill_mini_*；
 * 9–12 是共用分层（光线 / 名条 / 光晕 / 火花）。
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const uuids = require("./art-uuids.cjs");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "temp", "fx-skill");
const DEST = path.join(ROOT, "assets", "bundle", "game", "texture", "fx");

/** 生图完成顺序 → 招式文件名。第三项 true 表示带透明通道。 */
const MAP = [
    ["9.png", "skill_layer_rays", true],
    ["10.png", "skill_layer_banner", true],
    ["11.png", "skill_layer_flare", true],
    ["12.png", "skill_layer_sparks", true],
    ["31.png", "skill_peck", true],
    ["29.png", "skill_jump", true],
    ["32.png", "skill_dive", true],
    ["30.png", "skill_leap", true],
    ["36.png", "skill_charge", true],
    ["35.png", "skill_tail", true],
    ["33.png", "skill_combo", true],
    ["34.png", "skill_feint", true],
    ["39.png", "skill_bg_peck", false],
    ["37.png", "skill_bg_jump", false],
    ["40.png", "skill_bg_dive", false],
    ["38.png", "skill_bg_leap", false],
    ["42.png", "skill_bg_charge", false],
    ["43.png", "skill_bg_tail", false],
    ["44.png", "skill_bg_combo", false],
    ["41.png", "skill_bg_feint", false],
    ["45.png", "skill_mini_peck", true],
    ["47.png", "skill_mini_jump", true],
    ["46.png", "skill_mini_dive", true],
    ["48.png", "skill_mini_leap", true],
    ["49.png", "skill_mini_charge", true],
    ["52.png", "skill_mini_tail", true],
    ["50.png", "skill_mini_combo", true],
    ["51.png", "skill_mini_feint", true]
];

function pngSize(file) {
    const buf = fs.readFileSync(file);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function writeJpeg(srcPng, destJpg) {
    const result = spawnSync("python", [
        "-c",
        "from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'JPEG', quality=85, optimize=True)",
        srcPng,
        destJpg
    ], { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || "jpeg convert failed");
    }
}

function spriteMeta(uuid, name, w, h, hasAlpha) {
    const hw = w / 2;
    const hh = h / 2;
    const ext = hasAlpha ? ".png" : ".jpg";
    return {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid,
        files: [".json", ext],
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
                    anisotropy: 0,
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
            fixAlphaTransparencyArtifacts: false,
            hasAlpha: !!hasAlpha,
            redirect: uuid + "@6c48a",
            compressSettings: {
                useCompressTexture: true,
                presetId: "chicken-web"
            }
        }
    };
}

function spriteFrameLib(uuid, name, w, h) {
    const hw = w / 2;
    const hh = h / 2;
    return {
        __type__: "cc.SpriteFrame",
        content: {
            name,
            atlas: "",
            rect: { x: 0, y: 0, width: w, height: h },
            offset: { x: 0, y: 0 },
            originalSize: { width: w, height: h },
            rotated: false,
            capInsets: [0, 0, 0, 0],
            vertices: {
                rawPosition: [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                indexes: [0, 1, 2, 2, 1, 3],
                uv: [0, h, w, h, 0, 0, w, 0],
                nuv: [0, 0, 1, 0, 0, 1, 1, 1],
                minPos: { x: -hw, y: -hh, z: 0 },
                maxPos: { x: hw, y: hh, z: 0 }
            },
            texture: uuid + "@6c48a",
            packable: false,
            pixelsToUnit: 100,
            pivot: { x: 0.5, y: 0.5 },
            meshType: 0
        }
    };
}

/** 编辑器预览读 library/，只写 assets 不会出现在资源库里。 */
function syncLibrary(destName, destFile, uuid, w, h) {
    const libRoot = path.join(ROOT, "library");
    if (!fs.existsSync(libRoot)) return false;
    const ext = path.extname(destFile);
    const dir = path.join(libRoot, uuid.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(destFile, path.join(dir, uuid + ext));
    fs.writeFileSync(path.join(dir, uuid + ".json"), JSON.stringify({
        __type__: "cc.ImageAsset",
        content: { fmt: "0", w: 0, h: 0 }
    }, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, uuid + "@6c48a.json"), JSON.stringify({
        __type__: "cc.Texture2D",
        content: { base: "2,2,2,2,0,0", mipmaps: [uuid] }
    }, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, uuid + "@f9941.json"), JSON.stringify(spriteFrameLib(uuid, destName, w, h), null, 2) + "\n");

    const rel = "bundle\\game\\texture\\fx\\" + destName + ext;
    const now = Date.now();
    const infoPath = path.join(libRoot, ".assets-info.json");
    if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
        const files = info.map || info.files || info;
        files[rel] = { time: now, uuid };
        files[rel + ".meta"] = { time: now };
        fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n");
    }
    const dataPath = path.join(libRoot, ".assets-data.json");
    if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
        const url = "db://assets/bundle/game/texture/fx/" + destName + ext;
        data[uuid] = { url, value: { depends: [] }, versionCode: 1 };
        data[uuid + "@6c48a"] = { url: url + "@6c48a", value: { depends: [uuid] }, versionCode: 1 };
        data[uuid + "@f9941"] = { url: url + "@f9941", value: { depends: [uuid + "@6c48a"] }, versionCode: 1 };
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
    }
    const listPath = path.join(libRoot, ".assets");
    if (fs.existsSync(listPath)) {
        const list = JSON.parse(fs.readFileSync(listPath, "utf8"));
        const paths = list.data && list.data.paths;
        if (Array.isArray(paths) && !paths.includes(rel)) paths.push(rel);
        fs.writeFileSync(listPath, JSON.stringify(list, null, 4) + "\n");
    }
    return true;
}

for (const [srcName, destName, hasAlpha] of MAP) {
    const src = path.join(SRC, srcName);
    if (!fs.existsSync(src)) throw new Error("missing " + src);
    const ext = hasAlpha ? ".png" : ".jpg";
    const dest = path.join(DEST, destName + ext);
    if (hasAlpha) fs.copyFileSync(src, dest);
    else writeJpeg(src, dest);
    const { w, h } = pngSize(src);
    const uuid = uuids[destName];
    if (!uuid) throw new Error("no uuid for " + destName);
    fs.writeFileSync(dest + ".meta", JSON.stringify(spriteMeta(uuid, destName, w, h, hasAlpha), null, 2) + "\n");
    const lib = syncLibrary(destName, dest, uuid, w, h);
    console.log(destName, w + "x" + h, uuid, lib ? "library" : "assets-only");
}
