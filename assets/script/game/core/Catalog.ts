import { tableRow, tableRows } from "./Config";
import { Appearance, EquipItem, FaceId, PartId, RouteNode, SetDef, Stats, UpgradeDef } from "./Types";

export const PREFAB_PATH = {
    chicken: "game/prefab/chicken",
    fxHit: "game/prefab/fx_hit",
    fxSkill: "game/prefab/fx_skill",
    fxHeal: "game/prefab/fx_heal",
    fxStart: "game/prefab/fx_start",
    taunt: "game/prefab/taunt_bubble",
    shopItem: "game/prefab/shop_item",
    shopSetItem: "game/prefab/shop_set_item",
    rewardCard: "game/prefab/reward_card"
};

/** bundle 内贴图路径，供 GameComponent.setSprite 运行时换图。 */
export const TEX = {
    background: (name: string) => `game/texture/bg/${name}/spriteFrame`,
    /** 装备图标文件名与 Item.json 的 id 一致。 */
    equip: (itemId: string) => `game/texture/equip/${itemById(itemId).icon || itemId}/spriteFrame`,
    icon: (name: string) => `game/texture/icon/${name}/spriteFrame`,
    mapNode: (name: string) => `game/texture/map/${name}/spriteFrame`,
    ui: (name: string) => `game/texture/ui/${name}/spriteFrame`
};

/** shop 为 1080×1920 原图中的店面中心位置与缩放，逐图避开主路及关卡。 */
export const MAPS = [
    { id: 1, name: "鸡鸣村", background: "map_figma", shop: { x: 940, y: 1390, scale: 0.72 } },
    { id: 2, name: "青竹溪", background: "map_2_figma", shop: { x: 955, y: 1000, scale: 0.66 } },
    { id: 3, name: "金穗田", background: "map_3_figma", shop: { x: 950, y: 1450, scale: 0.7 } },
    { id: 4, name: "古祠镇", background: "map_4_figma", shop: { x: 940, y: 1320, scale: 0.7 } },
    { id: 5, name: "鸡王山", background: "map_5_figma", shop: { x: 940, y: 1340, scale: 0.72 } }
];

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

export function getStages() {
    return tableRows("Stage");
}

/** v7 线性路线。旧项目没有 Route 表时退回 Stage 表，方便编辑器缓存或旧导出继续启动。 */
export function getRoute(): RouteNode[] {
    try {
        return tableRows("Route").map(row => ({
            id: Number(row.id),
            encounter: row.encounter,
            shopAfter: !!row.shopAfter,
            mapId: Number(row.mapId) || 1,
            kind: String(row.kind || row.type) as RouteNode["kind"],
            name: String(row.name || "路线节点"),
            enemyId: row.enemyId ? String(row.enemyId) : undefined,
            goldWin: Number(row.goldWin) || 0,
            goldLose: Number(row.goldLose) || 0
        }));
    }
    catch {
        const stages = getStages();
        const route: RouteNode[] = stages.slice(0, 3).map((row, i) => ({
            id: i < 2 ? i + 1 : 4,
            kind: "battle",
            name: String(row.name || `节点 ${i + 1}`),
            enemyId: String(row.officialEnemyId || row.warmupEnemyId),
            goldWin: Number(row.officialGoldWin) || 0,
            goldLose: 0
        }));
        route.splice(2, 0, { id: 3, kind: "shop", name: "鸡市 · 中场" });
        route.push({ id: 5, kind: "shop", name: "鸡市 · 决战前" });
        route.push({ id: 6, kind: "boss", name: "鸡王", enemyId: getPlayer().bossEnemyId, goldWin: getPlayer().bossGoldWin });
        return route;
    }
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
    const p = getPlayer();
    return texts(p.taunt1, p.taunt2, p.taunt3);
}

export function enemyTaunts(id: string): string[] {
    const e = getEnemy(id);
    return texts(e.taunt1, e.taunt2, e.taunt3);
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
        combo: Number(e.combo) || e.spd * 10,
        crit: e.crit,
        revive: e.revive,
        lockHp: !!e.lockHp,
        healPerTurn: e.healPerTurn
    };
    return { name: e.name, appearance, stats, taunts: enemyTaunts(id) };
}

export function getBaseStats(): Stats {
    const p = getPlayer();
    return {
        hp: p.maxHp,
        maxHp: p.maxHp,
        atk: p.atk,
        def: p.def,
        spd: p.spd,
        combo: Number(p.combo) || p.spd * 10,
        crit: p.crit,
        revive: 0,
        lockHp: false,
        healPerTurn: 0
    };
}

function texts(...xs: any[]): string[] {
    return xs.map(v => String(v || "").trim()).filter(v => v.length > 0);
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
