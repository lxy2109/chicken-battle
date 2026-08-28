import { BattleActionKind, StrikeStyle } from "./Types";

export interface AiFighter {
    hp: number;
    maxHp: number;
    atk?: number;
    def?: number;
    spd?: number;
    crit?: number;
    healPerTurn: number;
    healCd: number;
    skillCd: number;
}

export interface BattleDecision {
    kind: BattleActionKind;
    style: StrikeStyle;
}

function n(v: number | undefined, d = 0) {
    return v == null ? d : v;
}

function ratio(hp: number, maxHp: number) {
    return maxHp <= 0 ? 0 : hp / maxHp;
}

/** 一条判据：看双方当前数值给个是或否。 */
export type AiRule = (self: AiFighter, foe: AiFighter) => boolean;

/**
 * 决策用到的全部判据，集中在这里当单一真相源。
 *
 * 下面的 decide 用 if 串起它们，battle 层的行为树用节点串起它们：
 * 组合方式不同，判据是同一份，改规则只要改这里，两边不会各走各的。
 * 签名统一成 (self, foe)，行为树才能拿它当通用条件节点使。
 */
export const AI_RULE = {
    /** 血过三成半且回血技能好了 */
    needHeal: (s, _f) => ratio(s.hp, s.maxHp) <= 0.35 && s.healPerTurn > 0 && s.healCd <= 0,
    skillReady: (s, _f) => s.skillCd <= 0,
    /** 对面残了，该收割 */
    foeDying: (_s, f) => ratio(f.hp, f.maxHp) <= 0.3,
    /** 自己血厚，放技能不亏 */
    healthy: (s, _f) => ratio(s.hp, s.maxHp) >= 0.55,
    /** 攻高过对面防不少，技能打得穿 */
    outgun: (s, f) => n(s.atk) > n(f.def) + 4,
    faster: (s, f) => n(s.spd) > n(f.spd) + 2,
    /** 血比对面少又打不过，只能搏命 */
    losing: (s, f) => ratio(s.hp, s.maxHp) < ratio(f.hp, f.maxHp) && n(s.atk) <= n(f.atk),
    canPierce: (s, f) => n(s.atk) > n(f.def)
} satisfies Record<string, AiRule>;

export const HEAL_UP: BattleDecision = { kind: "heal", style: "peck" };
export const SKILL_DIVE: BattleDecision = { kind: "skill", style: "dive" };
export const ATK_JUMP: BattleDecision = { kind: "attack", style: "jump" };
export const ATK_DIVE: BattleDecision = { kind: "attack", style: "dive" };
export const ATK_PECK: BattleDecision = { kind: "attack", style: "peck" };

/**
 * 按双方当前数值决策，不掷骰。
 * 残血回血 > 收割/压场技能 > 普攻（快跳踢 / 劣势飞扑 / 能打贴身啄）。
 *
 * 这是不带引擎依赖的默认实现，无界面验证直接用它；
 * 游戏跑起来时由 battle/BattleBrain 的行为树接管，判据同源，结论一致。
 */
export function decide(self: AiFighter, foe: AiFighter): BattleDecision {
    if (AI_RULE.needHeal(self, foe)) return HEAL_UP;
    if (AI_RULE.skillReady(self, foe)
        && (AI_RULE.foeDying(self, foe) || AI_RULE.healthy(self, foe) || AI_RULE.outgun(self, foe))) {
        return SKILL_DIVE;
    }
    if (AI_RULE.faster(self, foe)) return ATK_JUMP;
    if (AI_RULE.losing(self, foe)) return ATK_DIVE;
    if (AI_RULE.canPierce(self, foe)) return ATK_PECK;
    return ATK_DIVE;
}

/** 行为树 Task 与无界面验证共用 */
export function decideAction(self: AiFighter, foe?: AiFighter): BattleActionKind {
    const other: AiFighter = foe ?? {
        hp: 80,
        maxHp: 100,
        atk: 10,
        def: 8,
        spd: 10,
        healPerTurn: 0,
        healCd: 1,
        skillCd: 1
    };
    return decide(self, other).kind;
}
