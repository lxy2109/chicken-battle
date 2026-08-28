import { getBaseStats, getItems, getSets, itemById, setById } from "./Catalog";
import { Appearance, EquipItem, FaceId, PartId, Stats, addStats, cloneStats } from "./Types";

export function ownedSetCount(ownedIds: string[], setId: string): number {
    const def = getSets().find(s => s.id === setId);
    if (!def) return 0;
    return def.pieceIds.filter(id => ownedIds.indexOf(id) >= 0).length;
}

export function buildStats(ownedIds: string[], extra: Partial<Stats> = {}): Stats {
    let stats = getBaseStats();
    const seen = new Set<string>();
    for (const id of ownedIds) {
        const item = itemById(id);
        stats = addStats(stats, item.stats);
        seen.add(item.setId);
    }
    for (const setId of seen) {
        const n = ownedSetCount(ownedIds, setId);
        const def = getSets().find(s => s.id === setId)!;
        if (n >= 2) stats = addStats(stats, def.bonus2);
        if (n >= 4) stats = addStats(stats, def.bonus4);
    }
    stats = addStats(stats, extra);
    stats.hp = stats.maxHp;
    return stats;
}

export function applySkinAppearance(appearance: Appearance, ownedIds: string[]): Appearance {
    const next: Appearance = {
        face: appearance.face,
        colors: { ...appearance.colors }
    };
    for (const id of ownedIds) {
        const item = itemById(id);
        if (!item.isSkin) continue;
        if (item.skinFace) next.face = item.skinFace as FaceId;
        if (item.skinColor && item.slot !== "face") {
            next.colors[item.slot as PartId] = item.skinColor;
        }
    }
    return next;
}

export function setPrice(setId: string): number {
    const def = setById(setId);
    const raw = def.pieceIds.reduce((sum, id) => sum + itemById(id).price, 0);
    return Math.floor(raw * def.discount);
}

export function shopStock(stage: number, ownedIds: string[]): EquipItem[] {
    const locked = new Set(ownedIds);
    const pool = getItems().filter(it => !locked.has(it.id));
    const start = Math.max(0, (stage - 1) * 2);
    return pool.slice(start, start + 6);
}

export function formatStats(s: Stats): string {
    const extras: string[] = [];
    if (s.healPerTurn > 0) extras.push(`回血${s.healPerTurn}`);
    if (s.revive > 0) extras.push(`复活${s.revive}`);
    if (s.lockHp) extras.push("锁血");
    const extra = extras.length ? `\n${extras.join(" / ")}` : "";
    return `生命 ${s.maxHp}\n攻击 ${s.atk}\n防御 ${s.def}\n速度 ${s.spd}\n暴击 ${Math.round(s.crit * 100)}%${extra}`;
}

export function healFull(s: Stats): Stats {
    const n = cloneStats(s);
    n.hp = n.maxHp;
    return n;
}
