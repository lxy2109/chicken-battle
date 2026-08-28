/**
 * 生成斗鸡 MVP 所需预制体（仅引擎组件，脚本由运行时/MCP 挂载）。
 * 节点全部来自预制体，游戏代码只 instantiate。
 *
 * 设计基线 720x1280，锚点居中，所以 y 的可用区间是 -640..640。
 * 节点名在单个预制体内必须唯一：运行时靠 GameComponent.getNode(name) 全树按名取节点。
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const uuids = require("./art-uuids.cjs");

const ROOT = path.resolve(__dirname, "..");
const WHITE = "56a0bfc3-686d-4e85-bb26-5f5a6855ae06@f9941";

/** 素材名直接取自 art-uuids，两边命名一致就不用再维护映射表。 */
const SF = {};
for (const key of Object.keys(uuids)) {
    if (typeof uuids[key] === "string") SF[key] = uuids.frame(uuids[key]);
}

/** 文字配色。深色字压在浅底上不描边，浅色字压在深底上才描边。 */
const INK = {
    dark: [62, 40, 20, 255],
    cream: [255, 250, 236, 255],
    gold: [255, 206, 74, 255],
    good: [58, 148, 62, 255],
    bad: [198, 62, 48, 255],
    mute: [140, 118, 96, 255]
};

const LAYER = 33554432;
let seq = 1;

function fid() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < 22; i++) s += chars[(seq * 131 + i * 17) % chars.length];
    seq += 1;
    return s;
}

function vec3(x, y, z = 0) { return { __type__: "cc.Vec3", x, y, z }; }
function vec2(x, y) { return { __type__: "cc.Vec2", x, y }; }
function color(r, g, b, a = 255) { return { __type__: "cc.Color", r, g, b, a }; }
function size(w, h) { return { __type__: "cc.Size", width: w, height: h }; }

class Builder {
    constructor(name) {
        this.objs = [{
            __type__: "cc.Prefab",
            _name: name,
            _objFlags: 0,
            __editorExtras__: {},
            _native: "",
            data: { __id__: 1 },
            optimizationPolicy: 0,
            persistent: false
        }];
    }

    push(obj) {
        const id = this.objs.length;
        this.objs.push(obj);
        return id;
    }

    node(opt) {
        const n = {
            __type__: "cc.Node",
            _name: opt.name,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: opt.parent == null ? null : { __id__: opt.parent },
            _children: [],
            _active: opt.active !== false,
            _components: [],
            _prefab: { __id__: -1 },
            _lpos: vec3(opt.x || 0, opt.y || 0, 0),
            _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
            _lscale: vec3(opt.sx || 1, opt.sy || 1, 1),
            _mobility: 0,
            _layer: LAYER,
            _euler: vec3(0, 0, 0),
            _id: ""
        };
        const id = this.push(n);
        if (opt.parent != null) this.objs[opt.parent]._children.push({ __id__: id });
        this.ui(id, opt.w || 100, opt.h || 40, opt.ax, opt.ay);
        return id;
    }

