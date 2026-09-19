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
    s2_warmup_3: { style: "trickster", signature: "none" },
    s2_official: { style: "tank", signature: "counter" },
    s3_warmup_1: { style: "trickster", signature: "none" },
    s3_warmup_2: { style: "aerial", signature: "none" },
    s3_warmup_3: { style: "tank", signature: "none" },
    s3_warmup_4: { style: "swift", signature: "none" },
    s3_official: { style: "trickster", signature: "slip" },
    s4_warmup_1: { style: "brawler", signature: "none" },
    s4_warmup_2: { style: "swift", signature: "none" },
    s4_warmup_3: { style: "aerial", signature: "none" },
    s4_warmup_4: { style: "tank", signature: "none" },
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
        skill: ["charge", "leap", "combo"],
        fast: ["combo", "jump", "peck"],
        losing: ["combo", "peck", "jump"],
        pierce: ["peck", "combo", "jump"],
        hold: ["peck", "combo", "jump", "tail"]
    },
    swift: {
        heal: ["peck"],
        skill: ["jump", "feint", "leap"],
        fast: ["jump", "feint", "combo"],
        losing: ["feint", "jump", "peck"],
        pierce: ["combo", "feint", "jump"],
        hold: ["jump", "feint", "combo", "peck"]
    },
    tank: {
        heal: ["peck"],
        skill: ["tail", "charge", "leap"],
        fast: ["tail", "peck", "jump"],
        losing: ["tail", "peck", "jump"],
        pierce: ["tail", "peck", "combo"],
        hold: ["tail", "peck", "combo", "jump"]
    },
    aerial: {
        heal: ["peck"],
        skill: ["dive", "leap", "charge"],
        fast: ["jump", "combo", "feint"],
        losing: ["jump", "peck", "combo"],
        pierce: ["jump", "peck", "combo"],
        hold: ["jump", "feint", "combo", "peck"]
    },
    trickster: {
        heal: ["peck"],
        skill: ["feint", "leap", "combo"],
        fast: ["feint", "jump", "combo"],
        losing: ["feint", "jump", "peck"],
        pierce: ["feint", "combo", "peck"],
        hold: ["feint", "combo", "jump", "peck"]
    },
    berserker: {
        heal: ["peck"],
        skill: ["leap", "dive", "charge"],
        fast: ["combo", "jump", "peck"],
        losing: ["combo", "peck", "jump"],
        pierce: ["combo", "peck", "jump"],
        hold: ["combo", "peck", "jump", "feint"]
    },
    medic: {
        heal: ["peck"],
        skill: ["peck", "leap", "tail"],
        fast: ["peck", "jump", "tail"],
        losing: ["peck", "tail", "feint"],
        pierce: ["peck", "combo", "tail"],
        hold: ["peck", "tail", "jump", "feint"]
    }
};

/** 开场第一招跟路数走，两秒内就能看出这只鸡怎么打。 */
export const STYLE_OPENING: Record<FightStyle, StrikeStyle> = {
    brawler: "charge",
    swift: "jump",
    tank: "tail",
    aerial: "dive",
    trickster: "feint",
    berserker: "leap",
    medic: "peck"
};

/**
 * 位移个性。敌人战斗里是整图立绘，部位动画看不见，
 * 所以路数必须改整只鸡怎么挪、跳多高、站哪，不能只换招式名。
 */
export interface StyleRhythm {
    /** 位移时长倍率，小于 1 更利落。上限压在 1.05，免得顶住出手间隔。 */
    tempo: number;
    hop: number;
    roam: number;
    squash: number;
    gap: number;
    lane: number;
    ghost: [number, number, number];
}

export const STYLE_RHYTHM: Record<FightStyle, StyleRhythm> = {
    brawler: { tempo: 0.9, hop: 0.82, roam: 1.05, squash: 1.28, gap: 148, lane: -8, ghost: [190, 48, 22] },
    swift: { tempo: 0.78, hop: 1.18, roam: 1.85, squash: 0.82, gap: 205, lane: 18, ghost: [70, 96, 170] },
    tank: { tempo: 1.05, hop: 0.5, roam: 0.4, squash: 1.48, gap: 118, lane: -16, ghost: [96, 78, 42] },
    aerial: { tempo: 0.86, hop: 1.72, roam: 1.15, squash: 1.08, gap: 176, lane: 46, ghost: [210, 232, 255] },
    trickster: { tempo: 0.84, hop: 1.08, roam: 1.7, squash: 0.9, gap: 188, lane: -28, ghost: [108, 42, 140] },
    berserker: { tempo: 0.8, hop: 1.22, roam: 1.45, squash: 1.38, gap: 136, lane: 10, ghost: [220, 32, 24] },
    medic: { tempo: 1, hop: 0.92, roam: 0.85, squash: 1, gap: 160, lane: 0, ghost: [72, 176, 118] }
};

/**
 * 每张地图自己的场地味道。普攻没有全屏立绘，只能靠弹跳、压扁、残影色和一点小花活
 * 让五张图打起来不像同一场；正式赛/鸡王再叠一层，不改招式判定。
 */
export type ArenaFlourish = "dust" | "leaf" | "grain" | "incense" | "ember";

export interface ArenaMood {
    tint: string;
    veil: [number, number, number];
    hop: number;
    squash: number;
    spin: number;
    ghost: [number, number, number];
    dust: [number, number, number];
    flourish: ArenaFlourish;
}

