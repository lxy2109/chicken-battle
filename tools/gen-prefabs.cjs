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
/**
 * 编辑器内置的纯白图，给需要靠 _color 染色的方块和特效底用。
 * 别写成 56a0bfc3-…ae06：那是框架模板 common/texture/btn_ok.png 的 uuid，
 * 拿它当白底的话所有染色块都会顶着一张按钮图。
 */
const WHITE = "7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca@f9941";

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
    const id = b.node({ name, parent, x, y, w: 32, h: 32 });
    b.sprite(id, [255, 255, 255, 255], 1, SF.slot_frame);
    b.button(id);
    const chip = b.node({ name: name + "Chip", parent: id, w: 22, h: 22 });
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

/** 原型交付表是 1080×1920，项目保持 720×1280；所有标注坐标统一从左上角换算。 */
const DESIGN_SCALE = 2 / 3;
function layoutBox(x, y, w, h) {
    return {
        x: Math.round((x + w / 2 - 540) * DESIGN_SCALE),
        y: Math.round((960 - y - h / 2) * DESIGN_SCALE),
        w: Math.round(w * DESIGN_SCALE),
        h: Math.round(h * DESIGN_SCALE)
    };
}

function placeNode(b, parent, name, x, y, w, h, extra = {}) {
    return b.node(Object.assign({ name, parent }, layoutBox(x, y, w, h), extra));
}

function placeCard(b, parent, name, x, y, w, h, frame = SF.panel_white) {
    const r = layoutBox(x, y, w, h);
    return card(b, parent, name, r.x, r.y, r.w, r.h, frame);
}

function placeText(b, parent, name, text, x, y, w, h, opt = {}) {
    const r = layoutBox(x, y, w, h);
    return textNode(b, parent, name, text, r.x, r.y, Object.assign({}, opt, { w: r.w, h: r.h }));
}

function placeButton(b, parent, name, text, x, y, w, h, kind = "yellow") {
    const r = layoutBox(x, y, w, h);
    return labBtn(b, parent, name, text, r.x, r.y, r.w, r.h, kind);
}

/** 原型统一标题栏：深色木牌、左侧标题，留出顶部安全边距。 */
function header(b, parent, name, text) {
    const r = layoutBox(44, 34, 992, 116);
    const bg = b.node({ name: name + "Bg", parent, x: r.x, y: r.y, w: r.w, h: r.h });
    b.sprite(bg, [255, 255, 255, 255], 1, SF.banner_wood);
    textNode(b, bg, name, text, -130, 0, {
        font: 32, w: 360, h: 42, color: INK.cream, outline: true, align: 0
    });
    return bg;
}

function iconNode(b, parent, name, frame, x, y, s) {
    const id = b.node({ name, parent, x, y, w: s, h: s });
    b.sprite(id, [255, 255, 255, 255], 0, frame);
    return id;
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
    // 相邻界面增加节点不应改写内容相同的预制体，仅忽略生成序号 fileId。
    if (fs.existsSync(full)) {
        const content = value => JSON.stringify(value, (key, item) => key === "fileId" ? undefined : item);
        if (content(JSON.parse(fs.readFileSync(full, "utf8"))) === content(objs)) return;
    }
    fs.writeFileSync(full, JSON.stringify(objs, null, 2));
}

//#endregion

//#region 界面