    addComp(nodeId, comp, extra = {}) {
        const id = this.push(Object.assign({
            __type__: extra.type,
            _name: "",
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: nodeId },
            _enabled: true,
            __prefab: { __id__: -1 }
        }, extra.fields || {}));
        const info = this.push({ __type__: "cc.CompPrefabInfo", fileId: fid() });
        this.objs[id].__prefab = { __id__: info };
        this.objs[nodeId]._components.push({ __id__: id });
        return id;
    }

    ui(nodeId, w, h, ax = 0.5, ay = 0.5) {
        this.addComp(nodeId, null, {
            type: "cc.UITransform",
            fields: { _contentSize: size(w, h), _anchorPoint: vec2(ax, ay) }
        });
    }

    widget(nodeId) {
        this.addComp(nodeId, null, {
            type: "cc.Widget",
            fields: {
                _alignFlags: 45, _target: null,
                _left: 0, _right: 0, _top: 0, _bottom: 0,
                _horizontalCenter: 0, _verticalCenter: 0,
                _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
                _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
                _originalWidth: 100, _originalHeight: 100, _alignMode: 2, _lockFlags: 0
            }
        });
    }

    sprite(nodeId, col = [255, 255, 255, 255], type = 0, frame = WHITE, fillRange = 0) {
        this.addComp(nodeId, null, {
            type: "cc.Sprite",
            fields: {
                _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
                _color: color(col[0], col[1], col[2], col[3] ?? 255),
                _spriteFrame: { __uuid__: frame, __expectedType__: "cc.SpriteFrame" },
                _type: type, _fillType: 0, _sizeMode: 0,
                _fillCenter: vec2(0, 0), _fillStart: 0, _fillRange: fillRange,
                _isTrimmedMode: true, _useGrayscale: false, _atlas: null
            }
        });
    }

    label(nodeId, text, opt = {}) {
        const font = opt.font || 24;
        const col = opt.color || INK.dark;
        const outline = opt.outline || false;
        const w = opt.w || 240;
        const h = opt.h || font + 12;
        this.addComp(nodeId, null, {
            type: "cc.Label",
            fields: {
                _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
                _color: color(col[0], col[1], col[2], col[3] ?? 255),
                _string: text, _horizontalAlign: opt.align == null ? 1 : opt.align, _verticalAlign: 1,
                _actualFontSize: font, _fontSize: font, _fontFamily: "Arial",
                // SHRINK 而不是 NONE：NONE 会让节点尺寸跟着文字内容变，
                // 金币从 8 变成 128 时左对齐的数字会左右横跳，空文本更是直接塌成 0 宽。
                _lineHeight: Math.round(font * 1.2), _overflow: 2, _enableWrapText: true,
                _font: null, _isSystemFontUsed: true, _spacingX: 0,
                _isItalic: false, _isBold: opt.bold !== false, _isUnderline: false, _underlineHeight: 2,
                _cacheMode: 0, _enableOutline: !!outline,
                _outlineColor: color(58, 34, 12, 255), _outlineWidth: opt.outlineWidth || 3,
                _enableShadow: false, _shadowColor: color(0, 0, 0, 255),
                _shadowOffset: vec2(2, 2), _shadowBlur: 2
            }
        });
        const ui = this.objs[nodeId]._components[0];
        if (ui) this.objs[ui.__id__]._contentSize = size(w, h);
    }

    button(nodeId) {
        this.addComp(nodeId, null, {
            type: "cc.Button",
            fields: {
                clickEvents: [], _interactable: true, _transition: 3,
                _normalColor: color(255, 255, 255), _pressedColor: color(211, 211, 211),
                _hoverColor: color(255, 255, 255), _disabledColor: color(124, 124, 124),
                _colorDuration: 0.1, _zoomScale: 1.08, _duration: 0.1,
                _target: { __id__: nodeId },
                _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null
            }
        });
    }

    layout(nodeId, opt = {}) {
        const cols = opt.cols || 0;
        this.addComp(nodeId, null, {
            type: "cc.Layout",
            fields: {
                _resizeMode: 0, _layoutType: opt.type == null ? 2 : opt.type,
                _cellSize: size(opt.cellW || 310, opt.cellH || 120),
                _startAxis: 0,
                _paddingLeft: opt.pad || 6, _paddingRight: opt.pad || 6,
                _paddingTop: opt.pad || 6, _paddingBottom: opt.pad || 6,
                _spacingX: opt.gapX == null ? 12 : opt.gapX,
                _spacingY: opt.gapY == null ? 12 : opt.gapY,
                _verticalDirection: 1, _horizontalDirection: 0,
                _constraint: cols > 0 ? 2 : 0, _constraintNum: cols > 0 ? cols : 2,
                _affectedByScale: false, _isAlign: false
            }
        });
    }

    finish(rootId) {
        const pi = this.push({
            __type__: "cc.PrefabInfo",
            root: { __id__: rootId },
            asset: { __id__: 0 },
            fileId: fid(),
            instance: null,
            targetOverrides: null
        });
        this.objs[rootId]._prefab = { __id__: pi };
        for (let i = 1; i < this.objs.length; i++) {
            const o = this.objs[i];
            if (o.__type__ === "cc.Node" && o._prefab && o._prefab.__id__ === -1) {
                o._prefab = { __id__: this.push({
                    __type__: "cc.PrefabInfo",
                    root: { __id__: rootId },
                    asset: { __id__: 0 },
                    fileId: fid(),
                    instance: null,
                    targetOverrides: null
                }) };
            }
        }
        return this.objs;
    }
}

//#region 通用构件

const BTN = {
    yellow: { frame: SF.btn_yellow, ink: INK.dark, outline: false },
    green: { frame: SF.btn_green, ink: INK.cream, outline: true },
    red: { frame: SF.btn_red, ink: INK.cream, outline: true },
    orange: { frame: SF.btn_orange, ink: INK.cream, outline: true }
};

/** 主按钮：九宫格底图 + 居中文字，文字节点名为 <name>Lab。 */
function labBtn(b, parent, name, text, x, y, w = 320, h = 84, kind = "yellow") {
    const skin = BTN[kind] || BTN.yellow;
    const id = b.node({ name, parent, x, y, w, h });
    b.sprite(id, [255, 255, 255, 255], 1, skin.frame);
    b.button(id);
    const lid = b.node({ name: name + "Lab", parent: id, w: w - 40, h: h - 20 });
    b.label(lid, text, {
        font: Math.min(34, Math.round(h * 0.42)),
        w: w - 40, h: h - 20,
        color: skin.ink, outline: skin.outline
    });
    return id;
}

/**
 * 捏鸡的调色板色块。
 * 色值是拿 Sprite 的 color 乘上去的，底图必须中性，压在黄色按钮上会串色，
 * 所以外层只做边框，真正显色的是内层那块纯白图。
 */
