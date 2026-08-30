import { getUpgrades } from "./Catalog";
import { PartLevels, canUpgrade, levelOf } from "./PartUpgrade";
import { Rng } from "./Rng";
import { RewardOption, UpgradeDef } from "./Types";

/**
 * 摇三选一的牌。
 *
 * 表里分两个池子，靠有没有填 part 区分，两边各摇一组，互不占位：
 * 带 part 的是部位强化，会连带把那个部位撑大；不带的是战后奖励和 buff，
 * 给钱、给回血、给复活这类。混成一个池子的话，抽到钱就抽不到强化，反过来也一样。
 *
 * 三张一定落在不同选项上，不然一屏里两张一样的牌等于只有两个选择。
 */

/** 战后奖励与 buff：表里不带 part 的那些。 */
export function rollBuffs(stage: number, seed: number): RewardOption[] {
    return roll(getUpgrades().filter(u => !u.part), stage, seed, {});
}

/** 部位强化：表里带 part 的那些，已经练满的排除掉，免得给出一张点了没用的牌。 */
export function rollUpgrades(stage: number, seed: number, levels: PartLevels): RewardOption[] {
    const pool = getUpgrades().filter(u => !!u.part && canUpgrade(levels, u.part));
    return roll(pool, stage, seed, levels);
}

function roll(pool: UpgradeDef[], stage: number, seed: number, levels: PartLevels): RewardOption[] {
    const rng = new Rng(seed);
    const bag = pool.filter(u => u.weight > 0);
    const picked: UpgradeDef[] = [];
    while (picked.length < 3 && bag.length > 0) {
        const idx = weightedPick(bag, rng);
        picked.push(bag[idx]);
        bag.splice(idx, 1);
    }
    return picked.map(def => toOption(def, stage, levels));
}

/** 按 weight 摇一个，权重越高越常出现。 */
function weightedPick(pool: UpgradeDef[], rng: Rng): number {
    const total = pool.reduce((sum, u) => sum + u.weight, 0);
    if (total <= 0) return 0;
    let hit = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
        hit -= pool[i].weight;
        if (hit <= 0) return i;
    }
    return pool.length - 1;
}

function toOption(def: UpgradeDef, stage: number, levels: PartLevels): RewardOption {
    const opt: RewardOption = {
        id: def.id,
        title: def.title,
        desc: def.desc,
        gold: def.goldPerStage * stage,
        stats: def.stats
    };
    if (def.part) {
        opt.part = def.part;
        opt.nextLevel = levelOf(levels, def.part) + 1;
        opt.maxLevel = def.maxLevel;
    }
    return opt;
}
