import { getUpgrades } from "./Catalog";
import { PartId, Stats, UpgradeDef, addPartial } from "./Types";

/**
 * 部位强化：每场战斗后三选一，练哪个部位就把那个部位撑大一圈。
 *
 * 等级是唯一的真相源，属性加成和体型倍数都从它现算，不另存一份。
 * 这样两者永远对得上，也不会因为重复累加把数值刷上天。
 *
 * 哪个部位加哪个属性、每级撑大多少、最多练几级，全部读 Reward 配表，
 * 这里一条映射都不写死，策划改表即可。
 */
export type PartLevels = Partial<Record<PartId, number>>;

export function upgradeOf(part: PartId): UpgradeDef | undefined {
    return getUpgrades().find(u => u.part === part);
}

export function levelOf(levels: PartLevels, part: PartId): number {
    return levels[part] ?? 0;
}

/** 没到上限就还能练；表里没配这个部位就压根练不了。 */
export function canUpgrade(levels: PartLevels, part: PartId): boolean {
    const def = upgradeOf(part);
    if (!def) return false;
    return levelOf(levels, part) < def.maxLevel;
}

/** 各部位当前等级折算出的属性加成总和。 */
export function upgradeBonus(levels: PartLevels): Partial<Stats> {
    let out: Partial<Stats> = {};
    for (const def of getUpgrades()) {
        if (!def.part) continue;
        const n = levelOf(levels, def.part);
        if (n <= 0) continue;
        out = addPartial(out, times(def.stats, n));
    }
    return out;
}

/**
 * 各部位当前等级折算出的放大倍数，没练过的部位不出现在结果里。
 * 挂到 Appearance 上跟着快照走，所有画鸡的界面都会照着它放大。
 */
export function partScale(levels: PartLevels): Partial<Record<PartId, number>> {
    const out: Partial<Record<PartId, number>> = {};
    for (const def of getUpgrades()) {
        if (!def.part || def.scalePerLevel <= 0) continue;
        const n = levelOf(levels, def.part);
        if (n <= 0) continue;
        out[def.part] = 1 + def.scalePerLevel * n;
    }
    return out;
}

/** 把一条强化的单级数值乘上等级。 */
function times(s: Partial<Stats>, n: number): Partial<Stats> {
    const out: Partial<Stats> = {};
    if (s.maxHp) out.maxHp = s.maxHp * n;
    if (s.atk) out.atk = s.atk * n;
    if (s.def) out.def = s.def * n;
    if (s.spd) out.spd = s.spd * n;
    if (s.crit) out.crit = s.crit * n;
    if (s.revive) out.revive = s.revive * n;
    if (s.healPerTurn) out.healPerTurn = s.healPerTurn * n;
    if (s.lockHp) out.lockHp = true;
    return out;
}
