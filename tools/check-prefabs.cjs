/**
 * 预制体静态校验，不依赖编辑器。
 *
 * 查四件在编辑器里很难一眼看出来的事：
 *   1. 同一预制体内节点重名 —— GameComponent.getNode 按名索引，重名会静默取错节点。
 *   2. 节点超出 720x1280 设计区 —— 生成布局全靠手算坐标，越界只有真机上才看得见。
 *   3. spriteFrame 引用的贴图不存在 —— 素材改名后会渲染成白块。
 *   4. 两段文字互相压着 —— 挪一处坐标忘了挪相邻的，跑起来就是两行字叠在一起。
 *
 * 用法: node tools/check-prefabs.cjs
 */
const fs = require("fs");
const path = require("path");
const uuids = require("./art-uuids.cjs");

const ROOT = path.resolve(__dirname, "..");
const DESIGN = { w: 720, h: 1280 };
/** 编辑器内置纯白图，见 gen-prefabs 里同名常量的说明。 */
const WHITE = "7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca@f9941";

/** 生成脚本产出的预制体，编辑器手搓的那几个不在校验范围内。 */
const TARGETS = [
    "assets/bundle/gui/customize/customize.prefab",
    "assets/bundle/gui/map/map.prefab",
    "assets/bundle/gui/character/character.prefab",
    "assets/bundle/gui/prebattle/prebattle.prefab",
    "assets/bundle/gui/battle/battle.prefab",
    "assets/bundle/gui/result/result.prefab",
    "assets/bundle/gui/reward/reward.prefab",
    "assets/bundle/gui/shop/shop.prefab",
    "assets/bundle/gui/ending/ending.prefab",
    "assets/bundle/game/prefab/chicken.prefab",
    "assets/bundle/game/prefab/shop_item.prefab",
    "assets/bundle/game/prefab/reward_card.prefab",
    "assets/bundle/game/prefab/stat_row.prefab",
    "assets/bundle/game/prefab/taunt_bubble.prefab",
    "assets/bundle/game/prefab/fx_hit.prefab",
    "assets/bundle/game/prefab/fx_skill.prefab",
    "assets/bundle/game/prefab/fx_heal.prefab",
    "assets/bundle/game/prefab/fx_start.prefab"
];

/** 所有合法的 spriteFrame uuid：素材表里的每张图 + 内置纯白图。 */
function knownFrames() {
    const set = new Set([WHITE]);
    for (const key of Object.keys(uuids)) {
        if (typeof uuids[key] === "string") set.add(uuids.frame(uuids[key]));
    }
    return set;
}

function transformOf(objs, node) {
    for (const ref of node._components) {
        const c = objs[ref.__id__];
        if (c && c.__type__ === "cc.UITransform") return c;
    }
    return null;
}

function labelOf(objs, node) {
    for (const ref of node._components) {
        const c = objs[ref.__id__];
        if (c && c.__type__ === "cc.Label") return c;
    }
    return null;
}

/**
 * 空文本的标签由代码在运行时填，按占位尺寸算重叠；
 * 布局组件会在运行时重排子节点，它下面的坐标不作数。
 */
function hasLayout(objs, node) {
    for (const ref of node._components) {
        const c = objs[ref.__id__];
        if (c && c.__type__ === "cc.Layout") return true;
    }
    return false;
}

function overlaps(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

function checkOne(rel, frames) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return [`${rel}: 文件不存在`];
    const objs = JSON.parse(fs.readFileSync(full, "utf8"));
    const problems = [];
    const seen = new Map();
    const isScreen = rel.indexOf("/gui/") >= 0;
    const texts = [];

    const walk = (id, wx, wy, laidOut) => {
        const n = objs[id];
        if (!n || n.__type__ !== "cc.Node") return;
        const x = wx + n._lpos.x;
        const y = wy + n._lpos.y;

        seen.set(n._name, (seen.get(n._name) || 0) + 1);

        const t = transformOf(objs, n);
        if (t && !laidOut && labelOf(objs, n)) {
            texts.push({ name: n._name, x, y, w: t._contentSize.width, h: t._contentSize.height });
        }
        if (t && isScreen) {
            const hw = t._contentSize.width / 2;
            const hh = t._contentSize.height / 2;
            const over = [];
            if (x - hw < -DESIGN.w / 2) over.push(`左出 ${Math.round(DESIGN.w / 2 + x - hw)}`);
            if (x + hw > DESIGN.w / 2) over.push(`右出 ${Math.round(x + hw - DESIGN.w / 2)}`);
            if (y - hh < -DESIGN.h / 2) over.push(`下出 ${Math.round(DESIGN.h / 2 + y - hh)}`);
            if (y + hh > DESIGN.h / 2) over.push(`上出 ${Math.round(y + hh - DESIGN.h / 2)}`);
            if (over.length) problems.push(`${rel}: 节点 ${n._name} 越界 (${over.join(", ")})`);
        }

        for (const ref of n._components) {
            const c = objs[ref.__id__];
            if (!c || c.__type__ !== "cc.Sprite") continue;
            const uuid = c._spriteFrame && c._spriteFrame.__uuid__;
            if (uuid && !frames.has(uuid)) {
                problems.push(`${rel}: 节点 ${n._name} 引用了未知贴图 ${uuid}`);
            }
        }

        const nested = laidOut || hasLayout(objs, n);
        for (const ch of n._children) walk(ch.__id__, x, y, nested);
    };

    walk(1, 0, 0, false);

    for (const [name, count] of seen) {
        if (count > 1) problems.push(`${rel}: 节点名 ${name} 重复 ${count} 次`);
    }
    for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
            if (overlaps(texts[i], texts[j])) {
                problems.push(`${rel}: 文字 ${texts[i].name} 与 ${texts[j].name} 重叠`);
            }
        }
    }
    return problems;
}

const frames = knownFrames();
const all = [];
for (const rel of TARGETS) all.push(...checkOne(rel, frames));

if (all.length === 0) {
    console.log(`预制体校验通过，共 ${TARGETS.length} 个`);
    process.exit(0);
}
for (const p of all) console.log(p);
console.log(`\n共 ${all.length} 处问题`);
process.exit(1);
