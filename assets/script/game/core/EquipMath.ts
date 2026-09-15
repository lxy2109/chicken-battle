import { gameNumber, gameText } from "./GameConfig";
import { getBaseStats, routeNode, getItems, getSets, itemById, setById } from "./Catalog";
import { Appearance, EquipItem, FaceId, PartId, Stats, addStats, cloneStats } from "./Types";

export function ownedSetCount(ownedIds: string[], setId: string): number {
    const def = getSets().find(s => s.id === setId);
    if (!def) return 0;
    return def.pieceIds.filter(id => ownedIds.indexOf(id) >= 0).length;
}

export function buildStats(equippedIds: string[], extra: Partial<Stats> = {}): Stats {
    let stats = getBaseStats();
    const seen = new Set<string>();
    for (const id of equippedIds) {
        const item = itemById(id);
        stats = addStats(stats, item.stats);
        seen.add(item.setId);
    }
    for (const setId of seen) {
        const n = ownedSetCount(equippedIds, setId);
        const def = getSets().find(s => s.id === setId)!;
        if (n >= gameNumber("set_bonus2Count")) stats = addStats(stats, def.bonus2);
        if (n >= gameNumber("set_bonus4Count")) stats = addStats(stats, def.bonus4);
    }
    stats = addStats(stats, extra);
    stats.hp = stats.maxHp;
    return stats;
}

export function applySkinAppearance(appearance: Appearance, equippedIds: string[]): Appearance {
    const next: Appearance = {
        face: appearance.face,
        colors: { ...appearance.colors },
        equipment: {}
    };
    for (const id of equippedIds) {
        const item = itemById(id);
        next.equipment![item.slot] = id;
        if (!item.isSkin) continue;
        if (item.skinFace) next.face = item.skinFace as FaceId;
        if (item.skinColor && item.slot !== "face") {
            next.colors[item.slot as PartId] = item.skinColor;
        }
    }
    return next;
}

export function setPrice(setId: string, ownedIds: string[] = [], discount = 0): number {
    const def = setById(setId);
    const raw = def.pieceIds.filter(id => !ownedIds.includes(id)).reduce((sum, id) => sum + itemById(id).price, 0);
    return Math.floor(raw * def.discount * (1 - discount));
}

/**
 * v7 商店是固定货架：每次进入都按头饰、翅膀、身体、脚部的顺序展示一件
 * 可购买的单件，不刷新、不因路线节点随机变化。套装仍由商店界面单独展示。
 */
export function shopStock(stage: number, ownedIds: string[]): EquipItem[] {
    const locked = new Set(ownedIds);
    const slots: PartId[] = ["head", "body", "wing", "neck"];
    return slots
        .map(slot => getItems().find(item => item.slot === slot && !locked.has(item.id)
            && !setById(item.setId).legacy && !setById(item.setId).rewardOnly
            && setById(item.setId).unlockMap <= routeNode(stage).mapId!))
        .filter((item): item is EquipItem => !!item);
}

/** 战力为派生展示值，权重由 GameRule 配置，并复用战斗的暴击、速度和复活规则。 */
export function combatPower(s: Stats): number {
    const dps = s.atk * (1 + (gameNumber("battle_critMultiplier") - 1) * s.crit) * (1 + s.spd / gameNumber("battle_speedReference"));
    const ehp = s.maxHp
        + s.def * gameNumber("power_hits")
        + s.healPerTurn * gameNumber("power_heals")
        + s.revive * s.maxHp * gameNumber("battle_reviveRatio")
        + (s.lockHp ? s.maxHp * gameNumber("power_lockRatio") : 0);
    return Math.round(dps * gameNumber("power_dpsWeight") + ehp + (s.combo ?? 0) * gameNumber("power_comboWeight"));
}

/** 单行紧凑属性串，给空间有限的界面用。 */
export function formatStatsLine(s: Stats): string {
    return gameText("EquipMath_001", s.maxHp, s.atk, s.spd, Math.round(s.combo ?? s.spd * 10), Math.round(s.crit * 100));
}

export function healFull(s: Stats): Stats {
    const n = cloneStats(s);
    n.hp = n.maxHp;
    return n;
}