function makeCustomize() {
    const b = new Builder("customize");
    const root = panel(b, "customize", SF.bg_village_figma);
    const edit = b.node({ name: "CustomizePanel", parent: root, w: 720, h: 1280, active: false });
    placeText(b, edit, "LabTitle", "自定义你的专属战鸡", 230, 50, 620, 76, { font: 34, color: INK.cream, outline: true });
    placeNode(b, edit, "ChickenSlot", 310, 310, 460, 690);
    placeCard(b, edit, "ControlCard", 0, 1090, 1080, 830, SF.panel_green);
    const parts = [["Head", "头部"], ["Neck", "脖子"], ["Body", "身体"], ["Wing", "翅膀"], ["Leg", "脚部"]];
    parts.forEach(([part, label], i) => {
        placeButton(b, edit, "BtnPart" + part, label, 40 + i * 202, 1080, 190, 98, "green");
        const row = placeNode(b, edit, "ColorRow" + part, 0, 0, 1080, 1920, { active: part === "Body" });
        for (let k = 0; k < 6; k++) {
            const r = layoutBox(110 + k * 155, 1275, 90, 90);
            const chip = colorBtn(b, row, "BtnColor" + part + k, r.x, r.y, palette([0, 1, 9, 4, 7, 5][k]));
            b.objs[chip]._lscale = vec3(1.75, 1.75, 1);
        }
    });
    placeText(b, edit, "LabPart", "正在染：躯干", 100, 1198, 880, 48, { font: 23 });
    placeCard(b, edit, "FaceCard", 70, 1390, 940, 140, SF.panel_cream);
    placeText(b, edit, "FaceLabel", "表情", 100, 1425, 160, 55, { font: 23 });
    ["凶", "呆", "傲", "萌"].forEach((t, i) => placeButton(b, edit, "BtnFace" + i, t, 290 + i * 166, 1410, 138, 96, "yellow"));
    placeCard(b, edit, "NameCard", 70, 1560, 940, 112, SF.panel_cream);
    placeText(b, edit, "LabName", "村口鸡", 100, 1580, 590, 70, { font: 27, align: 0 });
    placeButton(b, edit, "BtnRandomName", "随机", 750, 1580, 218, 72, "yellow");
    placeButton(b, edit, "BtnReset", "重置", 70, 1740, 220, 120, "orange");
    placeButton(b, edit, "BtnRandomSet", "随机装扮", 320, 1740, 320, 120, "green");
    placeButton(b, edit, "BtnEnter", "确定", 670, 1740, 340, 120, "yellow");
    const start = b.node({ name: "StartPanel", parent: root, w: 720, h: 1280 });
    b.sprite(start, [255, 255, 255, 255], 0, SF.bg_start_figma);
    placeButton(b, start, "BtnStart", "开始", 300, 1400, 480, 210, "red");
    placeButton(b, start, "BtnClearSave", "清除本地存档", 330, 1680, 420, 105, "yellow");
    placeText(b, start, "LabSaveHint", "进度与养成自动保存到本机", 120, 1820, 840, 75, { font: 18, color: INK.cream, outline: true });
    const clear = b.node({ name: "ClearSaveModal", parent: root, w: 720, h: 1280, active: false });
    b.sprite(clear, [0, 0, 0, 185]);
    b.addComp(clear, null, { type: "cc.BlockInputEvents" });
    placeCard(b, clear, "ClearSaveCard", 140, 600, 800, 600, SF.panel_cream);
    placeText(b, clear, "LabClearTitle", "清除本地存档", 200, 660, 680, 90, { font: 32 });
    placeText(b, clear, "LabClearDesc", "将删除关卡进度、强化、金币、装备和首通记录。此操作无法撤销。", 220, 790, 640, 180, { font: 23 });
    placeButton(b, clear, "BtnCancelClear", "取消", 220, 1030, 280, 105, "green");
    placeButton(b, clear, "BtnConfirmClear", "确认清除", 580, 1030, 280, 105, "red");
    writePrefab("assets/bundle/gui/customize/customize.prefab", b.finish(root));
}

function palette(i) {
    const pal = [
        [226, 59, 59], [244, 211, 94], [238, 150, 75], [123, 75, 42], [42, 157, 143],
        [38, 70, 83], [231, 111, 81], [255, 255, 255], [142, 68, 173], [52, 152, 219]
    ];
    return pal[i];
}

/** 关卡节点在地图上的落点，按原型从上到下推进。 */
// 地图仅显示三场小怪与 BOSS；商店为独立的统一入口。
// 坐标由 1080×1920 标注换算到 720×1280 设计区，节点只向前开放。
const MAP_NODES = [[122, -385], [-91, -218], [128, -44]];
const MAP_BOSS = [-218, 350];

