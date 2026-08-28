/**
 * 把设计图拆件拷进 bundle，并写好 sprite-frame .meta。
 * 源图：Cursor 会话资源目录（GenerateImage 产出）。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const uuids = require("./art-uuids.cjs");

const ROOT = path.resolve(__dirname, "..");
const SRC = "C:/Users/TU/.cursor/projects/c-Users-TU-AANewAllStructure-chicken-battle/assets";

const FILES = [
    ["part_body.png", "assets/bundle/game/texture/chicken/body.png", uuids.body, false],
    ["part_head_base.png", "assets/bundle/game/texture/chicken/head.png", uuids.head, false],
    ["part_neck.png", "assets/bundle/game/texture/chicken/neck.png", uuids.neck, false],
    ["part_comb.png", "assets/bundle/game/texture/chicken/comb.png", uuids.comb, false],
    ["part_wing.png", "assets/bundle/game/texture/chicken/wing.png", uuids.wing, false],
    ["part_tail.png", "assets/bundle/game/texture/chicken/tail.png", uuids.tail, false],
    ["part_leg.png", "assets/bundle/game/texture/chicken/leg.png", uuids.leg, false],
    ["part_beak.png", "assets/bundle/game/texture/chicken/beak.png", uuids.beak, false],
    ["part_eyes.png", "assets/bundle/game/texture/chicken/eyes.png", uuids.eyes, false],
    ["part_shadow.png", "assets/bundle/game/texture/chicken/shadow.png", uuids.shadow, false],
    ["ui_panel.png", "assets/bundle/game/texture/ui/panel.png", uuids.panel, true],
    ["ui_btn_wood.png", "assets/bundle/game/texture/ui/btn_wood.png", uuids.btn_wood, true],
    ["ui_btn_green.png", "assets/bundle/game/texture/ui/btn_green.png", uuids.btn_green, true],
    ["ui_btn_red.png", "assets/bundle/game/texture/ui/btn_red.png", uuids.btn_red, true],
    ["ui_btn_dark.png", "assets/bundle/game/texture/ui/btn_dark.png", uuids.btn_dark, true],
    ["ui_coin.png", "assets/bundle/game/texture/ui/coin.png", uuids.coin, false],
    ["ui_bubble.png", "assets/bundle/game/texture/ui/bubble.png", uuids.bubble, true],
    ["ui_hp_frame.png", "assets/bundle/game/texture/ui/hp_frame.png", uuids.hp_frame, true],
    ["bg_village.png", "assets/bundle/game/texture/bg/village.png", uuids.village, false],
    ["bg_battle.png", "assets/bundle/game/texture/bg/battle.png", uuids.battle, false]
];

function pngSize(file) {
    const buf = fs.readFileSync(file);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function spriteMeta(uuid, name, w, h, sliced) {
    const hw = w / 2;
    const hh = h / 2;
    const bl = sliced ? Math.min(120, Math.floor(w * 0.18)) : 0;
    const bt = sliced ? Math.min(120, Math.floor(h * 0.22)) : 0;
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
            hasAlpha: true,
            fixAlphaTransparencyArtifacts: false
        }
    };
}

for (const [srcName, rel, uuid, sliced] of FILES) {
    const src = path.join(SRC, srcName);
    if (!fs.existsSync(src)) {
        console.error("missing", src);
        process.exit(1);
    }
    const dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    const { w, h } = pngSize(dest);
    const name = path.basename(rel, ".png");
    fs.writeFileSync(dest + ".meta", JSON.stringify(spriteMeta(uuid, name, w, h, sliced), null, 2) + "\n");
    console.log(rel, w + "x" + h);
}

const knockList = FILES
    .filter((row) => row[1].indexOf("/bg/") < 0)
    .map((row) => path.join(ROOT, row[1]));
const knock = spawnSync("python", [path.join(__dirname, "knock-alpha.py")].concat(knockList), { stdio: "inherit" });
if (knock.status !== 0) {
    console.error("knock-alpha failed");
    process.exit(knock.status || 1);
}
console.log("art imported", FILES.length);
