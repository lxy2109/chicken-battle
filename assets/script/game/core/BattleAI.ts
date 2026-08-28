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

/**
 * 按双方当前数值决策，不掷骰。
 * 残血回血 > 收割技能 > 压场技能 > 普攻（快跳踢 / 能打贴身啄 / 劣势飞扑）。
 */
export function decide(self: AiFighter, foe: AiFighter): BattleDecision {
    const myHp = ratio(self.hp, self.maxHp);
    const foeHp = ratio(foe.hp, foe.maxHp);
    const atk = n(self.atk);
    const def = n(self.def);
    const spd = n(self.spd);
    const foeAtk = n(foe.atk);
    const foeDef = n(foe.def);
    const foeSpd = n(foe.spd);

    if (myHp <= 0.35 && self.healPerTurn > 0 && self.healCd <= 0) {
        return { kind: "heal", style: "peck" };
    }
    if (self.skillCd <= 0 && foeHp <= 0.3) {
        return { kind: "skill", style: "dive" };
    }
    if (self.skillCd <= 0 && myHp >= 0.55) {
        return { kind: "skill", style: "dive" };
    }
    if (self.skillCd <= 0 && atk > foeDef + 4) {
        return { kind: "skill", style: "dive" };
    }

    if (spd > foeSpd + 2) {
        return { kind: "attack", style: "jump" };
    }
    if (myHp < foeHp && atk <= foeAtk) {
        return { kind: "attack", style: "dive" };
    }
    if (atk > foeDef) {
        return { kind: "attack", style: "peck" };
    }
    return { kind: "attack", style: "dive" };
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