function colorBtn(b, parent, name, x, y, rgb) {
    const id = b.node({ name, parent, x, y, w: 96, h: 60 });
    b.sprite(id, [255, 255, 255, 255], 1, SF.slot_frame);
    b.button(id);
    const chip = b.node({ name: name + "Chip", parent: id, w: 64, h: 32 });
    b.sprite(chip, rgb.concat(255), 0, WHITE);
    return id;
}

function textNode(b, parent, name, text, x, y, opt = {}) {
    const w = opt.w || 600;
    const h = opt.h || (opt.font || 24) + 14;
    const id = b.node({ name, parent, x, y, w, h });
    b.label(id, text, Object.assign({ w, h }, opt));
    return id;
}

/** 红缎带标题，文字节点名即传入的 name。 */
function banner(b, parent, name, text, y, w = 560) {
    const bg = b.node({ name: name + "Bg", parent, y, w, h: 104 });
    b.sprite(bg, [255, 255, 255, 255], 1, SF.banner_red);
    textNode(b, bg, name, text, 0, 4, { font: 40, w: w - 90, h: 56, color: INK.cream, outline: true });
    return bg;
}

/** 木牌招牌，商店专用。 */
function signboard(b, parent, name, text, y, w = 520) {
    const bg = b.node({ name: name + "Bg", parent, y, w, h: 124 });
    b.sprite(bg, [255, 255, 255, 255], 1, SF.banner_wood);
    textNode(b, bg, name, text, 0, 2, { font: 40, w: w - 100, h: 56, color: INK.cream, outline: true });
    return bg;
}

function iconNode(b, parent, name, frame, x, y, s) {
    const id = b.node({ name, parent, x, y, w: s, h: s });
    b.sprite(id, [255, 255, 255, 255], 0, frame);
    return id;
}

/** 左金币右战力的顶部资源条。 */
function topBar(b, parent, y) {
    const gold = b.node({ name: "GoldBar", parent, x: -172, y, w: 300, h: 76 });
    b.sprite(gold, [255, 255, 255, 255], 1, SF.tag_yellow);
    iconNode(b, gold, "GoldIcon", SF.icon_coin, -102, 0, 52);
    textNode(b, gold, "LabGold", "0", 30, 0, { font: 32, w: 180, h: 46, color: INK.dark, align: 0 });

    const power = b.node({ name: "PowerBar", parent, x: 172, y, w: 300, h: 76 });
    b.sprite(power, [255, 255, 255, 255], 1, SF.tag_gold);
    iconNode(b, power, "PowerIcon", SF.icon_power, -102, 0, 52);
    textNode(b, power, "LabPower", "0", 30, 0, { font: 32, w: 180, h: 46, color: INK.dark, align: 0 });
}

/** 整屏底板，带 Widget 自适应。 */
function panel(b, name, bg = SF.bg_home) {
    const root = b.node({ name, w: 720, h: 1280, x: 0, y: 0 });
    b.widget(root);
    b.sprite(root, [255, 255, 255, 255], 0, bg);
    return root;
}

function card(b, parent, name, x, y, w, h, frame = SF.panel_white) {
    const id = b.node({ name, parent, x, y, w, h });
    b.sprite(id, [255, 255, 255, 255], 1, frame);
    return id;
}

/** 血条：外框 + 可填充内条，内条按 fillRange 收缩。 */
function hpBar(b, parent, name, fillName, x, y, fillCol) {
    const frame = b.node({ name, parent, x, y, w: 580, h: 46 });
    b.sprite(frame, [255, 255, 255, 255], 1, SF.bar_track);
    const fill = b.node({ name: fillName, parent: frame, w: 540, h: 24 });
    b.sprite(fill, fillCol, 3, WHITE, 1);
    return frame;
}

function writePrefab(rel, objs) {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(objs, null, 2));
}

//#endregion

//#region 界面

function makeCustomize() {
    const b = new Builder("customize");
    const root = panel(b, "customize");
    banner(b, root, "LabTitle", "开局一只鸡", 572, 520);

    card(b, root, "ChickenCard", 0, 268, 640, 470);
    b.node({ name: "ChickenSlot", parent: root, x: 0, y: 288, w: 320, h: 400 });

    // 战力和属性是这屏最该看清的信息，压在背景图上会糊成一团，给它垫张卡。
    card(b, root, "StatCard", 0, -6, 640, 80, SF.panel_cream);
    textNode(b, root, "LabStats", "数值", 0, -6, { font: 21, w: 600, h: 62, color: INK.dark });

    textNode(b, root, "LabPart", "正在染：躯干", 0, -78, { font: 26, w: 560, h: 38, color: INK.cream, outline: true });
    const parts = ["Comb", "Head", "Body", "Wing", "Tail", "Leg"];
    const partText = ["鸡冠", "头部", "躯干", "翅膀", "尾巴", "腿部"];
    parts.forEach((p, i) => {
        labBtn(b, root, "BtnPart" + p, partText[i], -206 + (i % 3) * 206, -130 - Math.floor(i / 3) * 76, 194, 64);
    });

    for (let i = 0; i < 10; i++) {
        colorBtn(b, root, "BtnColor" + i, -252 + (i % 5) * 126, -292 - Math.floor(i / 5) * 68, palette(i));
    }

    ["凶", "呆", "傲", "萌"].forEach((t, i) => {
        labBtn(b, root, "BtnFace" + i, t, -243 + i * 162, -436, 150, 62, "orange");
    });

    labBtn(b, root, "BtnEnter", "进入村口", 0, -556, 420, 88, "green");
    writePrefab("assets/bundle/gui/customize/customize.prefab", b.finish(root));
}

