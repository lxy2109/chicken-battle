/**
 * 战斗特效预制体（全部 ParticleSystem2D + 必要 Label/Sprite）
 *
 * 目录：
 *   prefab/fx/ambient/  fx_ambient_*
 *   prefab/fx/combat/   fx_hit / fx_heal / fx_start / fx_skill / fx_impact / fx_clash
 *   prefab/fx/ribbon/   fx_ribbon
 *
 * 用法: node tools/gen-fx-particle-prefabs.cjs
 */
const fs = require("fs");
const path = require("path");
const uuids = require('../art/art-uuids.cjs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, "assets/bundle/game/prefab/fx");
const LAYER = 33554432;
const WHITE = "7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca@f9941";
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

function frameUuid(name) {
  if (name === "WHITE") return WHITE;
  const u = uuids[name];
  if (!u) throw new Error("missing art uuid " + name);
  return uuids.frame(u);
}

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
      _lscale: vec3(1, 1, 1),
      _mobility: 0,
      _layer: LAYER,
      _euler: vec3(0, 0, opt.angle || 0),
      _id: ""
    };
    const id = this.push(n);
    if (opt.parent != null) this.objs[opt.parent]._children.push({ __id__: id });
    this.ui(id, opt.w || 100, opt.h || 100);
    return id;
  }

  ui(nodeId, w, h) {
    this.addComp(nodeId, {
      type: "cc.UITransform",
      fields: { _contentSize: size(w, h), _anchorPoint: vec2(0.5, 0.5) }
    });
  }

  opacity(nodeId, value = 255) {
    this.addComp(nodeId, {
      type: "cc.UIOpacity",
      fields: { _opacity: value }
    });
  }

  sprite(nodeId, frame, col = [255, 255, 255, 255]) {
    this.addComp(nodeId, {
      type: "cc.Sprite",
      fields: {
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(...col),
        _spriteFrame: { __uuid__: frameUuid(frame), __expectedType__: "cc.SpriteFrame" },
        _type: 0,
        _fillType: 0,
        _sizeMode: 0,
        _fillCenter: vec2(0, 0),
        _fillStart: 0,
        _fillRange: 0,
        _isTrimmedMode: true,
        _useGrayscale: false,
        _atlas: null
      }
    });
  }

  label(nodeId, text, opt = {}) {
    const font = opt.font || 28;
    const col = opt.color || [255, 245, 220, 255];
    const outlineW = opt.outlineWidth != null ? opt.outlineWidth : 3;
    this.addComp(nodeId, {
      type: "cc.Label",
      fields: {
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(...col),
        _string: text,
        _horizontalAlign: 1,
        _verticalAlign: 1,
        _actualFontSize: font,
        _fontSize: font,
        _fontFamily: "Arial",
        _lineHeight: Math.round(font * 1.2),
        _overflow: 2,
        _enableWrapText: false,
        _font: null,
        _isSystemFontUsed: true,
        _spacingX: 0,
        _isItalic: false,
        _isBold: true,
        _isUnderline: false,
        _underlineHeight: 2,
        _cacheMode: 0,
        _enableOutline: true,
        _outlineColor: color(40, 20, 10, 255),
        _outlineWidth: outlineW,
        _enableShadow: false,
        _shadowColor: color(0, 0, 0, 255),
        _shadowOffset: vec2(2, 2),
        _shadowBlur: 2
      }
    });
  }

  addComp(nodeId, extra) {
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

  /**
   * ParticleSystem2D（custom=true）
   * blend: "add" | "alpha"
   */
  particle(nodeId, cfg) {
    const add = cfg.blend === "add";
    const sf = frameUuid(cfg.frame);
    return this.addComp(nodeId, {
      type: "cc.ParticleSystem2D",
      fields: {
        _visFlags: 0,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: add ? 1 : 4,
        _color: color(255, 255, 255, 255),
        duration: cfg.duration != null ? cfg.duration : -1,
        emissionRate: cfg.rate != null ? cfg.rate : 24,
        life: cfg.life != null ? cfg.life : 0.8,
        lifeVar: cfg.lifeVar != null ? cfg.lifeVar : 0.25,
        angle: cfg.angle != null ? cfg.angle : 90,
        angleVar: cfg.angleVar != null ? cfg.angleVar : 18,
        startSize: cfg.startSize != null ? cfg.startSize : 28,
        startSizeVar: cfg.startSizeVar != null ? cfg.startSizeVar : 10,
        endSize: cfg.endSize != null ? cfg.endSize : 10,
        endSizeVar: cfg.endSizeVar != null ? cfg.endSizeVar : 6,
        startSpin: cfg.startSpin != null ? cfg.startSpin : 0,
        startSpinVar: cfg.startSpinVar != null ? cfg.startSpinVar : 40,
        endSpin: cfg.endSpin != null ? cfg.endSpin : 0,
        endSpinVar: cfg.endSpinVar != null ? cfg.endSpinVar : 60,
        sourcePos: vec2(0, 0),
        posVar: vec2(cfg.posVarX != null ? cfg.posVarX : 40, cfg.posVarY != null ? cfg.posVarY : 8),
        emitterMode: 0,
        gravity: vec2(cfg.gx != null ? cfg.gx : 0, cfg.gy != null ? cfg.gy : 30),
        speed: cfg.speed != null ? cfg.speed : 55,
        speedVar: cfg.speedVar != null ? cfg.speedVar : 25,
        tangentialAccel: cfg.tang != null ? cfg.tang : 0,
        tangentialAccelVar: cfg.tangVar != null ? cfg.tangVar : 12,
        radialAccel: cfg.rad != null ? cfg.rad : 0,
        radialAccelVar: cfg.radVar != null ? cfg.radVar : 8,
        rotationIsDir: !!cfg.rotationIsDir,
        startRadius: 0,
        startRadiusVar: 0,
        endRadius: 0,
        endRadiusVar: 0,
        rotatePerS: 0,
        rotatePerSVar: 0,
        playOnLoad: cfg.playOnLoad !== false,
        autoRemoveOnFinish: !!cfg.autoRemove,
        _custom: true,
        _file: null,
        _spriteFrame: { __uuid__: sf, __expectedType__: "cc.SpriteFrame" },
        _totalParticles: cfg.total != null ? cfg.total : 80,
        _startColor: color(...(cfg.startColor || [255, 180, 60, 230])),
        _startColorVar: color(...(cfg.startColorVar || [40, 40, 20, 40])),
        _endColor: color(...(cfg.endColor || [180, 40, 10, 0])),
        _endColorVar: color(...(cfg.endColorVar || [30, 20, 10, 0])),
        _positionType: 0
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
        o._prefab = {
          __id__: this.push({
            __type__: "cc.PrefabInfo",
            root: { __id__: rootId },
            asset: { __id__: 0 },
            fileId: fid(),
            instance: null,
            targetOverrides: null
          })
        };
      }
    }
    return this.objs;
  }
}

function writePrefab(relDir, name, objs, uuidTail) {
  const dir = path.join(OUT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join(dir, name + ".prefab");
  fs.writeFileSync(rel, JSON.stringify(objs, null, 2) + "\n");
  const meta = rel + ".meta";
  const uuid = "a1b2c3d4-7007-4000-8000-" + uuidTail.toString(16).padStart(12, "0");
  // 保留已有 meta uuid，避免引用断裂
  if (!fs.existsSync(meta)) {
    fs.writeFileSync(meta, JSON.stringify({
      ver: "1.1.50",
      importer: "prefab",
      imported: true,
      uuid,
      files: [".json"],
      subMetas: {},
      userData: { syncNodeName: name }
    }, null, 2) + "\n");
  }
  console.log("wrote", path.relative(ROOT, rel));
}

// ─── 全屏氛围 ───────────────────────────────────────────────
const AMBIENT = {
  rain: {
    frame: "ambient_rain", blend: "alpha", rate: 55, total: 160, life: 1.1, lifeVar: 0.3,
    angle: -100, angleVar: 8, startSize: 18, startSizeVar: 8, endSize: 10, endSizeVar: 4,
    speed: 520, speedVar: 120, gx: -30, gy: -200, posVarX: 400, posVarY: 40,
    startSpin: 0, startSpinVar: 0, endSpin: 0, endSpinVar: 0, rotationIsDir: true,
    startColor: [190, 220, 255, 210], startColorVar: [20, 20, 20, 40],
    endColor: [160, 200, 255, 0], endColorVar: [10, 10, 10, 0]
  },
  leaf: {
    frame: "ambient_leaf", blend: "alpha", rate: 10, total: 48, life: 3.2, lifeVar: 1,
    angle: -70, angleVar: 40, startSize: 22, startSizeVar: 10, endSize: 18, endSizeVar: 6,
    speed: 45, speedVar: 25, gx: 8, gy: -25, tang: 15, tangVar: 30, posVarX: 380, posVarY: 520,
    startSpinVar: 90, endSpinVar: 120,
    startColor: [120, 200, 90, 220], endColor: [90, 160, 60, 0]
  },
  // dust / incense / mist 共用 particle_glow，靠尺寸与颜色区分
  dust: {
    frame: "particle_glow", blend: "alpha", rate: 16, total: 64, life: 2.4, lifeVar: 0.8,
    angle: 80, angleVar: 50, startSize: 14, startSizeVar: 8, endSize: 8, endSizeVar: 4,
    speed: 25, speedVar: 15, gx: 5, gy: -12, posVarX: 360, posVarY: 500,
    startColor: [255, 220, 160, 180], endColor: [210, 170, 100, 0]
  },
  grain: {
    frame: "ambient_grain", blend: "alpha", rate: 18, total: 70, life: 2.2, lifeVar: 0.7,
    angle: 70, angleVar: 45, startSize: 12, startSizeVar: 6, endSize: 6, endSizeVar: 3,
    speed: 30, speedVar: 18, gx: 4, gy: -18, posVarX: 360, posVarY: 480,
    startColor: [255, 220, 100, 210], endColor: [230, 180, 50, 0]
  },
  incense: {
    frame: "particle_glow", blend: "alpha", rate: 8, total: 42, life: 3.5, lifeVar: 1,
    angle: 90, angleVar: 25, startSize: 36, startSizeVar: 14, endSize: 64, endSizeVar: 20,
    speed: 35, speedVar: 15, gx: 0, gy: 40, posVarX: 280, posVarY: 80,
    startColor: [210, 200, 230, 100], endColor: [180, 170, 200, 0]
  },
  ember: {
    frame: "particle_ember", blend: "alpha", rate: 22, total: 80, life: 2.0, lifeVar: 0.6,
    angle: 90, angleVar: 35, startSize: 18, startSizeVar: 8, endSize: 8, endSizeVar: 4,
    speed: 50, speedVar: 28, gx: 0, gy: 55, posVarX: 360, posVarY: 100,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  },
  ash: {
    frame: "ambient_ash", blend: "alpha", rate: 24, total: 90, life: 2.4, lifeVar: 0.8,
    angle: 95, angleVar: 40, startSize: 12, startSizeVar: 6, endSize: 6, endSizeVar: 3,
    speed: 35, speedVar: 20, gx: 6, gy: 30, posVarX: 360, posVarY: 120,
    startColor: [200, 200, 205, 200], endColor: [140, 140, 145, 0]
  },
  mist: {
    frame: "particle_glow", blend: "alpha", rate: 6, total: 30, life: 4.5, lifeVar: 1.2,
    angle: 0, angleVar: 12, startSize: 110, startSizeVar: 40, endSize: 150, endSizeVar: 40,
    speed: 18, speedVar: 8, gx: 12, gy: 0, posVarX: 100, posVarY: 220,
    startColor: [220, 235, 245, 65], endColor: [200, 220, 230, 0]
  }
};

function makeAmbient(kind, idx) {
  const cfg = AMBIENT[kind];
  const name = "fx_ambient_" + kind;
  const b = new Builder(name);
  const root = b.node({ name, w: 720, h: 1280 });
  b.opacity(root, 255);
  const emit = b.node({ name: "Emitter", parent: root, w: 720, h: 1280 });
  b.particle(emit, { ...cfg, playOnLoad: false });
  writePrefab("ambient", name, b.finish(root), 10 + idx);
}

// ─── 飘字战斗字 + 粒子 ──────────────────────────────────────
function makeFloater(name, text, tint, particleCfg, uuidTail) {
  const b = new Builder(name);
  const root = b.node({ name, w: 220, h: 100 });
  b.opacity(root, 255);
  const burst = b.node({ name: "Burst", parent: root, w: 80, h: 80 });
  b.particle(burst, {
    playOnLoad: true,
    duration: 0.12,
    autoRemove: false,
    ...particleCfg
  });
  const lab = b.node({ name: "LabText", parent: root, y: 8, w: 200, h: 50 });
  b.label(lab, text, { font: 28, color: tint });
  writePrefab("combat", name, b.finish(root), uuidTail);
}

/**
 * 多层飘字底板：根节点 + 若干单图粒子发射器 + 文字。
 * 单张 sprite 用 ParticleSystem2D 一次喷出一堆，形成漫画打击感。
 */
function makeFloaterLayers(name, text, tint, layers, uuidTail, labelOpt = {}) {
  const font = labelOpt.font || 28;
  const rootW = labelOpt.rootW || 240;
  const rootH = labelOpt.rootH || 120;
  const labW = labelOpt.labW || Math.max(200, Math.round(font * 4.5));
  const labH = labelOpt.labH || Math.max(50, Math.round(font * 1.35));
  const b = new Builder(name);
  const root = b.node({ name, w: rootW, h: rootH });
  b.opacity(root, 255);
  layers.forEach((cfg, i) => {
    const n = b.node({ name: "Burst" + i, parent: root, w: 96, h: 96 });
    b.particle(n, {
      playOnLoad: true,
      duration: 0.1,
      autoRemove: false,
      ...cfg
    });
  });
  const lab = b.node({ name: "LabText", parent: root, y: 8, w: labW, h: labH });
  b.label(lab, text, {
    font,
    color: tint,
    outlineWidth: labelOpt.outlineWidth != null ? labelOpt.outlineWidth : 3
  });
  writePrefab("combat", name, b.finish(root), uuidTail);
}

function makeFloaters() {
  // 默认字色与运行时 FLOAT_TINT 对齐；运行时仍会按效果再染一遍
  // 普攻：星屑 + 火花 + 微光
  makeFloaterLayers("fx_hit", "-10", [255, 88, 68, 255], [
    {
      frame: "particle_star", blend: "alpha", rate: 90, total: 18, life: 0.34, lifeVar: 0.1,
      angle: 90, angleVar: 180, startSize: 20, startSizeVar: 7, endSize: 8, endSizeVar: 3,
      speed: 90, speedVar: 36, gx: 0, gy: -14, posVarX: 8, posVarY: 8,
      startColor: [255, 120, 90, 255], endColor: [255, 70, 50, 0]
    },
    {
      frame: "particle_spark", blend: "alpha", rate: 70, total: 14, life: 0.28, lifeVar: 0.08,
      angle: 90, angleVar: 180, startSize: 12, startSizeVar: 5, endSize: 5, endSizeVar: 2,
      speed: 120, speedVar: 48, gx: 0, gy: -30, posVarX: 6, posVarY: 6,
      startColor: [255, 220, 160, 255], endColor: [255, 140, 80, 0]
    }
  ], 0x20);

  // 绝招 / 暴击：光晕 + 星 + 火花
  makeFloaterLayers("fx_skill", "技能", [120, 168, 255, 255], [
    {
      frame: "particle_glow", blend: "alpha", rate: 56, total: 14, life: 0.4, lifeVar: 0.1,
      angle: 90, angleVar: 180, startSize: 28, startSizeVar: 10, endSize: 14, endSizeVar: 5,
      speed: 50, speedVar: 20, gx: 0, gy: 8, posVarX: 10, posVarY: 8,
      startColor: [150, 190, 255, 230], endColor: [120, 160, 255, 0]
    },
    {
      frame: "particle_star", blend: "alpha", rate: 72, total: 16, life: 0.36, lifeVar: 0.1,
      angle: 90, angleVar: 180, startSize: 18, startSizeVar: 6, endSize: 8, endSizeVar: 3,
      speed: 88, speedVar: 32, gx: 0, gy: 0, posVarX: 8, posVarY: 8,
      startColor: [200, 220, 255, 255], endColor: [140, 180, 255, 0]
    },
    {
      frame: "particle_spark", blend: "alpha", rate: 64, total: 14, life: 0.3, lifeVar: 0.08,
      angle: 90, angleVar: 180, startSize: 12, startSizeVar: 4, endSize: 5, endSizeVar: 2,
      speed: 130, speedVar: 50, gx: 0, gy: -20, posVarX: 6, posVarY: 6,
      startColor: [255, 255, 255, 255], endColor: [180, 210, 255, 0]
    }
  ], 0x21);

  // 治疗：十字 heal 粒子 + 绿光点上飘
  makeFloaterLayers("fx_heal", "+8", [64, 236, 128, 255], [
    {
      frame: "particle_heal", blend: "alpha", rate: 48, total: 12, life: 0.55, lifeVar: 0.14,
      angle: 90, angleVar: 36, startSize: 22, startSizeVar: 6, endSize: 12, endSizeVar: 4,
      speed: 48, speedVar: 16, gx: 0, gy: 56, posVarX: 16, posVarY: 8,
      startSpinVar: 20, endSpinVar: 30,
      startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
    },
    {
      frame: "particle_glow", blend: "alpha", rate: 40, total: 14, life: 0.6, lifeVar: 0.14,
      angle: 90, angleVar: 40, startSize: 14, startSizeVar: 5, endSize: 8, endSizeVar: 3,
      speed: 40, speedVar: 14, gx: 0, gy: 42, posVarX: 18, posVarY: 6,
      startColor: [90, 255, 150, 220], endColor: [60, 220, 120, 0]
    }
  ], 0x22);

  // 开战：大字居中提示 + 火花/星/余烬（字号明显大于普通飘字）
  makeFloaterLayers("fx_start", "开战！", [255, 242, 170, 255], [
    {
      frame: "particle_spark", blend: "alpha", rate: 96, total: 28, life: 0.48, lifeVar: 0.12,
      angle: 90, angleVar: 180, startSize: 22, startSizeVar: 8, endSize: 9, endSizeVar: 3,
      speed: 140, speedVar: 52, gx: 0, gy: 24, posVarX: 36, posVarY: 18,
      startColor: [255, 236, 140, 255], endColor: [255, 200, 80, 0]
    },
    {
      frame: "particle_star", blend: "alpha", rate: 64, total: 18, life: 0.45, lifeVar: 0.1,
      angle: 90, angleVar: 180, startSize: 28, startSizeVar: 10, endSize: 12, endSizeVar: 4,
      speed: 100, speedVar: 40, gx: 0, gy: 12, posVarX: 28, posVarY: 14,
      startColor: [255, 250, 200, 255], endColor: [255, 220, 120, 0]
    },
    {
      frame: "particle_ember", blend: "alpha", rate: 48, total: 16, life: 0.6, lifeVar: 0.15,
      angle: 90, angleVar: 50, startSize: 16, startSizeVar: 5, endSize: 6, endSizeVar: 2,
      speed: 70, speedVar: 28, gx: 0, gy: 48, posVarX: 32, posVarY: 14,
      startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
    }
  ], 0x23, {
    font: 84,
    rootW: 480,
    rootH: 200,
    labW: 440,
    labH: 120,
    outlineWidth: 8
  });
}

// ─── 命中喷溅 / 对撞：单图 × 多粒子，短促不糊屏 ──────────
function makeImpact() {
  const b = new Builder("fx_impact");
  const root = b.node({ name: "fx_impact", w: 180, h: 180 });
  b.opacity(root, 255);

  // 星芒（运行时按暴击/绝招再染）
  let n = b.node({ name: "Star", parent: root, w: 72, h: 72 });
  b.particle(n, {
    frame: "particle_star", blend: "alpha", playOnLoad: true, duration: 0.07,
    rate: 100, total: 18, life: 0.26, lifeVar: 0.08,
    angle: 90, angleVar: 180, startSize: 30, startSizeVar: 10, endSize: 10, endSizeVar: 4,
    speed: 120, speedVar: 44, gx: 0, gy: -8, posVarX: 5, posVarY: 5,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  });

  // 火花层
  n = b.node({ name: "Spark", parent: root, w: 80, h: 80 });
  b.particle(n, {
    frame: "particle_spark", blend: "alpha", playOnLoad: true, duration: 0.09,
    rate: 72, total: 18, life: 0.3, lifeVar: 0.1,
    angle: 90, angleVar: 180, startSize: 14, startSizeVar: 5, endSize: 6, endSizeVar: 3,
    speed: 150, speedVar: 55, gx: 0, gy: -28, posVarX: 6, posVarY: 6,
    startColor: [255, 240, 200, 255], endColor: [255, 200, 120, 0]
  });

  // 微光闪
  n = b.node({ name: "Glow", parent: root, w: 64, h: 64 });
  b.particle(n, {
    frame: "particle_glow", blend: "alpha", playOnLoad: true, duration: 0.05,
    rate: 40, total: 6, life: 0.2, lifeVar: 0.06,
    angle: 90, angleVar: 180, startSize: 36, startSizeVar: 10, endSize: 18, endSizeVar: 6,
    speed: 16, speedVar: 8, gx: 0, gy: 0, posVarX: 4, posVarY: 4,
    startColor: [255, 230, 180, 200], endColor: [255, 200, 120, 0]
  });

  // 描边血花：少而小
  n = b.node({ name: "BloodSplash", parent: root, w: 72, h: 72 });
  b.particle(n, {
    frame: "particle_blood_splash", blend: "alpha", playOnLoad: true, duration: 0.04,
    rate: 20, total: 4, life: 0.28, lifeVar: 0.08,
    angle: 90, angleVar: 40, startSize: 34, startSizeVar: 8, endSize: 16, endSizeVar: 6,
    speed: 26, speedVar: 10, gx: 0, gy: -20, posVarX: 3, posVarY: 3,
    startSpinVar: 30, endSpinVar: 40,
    startColor: [255, 255, 255, 230], endColor: [255, 255, 255, 0]
  });

  // 描边血滴
  n = b.node({ name: "Blood", parent: root, w: 80, h: 80 });
  b.particle(n, {
    frame: "particle_blood", blend: "alpha", playOnLoad: true, duration: 0.14,
    rate: 48, total: 16, life: 0.5, lifeVar: 0.15,
    angle: 75, angleVar: 42, startSize: 16, startSizeVar: 6, endSize: 8, endSizeVar: 3,
    speed: 130, speedVar: 50, gx: 0, gy: -380, posVarX: 5, posVarY: 5,
    rotationIsDir: true, startSpin: 0, startSpinVar: 0, endSpin: 0, endSpinVar: 0,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  });

  // 轻烟（命中尘）
  n = b.node({ name: "Smoke", parent: root, w: 72, h: 72 });
  b.particle(n, {
    frame: "particle_smoke", blend: "alpha", playOnLoad: true, duration: 0.1,
    rate: 28, total: 8, life: 0.45, lifeVar: 0.12,
    angle: 90, angleVar: 50, startSize: 22, startSizeVar: 8, endSize: 36, endSizeVar: 10,
    speed: 36, speedVar: 14, gx: 0, gy: 24, posVarX: 8, posVarY: 6,
    startColor: [255, 255, 255, 160], endColor: [255, 255, 255, 0]
  });

  // 描边羽毛（startColor 由运行时按鸡翅膀色染色）；贴图 128，尺寸适中才不糊
  n = b.node({ name: "Feather", parent: root, w: 96, h: 96 });
  b.particle(n, {
    frame: "particle_feather", blend: "alpha", playOnLoad: true, duration: 0.18,
    rate: 28, total: 12, life: 0.95, lifeVar: 0.28,
    angle: 100, angleVar: 55, startSize: 36, startSizeVar: 10, endSize: 22, endSizeVar: 6,
    speed: 78, speedVar: 32, gx: 8, gy: -90, tang: 14, tangVar: 28, posVarX: 8, posVarY: 8,
    startSpinVar: 100, endSpinVar: 140,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  });

  writePrefab("combat", "fx_impact", b.finish(root), 0x24);
}

function makeClash() {
  const b = new Builder("fx_clash");
  const root = b.node({ name: "fx_clash", w: 220, h: 220 });
  b.opacity(root, 255);

  let n = b.node({ name: "Star", parent: root, w: 96, h: 96 });
  b.particle(n, {
    frame: "particle_star", blend: "alpha", playOnLoad: true, duration: 0.08,
    rate: 110, total: 24, life: 0.3, lifeVar: 0.1,
    angle: 90, angleVar: 180, startSize: 34, startSizeVar: 10, endSize: 12, endSizeVar: 4,
    speed: 150, speedVar: 55, gx: 0, gy: 0, posVarX: 6, posVarY: 6,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  });

  n = b.node({ name: "Spark", parent: root, w: 96, h: 96 });
  b.particle(n, {
    frame: "particle_spark", blend: "alpha", playOnLoad: true, duration: 0.1,
    rate: 80, total: 26, life: 0.34, lifeVar: 0.1,
    angle: 90, angleVar: 180, startSize: 16, startSizeVar: 6, endSize: 7, endSizeVar: 3,
    speed: 180, speedVar: 70, gx: 0, gy: -30, posVarX: 8, posVarY: 8,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  });

  n = b.node({ name: "Slash", parent: root, w: 100, h: 100 });
  b.particle(n, {
    frame: "particle_slash", blend: "alpha", playOnLoad: true, duration: 0.06,
    rate: 36, total: 8, life: 0.22, lifeVar: 0.06,
    angle: 0, angleVar: 28, startSize: 58, startSizeVar: 14, endSize: 22, endSizeVar: 8,
    speed: 28, speedVar: 12, gx: 0, gy: 0, posVarX: 4, posVarY: 4,
    startSpinVar: 14, endSpinVar: 20,
    startColor: [255, 255, 255, 230], endColor: [255, 255, 255, 0]
  });

  n = b.node({ name: "Glow", parent: root, w: 80, h: 80 });
  b.particle(n, {
    frame: "particle_glow", blend: "alpha", playOnLoad: true, duration: 0.05,
    rate: 30, total: 6, life: 0.22, lifeVar: 0.06,
    angle: 90, angleVar: 180, startSize: 42, startSizeVar: 12, endSize: 20, endSizeVar: 8,
    speed: 12, speedVar: 6, gx: 0, gy: 0, posVarX: 4, posVarY: 4,
    startColor: [255, 240, 200, 210], endColor: [255, 200, 140, 0]
  });

  writePrefab("combat", "fx_clash", b.finish(root), 0x25);
}

// ─── 胜利彩带（ParticleSystem2D，替代 3D ParticleSystem） ───
function makeRibbon() {
  const b = new Builder("fx_ribbon");
  const root = b.node({ name: "fx_ribbon", w: 720, h: 1280 });
  b.opacity(root, 255);

  // 描边彩带碎片（贴图自带色，近白乘算）
  let n = b.node({ name: "Confetti", parent: root, y: 400, w: 720, h: 80 });
  b.particle(n, {
    frame: "particle_confetti", blend: "alpha", playOnLoad: true, duration: 1.6,
    rate: 40, total: 100, life: 2.8, lifeVar: 0.8,
    angle: -90, angleVar: 35, startSize: 20, startSizeVar: 10, endSize: 12, endSizeVar: 5,
    speed: 280, speedVar: 120, gx: 20, gy: -180, tang: 15, tangVar: 40,
    posVarX: 340, posVarY: 30, startSpinVar: 180, endSpinVar: 260,
    startColor: [255, 255, 255, 255], startColorVar: [40, 40, 40, 0],
    endColor: [255, 255, 255, 0], endColorVar: [0, 0, 0, 0]
  });

  n = b.node({ name: "Stars", parent: root, y: 360, w: 720, h: 80 });
  b.particle(n, {
    frame: "particle_star", blend: "alpha", playOnLoad: true, duration: 1.4,
    rate: 28, total: 70, life: 2.2, lifeVar: 0.6,
    angle: -90, angleVar: 40, startSize: 18, startSizeVar: 8, endSize: 10, endSizeVar: 4,
    speed: 220, speedVar: 100, gx: -10, gy: -140, posVarX: 320, posVarY: 40,
    startSpinVar: 90, endSpinVar: 120,
    startColor: [255, 255, 255, 255], endColor: [255, 255, 255, 0]
  });

  n = b.node({ name: "Glow", parent: root, y: 200, w: 200, h: 200 });
  b.particle(n, {
    frame: "particle_glow", blend: "alpha", playOnLoad: true, duration: 0.8,
    rate: 16, total: 32, life: 1.2, lifeVar: 0.4,
    angle: 90, angleVar: 180, startSize: 36, startSizeVar: 16, endSize: 64, endSizeVar: 24,
    speed: 40, speedVar: 20, gx: 0, gy: 20, posVarX: 80, posVarY: 40,
    startColor: [255, 255, 255, 140], endColor: [255, 255, 255, 0]
  });

  writePrefab("ribbon", "fx_ribbon", b.finish(root), 0x26);
}

// ─── 运行 ───────────────────────────────────────────────────
Object.keys(AMBIENT).forEach((k, i) => makeAmbient(k, i));
makeFloaters();
makeImpact();
makeClash();
makeRibbon();
console.log("fx particle prefabs ready ->", OUT);
