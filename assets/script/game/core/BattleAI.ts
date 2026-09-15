import { ARCHETYPE_POOLS } from "./BattleStyle";
import { gameNumber } from "./GameConfig";
import { BattleActionKind, FightStyle, SignatureId, StrikeStyle, StylePool } from "./Types";

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
    /** 这是本方第几次出手，只用来轮换招式动作，不参与任何数值判断。 */
    beat?: number;
    /** 格斗派系。缺省走原来的通用动作池，验证用例才能保持确定结论。 */
    style?: FightStyle;
    signature?: SignatureId;
}

export type { StylePool };

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
    /** 血过三成半且回血技能好了；回春型更早低头理毛 */
    needHeal: (s, _f) => ratio(s.hp, s.maxHp) <= (s.style === "medic" ? Math.max(0.5, gameNumber("ai_healRatio")) : gameNumber("ai_healRatio"))
        && s.healPerTurn > 0 && s.healCd <= 0,
    skillReady: (s, _f) => s.skillCd <= 0,
    /** 对面残了，该收割 */
    foeDying: (_s, f) => ratio(f.hp, f.maxHp) <= gameNumber("ai_finishRatio"),
    /** 自己血厚，放技能不亏 */
    healthy: (s, _f) => ratio(s.hp, s.maxHp) >= gameNumber("ai_healthyRatio"),
    /** 攻高过对面防不少，技能打得穿 */
    outgun: (s, f) => n(s.atk) > n(f.def) + gameNumber("ai_attackAdvantage"),
    faster: (s, f) => n(s.spd) > n(f.spd) + gameNumber("ai_speedAdvantage"),
    /** 血比对面少又打不过，只能搏命 */
    losing: (s, f) => ratio(s.hp, s.maxHp) < ratio(f.hp, f.maxHp) && n(s.atk) <= n(f.atk),
    canPierce: (s, f) => n(s.atk) > n(f.def),
    /** 诡道型技能不讲究血量优势，冷却好了就甩假动作 */
    tricksterCast: (s, _f) => s.style === "trickster",
    /** 狂战型残血反而更想放技能 */
    berserkCast: (s, _f) => s.style === "berserker" && ratio(s.hp, s.maxHp) <= 0.55
} satisfies Record<string, AiRule>;

/**
 * 每种局势下可用的招式动作。
 *
 * 招式一定要跟局势对得上，但**不能跟局势一一绑死**：数值在一场里几乎不变，
 * 判据的结论也就不变，招式若只由判据决定，一整场就只看得见一两个动作
 * ——之前兜底那一支占了全部出招的四成，通场都在飞扑，就是这么来的。
 * 所以每种局势给一个动作池，按出手序号轮着来，局势对味，动作还换着花样。
 */
const STYLE_POOL = {
    /** 回血是低头理毛，不冲出去 */
    heal: ["peck"],
    /** 技能要有排面。腾空下砸只留给技能，砸下来就知道这一下是大招 */
    skill: ["leap", "charge", "dive"],
    /** 比对面快，靠出手快占便宜 */
    fast: ["jump", "combo", "feint"],
    /** 打不过又落后，只能搏命往前撞 */
    losing: ["charge", "dive", "jump"],
    /** 攻能穿防，贴上去阴 */
    pierce: ["peck", "combo", "tail"],
    /** 势均力敌时的常规交手，这一支触发得最多，动作也给得最杂 */
    hold: ["dive", "jump", "tail", "feint"]
} satisfies Record<string, StrikeStyle[]>;

/** 在局势对应的动作池里按出手序号取一个，同一局势连着触发也不会重样。 */
export function pickStyle(pool: StylePool, beat: number, style?: FightStyle): StrikeStyle {
    const list = (style && ARCHETYPE_POOLS[style][pool]) || STYLE_POOL[pool];
    return list[Math.abs(Math.floor(beat)) % list.length];
}

/** 定下这一支的结论：出什么招由 kind 决定，摆什么动作由局势和出手序号决定。 */
export function act(kind: BattleActionKind, pool: StylePool, self: AiFighter): BattleDecision {
    return { kind, style: pickStyle(pool, n(self.beat), self.style) };
}

/**
 * 按双方当前数值决策，不掷骰。
 * 残血回血 > 收割/压场技能 > 普攻（快就抢手 / 劣势搏命 / 攻能穿防就贴身）。
 *
 * 这是不带引擎依赖的默认实现，无界面验证直接用它；
 * 游戏跑起来时由 battle/BattleBrain 的行为树接管，判据同源，结论一致。
 */
export function decide(self: AiFighter, foe: AiFighter): BattleDecision {
    if (AI_RULE.needHeal(self, foe)) return act("heal", "heal", self);
    if (AI_RULE.skillReady(self, foe)
        && (AI_RULE.foeDying(self, foe) || AI_RULE.healthy(self, foe) || AI_RULE.outgun(self, foe)
            || AI_RULE.tricksterCast(self, foe) || AI_RULE.berserkCast(self, foe))) {
        return act("skill", "skill", self);
    }
    if (AI_RULE.faster(self, foe)) return act("attack", "fast", self);
    if (AI_RULE.losing(self, foe)) return act("attack", "losing", self);
    if (AI_RULE.canPierce(self, foe)) return act("attack", "pierce", self);
    return act("attack", "hold", self);
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