function makeMap() {
    const b = new Builder("map");
    const root = panel(b, "map", SF.bg_map_figma);
    placeText(b, root, "LabTitle", "选择关卡", 250, 100, 580, 90, { font: 36, color: INK.cream, outline: true });
    placeButton(b, root, "BtnCharacter", "角色", 40, 35, 160, 130, "green");
    placeButton(b, root, "BtnHome", "保存并返回首页", 40, 189, 240, 80, "green");
    const gold = placeCard(b, root, "GoldCard", 810, 45, 225, 76, SF.bar_track);
    iconNode(b, gold, "GoldIcon", SF.icon_coin, -49, 0, 38);
    textNode(b, gold, "LabGold", "0", 20, 0, { font: 23, w: 90, h: 34, color: INK.cream, outline: true });
    placeCard(b, root, "RouteInfo", 310, 210, 460, 190, SF.panel_cream);
    placeText(b, root, "LabRouteTitle", "当前路线", 350, 220, 380, 44, { font: 22 });
    placeText(b, root, "LabPower", "战力 0", 340, 275, 400, 48, { font: 25 });
    placeText(b, root, "LabHint", "", 320, 332, 440, 46, { font: 16 });
    placeNode(b, root, "MapEnemySlot", 130, 1130, 170, 220);
    placeNode(b, root, "MapBossSlot", 785, 670, 170, 220);
    MAP_NODES.forEach(([x, y], i) => {
        const n = i + 1;
        const id = b.node({ name: "BtnStage" + n, parent: root, x, y, w: 82, h: 68 });
        b.sprite(id, [255, 255, 255, 255], 0, SF.node_stage);
        b.button(id);
        textNode(b, id, "LabStageNum" + n, String(n), 0, 4, { font: 27, w: 64, h: 36, color: INK.cream, outline: true });
        textNode(b, root, "LabStageName" + n, "", x, y - 52, { font: 19, w: 150, h: 30, color: INK.cream, outline: true });
    });
    const shop = b.node({ name: "BtnShop", parent: root, x: 245, y: 90, w: 104, h: 90 });
    b.sprite(shop, [255, 255, 255, 255], 0, SF.node_shop);
    b.button(shop);
    textNode(b, root, "LabShopName", "鸡友杂货铺", 245, 24, { font: 19, w: 170, h: 30, color: INK.cream, outline: true });
    const boss = b.node({ name: "BtnBoss", parent: root, x: MAP_BOSS[0], y: MAP_BOSS[1], w: 94, h: 78 });
    b.sprite(boss, [255, 255, 255, 255], 0, SF.node_boss);
    b.button(boss);
    textNode(b, root, "LabBossName", "鸡王", MAP_BOSS[0], MAP_BOSS[1] - 53, { font: 20, w: 180, h: 32, color: INK.cream, outline: true });
    placeButton(b, root, "BtnChallenge", "开始挑战", 220, 1730, 640, 130, "yellow");
    writePrefab("assets/bundle/gui/map/map.prefab", b.finish(root));
}

function makeCharacter() {
    const b = new Builder("character");
    const root = panel(b, "character", SF.bg_village_figma);
    placeText(b, root, "LabTitle", "我的战鸡", 260, 45, 560, 72, { font: 30, color: INK.cream, outline: true });
    placeButton(b, root, "BtnBack", "返回", 40, 35, 170, 100, "green");
    const power = placeCard(b, root, "PowerCard", 360, 155, 360, 96, SF.banner_red);
    iconNode(b, power, "PowerIcon", SF.icon_power, -86, 0, 48);
    textNode(b, power, "LabPower", "0", 25, 0, { font: 34, w: 150, h: 48, color: INK.gold, outline: true });
    placeNode(b, root, "ChickenSlot", 320, 410, 440, 620);
    const equipment = placeNode(b, root, "EquipCard", 0, 1140, 1080, 779);
    b.sprite(equipment, [34, 32, 47, 255]);
    ["头", "脖子", "身体", "脚", "套装"].forEach((name, i) =>
        placeButton(b, root, "BtnTab" + i, name, 25 + i * 210, 1160, 190, 100, "green"));
    placeText(b, root, "LabPartInfo", "", 50, 1280, 980, 70, { font: 20, color: INK.cream });
    for (let i = 0; i < 8; i++) {
        const slot = placeCard(b, root, "Slot" + i, 55 + i % 4 * 245, 1380 + Math.floor(i / 4) * 185, 230, 170, SF.slot_frame);
        b.button(slot);
        iconNode(b, slot, "SlotIcon" + i, SF.icon_star, 0, 22, 56);
        textNode(b, slot, "LabSlot" + i, "", 0, -25, { font: 14, w: 145, h: 24 });
        textNode(b, slot, "LabSlotState" + i, "", 0, -48, { font: 11, w: 145, h: 18 });
    }
    const empty = placeText(b, root, "LabEmpty", "该部位暂无装备", 100, 1450, 880, 100, { font: 25, color: INK.cream });
    b.objs[empty]._active = false;
    placeText(b, root, "LabSets", "", 60, 1780, 960, 100, { font: 18, color: INK.cream });
    writePrefab("assets/bundle/gui/character/character.prefab", b.finish(root));
}

