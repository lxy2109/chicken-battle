import { FightStyle, SignatureId, Stats, StrikeStyle, StylePool } from "./Types";

export interface CombatProfile {
    style: FightStyle;
    signature: SignatureId;
}

/**
 * 每只鸡的打法个性。数值一场里几乎不变，若不给个性，通场就只剩同一棵决策树。
 * 派系改的是出招池和战场机制，不改配表攻防，避免把平衡整盘掀翻。
 */
const ENEMY_PROFILE: Record<string, CombatProfile> = {
    s1_warmup_1: { style: "tank", signature: "none" },
    s1_warmup_2: { style: "swift", signature: "none" },
    s1_official: { style: "brawler", signature: "clumsy" },
    s2_warmup_1: { style: "aerial", signature: "none" },
    s2_warmup_2: { style: "brawler", signature: "none" },
    s2_official: { style: "tank", signature: "counter" },
    s3_warmup_1: { style: "trickster", signature: "none" },
    s3_warmup_2: { style: "aerial", signature: "none" },
    s3_warmup_3: { style: "tank", signature: "none" },
    s3_official: { style: "trickster", signature: "slip" },
    s4_warmup_1: { style: "brawler", signature: "none" },
    s4_warmup_2: { style: "swift", signature: "none" },
    s4_warmup_3: { style: "aerial", signature: "none" },
    s4_official: { style: "swift", signature: "focus" },
    s5_warmup_1: { style: "brawler", signature: "none" },
    s5_warmup_2: { style: "trickster", signature: "none" },
    s5_warmup_3: { style: "tank", signature: "none" },
    s5_warmup_4: { style: "aerial", signature: "none" },
    s5_warmup_5: { style: "tank", signature: "none" },
    s5_official: { style: "tank", signature: "stitch" },
    kun_boss: { style: "berserker", signature: "idol" }
};

const NAME_STYLE: Array<[RegExp, FightStyle]> = [
    [/金颈|乌金|铁|混凝土/, "tank"],
    [/细脖|黑羽|长颈|闪电/, "swift"],
    [/黄羽|蓬尾|墨绿|飞/, "aerial"],
    [/斑点|哈鸡|诡|麻鸡/, "trickster"],
    [/红冠|赤颈|菜鸡|莽/, "brawler"],
    [/坤|狂/, "berserker"]
];

/**
 * 有派系时覆盖默认动作池。第一招仍按局势挑池，池内按出手序号轮换，
 * 所以同一只鸡连打也不会通场一个动作，换对手又能看出路数不同。
 */
export const ARCHETYPE_POOLS: Record<FightStyle, Record<StylePool, StrikeStyle[]>> = {
    brawler: {
        heal: ["peck"],
        skill: ["leap", "combo", "charge"],
        fast: ["combo", "jump", "charge"],
        losing: ["charge", "dive", "peck"],
        pierce: ["peck", "combo", "charge"],
        hold: ["peck", "combo", "tail", "charge"]
    },
    swift: {
        heal: ["peck"],
        skill: ["leap", "feint", "jump"],
        fast: ["jump", "feint", "combo"],
        losing: ["feint", "jump", "dive"],
        pierce: ["combo", "feint", "peck"],
        hold: ["jump", "feint", "combo", "tail"]
    },
    tank: {
        heal: ["peck"],
        skill: ["tail", "leap", "charge"],
        fast: ["tail", "jump", "charge"],
        losing: ["tail", "charge", "dive"],
        pierce: ["tail", "peck", "charge"],
        hold: ["tail", "peck", "dive", "charge"]
    },
    aerial: {
        heal: ["peck"],
        skill: ["leap", "dive", "charge"],
        fast: ["dive", "jump", "leap"],
        losing: ["dive", "leap", "charge"],
        pierce: ["dive", "peck", "jump"],
        hold: ["dive", "leap", "jump", "feint"]
    },
    trickster: {
        heal: ["peck"],
        skill: ["feint", "leap", "combo"],
        fast: ["feint", "combo", "jump"],
        losing: ["feint", "dive", "jump"],
        pierce: ["feint", "combo", "peck"],
        hold: ["feint", "combo", "tail", "jump"]
    },
    berserker: {
        heal: ["peck"],
        skill: ["leap", "dive", "charge"],
        fast: ["combo", "jump", "charge"],
        losing: ["dive", "charge", "leap"],
        pierce: ["combo", "peck", "charge"],
        hold: ["dive", "combo", "leap", "charge"]
    },
    medic: {
        heal: ["peck"],
        skill: ["leap", "tail", "peck"],
        fast: ["peck", "jump", "tail"],
        losing: ["peck", "tail", "feint"],
        pierce: ["peck", "combo", "tail"],
        hold: ["peck", "tail", "jump", "feint"]
    }
};

