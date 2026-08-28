/** 斗鸡部位 */
export type PartId = "comb" | "head" | "body" | "wing" | "tail" | "leg";

/** 表情 */
export type FaceId = "fierce" | "dumb" | "proud" | "cute";

/** 外观特殊效果 */
export type SpecialId = "none" | "heal" | "revive" | "lockHp";

export const PARTS: PartId[] = ["comb", "head", "body", "wing", "tail", "leg"];

export const FACE_TEXT: Record<FaceId, string> = {
    fierce: "凶",
    dumb: "呆",
    proud: "傲",
    cute: "萌"
};

export const PART_TEXT: Record<PartId, string> = {
    comb: "鸡冠",
    head: "头部",
    body: "躯干",
    wing: "翅膀",
    tail: "尾巴",
    leg: "腿部"
};

export interface Stats {
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    crit: number;
    revive: number;
    lockHp: boolean;
    healPerTurn: number;
}

export interface Appearance {
    colors: Record<PartId, string>;
    face: FaceId;
}

export interface EquipItem {
    id: string;
    name: string;
    desc: string;
    slot: PartId | "face";
    setId: string;
    price: number;
    stats: Partial<Stats>;
    special: SpecialId;
    isSkin: boolean;
    skinFace?: string;
    skinColor?: string;
}

export interface SetDef {
    id: string;
    name: string;
    pieceIds: string[];
    bonus2: Partial<Stats>;
    bonus4: Partial<Stats>;
    discount: number;
}

export interface FighterSnapshot {
    name: string;
    appearance: Appearance;
    stats: Stats;
    taunts: string[];
}

export type BattleSide = "player" | "enemy";

export type BattleActionKind = "heal" | "skill" | "attack";

/** 普攻/技能的接触方式：贴身啄、跳踢、飞扑 */
export type StrikeStyle = "peck" | "jump" | "dive";

export type BattleEvent =
    | { type: "taunt"; side: BattleSide; text: string }
    | { type: "start" }
    | { type: "action"; side: BattleSide; kind: BattleActionKind; style: StrikeStyle }
    | { type: "hit"; from: BattleSide; to: BattleSide; dmg: number; crit: boolean; remain: number }
    | { type: "miss"; side: BattleSide }
    | { type: "heal"; side: BattleSide; amount: number; remain: number }
    | { type: "revive"; side: BattleSide; remain: number }
    | { type: "lock"; side: BattleSide }
    | { type: "end"; win: boolean };

export type StagePhase = "warmup" | "official" | "boss";

export type RunScreen =
    | "customize"
    | "map"
    | "shop"
    | "prebattle"
    | "battle"
    | "result"
    | "reward"
    | "ending";

export interface RewardOption {
    id: string;
    title: string;
    desc: string;
    gold: number;
    stats: Partial<Stats>;
    part?: PartId;
}

export function emptyStats(): Stats {
    return {
        hp: 0,
        maxHp: 0,
        atk: 0,
        def: 0,
        spd: 0,
        crit: 0,
        revive: 0,
        lockHp: false,
        healPerTurn: 0
    };
}

export function cloneStats(s: Stats): Stats {
    return { ...s };
}

export function addStats(base: Stats, extra: Partial<Stats>): Stats {
    const out = cloneStats(base);
    out.maxHp += extra.maxHp ?? extra.hp ?? 0;
    out.hp += extra.hp ?? extra.maxHp ?? 0;
    out.atk += extra.atk ?? 0;
    out.def += extra.def ?? 0;
    out.spd += extra.spd ?? 0;
    out.crit += extra.crit ?? 0;
    out.revive += extra.revive ?? 0;
    out.healPerTurn += extra.healPerTurn ?? 0;
    if (extra.lockHp) out.lockHp = true;
    if (out.hp > out.maxHp) out.hp = out.maxHp;
    return out;
}

export function defaultAppearance(): Appearance {
    return {
        colors: {
            comb: "#B91C1C",
            head: "#E23B3B",
            body: "#E23B3B",
            wing: "#8B5A2B",
            tail: "#7B4B2A",
            leg: "#C4A35A"
        },
        face: "fierce"
    };
}

