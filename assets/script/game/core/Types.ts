/** 斗鸡部位。顺序按从头到脚排，染色按钮和装备槽都跟着这个顺序摆。 */
export type PartId = "comb" | "head" | "neck" | "body" | "wing" | "tail" | "leg";

/** 表情 */
export type FaceId = "fierce" | "dumb" | "proud" | "cute" | "sad" | "wink";

/** 外观特殊效果 */
export type SpecialId = "none" | "heal" | "revive" | "lockHp";

export const PARTS: PartId[] = ["comb", "head", "neck", "body", "wing", "tail", "leg"];

export const FACE_TEXT: Record<FaceId, string> = {
    fierce: "凶",
    dumb: "呆",
    proud: "傲",
    cute: "萌",
    sad: "委屈",
    wink: "眨眼"
};

export const PART_TEXT: Record<PartId, string> = {
    comb: "鸡冠",
    head: "头部",
    neck: "脖子",
    body: "躯干",
    wing: "翅膀",
    tail: "尾巴",
    leg: "腿部"
};

export interface Stats {
    firstStrike?: number;
    streakBonus?: number;
    healBonus?: number;
    goldBonus?: number;
    shopDiscount?: number;
    retainGrowth?: number;
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    /** 连击展示值；旧表未配置时由敏捷派生。 */
    combo?: number;
    crit: number;
    revive: number;
    lockHp: boolean;
    healPerTurn: number;
}

export interface Appearance {
    /** Figma enemy illustration; player customization uses the articulated parts. */
    illustration?: string;
    colors: Record<PartId, string>;
    face: FaceId;
    /** 当前穿戴的装备图片，随战斗快照交给角色部位渲染。 */
    equipment?: Partial<Record<PartId | "face", string>>;
    /**
     * 各部位的放大倍数，缺省当 1。
     * 强化过的部位会明显大一圈，这是玩家唯一能一眼看出练了什么的地方，
     * 所以挂在外观上跟着快照走，战斗、备战、结算各界面都自动生效。
     */
    partScale?: Partial<Record<PartId, number>>;
}

export interface EquipItem {
    icon?: string;
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
    desc2: string;
    desc4: string;
    unlockMap: number;
    rewardOnly: boolean;
    legacy: boolean;
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

/**
 * 出招的接触方式：贴身啄、跳踢、飞扑、腾空下砸、扑翅冲撞、转身扫尾、连啄、假动作绕后。
 *
 * 纯演出用，一次出招打多少伤害只看 kind 是普攻还是技能，跟这里选哪个动作无关。
 * 所以招式可以按观赏性随便编排，不必担心动到平衡。
 */
export type StrikeStyle = "peck" | "jump" | "dive" | "leap" | "charge" | "tail" | "combo" | "feint";

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

/**
 * 线性路线上的当前节点类型。
 *
 * v7 原型不再区分“热身/正式”两种局内阶段，而是把战斗、商店和鸡王
 * 作为路线上的三类节点。保留旧字面量是为了让旧存档/旧工具在迁移期间
 * 仍能被读取；新流程只会写入 battle/shop/boss。
 */
export type StagePhase = "battle" | "shop" | "boss" | "warmup" | "official";

export type RouteNodeKind = "battle" | "shop" | "boss";

export interface RouteNode {
    encounter?: "warmup" | "official" | "final";
    shopAfter?: boolean;
    id: number;
    mapId?: number;
    kind: RouteNodeKind;
    name: string;
    enemyId?: string;
    goldWin?: number;
    goldLose?: number;
}

/** character 是从地图进出的查看界面，不参与 RunState 的流程推进。 */
export type RunScreen =
    | "customize"
    | "map"
    | "character"
    | "shop"
    | "prebattle"
    | "battle"
    | "result"
    | "reward"
    | "ending";

/**
 * 一条三选一强化的配置，整张 Reward 表由策划维护。
 *
 * 部位对应哪个属性、每级撑大多少、最多几级、出现权重，全在表里，代码不写死任何一条。
 * part 留空就是纯 buff（比如给钱），weight 设 0 就是暂时不出现。
 */
export interface UpgradeDef {
    id: string;
    title: string;
    desc: string;
    part?: PartId;
    goldPerStage: number;
    stats: Partial<Stats>;
    maxLevel: number;
    scalePerLevel: number;
    weight: number;
}

export interface RewardOption {
    id: string;
    title: string;
    desc: string;
    gold: number;
    stats: Partial<Stats>;
    /** 有部位的是部位强化，会连带把那个部位撑大；没有的是纯 buff。 */
    part?: PartId;
    /** 选了它之后该部位到几级，界面直接拿来显示，不用自己再算一遍。 */
    nextLevel?: number;
    maxLevel?: number;
}

export function emptyStats(): Stats {
    return {
        hp: 0,
        maxHp: 0,
        atk: 0,
        def: 0,
        spd: 0,
        combo: 0,
        crit: 0,
        revive: 0,
        lockHp: false,
        healPerTurn: 0
    };
}

export function cloneStats(s: Stats): Stats {
    return { ...s };
}

/** 合并两份增量。装备加成、三选一强化各算一份，最后一起塞进 buildStats。 */
export function addPartial(a: Partial<Stats>, b: Partial<Stats>): Partial<Stats> {
    return {
        maxHp: (a.maxHp ?? 0) + (b.maxHp ?? b.hp ?? 0),
        atk: (a.atk ?? 0) + (b.atk ?? 0),
        def: (a.def ?? 0) + (b.def ?? 0),
        spd: (a.spd ?? 0) + (b.spd ?? 0),
        combo: (a.combo ?? 0) + (b.combo ?? 0),
        crit: (a.crit ?? 0) + (b.crit ?? 0),
        revive: (a.revive ?? 0) + (b.revive ?? 0),
        healPerTurn: (a.healPerTurn ?? 0) + (b.healPerTurn ?? 0),
        lockHp: !!(a.lockHp || b.lockHp),
        hp: 0
    };
}

export function addStats(base: Stats, extra: Partial<Stats>): Stats {
    const out = cloneStats(base);
    for (const key of ["firstStrike", "streakBonus", "healBonus", "goldBonus", "shopDiscount", "retainGrowth"] as const) {
        out[key] = (out[key] ?? 0) + (extra[key] ?? 0);
    }
    out.maxHp += extra.maxHp ?? extra.hp ?? 0;
    out.hp += extra.hp ?? extra.maxHp ?? 0;
    out.atk += extra.atk ?? 0;
    out.def += extra.def ?? 0;
    out.spd += extra.spd ?? 0;
    out.combo = (out.combo ?? 0) + (extra.combo ?? 0);
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
            head: "#F03E53",
            // 脖子原先跟着躯干上色，独立成部位后沿用同一个色，视觉上不变。
            neck: "#F03E53",
            body: "#F03E53",
            wing: "#AD8E6A",
            tail: "#7B4B2A",
            leg: "#C5A077"
        },
        face: "fierce"
    };
}

