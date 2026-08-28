import { PARTS, RewardOption } from "./Types";
import { getRewards } from "./Catalog";
import { Rng } from "./Rng";

export function rollRewards(stage: number, seed: number): RewardOption[] {
    const rng = new Rng(seed);
    const rows = getRewards();
    const goldRow = rows.find(r => r.id === "gold") || rows[0];
    const gold = Number(goldRow.goldPerStage || 0) * stage;
    const goldOpt: RewardOption = {
        id: String(goldRow.id),
        title: goldRow.title,
        desc: gold > 0 ? `立刻获得 ${gold} 金币` : String(goldRow.desc || ""),
        gold,
        stats: {}
    };
    const pool: RewardOption[] = rows.filter(r => r.id !== goldRow.id).map(r => {
        const stats: RewardOption["stats"] = {};
        if (r.maxHp) { stats.maxHp = r.maxHp; stats.hp = r.maxHp; }
        if (r.atk) stats.atk = r.atk;
        if (r.def) stats.def = r.def;
        if (r.spd) stats.spd = r.spd;
        if (r.crit) stats.crit = r.crit;
        return {
            id: String(r.id),
            title: r.title,
            desc: r.desc,
            gold: Number(r.goldPerStage || 0) * stage,
            stats,
            part: r.randomPart ? rng.pick(PARTS) : undefined
        };
    });
    const picked = rng.shuffle(pool).slice(0, 2);
    return rng.shuffle([goldOpt, ...picked]);
}