function palette(i) {
    const pal = [
        [226, 59, 59], [244, 211, 94], [238, 150, 75], [123, 75, 42], [42, 157, 143],
        [38, 70, 83], [231, 111, 81], [255, 255, 255], [142, 68, 173], [52, 152, 219]
    ];
    return pal[i];
}

/** 关卡节点在地图上的落点，自下而上蜿蜒。 */
const MAP_NODES = [
    [-168, -378], [138, -262], [-146, -104], [152, 54], [-150, 212]
];
const MAP_BOSS = [36, 366];
const MAP_SHOP = [214, -370];

function makeMap() {
    const b = new Builder("map");
    const root = panel(b, "map", SF.bg_map);

    // 路径点先铺，保证压在节点下面。
    const route = MAP_NODES.concat([MAP_BOSS]);
    let dot = 0;
    for (let i = 0; i < route.length - 1; i++) {
        const [x0, y0] = route[i];
        const [x1, y1] = route[i + 1];
        for (let k = 1; k <= 4; k++) {
            const t = k / 5;
            const id = b.node({
                name: "PathDot" + dot, parent: root,
                x: Math.round(x0 + (x1 - x0) * t), y: Math.round(y0 + (y1 - y0) * t),
                w: 34, h: 34
            });
            b.sprite(id, [255, 255, 255, 210], 0, SF.node_dot);
            dot += 1;
        }
    }

    MAP_NODES.forEach(([x, y], i) => {
        const n = i + 1;
        const id = b.node({ name: "BtnStage" + n, parent: root, x, y, w: 128, h: 128 });
        b.sprite(id, [255, 255, 255, 255], 0, SF.node_stage);
        b.button(id);
        textNode(b, id, "LabStageNum" + n, String(n), 0, 6, { font: 40, w: 100, h: 52, color: INK.cream, outline: true });
        textNode(b, root, "LabStageName" + n, "", x, y - 84, { font: 22, w: 220, h: 32, color: INK.cream, outline: true });
    });

    const boss = b.node({ name: "BtnBoss", parent: root, x: MAP_BOSS[0], y: MAP_BOSS[1], w: 150, h: 150 });
    b.sprite(boss, [255, 255, 255, 255], 0, SF.node_boss);
    b.button(boss);
    textNode(b, root, "LabBossName", "鸡王", MAP_BOSS[0], MAP_BOSS[1] - 96, { font: 24, w: 220, h: 34, color: INK.cream, outline: true });

    const shop = b.node({ name: "BtnShop", parent: root, x: MAP_SHOP[0], y: MAP_SHOP[1], w: 132, h: 132 });
    b.sprite(shop, [255, 255, 255, 255], 0, SF.node_shop);
    b.button(shop);
    textNode(b, root, "LabShopName", "鸡市", MAP_SHOP[0], MAP_SHOP[1] - 86, { font: 22, w: 200, h: 32, color: INK.cream, outline: true });

    banner(b, root, "LabTitle", "冒险路线", 572, 480);
    topBar(b, root, 470);

    card(b, root, "HintCard", 0, -520, 620, 76, SF.panel_cream);
    textNode(b, root, "LabHint", "提示", 0, -520, { font: 24, w: 560, h: 36, color: INK.dark });
    labBtn(b, root, "BtnCharacter", "我的斗鸡", 0, -600, 300, 72, "green");

    writePrefab("assets/bundle/gui/map/map.prefab", b.finish(root));
}

/**
 * 装备槽落点，顺序对应 comb / head / body / wing / tail / leg / face。
 * 策划图画的是 4 格，这里按 Item.json 实际的 6 个部位槽加 face 皮肤槽排 7 格，
 * 保证界面显示的是真数据而不是摆设。
 */
const SLOT_POS = [
    [-246, -232], [-82, -232], [82, -232], [246, -232],
    [-164, -392], [0, -392], [164, -392]
];