export function enemyCombatProfile(id: string, name = ""): CombatProfile {
    if (ENEMY_PROFILE[id]) return ENEMY_PROFILE[id];
    for (const [re, style] of NAME_STYLE) {
        if (re.test(name) || re.test(id)) return { style, signature: "none" };
    }
    return { style: "brawler", signature: "none" };
}

/** 玩家路数跟当前数值走：堆速度就改疾步，穿医疗套就改回春。 */
export function inferFightStyle(stats: Stats): FightStyle {
    if ((stats.healPerTurn || 0) > 0) return "medic";
    const atk = stats.atk || 0;
    const def = stats.def || 0;
    const spd = stats.spd || 0;
    const crit = stats.crit || 0;
    const hp = stats.maxHp || 1;
    const combo = stats.combo ?? spd * 10;
    const scores: Record<Exclude<FightStyle, "berserker" | "medic">, number> = {
        tank: def * 2.2 + hp * 0.08,
        swift: spd * 2 + combo * 0.04,
        trickster: crit * 140 + spd * 0.6,
        aerial: spd * 1.1 + atk * 0.8,
        brawler: atk * 1.8
    };
    let best: FightStyle = "brawler";
    let top = -Infinity;
    for (const key of Object.keys(scores) as Array<keyof typeof scores>) {
        if (scores[key] > top) {
            top = scores[key];
            best = key;
        }
    }
    return best;
}

export function dodgeChance(atkSpd: number, defSpd: number, defStyle: FightStyle | undefined,
    signature: SignatureId | undefined, strike: StrikeStyle): number {
    if (defStyle !== "swift" && signature !== "slip") return 0;
    let p = 0.07 + Math.max(0, defSpd - atkSpd) / 48;
    if (signature === "slip") p += 0.08;
    if (strike === "feint" || strike === "combo") p -= 0.07;
    if (strike === "leap" || strike === "charge") p -= 0.05;
    return Math.max(0.04, Math.min(0.24, p));
}

export function styleDamageMul(style: StrikeStyle, skill: boolean, signature?: SignatureId): number {
    let mul = 1;
    if (style === "combo") mul *= signature === "focus" ? 1.2 : 1.08;
    if (style === "feint") mul *= 1.06;
    if (style === "tail") mul *= 1.04;
    if (skill && style === "leap") mul *= 1.05;
    return mul;
}

export function stylePierce(style: StrikeStyle): number {
    if (style === "leap") return 0.22;
    if (style === "dive") return 0.15;
    if (style === "charge") return 0.08;
    return 0;
}

export function styleStagger(style: StrikeStyle, skill: boolean): number {
    let n = 1;
    if (style === "leap") n = 2.1;
    else if (style === "charge") n = 1.8;
    else if (style === "dive") n = 1.35;
    else if (style === "jump") n = 1.25;
    else if (style === "tail") n = 1.15;
    if (skill) n *= 1.15;
    return n;
}

export const STYLE_LABEL: Record<FightStyle, string> = {
    brawler: "莽撞型",
    swift: "疾步型",
    tank: "铁壁型",
    aerial: "飞扑型",
    trickster: "诡道型",
    berserker: "狂战型",
    medic: "回春型"
};