export const ARENA_MOOD: Record<number, ArenaMood> = {
    1: { tint: "#f3d9a4", veil: [196, 118, 36], hop: 0.88, squash: 1.18, spin: 0, ghost: [196, 118, 36], dust: [210, 150, 70], flourish: "dust" },
    2: { tint: "#c5e8b0", veil: [46, 122, 58], hop: 1.28, squash: 0.92, spin: 8, ghost: [46, 140, 58], dust: [90, 170, 70], flourish: "leaf" },
    3: { tint: "#f5d56a", veil: [201, 154, 32], hop: 1.02, squash: 1.08, spin: 4, ghost: [210, 170, 40], dust: [230, 190, 50], flourish: "grain" },
    4: { tint: "#e0b8c8", veil: [108, 48, 72], hop: 1.1, squash: 0.96, spin: 22, ghost: [120, 50, 140], dust: [160, 80, 180], flourish: "incense" },
    5: { tint: "#f0a090", veil: [148, 36, 28], hop: 1.16, squash: 1.32, spin: 6, ghost: [180, 40, 28], dust: [220, 70, 40], flourish: "ember" }
};

/** 热身用地图底味，正式赛砸得更重，鸡王改成火气。拷一份再改，别去动表。 */
export function stageMood(mapId: number, encounter?: string): ArenaMood {
    const base = ARENA_MOOD[mapId] || ARENA_MOOD[1];
    const mood: ArenaMood = {
        ...base,
        veil: [...base.veil],
        ghost: [...base.ghost],
        dust: [...base.dust]
    };
    if (encounter === "official") mood.squash *= 1.12;
    if (encounter === "final") {
        mood.squash *= 1.22;
        mood.hop *= 1.08;
        mood.flourish = "ember";
        mood.dust = [220, 48, 32];
        mood.ghost = [220, 48, 32];
    }
    return mood;
}

export const SIGNATURE_LABEL: Record<SignatureId, string> = {
    none: "",
    clumsy: "会打滑",
    counter: "挨打必回",
    slip: "捉不住",
    focus: "连啄见血",
    stitch: "吸血",
    idol: "半血回春"
};

export function styleRhythm(style: FightStyle | undefined): StyleRhythm {
    return STYLE_RHYTHM[style || "brawler"];
}

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

/**
 * 全部带特效的绝招。普攻仍自动打，这八招都要点按钮才放，冷却和攻击各自独立。
 * 短冷却低伤、长冷却高伤，按钮上标的攻击就是 atk × powerMul。
 * 按地图逐步解锁，到第五图凑齐全部八招。
 */
export const PLAYER_SKILLS: readonly StrikeStyle[] = [
    "peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"
];

/** 各绝招首次可用的地图 id；抵达该图时解锁并弹窗提醒。 */
export const SKILL_UNLOCK_MAP: Readonly<Record<StrikeStyle, number>> = {
    peck: 1,
    combo: 1,
    jump: 2,
    feint: 2,
    charge: 3,
    tail: 3,
    dive: 4,
    leap: 5
};

export const SKILL_KIT: Record<StrikeStyle, { cooldown: number; powerMul: number }> = {
    peck: { cooldown: 6, powerMul: 1.45 },
    jump: { cooldown: 7, powerMul: 1.55 },
    dive: { cooldown: 9, powerMul: 1.85 },
    leap: { cooldown: 12, powerMul: 2.2 },
    charge: { cooldown: 8, powerMul: 1.7 },
    tail: { cooldown: 7, powerMul: 1.6 },
    combo: { cooldown: 5, powerMul: 1.4 },
    feint: { cooldown: 6.5, powerMul: 1.5 }
};

export const SKILL_ICON: Record<StrikeStyle, string> = {
    peck: "skill_peck",
    jump: "skill_jump",
    dive: "skill_dive",
    leap: "skill_leap",
    charge: "skill_charge",
    tail: "skill_tail",
    combo: "skill_combo",
    feint: "skill_feint"
};

export function isPlayerSkill(style: StrikeStyle): boolean {
    return (PLAYER_SKILLS as readonly StrikeStyle[]).includes(style);
}

/** 当前地图及之前已解锁的绝招，顺序与 PLAYER_SKILLS 一致。 */
export function skillsUnlockedAt(mapId: number): StrikeStyle[] {
    const cap = Math.max(1, Math.floor(mapId) || 1);
    return PLAYER_SKILLS.filter(style => SKILL_UNLOCK_MAP[style] <= cap);
}

/** 抵达该地图时新学的绝招（弹窗内容）。 */
export function skillsUnlockedOnMap(mapId: number): StrikeStyle[] {
    const id = Math.floor(mapId) || 0;
    return PLAYER_SKILLS.filter(style => SKILL_UNLOCK_MAP[style] === id);
}

export function skillCooldownOf(style: StrikeStyle): number {
    return SKILL_KIT[style].cooldown;
}

export function skillPowerMul(style: StrikeStyle): number {
    return SKILL_KIT[style].powerMul;
}

/** 招式按钮上展示的攻击数值，跟玩家当前攻击力和该招倍率走。 */
export function skillAttackValue(atk: number, style: StrikeStyle): number {
    return Math.max(1, Math.round(Math.max(0, atk) * skillPowerMul(style)));
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
