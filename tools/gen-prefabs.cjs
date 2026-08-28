/**
 * 生成斗鸡 MVP 所需预制体（仅引擎组件，脚本由运行时/MCP 挂载）。
 * 节点全部来自预制体，游戏代码只 instantiate。
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const uuids = require("./art-uuids.cjs");

const ROOT = path.resolve(__dirname, "..");
const WHITE = "56a0bfc3-686d-4e85-bb26-5f5a6855ae06@f9941";
const SF = {
    body: uuids.frame(uuids.body),
    head: uuids.frame(uuids.head),
    neck: uuids.frame(uuids.neck),
    comb: uuids.frame(uuids.comb),
    wing: uuids.frame(uuids.wing),
    tail: uuids.frame(uuids.tail),
    leg: uuids.frame(uuids.leg),
    beak: uuids.frame(uuids.beak),
    eyes: uuids.frame(uuids.eyes),
    shadow: uuids.frame(uuids.shadow),
    panel: uuids.frame(uuids.panel),
    btn_wood: uuids.frame(uuids.btn_wood),
    btn_green: uuids.frame(uuids.btn_green),
    btn_red: uuids.frame(uuids.btn_red),
    btn_dark: uuids.frame(uuids.btn_dark),
    coin: uuids.frame(uuids.coin),
    bubble: uuids.frame(uuids.bubble),
    hp_frame: uuids.frame(uuids.hp_frame),
    village: uuids.frame(uuids.village),
    battle: uuids.frame(uuids.battle)
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

    label(nodeId, text, font = 28, w = 400, h = 40, colorArr = [255, 244, 214, 255], align = 1) {
        this.addComp(nodeId, null, {
            type: "cc.Label",
            fields: {
                _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
                _color: color(colorArr[0], colorArr[1], colorArr[2], colorArr[3] ?? 255),
                _string: text, _horizontalAlign: align, _verticalAlign: 1,
                _actualFontSize: font, _fontSize: font, _fontFamily: "Arial",
                _lineHeight: Math.round(font * 1.2), _overflow: 0, _enableWrapText: true,
                _font: null, _isSystemFontUsed: true, _spacingX: 0,
                _isItalic: false, _isBold: true, _isUnderline: false, _underlineHeight: 2,
                _cacheMode: 0, _enableOutline: true,
                _outlineColor: color(40, 24, 8, 255), _outlineWidth: 3,
                _enableShadow: false, _shadowColor: color(0, 0, 0, 255),
                _shadowOffset: vec2(2, 2), _shadowBlur: 2
            }
        });
        const ui = this.objs[nodeId]._components[0];
        if (ui) {
            const uid = ui.__id__;
            this.objs[uid]._contentSize = size(w, h);
        }
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

    layout(nodeId, type = 1, cols = 0) {
        this.addComp(nodeId, null, {
            type: "cc.Layout",
            fields: {
                _resizeMode: 0, _layoutType: type, _cellSize: size(cols > 0 ? 310 : 40, cols > 0 ? 108 : 40),
                _startAxis: 0, _paddingLeft: 6, _paddingRight: 6, _paddingTop: 6, _paddingBottom: 6,
                _spacingX: 10, _spacingY: 8, _verticalDirection: 1, _horizontalDirection: 0,
                _constraint: cols > 0 ? 2 : 0, _constraintNum: cols > 0 ? cols : 2,
                _affectedByScale: false, _isAlign: false
            }
        });
    }

    finish(rootId) {
        const prefabInfo = {
            __type__: "cc.PrefabInfo",
            root: { __id__: rootId },
            asset: { __id__: 0 },
            fileId: fid(),
            instance: null,
            targetOverrides: null
        };
        const pi = this.push(prefabInfo);
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

const BTN = {
    wood: { frame: SF.btn_wood, ink: [50, 28, 10, 255] },
    green: { frame: SF.btn_green, ink: [255, 248, 230, 255] },
    red: { frame: SF.btn_red, ink: [255, 248, 230, 255] },
    dark: { frame: SF.btn_dark, ink: [255, 248, 230, 255] }
};

function labBtn(b, parent, name, text, x, y, w = 160, h = 52, kind = "wood") {
    const skin = BTN[kind] || BTN.wood;
    const id = b.node({ name, parent, x, y, w, h });
    b.sprite(id, [255, 255, 255, 255], 1, skin.frame);
    b.button(id);
    const lid = b.node({ name: name + "Lab", parent: id, w: w - 16, h: h - 8 });
    b.label(lid, text, Math.min(24, Math.round(h * 0.42)), w - 16, h - 8, skin.ink);
    return id;
}

function colorBtn(b, parent, name, x, y, rgb) {
    const id = b.node({ name, parent, x, y, w: 88, h: 52 });
    b.sprite(id, rgb.concat(255), 1, SF.btn_wood);
    b.button(id);
    return id;
}

function titleLab(b, parent, name, text, x, y, font = 36, w = 600) {
    const id = b.node({ name, parent, x, y, w, h: font + 16 });
    b.label(id, text, font, w, font + 16);
    return id;
}

function parchment(b, parent, name, x, y, w, h) {
    const id = b.node({ name, parent, x, y, w, h });
    b.sprite(id, [255, 255, 255, 255], 1, SF.panel);
    return id;
}

function panel(b, name, bg = SF.village) {
    const root = b.node({ name, w: 720, h: 1280, x: 0, y: 0 });
    b.widget(root);
    b.sprite(root, [255, 255, 255, 255], 0, bg);
    return root;
}

function goldRow(b, parent, y) {
    const coin = b.node({ name: "Coin", parent, x: -90, y, w: 44, h: 44 });
    b.sprite(coin, [255, 255, 255, 255], 0, SF.coin);
    titleLab(b, parent, "LabGold", "金币 0", 40, y, 26, 280);
}

function hpBar(b, parent, name, fillName, x, y, fillCol) {
    const frame = b.node({ name, parent, x, y, w: 560, h: 36 });
    b.sprite(frame, [255, 255, 255, 255], 1, SF.hp_frame);
    const fill = b.node({ name: fillName, parent: frame, w: 520, h: 18 });
    b.sprite(fill, fillCol, 3, WHITE, 1);
    return frame;
}

function writePrefab(rel, objs) {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(objs, null, 2));
}

function makeCustomize() {
    const b = new Builder("customize");
    const root = panel(b, "customize");
    parchment(b, root, "Card", 0, -250, 680, 700);
    titleLab(b, root, "LabTitle", "开局一只鸡", 0, 560, 40);
    b.node({ name: "ChickenSlot", parent: root, x: 0, y: 250, w: 320, h: 420 });
    titleLab(b, root, "LabPart", "正在染：躯干", 0, 20, 24, 560);
    titleLab(b, root, "LabStats", "数值", 0, -24, 20, 620);
    const parts = ["Comb", "Head", "Body", "Wing", "Tail", "Leg"];
    const texts = ["鸡冠", "头部", "躯干", "翅膀", "尾巴", "腿部"];
    parts.forEach((p, i) => labBtn(b, root, "BtnPart" + p, texts[i], -200 + (i % 3) * 200, -90 - Math.floor(i / 3) * 70, 180, 56));
    for (let i = 0; i < 10; i++) {
        colorBtn(b, root, "BtnColor" + i, -248 + (i % 5) * 124, -250 - Math.floor(i / 5) * 64, hexToRgb(i));
    }
    ["凶", "呆", "傲", "萌"].forEach((t, i) => labBtn(b, root, "BtnFace" + i, t, -240 + i * 160, -390, 140, 52));
    labBtn(b, root, "BtnEnter", "进入村口", 0, -560, 320, 72, "green");
    writePrefab("assets/bundle/gui/customize/customize.prefab", b.finish(root));
}

function hexToRgb(i) {
    const pal = [
        [226, 59, 59], [244, 211, 94], [238, 150, 75], [123, 75, 42], [42, 157, 143],
        [38, 70, 83], [231, 111, 81], [255, 255, 255], [142, 68, 173], [52, 152, 219]
    ];
    return pal[i];
}

function makeMap() {
    const b = new Builder("map");
    const root = panel(b, "map");
    parchment(b, root, "Card", 0, 20, 680, 1020);
    titleLab(b, root, "LabTitle", "村口战场", 0, 560, 40);
    goldRow(b, root, 500);
    parchment(b, root, "HintCard", 0, 430, 620, 72);
    titleLab(b, root, "LabHint", "提示", 0, 430, 22, 560);
    const xs = [-36, 40, -48, 44, 0];
    for (let i = 1; i <= 5; i++) {
        labBtn(b, root, "BtnStage" + i, i + ".关", xs[i - 1], 310 - (i - 1) * 92, 520, 76);
    }
    labBtn(b, root, "BtnBoss", "挑战鸡王", 0, -280, 420, 70, "dark");
    labBtn(b, root, "BtnShop", "鸡市补给", 0, -400, 320, 64);
    writePrefab("assets/bundle/gui/map/map.prefab", b.finish(root));
}

function makePrebattle() {
    const b = new Builder("prebattle");
    const root = panel(b, "prebattle", SF.battle);
    parchment(b, root, "Card", 0, 80, 680, 420);
    titleLab(b, root, "LabTitle", "战前", 0, 580, 36);
    titleLab(b, root, "LabEnemyName", "对手", 0, 510, 24);
    b.node({ name: "EnemySlot", parent: root, x: 0, y: 340, w: 260, h: 300 });
    const stats = b.node({ name: "StatSlot", parent: root, x: 0, y: 80, w: 640, h: 200 });
    b.layout(stats, 2);
    titleLab(b, root, "LabExtra", "附加", 0, -80, 20, 640);
    titleLab(b, root, "LabPlayerName", "村口鸡", 0, -160, 24);
    b.node({ name: "PlayerSlot", parent: root, x: 0, y: -340, w: 260, h: 300 });
    labBtn(b, root, "BtnFight", "开战", 0, -580, 320, 72, "red");
    writePrefab("assets/bundle/gui/prebattle/prebattle.prefab", b.finish(root));
}

function makeBattle() {
    const b = new Builder("battle");
    const root = panel(b, "battle", SF.battle);
    titleLab(b, root, "LabTitle", "战斗", 0, 600, 28, 640);
    hpBar(b, root, "BarEnemy", "BarEnemyFill", 0, 555, [196, 64, 48, 255]);
    titleLab(b, root, "LabEnemyHp", "HP", 0, 555, 18);
    const arena = b.node({ name: "Arena", parent: root, x: 0, y: 10, w: 720, h: 980 });
    b.node({ name: "EnemySlot", parent: arena, x: 90, y: 300, w: 40, h: 40 });
    b.node({ name: "PlayerSlot", parent: arena, x: -90, y: -310, w: 40, h: 40 });
    titleLab(b, root, "LabLog", "", 0, -500, 22, 640);
    hpBar(b, root, "BarPlayer", "BarPlayerFill", 0, -560, [70, 150, 70, 255]);
    titleLab(b, root, "LabPlayerHp", "HP", 0, -560, 18);
    b.node({ name: "FxLayer", parent: root, x: 0, y: 0, w: 720, h: 1280 });
    writePrefab("assets/bundle/gui/battle/battle.prefab", b.finish(root));
}

function makeResult() {
    const b = new Builder("result");
    const root = panel(b, "result");
    parchment(b, root, "Card", 0, 40, 680, 900);
    titleLab(b, root, "LabTitle", "结算", 0, 540, 44, 640);
    b.node({ name: "ChickenSlot", parent: root, x: 0, y: 200, w: 280, h: 360 });
    goldRow(b, root, -40);
    titleLab(b, root, "LabHint", "点击继续", 0, -140, 24, 600);
    titleLab(b, root, "LabDesc", "", 0, -200, 22, 600);
    labBtn(b, root, "BtnNext", "继续", 0, -540, 340, 72, "green");
    writePrefab("assets/bundle/gui/result/result.prefab", b.finish(root));
}

function makeReward() {
    const b = new Builder("reward");
    const root = panel(b, "reward");
    parchment(b, root, "Card", 0, 40, 680, 980);
    titleLab(b, root, "LabTitle", "三选一", 0, 560, 40, 640);
    goldRow(b, root, 490);
    titleLab(b, root, "LabHint", "挑一份带走，或只要金币", 0, 430, 22, 600);
    titleLab(b, root, "LabDesc", "", 0, 390, 20, 600);
    const cards = b.node({ name: "CardSlot", parent: root, x: 0, y: 20, w: 640, h: 620 });
    b.layout(cards, 2);
    labBtn(b, root, "BtnSkip", "只要金币", 0, -560, 320, 64);
    writePrefab("assets/bundle/gui/reward/reward.prefab", b.finish(root));
}

function makeShop() {
    const b = new Builder("shop");
    const root = panel(b, "shop");
    parchment(b, root, "Card", 0, 40, 680, 1020);
    titleLab(b, root, "LabTitle", "鸡市", 0, 560, 40, 640);
    goldRow(b, root, 500);
    titleLab(b, root, "LabHint", "补给", 0, 440, 22, 600);
    titleLab(b, root, "LabDesc", "", 0, 400, 20, 600);
    titleLab(b, root, "LabItems", "散件", 0, 360, 24, 200);
    const items = b.node({ name: "ItemSlot", parent: root, x: 0, y: 140, w: 640, h: 360 });
    b.layout(items, 3, 2);
    titleLab(b, root, "LabSets", "套装", 0, -80, 24, 200);
    const sets = b.node({ name: "SetSlot", parent: root, x: 0, y: -250, w: 640, h: 250 });
    b.layout(sets, 3, 2);
    labBtn(b, root, "BtnLeave", "离开商店", 0, -560, 320, 64, "dark");
    writePrefab("assets/bundle/gui/shop/shop.prefab", b.finish(root));
}

function makeEnding() {
    const b = new Builder("ending");
    const root = panel(b, "ending");
    parchment(b, root, "Card", 0, 40, 680, 900);
    titleLab(b, root, "LabTitle", "村口鸡王", 0, 540, 44, 640);
    b.node({ name: "ChickenSlot", parent: root, x: 0, y: 180, w: 280, h: 360 });
    goldRow(b, root, -40);
    titleLab(b, root, "LabHint", "", 0, -120, 22, 600);
    titleLab(b, root, "LabDesc", "你打败了坤坤。", 0, -180, 24, 600);
    labBtn(b, root, "BtnRestart", "再来一局", 0, -540, 340, 72, "green");
    writePrefab("assets/bundle/gui/ending/ending.prefab", b.finish(root));
}

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
    b.label(face, "凶", 20, 48, 32, [40, 24, 8, 255]);
    writePrefab("assets/bundle/game/prefab/chicken.prefab", b.finish(root));
}

function makeFx(name, text, col, frame = WHITE) {
    const b = new Builder(name);
    const root = b.node({ name, w: 200, h: 70 });
    b.sprite(root, col, 1, frame);
    const lab = b.node({ name: "LabText", parent: root, w: 180, h: 50 });
    b.label(lab, text, 26, 180, 50, [255, 248, 230, 255]);
    writePrefab(`assets/bundle/game/prefab/${name}.prefab`, b.finish(root));
}

function makeCard(name, title, compact) {
    const b = new Builder(name);
    const w = compact ? 300 : 620;
    const h = compact ? 108 : 148;
    const root = b.node({ name, w, h });
    b.sprite(root, [255, 255, 255, 255], 1, SF.panel);
    b.button(root);
    if (compact) {
        const t = b.node({ name: "LabTitle", parent: root, x: -8, y: 28, w: 180, h: 32 });
        b.label(t, title, 20, 180, 32, [50, 28, 10, 255], 0);
        const d = b.node({ name: "LabDesc", parent: root, x: -8, y: -8, w: 180, h: 48 });
        b.label(d, "描述", 14, 180, 48, [70, 48, 28, 255], 0);
        labBtn(b, root, name === "shop_item" ? "BtnBuy" : "BtnPick", name === "shop_item" ? "买" : "选", 104, 0, 80, 44, "green");
    }
    else {
        const t = b.node({ name: "LabTitle", parent: root, y: 40, w: 560, h: 36 });
        b.label(t, title, 24, 560, 36, [50, 28, 10, 255]);
        const d = b.node({ name: "LabDesc", parent: root, y: -2, w: 560, h: 48 });
        b.label(d, "描述", 18, 560, 48, [70, 48, 28, 255]);
        labBtn(b, root, name === "shop_item" ? "BtnBuy" : "BtnPick", name === "shop_item" ? "买" : "选", 0, -48, 160, 44, "green");
    }
    writePrefab(`assets/bundle/game/prefab/${name}.prefab`, b.finish(root));
}

function makeStatRow() {
    const b = new Builder("stat_row");
    const root = b.node({ name: "stat_row", w: 640, h: 44 });
    const n = b.node({ name: "LabName", parent: root, x: -200, w: 120, h: 36 });
    b.label(n, "生命", 22, 120, 36, [50, 28, 10, 255]);
    const p = b.node({ name: "LabPlayer", parent: root, x: -20, w: 120, h: 36 });
    b.label(p, "0", 22, 120, 36, [40, 120, 40, 255]);
    const e = b.node({ name: "LabEnemy", parent: root, x: 180, w: 120, h: 36 });
    b.label(e, "0", 22, 120, 36, [160, 40, 40, 255]);
    writePrefab("assets/bundle/game/prefab/stat_row.prefab", b.finish(root));
}

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
makeFx("taunt_bubble", "垃圾话", [255, 255, 255, 255], SF.bubble);
makeCard("shop_item", "商品", true);
makeCard("reward_card", "奖励", false);
makeStatRow();
writeWhitePng();
console.log("prefabs generated");
