import { BehaviorTree, Selector, Sequence, Task } from "db://oops-framework/libs/behavior-tree";
import { AiFighter, BattleDecision, decide } from "../core/BattleAI";

class Board {
    self: AiFighter = { hp: 1, maxHp: 1, healPerTurn: 0, healCd: 0, skillCd: 0 };
    foe: AiFighter = { hp: 1, maxHp: 1, healPerTurn: 0, healCd: 1, skillCd: 1 };
    decision: BattleDecision = { kind: "attack", style: "peck" };
}

function pick(bb: Board) {
    return decide(bb.self, bb.foe);
}

class CondHeal extends Task {
    run(bb: Board) {
        if (pick(bb).kind === "heal") this.success();
        else this.fail();
    }
}

class CondSkill extends Task {
    run(bb: Board) {
        if (pick(bb).kind === "skill") this.success();
        else this.fail();
    }
}

class CondJump extends Task {
    run(bb: Board) {
        const d = pick(bb);
        if (d.kind === "attack" && d.style === "jump") this.success();
        else this.fail();
    }
}

class CondDive extends Task {
    run(bb: Board) {
        const d = pick(bb);
        if (d.kind === "attack" && d.style === "dive") this.success();
        else this.fail();
    }
}

class ActHeal extends Task {
    run(bb: Board) {
        bb.decision = { kind: "heal", style: "peck" };
        this.success();
    }
}

class ActSkill extends Task {
    run(bb: Board) {
        bb.decision = { kind: "skill", style: "dive" };
        this.success();
    }
}

class ActJump extends Task {
    run(bb: Board) {
        bb.decision = { kind: "attack", style: "jump" };
        this.success();
    }
}

class ActDive extends Task {
    run(bb: Board) {
        bb.decision = { kind: "attack", style: "dive" };
        this.success();
    }
}

class ActPeck extends Task {
    run(bb: Board) {
        bb.decision = { kind: "attack", style: "peck" };
        this.success();
    }
}

/** 行为树：按双方数值选回血 / 技能飞扑 / 跳踢 / 贴身啄 / 搏命飞扑 */
export class BattleBrain {
    private board = new Board();
    private tree: BehaviorTree;

    constructor() {
        const root = new Selector([
            new Sequence([new CondHeal(), new ActHeal()]),
            new Sequence([new CondSkill(), new ActSkill()]),
            new Sequence([new CondJump(), new ActJump()]),
            new Sequence([new CondDive(), new ActDive()]),
            new ActPeck()
        ]);
        this.tree = new BehaviorTree(root, this.board);
    }

    think(self: AiFighter, foe: AiFighter): BattleDecision {
        this.board.self = self;
        this.board.foe = foe;
        this.board.decision = { kind: "attack", style: "peck" };
        this.tree.run();
        return this.board.decision;
    }
}
