import { BehaviorTree, Selector, Sequence, Task } from "db://oops-framework/libs/behavior-tree";
import {
    AI_RULE, AiFighter, AiRule, BattleDecision, StylePool, act
} from "../core/BattleAI";
import { BattleActionKind } from "../core/Types";

const FALLBACK: BattleDecision = { kind: "attack", style: "dive" };

class Board {
    self!: AiFighter;
    foe!: AiFighter;
    decision: BattleDecision = FALLBACK;
}

/** 判据节点：过了这一支才往下走，没过就让 Selector 去试下一支。 */
class Cond extends Task {
    constructor(private readonly rule: AiRule) {
        super();
    }

    run(bb: Board) {
        if (this.rule(bb.self, bb.foe)) this.success();
        else this.fail();
    }
}

/**
 * 结论节点：写下这一支的结论，走到这里这次决策就定了。
 * 出什么招由 kind 定，摆什么动作交给 core 的 act 按局势和出手序号轮换。
 */
class Act extends Task {
    constructor(private readonly kind: BattleActionKind, private readonly pool: StylePool) {
        super();
    }

    run(bb: Board) {
        bb.decision = act(this.kind, this.pool, bb.self);
        this.success();
    }
}

/**
 * 出招决策的行为树。
 *
 * 判据全部取自 core 的 AI_RULE，这里只负责编排优先级：
 * 从上往下试，回血最急，其次冷却好了就放绝招，
 * 再往下按速度和血量差挑局势（铁壁型不用速度池），都不满足就走常规交手。
 *
 * 树本身不存跨次状态，每次 think 都从根重跑一遍，所以双方共用一棵没问题。
 */
export class BattleBrain {
    private board = new Board();
    private tree: BehaviorTree;

    constructor() {
        const root = new Selector([
            new Sequence([new Cond(AI_RULE.needHeal), new Act("heal", "heal")]),
            new Sequence([new Cond(AI_RULE.skillReady), new Act("skill", "skill")]),
            new Sequence([new Cond(AI_RULE.dash), new Act("attack", "fast")]),
            new Sequence([new Cond(AI_RULE.losing), new Act("attack", "losing")]),
            new Sequence([new Cond(AI_RULE.canPierce), new Act("attack", "pierce")]),
            new Act("attack", "hold")
        ]);
        this.tree = new BehaviorTree(root, this.board);
    }

    think(self: AiFighter, foe: AiFighter): BattleDecision {
        this.board.self = self;
        this.board.foe = foe;
        this.board.decision = FALLBACK;
        this.tree.run();
        return this.board.decision;
    }
}
