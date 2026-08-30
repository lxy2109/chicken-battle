import { tableRow, tableRows } from "./Config";
import { Appearance, EquipItem, FaceId, PartId, SetDef, Stats, UpgradeDef } from "./Types";

export const PREFAB_PATH = {
    chicken: "game/prefab/chicken",
    fxHit: "game/prefab/fx_hit",
    fxSkill: "game/prefab/fx_skill",
    fxHeal: "game/prefab/fx_heal",
    fxStart: "game/prefab/fx_start",
    taunt: "game/prefab/taunt_bubble",
    shopItem: "game/prefab/shop_item",
    rewardCard: "game/prefab/reward_card",
    statRow: "game/prefab/stat_row"
};

/** bundle 内贴图路径，供 GameComponent.setSprite 运行时换图。 */
export const TEX = {
    /** 装备图标文件名与 Item.json 的 id 一致。 */
    equip: (itemId: string) => `game/texture/equip/${itemId}/spriteFrame`,
    icon: (name: string) => `game/texture/icon/${name}/spriteFrame`,
    mapNode: (name: string) => `game/texture/map/${name}/spriteFrame`,
    ui: (name: string) => `game/texture/ui/${name}/spriteFrame`
};

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
    return tableRows("Part").filter(r => r.type === "face").map(r => r.value as FaceId);
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
    if (n("maxHp")) out.maxHp = n("maxHp");
    if (n("atk")) out.atk = n("atk");
    if (n("def")) out.def = n("def");
    if (n("spd")) out.spd = n("spd");
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
        bonus2: packStats(row, "b2"),
        bonus4: packStats(row, "b4"),
        discount: Number(row.discount) || 1
    };
}