function makePrebattle() {
    const b = new Builder("prebattle");
    const root = panel(b, "prebattle", SF.bg_arena_figma);
    const dim = b.node({ name: "Dim", parent: root, w: 720, h: 1280 });
    b.sprite(dim, [15, 17, 25, 158]);
    const sign = placeCard(b, root, "StageSign", 315, 300, 450, 200, SF.banner_wood);
    textNode(b, sign, "LabTitle", "战前准备", 0, 0, { font: 34, w: 270, h: 70, color: INK.cream, outline: true });
    const keys = ["Hp", "Atk", "Spd", "Combo", "Crit"];
    const names = ["生命", "攻击伤害", "敏捷", "连击", "暴击"];
    const icons = [SF.icon_hp, SF.icon_atk, SF.icon_spd, SF.icon_feather, SF.icon_power];
    for (const side of ["Player", "Enemy"]) {
        const left = side === "Player";
        const x = left ? 30 : 560;
        const area = placeCard(b, root, side + "Card", x, 575, 490, 770, SF.panel_white);
        const sprite = b.objs[area]._components.map(r => b.objs[r.__id__]).find(c => c.__type__ === "cc.Sprite");
        sprite._color = left ? color(255, 185, 58) : color(170, 116, 240);
        placeNode(b, root, side + "Slot", x + 35, 600, 130, 170);
        placeText(b, root, "Lab" + side + "Name", left ? "我方" : "对手", x + 180, 600, 275, 65, { font: 25, color: INK.cream, outline: true });
        placeText(b, root, "Lab" + side + "Power", "0", x + 190, 680, 260, 60, { font: 34, color: INK.cream, outline: true });
        keys.forEach((key, i) => {
            const row = placeCard(b, root, side + "Stat" + key, x + 28, 800 + i * 83, 435, 72, SF.bar_track);
            iconNode(b, row, side + "Icon" + key, icons[i], -117, 0, 32);
            textNode(b, row, side + "StatName" + key, names[i], -37, 0, { font: 16, w: 110, h: 30, color: INK.cream });
            textNode(b, row, "Lab" + side + key, "0", 95, 0, { font: 23, w: 80, h: 32, color: INK.gold });
        });
        placeText(b, root, left ? "LabExtra" : "LabEnemyExtra", "", x + 30, 1230, 430, 70, { font: 15, color: INK.cream, outline: true });
    }
    const vs = placeNode(b, root, "VsBadge", 430, 440, 220, 160);
    b.sprite(vs, [255, 255, 255, 255], 0, SF.badge_vs);
    placeText(b, root, "LabDiff", "VS", 430, 460, 220, 90, { font: 48, color: INK.gold, outline: true, outlineWidth: 4 });
    keys.forEach((key, i) => placeText(b, root, "LabDiff" + key, "", 45 + i * 200, 1385, 190, 52, { font: 13, color: INK.cream, outline: true }));
    placeButton(b, root, "BtnFight", "开始", 350, 1510, 380, 170, "red");
    writePrefab("assets/bundle/gui/prebattle/prebattle.prefab", b.finish(root));
}

/** 双方在场地里的落点，和 BattleViewComp 的 P_HOME / E_HOME 一致。 */
const BATTLE_HOME = { player: [-160, -76], enemy: [160, -76] };

