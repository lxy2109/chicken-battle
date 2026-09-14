import { getBaseStats, getItems, getSets, itemById, setById } from "./Catalog";
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
        if (n >= 2) stats = addStats(stats, def.bonus2);
        if (n >= 4) stats = addStats(stats, def.bonus4);
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
            && setById(item.setId).unlockMap <= Math.min(5, Math.ceil(stage / 6))))
        .filter((item): item is EquipItem => !!item);
}

/** 一场里典型的挨刀次数，用来把每刀生效的属性折算成等效生命。 */
const HITS = 9;
/** 一场里典型的回血次数，回血冷却 6 秒、一场二三十秒。 */
const HEALS = 4;
/** 输出与生存的换算比，标定成让初始鸡的战力落在四百上下。 */
const DPS_WEIGHT = 7;

/**
 * 战力：纯派生展示值，不入配表。
 *
 * 权重贴着 BattleSession 的即时结算来算：
 * 速度不再只是抢先手，而是直接换算成出手间隔，所以它是输出的乘数而不是小加项 ——
 * 这里的 (1 + spd/20) 和 BattleSession.intervalOf 用的是同一个式子，速度翻倍输出就翻倍。
 * 伤害走 atk-def 的减法，防御折成"少挨 HITS 刀"的等效生命；暴击 1.5 倍，期望乘数 1+0.5*crit；
 * 复活按 40% 上限血、锁血按扛一次致命伤估。
 */
export function combatPower(s: Stats): number {
    const dps = s.atk * (1 + 0.5 * s.crit) * (1 + s.spd / 20);
    const ehp = s.maxHp
        + s.def * HITS
        + s.healPerTurn * HEALS
        + s.revive * s.maxHp * 0.4
        + (s.lockHp ? s.maxHp * 0.3 : 0);
    return Math.round(dps * DPS_WEIGHT + ehp + (s.combo ?? 0) * 0.2);
}

/** 单行紧凑属性串，给空间有限的界面用。 */
export function formatStatsLine(s: Stats): string {
    return `生命 ${s.maxHp}   攻击伤害 ${s.atk}   敏捷 ${s.spd}   连击 ${Math.round(s.combo ?? s.spd * 10)}   暴击 ${Math.round(s.crit * 100)}%`;
}

export function healFull(s: Stats): Stats {
    const n = cloneStats(s);
    n.hp = n.maxHp;
    return n;
}
