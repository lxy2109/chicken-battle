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
const figmaAssets = require("./figma-assets.json");
const F = Object.fromEntries(Object.entries(figmaAssets).map(([key, value]) => [key, value.uuid + "@f9941"]));

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
    mute: [94, 69, 43, 255]
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
                _alignFlags: 18, _target: null,
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
        const font = Math.max(14, opt.font || 28);
        const col = opt.color || INK.dark;
        const outline = opt.outline || false;
        const w = opt.w || 240;
        const h = Math.max(opt.h || font + 12, Math.ceil(font * 1.2) + (outline ? 6 : 0));
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
                _paddingLeft: opt.pad ?? 6, _paddingRight: opt.pad ?? 6,
                _paddingTop: opt.pad ?? 6, _paddingBottom: opt.pad ?? 6,
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
    yellow: { frame: F['ui/figma_button_yellow'], ink: INK.cream, outline: true },
    green: { frame: F['ui/figma_button_green'], ink: INK.cream, outline: true },
    red: { frame: F['ui/figma_button_red'], ink: INK.cream, outline: true },
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
        font: 34,
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
        x: (x + w / 2 - 540) * DESIGN_SCALE,
        y: (960 - y - h / 2) * DESIGN_SCALE,
        w: w * DESIGN_SCALE,
        h: h * DESIGN_SCALE
    };
}

function placeNode(b, parent, name, x, y, w, h, extra = {}) {
    return b.node(Object.assign({ name, parent }, layoutBox(x, y, w, h), extra));
}