function makeBattle() {
    const b = new Builder("battle");
    const root = panel(b, "battle", SF.bg_arena_figma);
    placeText(b, root, "LabTitle", "自动战斗", 380, 260, 320, 60, { font: 23, color: INK.cream, outline: true });
    for (const side of ["Player", "Enemy"]) {
        const x = side === "Player" ? -178 : 178;
        const bar = b.node({ name: "Bar" + side, parent: root, x, y: 520, w: 290, h: 48 });
        b.sprite(bar, [255, 255, 255, 255], 1, SF.bar_track);
        const fill = b.node({ name: "Bar" + side + "Fill", parent: bar, w: 264, h: 26 });
        b.sprite(fill, [244, 46, 63, 255], 3, WHITE, 1);
        textNode(b, root, "Lab" + side + "Name", "", x, 571, { font: 22, w: 280, h: 34, color: INK.cream, outline: true });
        textNode(b, bar, "Lab" + side + "Hp", "0/0", 0, 0, { font: 17, w: 240, h: 26, color: INK.cream, outline: true });
    }
    const arena = b.node({ name: "Arena", parent: root, x: 0, y: 0, w: 680, h: 830 });
    b.node({ name: "PlayerSlot", parent: arena, x: BATTLE_HOME.player[0], y: BATTLE_HOME.player[1], w: 40, h: 40 });
    b.node({ name: "EnemySlot", parent: arena, x: BATTLE_HOME.enemy[0], y: BATTLE_HOME.enemy[1], w: 40, h: 40 });
    placeText(b, root, "LabLog", "", 75, 1550, 930, 100, { font: 28, color: INK.cream, outline: true, outlineWidth: 3 });
    placeText(b, root, "LabBattleHint", "战鸡自动出招", 230, 1790, 620, 54, { font: 20, color: INK.cream, outline: true });
    placeText(b, root, "LabDanmaku", "", 140, 400, 800, 65, { font: 23, color: INK.cream, outline: true });
    b.node({ name: "FxLayer", parent: root, w: 720, h: 1280 });
    writePrefab("assets/bundle/gui/battle/battle.prefab", b.finish(root));
}

function makeResult() {
    const b = new Builder("result");
    const root = panel(b, "result", SF.bg_village_figma);
    const dim = b.node({ name: "Dim", parent: root, w: 720, h: 1280 });
    b.sprite(dim, [18, 14, 28, 170]);
    const confetti = b.node({ name: "Confetti", parent: root, w: 720, h: 1280 });
    b.sprite(confetti, [255, 255, 255, 200], 0, SF.confetti);
    const burst = placeNode(b, root, "Burst", 90, 130, 900, 430);
    b.sprite(burst, [255, 255, 255, 255], 0, SF.burst_win);
    placeText(b, root, "LabTitle", "胜利", 200, 300, 680, 100, { font: 52, color: INK.gold, outline: true, outlineWidth: 4 });
    placeNode(b, root, "ChickenSlot", 300, 660, 480, 540);
    const podium = placeCard(b, root, "Podium", 250, 1200, 580, 140, SF.banner_wood);
    textNode(b, podium, "LabHeader", "战斗结算", 0, 0, { font: 30, w: 340, h: 50, color: INK.cream, outline: true });
    placeText(b, root, "LabDesc", "本局获得", 180, 1390, 420, 60, { font: 24, color: INK.cream });
    const gain = placeNode(b, root, "GainCard", 580, 1380, 320, 80);
    iconNode(b, gain, "GoldIcon", SF.icon_coin, -70, 0, 46);
    textNode(b, gain, "LabGold", "+0", 25, 0, { font: 34, w: 150, h: 48, color: INK.gold, outline: true });
    placeText(b, root, "LabHint", "", 120, 1510, 840, 65, { font: 21, color: INK.cream, outline: true });
    placeButton(b, root, "BtnNext", "选择强化", 280, 1650, 520, 145, "green");
    writePrefab("assets/bundle/gui/result/result.prefab", b.finish(root));
}