function makeCharacter() {
    const b = new Builder("character");
    const root = panel(b, "character");
    banner(b, root, "LabTitle", "我的斗鸡", 572, 500);

    const pw = card(b, root, "PowerCard", 0, 452, 620, 108, SF.panel_green);
    iconNode(b, pw, "PowerIcon", SF.icon_power, -228, 0, 76);
    textNode(b, pw, "LabPowerTag", "战力", -128, 0, { font: 28, w: 110, h: 40, color: INK.cream, outline: true });
    textNode(b, pw, "LabPower", "0", 108, 0, { font: 54, w: 280, h: 68, color: INK.gold, outline: true });

    card(b, root, "InfoCard", 0, 214, 640, 340);
    b.node({ name: "ChickenSlot", parent: root, x: -166, y: 214, w: 250, h: 320 });

    const statIcons = [SF.icon_hp, SF.icon_atk, SF.icon_def, SF.icon_spd];
    const statNames = ["生命", "攻击", "防御", "速度"];
    const statKeys = ["Hp", "Atk", "Def", "Spd"];
    statKeys.forEach((k, i) => {
        const y = 322 - i * 72;
        iconNode(b, root, "Icon" + k, statIcons[i], 26, y, 46);
        textNode(b, root, "LabName" + k, statNames[i], 108, y, { font: 24, w: 90, h: 34, color: INK.mute, align: 0 });
        textNode(b, root, "LabVal" + k, "0", 232, y, { font: 30, w: 130, h: 40, color: INK.dark, align: 2 });
    });

    textNode(b, root, "LabEquipTitle", "装备", 0, -128, { font: 28, w: 300, h: 40, color: INK.cream, outline: true });
    SLOT_POS.forEach(([x, y], i) => {
        const slot = b.node({ name: "Slot" + i, parent: root, x, y, w: 142, h: 142 });
        b.sprite(slot, [255, 255, 255, 255], 1, SF.slot_frame);
        const icon = b.node({ name: "SlotIcon" + i, parent: slot, y: 10, w: 88, h: 88 });
        b.sprite(icon, [255, 255, 255, 255], 0, WHITE);
        textNode(b, slot, "LabSlot" + i, "", 0, -50, { font: 18, w: 134, h: 24, color: INK.dark });
    });

    card(b, root, "SetCard", 0, -522, 640, 76, SF.panel_cream);
    textNode(b, root, "LabSets", "未激活套装", 0, -522, { font: 22, w: 600, h: 58, color: INK.dark });
    labBtn(b, root, "BtnBack", "返回", 0, -600, 280, 68, "orange");

    writePrefab("assets/bundle/gui/character/character.prefab", b.finish(root));
}

function makePrebattle() {
    const b = new Builder("prebattle");
    const root = panel(b, "prebattle", SF.bg_prebattle);
    banner(b, root, "LabTitle", "战前", 588, 560);

    const foe = card(b, root, "EnemyCard", 0, 378, 620, 286, SF.panel_cream);
    b.node({ name: "EnemySlot", parent: foe, x: -178, y: 4, w: 200, h: 250 });
    textNode(b, foe, "LabEnemyName", "对手", 68, 74, { font: 30, w: 320, h: 42, color: INK.dark });
    iconNode(b, foe, "EnemyPowerIcon", SF.icon_power, -34, -6, 48);
    textNode(b, foe, "LabEnemyPower", "0", 108, -6, { font: 40, w: 200, h: 52, color: INK.bad, align: 0 });
    textNode(b, foe, "LabEnemyExtra", "", 68, -78, { font: 20, w: 320, h: 30, color: INK.mute });

    iconNode(b, root, "BadgeVs", SF.badge_vs, 0, 196, 138);

    const me = card(b, root, "PlayerCard", 0, 24, 620, 286);
    b.node({ name: "PlayerSlot", parent: me, x: -178, y: 4, w: 200, h: 250 });
    textNode(b, me, "LabPlayerName", "村口鸡", 68, 74, { font: 30, w: 320, h: 42, color: INK.dark });
    iconNode(b, me, "PlayerPowerIcon", SF.icon_power, -34, -6, 48);
    textNode(b, me, "LabPlayerPower", "0", 108, -6, { font: 40, w: 200, h: 52, color: INK.good, align: 0 });
    textNode(b, me, "LabExtra", "", 68, -78, { font: 20, w: 320, h: 30, color: INK.mute });

    const stats = b.node({ name: "StatSlot", parent: root, x: 0, y: -278, w: 640, h: 258 });
    b.layout(stats, { type: 2, cellH: 56, gapY: 6, pad: 4 });

    labBtn(b, root, "BtnFight", "开战", 0, -560, 420, 92, "red");
    writePrefab("assets/bundle/gui/prebattle/prebattle.prefab", b.finish(root));
}

/** 双方在场地里的落点，和 BattleViewComp 的 P_HOME / E_HOME 一致。 */
const BATTLE_HOME = { player: [-100, -160], enemy: [100, 160] };

