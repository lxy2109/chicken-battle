/**
 * 把设计图拆件拷进 bundle，并写好 sprite-frame .meta。
 *
 * 用法: node tools/import-art.cjs <生图输出目录>
 * 生图输出目录即 Cursor 会话资源目录（GenerateImage 产出）。
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const png = require("../art/png.cjs");
const { knock } = require("../art/knock-alpha.cjs");
const uuids = require("../art/art-uuids.cjs");

const ROOT = path.resolve(__dirname, "../..");
/** 图片根：game/image/<kind>/；特效贴图在 game/image/texture/。 */
const ART = "assets/bundle/game/image/";
const g = uuids.groups;

/** [源文件名, bundle 相对路径, uuid, 是否九宫格]，源文件统一取 <名字>.png。 */
function rows(names, dir, sliced, strip, ext = ".png") {
    return names.map((name) => {
        const short = strip ? name.slice(strip.length) : name;
        return [name + ".png", ART + dir + "/" + short + ext, uuids[name], sliced];
    });
}

const FILES = [].concat(
    rows(g.UI_SLICED, "ui", true),
    rows(g.UI_PLAIN, "ui", false),
    rows(g.ICONS, "icon", false, "icon_"),
    rows(g.NODES, "map", false, "node_"),
    rows(g.EQUIPS, "equip", false, "eq_"),
    rows(g.BGS, "bg", false, "bg_", ".jpg")
);

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

function spriteMeta(uuid, name, w, h, sliced, ext = ".png") {
    const hw = w / 2;
    const hh = h / 2;
    const bl = sliced ? Math.min(120, Math.floor(w * 0.18)) : 0;
    const bt = sliced ? Math.min(120, Math.floor(h * 0.22)) : 0;
    const jpeg = ext === ".jpg";
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
                    trimType: "auto",
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
                    borderTop: bt,
                    borderBottom: bt,
                    borderLeft: bl,
                    borderRight: bl,
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid + "@6c48a",
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
                }
            }
        },
        userData: {
            type: "sprite-frame",
            redirect: uuid + "@6c48a",
            hasAlpha: !jpeg,
            fixAlphaTransparencyArtifacts: false
        }
    };
}

function main() {
    const SRC = process.argv[2];
    if (!SRC) {
        console.error("用法: node tools/import-art.cjs <生图输出目录>");
        process.exit(1);
    }

    for (const [srcName, rel, uuid, sliced] of FILES) {
        const src = path.join(SRC, srcName);
        if (!fs.existsSync(src)) {
            console.error("missing", src);
            process.exit(1);
        }
        const dest = path.join(ROOT, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const ext = path.extname(rel);
        if (ext === ".jpg") writeJpeg(src, dest);
        else fs.copyFileSync(src, dest);
        const { w, h } = pngSize(src);
        const name = path.basename(rel, ext);
        fs.writeFileSync(dest + ".meta", JSON.stringify(spriteMeta(uuid, name, w, h, sliced, ext), null, 2) + "\n");
        console.log(rel, w + "x" + h);
    }

    // 背景是整屏不透明图，抠底只会误伤天空，跳过。
    for (const [, rel] of FILES.filter((row) => !row[1].endsWith(".jpg"))) {
        const file = path.join(ROOT, rel);
        const img = png.decode(file);
        const cleared = knock(img);
        png.encode(file, img);
        console.log(`抠底 ${path.basename(rel)} 清除 ${(100 * cleared / (img.width * img.height)).toFixed(1)}%`);
    }
    console.log("art imported", FILES.length);
}

module.exports = { FILES };

if (require.main === module) main();