function figmaImage(b, parent, name, asset, box) {
    const r = box || figmaAssets[asset].box;
    const id = placeNode(b, parent, name, ...r);
    b.sprite(id, [255, 255, 255, 255], 0, F[asset]);
    return id;
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

/** Internal combat coordinates stay 720x1280; the project uses the Figma 1080x1920 canvas. */
function panel(b, name, bg = SF.bg_home) {
    const root = b.node({ name, w: 720, h: 1280, x: 0, y: 0, sx: 1.5, sy: 1.5 });
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
    placeText(b, edit, "LabStory", "", 100, 100, 880, 130, { font: 22, color: INK.cream, outline: true });
    placeNode(b, edit, "ChickenSlot", 275.5, 157, 530, 920);
    figmaImage(b, edit, "ControlCard", 'ui/figma_customize_base');
    figmaImage(b, edit, "Controls", 'ui/figma_customize_buttons');
    const colors = b.node({ name: "ColorOptions", parent: edit, w: 720, h: 1280 });
    figmaImage(b, colors, "ColorChips", 'ui/figma_customize_colors');
    const parts = ["Head", "Face", "Wing", "Body", "Leg"];
    parts.forEach((part, i) => {
        const tab = figmaImage(b, edit, "BtnPart" + part, 'ui/figma_tab', [68 + i * 190, 1140, 173, 151]);
        b.button(tab);
        iconNode(b, tab, "TabIcon" + part, F['ui/figma_tab_' + part.toLowerCase()], 0, 13, 65);
        if (part === "Face") return;
        const row = b.node({ name: "ColorRow" + part, parent: colors, w: 720, h: 1280, active: part === "Head" });
        for (let k = 0; k < 6; k++) {
            const chip = placeNode(b, row, "BtnColor" + part + k, 124 + k * 149, 1328, 112, 112);
            b.button(chip);
        }
    });
    placeText(b, edit, "LabPart", "", 100, 1480, 880, 45, { font: 23, color: INK.cream });
    const faces = b.node({ name: "FaceOptions", parent: edit, w: 720, h: 1280, active: false });
    ['dumb', 'cute', 'sad', 'fierce', 'proud', 'wink'].forEach((face, i) => {
        const tab = figmaImage(b, faces, "BtnFace" + i, 'ui/figma_expression_' + face);
        b.button(tab);
    });
    const random = placeNode(b, edit, "BtnRandomSet", 160, 1590, 350, 200);
    b.button(random);
    const enter = placeNode(b, edit, "BtnEnter", 580, 1590, 350, 200);
    b.button(enter);
    const nameInput = placeCard(b, edit, "NameInput", 140, 1530, 520, 90, SF.panel_cream);
    const nameLabel = textNode(b, nameInput, "LabName", "", 0, 0, { font: 36, w: 326, h: 48 });
    const placeholder = textNode(b, nameInput, "LabNamePlaceholder", "点击输入名字", 0, 0, { font: 30, w: 326, h: 48, color: INK.mute });
    // EditBox 将文字定位到输入框左上角，文字节点必须使用相同锚点。
    for (const label of [nameLabel, placeholder]) {
        b.objs[b.objs[label]._components[0].__id__]._anchorPoint = vec2(0, 1);
    }
    b.objs[placeholder]._active = false;
    b.addComp(nameInput, null, { type: "cc.EditBox", fields: {
        _backgroundImage: { __uuid__: SF.panel_cream, __expectedType__: "cc.SpriteFrame" },
        _textLabel: b.objs[nameLabel]._components.find(ref => b.objs[ref.__id__].__type__ === "cc.Label"),
        _placeholderLabel: b.objs[placeholder]._components.find(ref => b.objs[ref.__id__].__type__ === "cc.Label"),
        _string: "", _maxLength: 12, _inputMode: 6, _inputFlag: 5, _returnType: 1
    } });
    placeButton(b, edit, "BtnRandomName", "随机名字", 680, 1530, 280, 90, "yellow");
    const start = b.node({ name: "StartPanel", parent: root, w: 720, h: 1280 });
    b.sprite(start, [255, 255, 255, 255], 0, SF.bg_start_figma);
    placeButton(b, start, "BtnStart", "开始", 292, 1392, 496, 231, "red");
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
// 五图热身 2/2/3/3/5 加正式赛；第五图结束后进入坤坤挑战。运行时用 map_1..map_5，每图只放对应场次的热身节点。
// 坐标由 1080×1920 标注换算到 720×1280 设计区，节点只向前开放。
const MAP_NODES = [[134.333, -452.667], [-96.333, -274], [145, -93.333], [-10.333, 30.667], [85.667, 215.333]];
const MAP_BOSS = [-126.667, 326.667];

function makeMap() {
    const b = new Builder("map");
    const root = panel(b, "map", SF.bg_map_figma);
    placeText(b, root, "LabTitle", "选择关卡", 250, 100, 580, 90, { font: 36, color: INK.cream, outline: true });
    const avatar = figmaImage(b, root, "BtnCharacter", 'ui/figma_avatar', [40, 25, 180, 188]);
    b.button(avatar);
    const portrait = b.node({ name: "MapAvatarSlot", parent: avatar, x: 0, y: 3, w: 84, h: 84 });
    b.addComp(portrait, null, { type: "cc.Mask", fields: { _type: 1, _segments: 64 } });
    placeButton(b, root, "BtnHome", "首页", 40, 225, 160, 72, "green");
    figmaImage(b, root, "GoldCard", 'ui/figma_gold');
    placeText(b, root, "LabGold", "0", 917, 45, 102, 68, { font: 28, color: INK.cream, outline: true });
    placeText(b, root, "LabRouteTitle", "", 250, 210, 580, 60, { font: 26, color: INK.cream, outline: true });
    placeText(b, root, "LabPower", "", 250, 275, 580, 50, { font: 24, color: INK.cream, outline: true });
    placeText(b, root, "LabHint", "", 110, 1750, 860, 32, { font: 22, color: INK.cream, outline: true });
    MAP_NODES.forEach(([x, y], i) => {
        const n = i + 1;
        const id = b.node({ name: "BtnStage" + n, parent: root, x, y, w: 76.667, h: 64 });
        b.sprite(id, [255, 255, 255, 255], 0, SF.node_stage);
        b.button(id);
        textNode(b, id, "LabStageNum" + n, String(n), 0, -31, { font: 27, w: 66, h: 36, color: INK.cream, outline: true });
    });
    const shop = b.node({ name: "BtnShop", parent: root, x: 239.667, y: -301.333, w: 240.667, h: 272 });
    b.sprite(shop, [255, 255, 255, 255], 0, SF.node_shop);
    b.button(shop);
    textNode(b, root, "LabShopName", "小卖部", 252, -164, { font: 19, w: 136, h: 30, color: INK.cream, outline: true });
    const boss = b.node({ name: "BtnBoss", parent: root, x: MAP_BOSS[0], y: MAP_BOSS[1], w: 97.333, h: 81.333 });
    b.sprite(boss, [255, 255, 255, 255], 0, SF.node_boss);
    b.button(boss);
    textNode(b, root, "LabBossName", "鸡王", MAP_BOSS[0], MAP_BOSS[1] - 68, { font: 28, w: 180, h: 40, color: INK.cream, outline: true });
    // Draw all enemy previews after platforms and buildings, feet on the platform tops.
    MAP_NODES.forEach(([x, y], i) => b.node({ name: "StageEnemySlot" + (i + 1), parent: root, x, y: y + 67, w: 80, h: 112 }));
    b.node({ name: "MapBossSlot", parent: root, x: MAP_BOSS[0], y: MAP_BOSS[1] + 88, w: 106, h: 148 });
    placeButton(b, root, "BtnChallenge", "开始挑战", 220, 1810, 640, 100, "yellow");
    writePrefab("assets/bundle/gui/map/map.prefab", b.finish(root));
    // 运行时使用 map_1..map_5，背景和落点在编辑器里手调，不要用本函数覆盖。
}

function makeCharacter() {
    const b = new Builder("character");
    const root = panel(b, "character", SF.bg_arena_figma);
    const back = figmaImage(b, root, "BtnBack", 'ui/figma_back');
    b.button(back);
    figmaImage(b, root, "GoldCard", 'ui/figma_gold');
    placeText(b, root, "LabGold", "0", 917, 45, 102, 68, { font: 28, color: INK.cream, outline: true });
    figmaImage(b, root, "PowerCard", 'ui/figma_power');
    placeText(b, root, "LabPower", "0", 485, 149, 155, 70, { font: 36, color: INK.gold, outline: true });
    placeNode(b, root, "ChickenSlot", 340, 330, 400, 660);
    for (const [key, art] of [['Hp', 'hp'], ['Atk', 'atk'], ['Combo', 'combo'], ['Spd', 'spd']]) {
        const box = figmaAssets['ui/figma_stat_' + art].box;
        const card = figmaImage(b, root, key + 'Card', 'ui/figma_stat_' + art);
        b.objs[card]._active = false;
        const lab = placeText(b, root, 'Lab' + key, '', box[0] + 20, box[1] + 137, box[2] - 40, 50, { font: 24 });
        b.objs[lab]._active = false;
    }
    const equip = figmaImage(b, root, "EquipCard", 'ui/figma_equipment_panel');
    b.objs[equip]._active = false;
    const tray = placeNode(b, root, "SetTray", 40, 1180, 1000, 620);
    b.sprite(tray, [35, 33, 47, 210]);
    textNode(b, tray, "LabEmpty", "未集齐任何套装", 0, 0, { font: 28, w: 640, h: 80, color: INK.cream });
    placeButton(b, root, "BtnHideAppearance", "原皮出战", 250, 1000, 380, 88, "green");
    placeButton(b, root, "BtnHideHint", "!", 655, 1000, 88, 88, "yellow");
    const hint = b.node({ name: "HideHintModal", parent: root, w: 720, h: 1280, active: false });
    b.sprite(hint, [0, 0, 0, 185]);
    b.addComp(hint, null, { type: "cc.BlockInputEvents" });
    placeCard(b, hint, "HideHintCard", 140, 620, 800, 560, SF.panel_cream);
    placeText(b, hint, "LabHideHintTitle", "原皮出战", 200, 680, 680, 80, { font: 32 });
    placeText(b, hint, "LabHideHintDesc", "穿上套装后可选择原皮出战：保留套装属性和加成，外观仍用自定义染色。再点一次可切换回套装外观。", 220, 790, 640, 200, { font: 23 });
    placeButton(b, hint, "BtnCloseHideHint", "知道了", 360, 1020, 360, 105, "green");
    const prev = placeButton(b, root, "BtnPagePrev", "‹", 855, 1195, 75, 55, "green");
    const next = placeButton(b, root, "BtnPageNext", "›", 960, 1195, 75, 55, "green");
    b.objs[prev]._active = false;
    b.objs[next]._active = false;
    for (let i = 0; i < 8; i++) {
        const slot = figmaImage(b, root, "Slot" + i, 'ui/figma_equip_slot', [83 + i % 4 * 247, 1280 + Math.floor(i / 4) * 240, 180, 180]);
        b.objs[slot]._active = false;
        b.button(slot);
        iconNode(b, slot, "SlotIcon" + i, SF.icon_star, 0, 0, 96);
        textNode(b, slot, "LabSlot" + i, "", 0, -78, { font: 18, w: 150, h: 32, color: INK.cream });
        textNode(b, slot, "LabSlotState" + i, "", 0, 44, { font: 16, w: 110, h: 24, color: INK.cream, outline: true });
    }
    const sets = placeText(b, root, "LabSets", "", 60, 1800, 960, 80, { font: 22, color: INK.cream });
    b.objs[sets]._active = false;
    writePrefab("assets/bundle/gui/character/character.prefab", b.finish(root));
}

function makePrebattle() {
    const b = new Builder("prebattle");
    const root = panel(b, "prebattle", F['bg/prebattle_figma']);
    placeText(b, root, "LabTitle", "1-1", 335, 462, 390, 98, { font: 34, color: INK.cream, outline: true });

    const keys = ["Power", "Hp", "Atk", "Spd", "Combo", "Crit"];
    const tones = [[92, 209, 50, 255], [255, 80, 80, 255], [255, 185, 51, 255], [60, 181, 230, 255], [201, 102, 230, 255], [255, 221, 25, 255]];
    for (const side of ["Player", "Enemy"]) {
        const left = side === "Player";
        const group = b.node({ name: side + "Panel", parent: root, w: 720, h: 1280 });
        const art = placeNode(b, group, side + "PanelArt", 6, 614, 1073, 766);
        const picture = b.node({ name: side + "Picture", parent: art, w: 715.333, h: 510.667 });
        b.sprite(picture, [255,255,255,255], 0, F['ui/figma_match_card']);
        placeNode(b, group, side + "Slot", left ? 59 : 901, left ? 679 : 742, left ? 152 : 106, left ? 142 : 103);
        placeText(b, group, "Lab" + side + "Name", "", left ? 256 : 790, left ? 675 : 691, left ? 204 : 222, 52, { font: 26, color: INK.cream, outline: true });
        keys.forEach((key, i) => placeText(b, group, "Lab" + side + key, "0", left ? 125 : 867,
            614 + (left ? [251, 336, 422, 510, 595, 681][i] : [269, 348, 430, 511, 590, 669][i]),
            left ? 144 : 135, 44, { font: 25, color: tones[i], outline: true }));
    }
    const vs = b.node({ name: "VsBadge", parent: root, x: 0.667, y: -61.333, w: 286.667, h: 286.667 });
    const vsArt = b.node({ name: "VsArt", parent: vs, x: 1, y: 36.667, w: 715.333, h: 510.667 });
    b.sprite(vsArt, [255,255,255,255], 0, F['ui/figma_match_card']);
    placeButton(b, root, "BtnFight", "开始", 343.583, 1431, 396.833, 187.042, "red");
    placeText(b, root, "LabStory", "", 100, 1730, 880, 150, { font: 22, color: INK.cream, outline: true });
    writePrefab("assets/bundle/gui/prebattle/prebattle.prefab", b.finish(root));
}

/** 双方在场地里的落点，和 BattleViewComp 的 P_HOME / E_HOME 一致。 */
const BATTLE_HOME = { player: [-160, -76], enemy: [160, -76] };

function makeBattle() {
    const b = new Builder("battle");
    const root = panel(b, "battle", SF.bg_arena_figma);
    for (const side of ["Player", "Enemy"]) {
        const left = side === "Player";
        const r = layoutBox(left ? 149 : 579, 89, 362, 66);
        const bar = b.node({ name: "Bar" + side, parent: root, ...r });
        b.sprite(bar, [90, 90, 90, 255], 0, F['ui/figma_hp']);
        const fill = b.node({ name: "Bar" + side + "Fill", parent: bar, w: r.w, h: r.h });
        b.sprite(fill, [255, 255, 255, 255], 3, F['ui/figma_hp'], 1);
        textNode(b, bar, "Lab" + side + "Hp", "0/0", 0, 0, { font: 17, w: 210, h: 30, color: INK.cream, outline: true });
        figmaImage(b, root, side + "AvatarFrame", 'ui/figma_avatar', [left ? 44 : 889, 43, 157, 164]);
        const portrait = placeNode(b, root, side + "Portrait", left ? 57 : 902, 61, 124, 126);
        b.addComp(portrait, null, { type: "cc.Mask", fields: { _type: 1, _segments: 64 } });
        placeText(b, root, "Lab" + side + "Name", "", left ? 149 : 579, 210, 362, 45, { font: 22, color: INK.cream, outline: true });
    }
    const arena = b.node({ name: "Arena", parent: root, w: 720, h: 1280 });
    b.node({ name: "PlayerSlot", parent: arena, x: BATTLE_HOME.player[0], y: BATTLE_HOME.player[1], w: 40, h: 40 });
    b.node({ name: "EnemySlot", parent: arena, x: BATTLE_HOME.enemy[0], y: BATTLE_HOME.enemy[1], w: 40, h: 40 });
    placeText(b, root, "LabLog", "", 75, 1550, 930, 100, { font: 28, color: INK.cream, outline: true, outlineWidth: 3 });
    const danmaku = b.node({ name: "DanmakuLayer", parent: root, y: 405, w: 720, h: 160 });
    b.addComp(danmaku, null, { type: "cc.Mask", fields: { _type: 0 } });
    b.node({ name: "FxLayer", parent: root, w: 720, h: 1280 });
    writePrefab("assets/bundle/gui/battle/battle.prefab", b.finish(root));
}

function makeResult() {
    const b = new Builder("result");
    const root = panel(b, "result", F['bg/result_figma']);
    // Same jagged burst as the baked WINNER heading, tinted red so fail rhymes with victory.
    const loss = placeNode(b, root, "LossBanner", 90, 36, 900, 360, { active: false });
    b.sprite(loss, [230, 76, 64, 255], 0, SF.burst_win);
    textNode(b, loss, "LabTitle", "失败", 0, 6, { font: 68, w: 460, h: 96, color: INK.cream, outline: true, outlineWidth: 6 });
    placeNode(b, root, "ChickenSlot", 272, 544, 539, 734);
    placeText(b, root, "LabHeader", "", 375, 1330, 330, 95, { font: 30, color: INK.cream, outline: true });
    placeText(b, root, "LabDesc", "本局获得", 210, 1470, 440, 56, { font: 24, color: INK.cream });
    placeText(b, root, "LabGold", "+0", 650, 1470, 220, 56, { font: 30, color: INK.gold, outline: true });
    placeButton(b, root, "BtnNext", "选择强化", 292, 1610, 500, 182, "green");
    placeText(b, root, "LabHint", "", 70, 1805, 940, 100, { font: 22, color: INK.cream, outline: true });
    writePrefab("assets/bundle/gui/result/result.prefab", b.finish(root));
}

function makeReward() {
    const b = new Builder("reward");
    const root = panel(b, "reward", F['bg/reward_figma']);
    figmaImage(b, root, "RewardBanner", 'ui/figma_reward_banner');
    placeText(b, root, "LabTitle", "选择强化", 350, 305, 390, 100, { font: 40, color: INK.cream, outline: true });
    placeText(b, root, "LabHint", "选择一项强化", 220, 471, 640, 55, { font: 28, color: INK.cream, outline: true });
    const r = layoutBox(73, 559, 912, 935);
    const cards = b.node({ name: "CardSlot", parent: root, x: r.x, y: r.y, w: r.w, h: r.h });
    b.layout(cards, { type: 3, cols: 3, cellW: 208, cellH: 623.333, gapX: -8, gapY: 0, pad: 0 });
    placeText(b, root, "LabDesc", "", 100, 1500, 880, 50, { font: 19, color: INK.cream, outline: true });
    placeButton(b, root, "BtnConfirm", "下一关", 294, 1584, 500, 182, "green");
    const skip = b.node({ name: "BtnSkip", parent: root, w: 1, h: 1, active: false });
    b.button(skip);
    writePrefab("assets/bundle/gui/reward/reward.prefab", b.finish(root));
}

function makeShop() {
    const b = new Builder("shop");
    const root = panel(b, "shop", SF.bg_shop_figma);
    figmaImage(b, root, "GoldCard", 'ui/figma_gold');
    placeText(b, root, "LabGold", "0", 917, 45, 102, 68, { font: 28, color: INK.cream, outline: true });
    const back = figmaImage(b, root, "BtnBack", 'ui/figma_back');
    b.button(back);
    const ir = layoutBox(90, 990, 900, 540);
    const items = b.node({ name: "ItemSlot", parent: root, x: ir.x, y: ir.y, w: ir.w, h: ir.h });
    b.layout(items, { type: 3, cols: 3, cellW: 180, cellH: 164, gapX: 16, gapY: 16, pad: 8 });
    placeText(b, root, "LabDesc", "", 160, 1630, 760, 70, { font: 22, color: INK.cream, outline: true });
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
    textNode(b, gain, "LabDesc", "", 0, 34, { font: 22, w: 520, h: 60, color: INK.dark });
    iconNode(b, gain, "GoldIcon", SF.icon_coin, -104, -32, 52);
    textNode(b, gain, "LabGold", "0", 24, -32, { font: 32, w: 220, h: 44, color: INK.dark, align: 0 });

    textNode(b, root, "LabHint", "", 0, -332, { font: 22, w: 600, h: 34, color: INK.cream, outline: true });
    labBtn(b, root, "BtnCharacter", "查看奖励套装", 0, -438, 400, 88, "yellow");
    labBtn(b, root, "BtnRestart", "返回首页", 0, -546, 400, 88, "green");
    writePrefab("assets/bundle/gui/ending/ending.prefab", b.finish(root));
}

//#endregion

//#region 复用预制体

function makeChicken() {
    const b = new Builder("chicken");
    const root = b.node({ name: "chicken", w: 260, h: 460 });
    const shadow = b.node({ name: "Shadow", parent: root, x: -7, y: -208, w: 222, h: 68 });
    b.sprite(shadow, [90, 90, 90, 80], 0, F["chicken/figma_shadow"]);
    // Official split (头/脖子/身体/前翅膀/后翅膀/前腿/后腿). Display size is half the stored texture.
    // sx=-1: source art faces left, the actor's default faces right.
    // Back to front so the near wing covers the body and the far wing sits behind it.
    // Positions copied from the hand-tuned chicken.prefab. Don't regenerate over editor tweaks.
    const parts = [
        ["WingBack", F["chicken/后翅膀"], 59.536, -18, 50, 91],
        ["LegR", F["chicken/后腿"], -22, -166, 71.5, 91],
        ["LegL", F["chicken/前腿"], 53.925, -166, 68, 91.5],
        ["Neck", F["chicken/脖子"], 2, 82, 88, 183.5],
        ["Body", F["chicken/身体"], 0, -52, 138.5, 189.5],
        ["Head", F["chicken/头"], 27.058, 193.328, 104, 128],
        ["Wing", F["chicken/前翅膀"], -46, -28, 72, 119.5]
    ];
    for (const [name, frame, x, y, w, h] of parts) {
        const id = b.node({ name, parent: root, x, y, w, h, sx: -1 });
        b.sprite(id, [255, 255, 255, 255], 0, frame);
        if (name === "Head") {
            const face = b.node({ name: "Face", parent: id, w, h, active: false });
            b.sprite(face, [255, 255, 255, 255], 0, F["chicken/figma_face_dumb"]);
            const eyeL = b.node({ name: "EyeL", parent: id, x: -34.531, y: -15.444, w: 36, h: 36 });
            b.sprite(eyeL, [255, 255, 255, 255], 0, F["chicken/eye"]);
            const eyeR = b.node({ name: "EyeR", parent: id, x: 7.558, y: -13.569, w: 45, h: 45 });
            b.sprite(eyeR, [255, 255, 255, 255], 0, F["chicken/eye"]);
        }
    }
    for (const [name, x, y, w, h] of [["Tail", -70, -48, 70, 80], ["Comb", 16, 228, 60, 40]])
        b.node({ name, parent: root, x, y, w, h });
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

/** 套装条目：左图标与大字说明，整张卡片点击查看购买介绍。 */
function makeShopSetItem() {
    makeShelfItem('shop_set_item', 120, 94);
}

function makeShopItem() {
    makeShelfItem('shop_item', 180, 164);
}

/** Place the actual products directly in the painted wooden shelf compartments. */
function makeShelfItem(name, width, height) {
    const b = new Builder(name);
    const root = b.node({ name, w: width, h: height });
    b.sprite(root, [255, 255, 255, 255], 1, SF.panel_cream);
    b.button(root);
    const slot = b.node({ name: "IconSlot", parent: root, y: 0, w: width - 24, h: height - 64 });
    b.sprite(slot, [255, 255, 255, 255], 0, F['ui/figma_equip_slot']);
    const icon = b.node({ name: "Icon", parent: slot, w: width - 40, h: height - 78 });
    b.sprite(icon);
    textNode(b, root, "LabTitle", "", 0, height / 2 - 18, { font: 19, w: width - 12, h: 28, color: INK.dark });
    const price = b.node({ name: "PriceRow", parent: root, y: -height / 2 + 18, w: width - 12, h: 28 });
    iconNode(b, price, "Coin", SF.icon_coin, -42, 0, 22);
    textNode(b, price, "LabPrice", "0", 10, 0, { font: 21, w: width - 50, h: 28, color: INK.dark });
    const mask = b.node({ name: "SoldMask", parent: root, w: width, h: height, active: false });
    b.sprite(mask, [18, 16, 22, 160]);
    textNode(b, mask, "LabSold", "已购买", 0, 0, { font: 20, w: width - 8, h: 32, color: INK.cream, outline: true });
    writePrefab("assets/bundle/game/prefab/" + name + ".prefab", b.finish(root));
}

/** 三选一奖励卡：整行大卡。 */
function makeRewardCard() {
    const b = new Builder("reward_card");
    const root = b.node({ name: "reward_card", w: 208, h: 623.333 });
    b.sprite(root, [255, 255, 255, 255], 0, F['ui/figma_reward_card']);
    b.button(root);

    const banner = b.node({ name: "TitleBanner", parent: root, y: 218, w: 180, h: 60 });
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

const ONLY = process.argv[2];
function emit(name, fn) {
    if (!ONLY || ONLY === name) fn();
}
emit("customize", makeCustomize);
emit("map", makeMap);
emit("character", makeCharacter);
emit("prebattle", makePrebattle);
emit("battle", makeBattle);
emit("result", makeResult);
emit("reward", makeReward);
emit("shop", makeShop);
emit("ending", makeEnding);
emit("chicken", makeChicken);
if (!ONLY) {
    makeFx("fx_hit", "-10", [200, 60, 60, 220]);
    makeFx("fx_skill", "技能", [80, 80, 220, 220]);
    makeFx("fx_heal", "+8", [60, 180, 80, 220]);
    makeFx("fx_start", "开战！", [40, 40, 40, 230]);
    makeTauntBubble();
    makeShopItem();
    makeShopSetItem();
    makeRewardCard();
    writeWhitePng();
}
console.log(ONLY ? `prefab generated: ${ONLY}` : "prefabs generated");