function makeBattle() {
    const b = new Builder("battle");
    const root = panel(b, "battle", SF.bg_arena);
    textNode(b, root, "LabTitle", "战斗", 0, 610, { font: 26, w: 640, h: 36, color: INK.cream, outline: true });

    textNode(b, root, "LabEnemyName", "对手", -140, 572, { font: 24, w: 300, h: 34, color: INK.cream, outline: true, align: 0 });
    hpBar(b, root, "BarEnemy", "BarEnemyFill", 0, 534, [198, 62, 48, 255]);
    textNode(b, root, "LabEnemyHp", "0/0", 0, 534, { font: 20, w: 300, h: 28, color: INK.cream, outline: true });

    const arena = b.node({ name: "Arena", parent: root, x: 0, y: 10, w: 720, h: 960 });
    b.node({ name: "EnemySlot", parent: arena, x: BATTLE_HOME.enemy[0], y: BATTLE_HOME.enemy[1], w: 40, h: 40 });
    b.node({ name: "PlayerSlot", parent: arena, x: BATTLE_HOME.player[0], y: BATTLE_HOME.player[1], w: 40, h: 40 });

    textNode(b, root, "LabLog", "", 0, -452, { font: 32, w: 640, h: 46, color: INK.gold, outline: true, outlineWidth: 4 });

    textNode(b, root, "LabPlayerName", "村口鸡", -140, -518, { font: 24, w: 300, h: 34, color: INK.cream, outline: true, align: 0 });
    hpBar(b, root, "BarPlayer", "BarPlayerFill", 0, -562, [58, 148, 62, 255]);
    textNode(b, root, "LabPlayerHp", "0/0", 0, -562, { font: 20, w: 300, h: 28, color: INK.cream, outline: true });

    b.node({ name: "FxLayer", parent: root, x: 0, y: 0, w: 720, h: 1280 });
    writePrefab("assets/bundle/gui/battle/battle.prefab", b.finish(root));
}

function makeResult() {
    const b = new Builder("result");
    const root = panel(b, "result");
    const confetti = b.node({ name: "Confetti", parent: root, w: 720, h: 1280 });
    b.sprite(confetti, [255, 255, 255, 180], 0, SF.confetti);

    const burst = b.node({ name: "Burst", parent: root, x: 0, y: 430, w: 620, h: 320 });
    b.sprite(burst, [255, 255, 255, 255], 0, SF.burst_win);
    textNode(b, burst, "LabTitle", "胜利", 0, 6, { font: 68, w: 460, h: 90, color: INK.cream, outline: true, outlineWidth: 5 });

    b.node({ name: "ChickenSlot", parent: root, x: 0, y: 76, w: 280, h: 300 });

    const gain = card(b, root, "GainCard", 0, -190, 560, 140, SF.panel_cream);
    iconNode(b, gain, "GoldIcon", SF.icon_coin, -152, 0, 62);
    textNode(b, gain, "LabGold", "+0", -20, 0, { font: 42, w: 240, h: 56, color: INK.dark, align: 0 });
    textNode(b, gain, "LabDesc", "", 0, -46, { font: 20, w: 500, h: 30, color: INK.mute });

    textNode(b, root, "LabHint", "点击继续", 0, -330, { font: 24, w: 600, h: 36, color: INK.cream, outline: true });
    labBtn(b, root, "BtnNext", "继续", 0, -546, 400, 88, "green");
    writePrefab("assets/bundle/gui/result/result.prefab", b.finish(root));
}

function makeReward() {
    const b = new Builder("reward");
    const root = panel(b, "reward");
    banner(b, root, "LabTitle", "三选一", 572, 460);
    topBar(b, root, 470);
    textNode(b, root, "LabHint", "挑一份带走，或只要金币", 0, 418, { font: 24, w: 600, h: 36, color: INK.cream, outline: true });
    textNode(b, root, "LabDesc", "", 0, 378, { font: 20, w: 600, h: 30, color: INK.cream, outline: true });

    const cards = b.node({ name: "CardSlot", parent: root, x: 0, y: 40, w: 660, h: 620 });
    b.layout(cards, { type: 2, cellH: 168, gapY: 14, pad: 8 });

    labBtn(b, root, "BtnSkip", "只要金币", 0, -560, 360, 80, "orange");
    writePrefab("assets/bundle/gui/reward/reward.prefab", b.finish(root));
}

function makeShop() {
    const b = new Builder("shop");
    const root = panel(b, "shop");
    signboard(b, root, "LabTitle", "鸡市", 578, 500);
    topBar(b, root, 468);
    textNode(b, root, "LabDesc", "", 0, 404, { font: 20, w: 620, h: 30, color: INK.cream, outline: true });

    textNode(b, root, "LabItems", "散件", -250, 364, { font: 26, w: 160, h: 38, color: INK.cream, outline: true, align: 0 });
    const items = b.node({ name: "ItemSlot", parent: root, x: 0, y: 152, w: 660, h: 372 });
    b.layout(items, { type: 0, cols: 2, cellW: 316, cellH: 112, gapX: 12, gapY: 10, pad: 6 });

    textNode(b, root, "LabSets", "套装", -250, -76, { font: 26, w: 160, h: 38, color: INK.cream, outline: true, align: 0 });
    const sets = b.node({ name: "SetSlot", parent: root, x: 0, y: -218, w: 660, h: 246 });
    b.layout(sets, { type: 0, cols: 2, cellW: 316, cellH: 112, gapX: 12, gapY: 10, pad: 6 });

    textNode(b, root, "LabHint", "补给", 0, -380, { font: 22, w: 620, h: 32, color: INK.cream, outline: true });
    labBtn(b, root, "BtnLeave", "离开商店", 0, -540, 380, 84, "orange");
    writePrefab("assets/bundle/gui/shop/shop.prefab", b.finish(root));
}