function makeReward() {
    const b = new Builder("reward");
    const root = panel(b, "reward", SF.bg_arena_figma);
    const dim = b.node({ name: "Dim", parent: root, w: 720, h: 1280 });
    b.sprite(dim, [20, 17, 24, 165]);
    const banner = placeCard(b, root, "RewardBanner", 170, 320, 740, 120, SF.banner_wood);
    textNode(b, banner, "LabTitle", "战利品强化", 0, 0, { font: 29, w: 450, h: 54, color: INK.cream, outline: true });
    placeText(b, root, "LabHint", "选择一项强化", 120, 475, 840, 55, { font: 22, color: INK.cream, outline: true });
    const r = layoutBox(55, 640, 970, 820);
    const cards = b.node({ name: "CardSlot", parent: root, x: r.x, y: r.y, w: r.w, h: r.h });
    b.layout(cards, { type: 3, cols: 3, cellW: 200, cellH: 547, gapX: 16, gapY: 8, pad: 4 });
    placeText(b, root, "LabDesc", "点击卡片查看选择，再确认强化", 100, 1510, 880, 50, { font: 19, color: INK.cream, outline: true });
    placeButton(b, root, "BtnConfirm", "选择强化", 300, 1680, 480, 150, "green");
    const skip = b.node({ name: "BtnSkip", parent: root, w: 1, h: 1, active: false });
    b.button(skip);
    writePrefab("assets/bundle/gui/reward/reward.prefab", b.finish(root));
}

function makeShop() {
    const b = new Builder("shop");
    const root = panel(b, "shop", SF.bg_shop_figma);
    const gold = placeCard(b, root, "GoldCard", 760, 30, 280, 80, SF.bar_track);
    textNode(b, gold, "LabGold", "金币 0", 0, 0, { font: 21, w: 165, h: 38, color: INK.gold });
    placeButton(b, root, "BtnBack", "返回", 40, 30, 170, 100, "green");
    placeText(b, root, "LabPower", "战力 0", 260, 45, 400, 48, { font: 21, color: INK.cream, outline: true });
    const sign = placeCard(b, root, "ShopSign", 210, 260, 720, 250, SF.banner_wood);
    textNode(b, sign, "LabTitle", "鸡友杂货铺", 0, 0, { font: 40, w: 390, h: 80, color: INK.cream, outline: true });
    placeNode(b, root, "ShopkeeperSlot", 820, 460, 150, 180);
    placeCard(b, root, "SetArea", 45, 650, 990, 450, SF.panel_cream);
    placeText(b, root, "LabSets", "套装", 75, 675, 930, 50, { font: 22, align: 0 });
    const sr = layoutBox(45, 735, 990, 370);
    const sets = b.node({ name: "SetSlot", parent: root, x: sr.x, y: sr.y, w: sr.w, h: sr.h });
    b.layout(sets, { type: 3, cols: 2, cellW: 316, cellH: 112, gapX: 12, gapY: 10, pad: 6 });
    placeCard(b, root, "ItemArea", 45, 1110, 990, 550, SF.panel_cream);
    placeText(b, root, "LabItems", "单件商品", 75, 1125, 930, 55, { font: 22, align: 0 });
    const ir = layoutBox(60, 1200, 960, 450);
    const items = b.node({ name: "ItemSlot", parent: root, x: ir.x, y: ir.y, w: ir.w, h: ir.h });
    b.layout(items, { type: 3, cols: 4, cellW: 141, cellH: 287, gapX: 16, gapY: 10, pad: 6 });
    placeText(b, root, "LabDesc", "", 80, 1670, 920, 55, { font: 17, color: INK.cream, outline: true });
    placeButton(b, root, "BtnLeave", "返回地图", 300, 1760, 480, 120, "yellow");
    const modal = b.node({ name: "PurchaseModal", parent: root, w: 720, h: 1280, active: false });
    b.sprite(modal, [0, 0, 0, 185]);
    b.addComp(modal, null, { type: "cc.BlockInputEvents" });
    placeCard(b, modal, "PurchaseCard", 140, 530, 800, 820, SF.panel_cream);
    placeText(b, modal, "LabPurchaseTitle", "商品", 190, 570, 700, 80, { font: 34 });
    const preview = placeNode(b, modal, "PurchaseIcon", 440, 680, 200, 200);
    b.sprite(preview);
    placeText(b, modal, "LabPurchaseDesc", "", 220, 900, 640, 135, { font: 23 });
    placeText(b, modal, "LabPurchasePrice", "", 200, 1050, 680, 80, { font: 26 });
    placeButton(b, modal, "BtnCancelBuy", "取消", 220, 1180, 280, 105, "green");
    placeButton(b, modal, "BtnConfirmBuy", "购买", 580, 1180, 280, 105, "yellow");
    writePrefab("assets/bundle/gui/shop/shop.prefab", b.finish(root));
}

