import { enemyCombatProfile } from "./BattleStyle";
import { tableRow, tableRows } from "./Config";
import { Appearance, EquipItem, FaceId, PartId, RouteNode, SetDef, Stats, UpgradeDef } from "./Types";

export const PREFAB_PATH = {
    chicken: "game/prefab/actor/chicken",
    /** 战斗飘字 / 命中喷溅（ParticleSystem2D）。 */
    fxHit: "game/prefab/fx/combat/fx_hit",
    fxSkill: "game/prefab/fx/combat/fx_skill",
    fxHeal: "game/prefab/fx/combat/fx_heal",
    fxStart: "game/prefab/fx/combat/fx_start",
    fxImpact: "game/prefab/fx/combat/fx_impact",
    fxClash: "game/prefab/fx/combat/fx_clash",
    /** 结算彩带（ParticleSystem2D）。 */
    fxRibbon: "game/prefab/fx/ribbon/fx_ribbon",
    /** 残血火焰边框（ParticleSystem2D）。 */
    fxFlameBorder: "game/prefab/fx/border/fx_flame_border",
    /** 全屏氛围粒子。 */
    fxAmbient: (kind: string) => `game/prefab/fx/ambient/fx_ambient_${kind}`,
    taunt: "game/prefab/ui/taunt_bubble",
    shopItem: "game/prefab/ui/shop_item",
    shopSetItem: "game/prefab/ui/shop_set_item",
    rewardCard: "game/prefab/ui/reward_card",
    skillFull: (style: string) => `game/prefab/skill/skill_full_${style}`,
    skillHalf: (style: string) => `game/prefab/skill/skill_half_${style}`
};

/**
 * 特效贴图（仅 game/image/texture/）：
 * - common：粒子通用（火焰/血/光晕/雨叶等，一份多用）
 * - stamp：斩痕/裂纹等贴图戳
 * - skill：绝招立绘
 */
export const FX_TEX = {
    common: (name: string) => `game/image/texture/common/${name}/spriteFrame`,
    stamp: (name: string) => `game/image/texture/stamp/${name}/spriteFrame`,
    skill: (name: string) => `game/image/texture/skill/${name}/spriteFrame`
};

/** bundle 内普通贴图路径（均在 game/image/ 下；texture 子目录专指特效）。 */
export const TEX = {
    background: (name: string) => `game/image/bg/${name}/spriteFrame`,
    /** 装备图标文件名与 Item.json 的 id 一致。 */
    equip: (itemId: string) => `game/image/equip/${itemById(itemId).icon || itemId}/spriteFrame`,
    icon: (name: string) => `game/image/icon/${name}/spriteFrame`,
    mapNode: (name: string) => `game/image/map/${name}/spriteFrame`,
    ui: (name: string) => `game/image/ui/${name}/spriteFrame`,
    set: (setId: string) => `game/image/equip/set_${setId}/spriteFrame`,
    /** 立绘序列帧。小怪只打 idle+peck，精英/Boss/套装才有 8 个出招。敌人用 illustration 名，套装用 set_<id>。 */
    strikeAnim: (key: string, style: string) => `game/image/anim/${key}/${style}/spriteFrame`,
    /** 结算套装胜利 GIF，文件放到 bundle/game/media/suit_gif/set_<套装id>.gif。 */
    suitGif: (setId: string) => `game/media/suit_gif/set_${setId}`,
    /** 打败坤坤鸡后的全屏结局视频。 */
    endingVideo: "game/media/video/ending"
};

/** 每张地图对应 `gui/map/map_${id}` 预制体，背景和落点都做在预制体上。 */
/** 杂色鸡 / warmup 立绘：包体只带待机和啄击，其它招式播 peck。 */
export function isMinionAnim(key: string) {
    return key.startsWith("warmup_") || /^s\d+_warmup$/.test(key);
}

export function mapPrefab(id: number) {
    return `gui/map/map_${id}`;
}

export function getMaps(): Array<{ id: number; name: string; storyId: string }> {
    return tableRows("Map");
}

export const PART_NODE: Record<PartId, string> = {
    comb: "Comb",
    head: "Head",
    neck: "Neck",
    body: "Body",
    wing: "Wing",
    tail: "Tail",
    leg: "LegL"
};

export function getPlayer() {
    return tableRow("Player", 1);
}

export function getStory(id: string): string {
    return tableRow("Story", id).text;
}

export function getStages() {
    return tableRows("Stage");
}

/** 路线表统一管理战斗节点、敌人、奖励与剧情覆盖。 */
export function getRoute(): RouteNode[] {
    return tableRows("Route").map(row => ({
        id: Number(row.id), encounter: row.encounter, shopAfter: !!row.shopAfter,
        mapId: Number(row.mapId), kind: row.kind, name: row.name,
        enemyId: row.enemyId || undefined, storyId: row.storyId || undefined,
        goldWin: Number(row.goldWin) || 0, goldLose: Number(row.goldLose) || 0
    }));
}
export function routeNode(id: number): RouteNode {
    const node = getRoute().find(v => v.id === id);
    if (!node) throw new Error(`路线没有节点 id=${id}`);
    return node;
}

export function maxStage(): number {
    return getStages().length;
}

export function getStage(id: number) {
    return tableRow("Stage", id);
}

export function getEnemy(id: string) {
    return tableRow("Enemy", id);
}

export function getItems(): EquipItem[] {
    return tableRows("Item").map(toItem);
}

export function getSets(): SetDef[] {
    return tableRows("Set").map(toSet);
}