function makeEnding() {
    const b = new Builder("ending");
    const root = panel(b, "ending");
    const confetti = b.node({ name: "Confetti", parent: root, w: 720, h: 1280 });
    b.sprite(confetti, [255, 255, 255, 200], 0, SF.confetti);

    const burst = b.node({ name: "Burst", parent: root, x: 0, y: 440, w: 640, h: 310 });
    b.sprite(burst, [255, 255, 255, 255], 0, SF.burst_win);
    textNode(b, burst, "LabTitle", "村口鸡王", 0, 6, { font: 56, w: 520, h: 78, color: INK.cream, outline: true, outlineWidth: 5 });

    b.node({ name: "ChickenSlot", parent: root, x: 0, y: 90, w: 260, h: 300 });

    const gain = card(b, root, "GainCard", 0, -200, 580, 156, SF.panel_cream);
    textNode(b, gain, "LabDesc", "你打败了坤坤。", 0, 34, { font: 26, w: 520, h: 40, color: INK.dark });
    iconNode(b, gain, "GoldIcon", SF.icon_coin, -104, -32, 52);
    textNode(b, gain, "LabGold", "0", 24, -32, { font: 32, w: 220, h: 44, color: INK.dark, align: 0 });

    textNode(b, root, "LabHint", "", 0, -332, { font: 22, w: 600, h: 34, color: INK.cream, outline: true });
    labBtn(b, root, "BtnRestart", "再来一局", 0, -546, 400, 88, "green");
    writePrefab("assets/bundle/gui/ending/ending.prefab", b.finish(root));
}

//#endregion

//#region 复用预制体

function makeChicken() {
    const b = new Builder("chicken");
    const root = b.node({ name: "chicken", w: 260, h: 420 });
    const parts = [
        ["Shadow", 0, -168, 170, 32, SF.shadow, [255, 255, 255, 160], 1],
        ["Tail", -78, -6, 100, 110, SF.tail, [255, 255, 255, 255], 1],
        ["LegL", -34, -132, 44, 100, SF.leg, [255, 255, 255, 255], 1],
        ["LegR", 30, -128, 44, 100, SF.leg, [255, 255, 255, 255], -1],
        ["Body", 0, -32, 158, 148, SF.body, [255, 255, 255, 255], 1],
        ["Neck", 8, 78, 46, 130, SF.neck, [255, 255, 255, 255], 1],
        ["Wing", 52, -16, 100, 86, SF.wing, [255, 255, 255, 255], 1],
        ["Head", 16, 158, 108, 108, SF.head, [255, 255, 255, 255], 1],
        ["Comb", 10, 214, 58, 46, SF.comb, [255, 255, 255, 255], 1],
        ["Beak", 62, 150, 52, 34, SF.beak, [255, 255, 255, 255], 1],
        ["Eyes", 24, 166, 60, 42, SF.eyes, [255, 255, 255, 255], 1]
    ];
    for (const p of parts) {
        const id = b.node({ name: p[0], parent: root, x: p[1], y: p[2], w: p[3], h: p[4], sx: p[7] });
        b.sprite(id, p[6], 0, p[5]);
    }
    const face = b.node({ name: "Face", parent: root, x: 26, y: 166, w: 48, h: 32 });
    b.label(face, "凶", { font: 20, w: 48, h: 32, color: INK.dark });
    writePrefab("assets/bundle/game/prefab/chicken.prefab", b.finish(root));
}

function makeFx(name, text, col, frame = WHITE) {
    const b = new Builder(name);
    const root = b.node({ name, w: 200, h: 70 });
    b.sprite(root, col, 1, frame);
    textNode(b, root, "LabText", text, 0, 0, { font: 26, w: 180, h: 50, color: INK.cream, outline: true });
    writePrefab(`assets/bundle/game/prefab/${name}.prefab`, b.finish(root));
}

function makeTauntBubble() {
    const b = new Builder("taunt_bubble");
    const root = b.node({ name: "taunt_bubble", w: 300, h: 110 });
    b.sprite(root, [255, 255, 255, 255], 1, SF.bubble_taunt);
    textNode(b, root, "LabText", "垃圾话", 0, 8, { font: 22, w: 260, h: 66, color: INK.dark });
    writePrefab("assets/bundle/game/prefab/taunt_bubble.prefab", b.finish(root));
}