function makeEnding() {
    const b = new Builder("ending");
    const root = panel(b, "ending", SF.bg_village_figma);
    header(b, root, "LabHeader", "路线通关");
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
    labBtn(b, root, "BtnRestart", "返回首页", 0, -546, 400, 88, "green");
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

/** 套装条目：左图标 + 中文字 + 右按钮，尺寸对齐套装区的两列网格。 */
function makeShopSetItem() {
    const b = new Builder("shop_set_item");
    const root = b.node({ name: "shop_set_item", w: 316, h: 112 });
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
    writePrefab("assets/bundle/game/prefab/shop_set_item.prefab", b.finish(root));
}

/** 单件条目：四列竖卡，按原型固定的头饰 / 翅膀 / 身体 / 脚部顺序排列。 */
function makeShopItem() {
    const b = new Builder("shop_item");
    const root = b.node({ name: "shop_item", w: 141, h: 287 });
    b.sprite(root, [255, 255, 255, 255], 1, SF.panel_white);
    b.button(root);

    const slot = b.node({ name: "IconSlot", parent: root, x: 0, y: 62, w: 94, h: 94 });
    b.sprite(slot, [255, 255, 255, 255], 1, SF.slot_frame);
    const icon = b.node({ name: "Icon", parent: slot, w: 66, h: 66 });
    b.sprite(icon, [255, 255, 255, 255], 0, WHITE);

    textNode(b, root, "LabTitle", "商品", 0, 16, { font: 17, w: 126, h: 28, color: INK.dark });
    textNode(b, root, "LabDesc", "描述", 0, -16, { font: 12, w: 126, h: 28, color: INK.mute });
    const price = b.node({ name: "PriceRow", parent: root, x: 0, y: -56, w: 126, h: 28 });
    iconNode(b, price, "PriceIcon", SF.icon_coin, -38, 0, 24);
    textNode(b, price, "LabPrice", "0", 14, 0, { font: 16, w: 72, h: 24, color: INK.dark, align: 0 });

    labBtn(b, root, "BtnBuy", "购买", 0, -112, 104, 51, "green");
    writePrefab("assets/bundle/game/prefab/shop_item.prefab", b.finish(root));
}

/** 三选一奖励卡：整行大卡。 */
function makeRewardCard() {
    const b = new Builder("reward_card");
    const root = b.node({ name: "reward_card", w: 200, h: 547 });
    b.sprite(root, [255, 255, 255, 255], 1, SF.panel_cream);
    b.button(root);

    const banner = b.node({ name: "TitleBanner", parent: root, y: 218, w: 200, h: 96 });
    b.sprite(banner, [255, 255, 255, 255], 1, SF.banner_wood);
    const slot = b.node({ name: "IconSlot", parent: root, x: 0, y: 102, w: 130, h: 130 });
    b.sprite(slot, [255, 255, 255, 255], 1, SF.slot_frame);
    iconNode(b, slot, "Icon", SF.icon_star, 0, 0, 76);

    textNode(b, root, "LabTitle", "强化", 0, 218, { font: 22, w: 178, h: 70, color: INK.cream, outline: true });
    textNode(b, root, "LabDesc", "描述", 0, -32, { font: 21, w: 170, h: 116, color: INK.dark, align: 1 });
    const gold = b.node({ name: "GoldRow", parent: root, x: 0, y: -138, w: 178, h: 34 });
    iconNode(b, gold, "GoldIcon", SF.icon_coin, -48, 0, 30);
    textNode(b, gold, "LabGold", "0", 18, 0, { font: 21, w: 100, h: 30, color: INK.dark, align: 0 });

    const pick = labBtn(b, root, "BtnPick", "选择", 0, -178, 150, 64, "green");
    // 原型由底部统一按钮确认；保留旧节点名仅为旧预制体/脚本兼容，但不显示。
    b.objs[pick]._active = false;
    writePrefab("assets/bundle/game/prefab/reward_card.prefab", b.finish(root));
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
makeShopSetItem();
makeRewardCard();
writeWhitePng();
console.log("prefabs generated");