/** 商店/角色面板：先按解锁地图，通关奖励套装排最后。 */
export function compareSets(a: SetDef, b: SetDef) {
    return Number(a.rewardOnly) - Number(b.rewardOnly) || a.unlockMap - b.unlockMap || a.id.localeCompare(b.id);
}

/** 当前穿齐、可在结算展示套装 GIF/立绘的套装。 */
export function showcaseSuit(appearance: Appearance) {
    const equipped = Object.values(appearance.equipment || {});
    return getSets().find(set => !set.legacy && set.pieceIds.every(id => equipped.includes(id)));
}

export function getColorPalette(): string[] {
    return tableRows("Part").filter(r => r.type === "color").map(r => String(r.value));
}

export function getFaceList(): FaceId[] {
    return tableRows("Part").filter(r => r.type === "face").sort((a, b) => a.order - b.order).map(r => r.value as FaceId);
}

export function getUpgrades(): UpgradeDef[] {
    return tableRows("Reward").map(toUpgrade);
}

export function itemById(id: string): EquipItem {
    return toItem(tableRow("Item", id));
}

export function setById(id: string): SetDef {
    return toSet(tableRow("Set", id));
}

export function playerTaunts(): string[] {
    return taunts(getPlayer().tauntGroup);
}

export function enemyTaunts(id: string): string[] {
    return taunts(getEnemy(id).tauntGroup);
}

export function enemyToFighter(id: string) {
    const e = getEnemy(id);
    const appearance: Appearance = {
        illustration: e.illustration || id,
        face: e.face,
        colors: {
            comb: e.comb,
            head: e.head,
            // Enemy 表里没有脖子这一列，缺了就跟躯干同色，跟脖子独立成部位之前的观感一致。
            neck: e.neck || e.body,
            body: e.body,
            wing: e.wing,
            tail: e.tail,
            leg: e.leg
        }
    };
    const stats: Stats = {
        maxHp: e.maxHp,
        hp: e.maxHp,
        atk: e.atk,
        def: e.def,
        spd: e.spd,
        combo: e.combo == null ? e.spd * 10 : Number(e.combo),
        crit: e.crit,
        revive: e.revive,
        lockHp: !!e.lockHp,
        healPerTurn: e.healPerTurn
    };
    const profile = enemyCombatProfile(id, e.name);
    return {
        name: e.name, appearance, stats, taunts: enemyTaunts(id),
        targetBattleSeconds: e.targetBattleSeconds, danmakuGroup: e.danmakuGroup,
        fightStyle: profile.style, signature: profile.signature
    };
}

export function getBaseStats(): Stats {
    const p = getPlayer();
    return {
        hp: p.maxHp,
        maxHp: p.maxHp,
        atk: p.atk,
        def: p.def,
        spd: p.spd,
        combo: p.combo == null ? p.spd * 10 : Number(p.combo),
        crit: p.crit,
        revive: p.revive,
        lockHp: !!p.lockHp,
        healPerTurn: p.healPerTurn
    };
}

function taunts(group: string): string[] {
    return tableRows("Taunt").filter(row => row.group === group).sort((a, b) => a.order - b.order).map(row => row.text);
}

function packStats(row: any, prefix = ""): Partial<Stats> {
    const n = (k: string) => Number(row[prefix + k] || 0);
    const out: Partial<Stats> = {};
    for (const key of ["firstStrike", "streakBonus", "healBonus", "goldBonus", "shopDiscount", "retainGrowth"] as const) {
        if (n(key)) out[key] = n(key);
    }
    if (n("maxHp")) out.maxHp = n("maxHp");
    if (n("atk")) out.atk = n("atk");
    if (n("def")) out.def = n("def");
    if (n("spd")) out.spd = n("spd");
    if (n("combo")) out.combo = n("combo");
    if (n("crit")) out.crit = n("crit");
    if (n("revive")) out.revive = n("revive");
    if (n("healPerTurn")) out.healPerTurn = n("healPerTurn");
    if (n("lockHp")) out.lockHp = true;
    return out;
}

function toUpgrade(row: any): UpgradeDef {
    const part = String(row.part || "").trim();
    return {
        id: String(row.id),
        title: row.title,
        desc: row.desc,
        part: part ? part as PartId : undefined,
        goldPerStage: Number(row.goldPerStage) || 0,
        stats: packStats(row),
        maxLevel: Number(row.maxLevel) || 0,
        scalePerLevel: Number(row.scalePerLevel) || 0,
        weight: Number(row.weight) || 0
    };
}

function toItem(row: any): EquipItem {
    return {
        icon: row.icon,
        id: String(row.id),
        name: row.name,
        desc: row.desc,
        slot: row.slot,
        setId: row.setId,
        price: Number(row.price) || 0,
        stats: packStats(row),
        special: row.special || "none",
        isSkin: !!row.isSkin,
        skinFace: row.skinFace || "",
        skinColor: row.skinColor || ""
    };
}

function toSet(row: any): SetDef {
    let pieces = row.pieceIds;
    if (typeof pieces === "string") {
        try { pieces = JSON.parse(pieces); } catch { pieces = []; }
    }
    if (!Array.isArray(pieces)) pieces = [];
    return {
        id: String(row.id),
        name: row.name,
        pieceIds: pieces.map((v: any) => String(v)),
        desc2: row.desc2 || "",
        desc4: row.desc4 || "",
        unlockMap: Number(row.unlockMap) || 1,
        rewardOnly: !!row.rewardOnly,
        legacy: !!row.legacy,
        bonus2: packStats(row, "b2"),
        bonus4: packStats(row, "b4"),
        discount: Number(row.discount) || 1
    };
}