/** 商店条目：左图标 + 中文字 + 右按钮，尺寸对齐 shop 的两列网格。 */
function makeShopItem() {
    const b = new Builder("shop_item");
    const root = b.node({ name: "shop_item", w: 316, h: 112 });
    b.sprite(root, [255, 255, 255, 255], 1, SF.panel_white);
    b.button(root);

    const slot = b.node({ name: "IconSlot", parent: root, x: -114, w: 86, h: 86 });
    b.sprite(slot, [255, 255, 255, 255], 1, SF.slot_frame);
    const icon = b.node({ name: "Icon", parent: slot, w: 62, h: 62 });
    b.sprite(icon, [255, 255, 255, 255], 0, WHITE);

    textNode(b, root, "LabTitle", "商品", -6, 30, { font: 21, w: 142, h: 30, color: INK.dark, align: 0 });
    textNode(b, root, "LabDesc", "描述", -6, 2, { font: 15, w: 142, h: 26, color: INK.mute, align: 0 });
    const price = b.node({ name: "PriceRow", parent: root, x: -6, y: -30, w: 142, h: 30 });
    iconNode(b, price, "PriceIcon", SF.icon_coin, -58, 0, 30);
    textNode(b, price, "LabPrice", "0", 8, 0, { font: 20, w: 100, h: 28, color: INK.dark, align: 0 });

    labBtn(b, root, "BtnBuy", "买", 112, 0, 72, 60, "green");
    writePrefab("assets/bundle/game/prefab/shop_item.prefab", b.finish(root));
}

/** 三选一奖励卡：整行大卡。 */
function makeRewardCard() {
    const b = new Builder("reward_card");
    const root = b.node({ name: "reward_card", w: 620, h: 156 });
    b.sprite(root, [255, 255, 255, 255], 1, SF.panel_white);
    b.button(root);

    const slot = b.node({ name: "IconSlot", parent: root, x: -238, w: 108, h: 108 });
    b.sprite(slot, [255, 255, 255, 255], 1, SF.slot_frame);
    iconNode(b, slot, "Icon", SF.icon_star, 0, 0, 76);

    textNode(b, root, "LabTitle", "奖励", -22, 40, { font: 28, w: 320, h: 40, color: INK.dark, align: 0 });
    textNode(b, root, "LabDesc", "描述", -22, 2, { font: 19, w: 320, h: 32, color: INK.mute, align: 0 });
    const gold = b.node({ name: "GoldRow", parent: root, x: -22, y: -38, w: 320, h: 34 });
    iconNode(b, gold, "GoldIcon", SF.icon_coin, -140, 0, 34);
    textNode(b, gold, "LabGold", "0", -66, 0, { font: 22, w: 120, h: 30, color: INK.dark, align: 0 });

    labBtn(b, root, "BtnPick", "选", 232, 0, 100, 68, "green");
    writePrefab("assets/bundle/game/prefab/reward_card.prefab", b.finish(root));
}

/** 战前属性对比行：名字 / 我方 / 箭头 / 敌方。 */
function makeStatRow() {
    const b = new Builder("stat_row");
    const root = b.node({ name: "stat_row", w: 620, h: 52 });
    b.sprite(root, [255, 255, 255, 40], 1, SF.panel_white);

    iconNode(b, root, "Icon", SF.icon_hp, -268, 0, 40);
    textNode(b, root, "LabName", "生命", -186, 0, { font: 22, w: 110, h: 34, color: INK.dark, align: 0 });
    textNode(b, root, "LabPlayer", "0", -30, 0, { font: 24, w: 130, h: 34, color: INK.good, align: 2 });
    iconNode(b, root, "Arrow", SF.icon_up, 66, 0, 32);
    textNode(b, root, "LabEnemy", "0", 200, 0, { font: 24, w: 130, h: 34, color: INK.bad, align: 2 });

    writePrefab("assets/bundle/game/prefab/stat_row.prefab", b.finish(root));
}

//#endregion

function writeWhitePng() {
    const w = 64, h = 64;
    const raw = Buffer.alloc((w * 4 + 1) * h, 0);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * (w * 4 + 1) + 1 + x * 4;
            raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 255;
        }
    }
    const compressed = zlib.deflateSync(raw);
    function crc32(buf) {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        return (c ^ 0xffffffff) >>> 0;
    }
    function chunk(type, data) {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("IDAT", compressed),
        chunk("IEND", Buffer.alloc(0))
    ]);
    const dir = path.join(ROOT, "assets/bundle/game/texture");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "white.png"), png);
}

makeCustomize();
makeMap();
makeCharacter();
makePrebattle();
makeBattle();
makeResult();
makeReward();
makeShop();
makeEnding();
makeChicken();
makeFx("fx_hit", "-10", [200, 60, 60, 220]);
makeFx("fx_skill", "技能", [80, 80, 220, 220]);
makeFx("fx_heal", "+8", [60, 180, 80, 220]);
makeFx("fx_start", "开战！", [40, 40, 40, 230]);
makeTauntBubble();
makeShopItem();
makeRewardCard();
makeStatRow();
writeWhitePng();
console.log("prefabs generated");
