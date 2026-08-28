import { BehaviorTree, Selector, Sequence, Task } from "db://oops-framework/libs/behavior-tree";
import {
    AI_RULE, ATK_DIVE, ATK_JUMP, ATK_PECK, AiFighter, AiRule, BattleDecision, HEAL_UP, SKILL_DIVE
} from "../core/BattleAI";

class Board {
    self!: AiFighter;
    foe!: AiFighter;
    decision: BattleDecision = ATK_PECK;
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

/** 结论节点：写下这一支的结论，走到这里这次决策就定了。 */
class Act extends Task {
    constructor(private readonly decision: BattleDecision) {
        super();
    }

    run(bb: Board) {
        bb.decision = this.decision;
        this.success();
    }
}

/**
 * 出招决策的行为树。
 *
 * 判据全部取自 core 的 AI_RULE，这里只负责编排优先级：
 * 从上往下试，回血最急，其次是技能（要冷却好，且满足收割、血厚、能打穿三者之一），
 * 再往下按速度和血量差挑普攻招式，都不满足就搏命飞扑。
 *
 * 树本身不存跨次状态，每次 think 都从根重跑一遍，所以双方共用一棵没问题。
 */
export class BattleBrain {
    private board = new Board();
    private tree: BehaviorTree;

    constructor() {
        const root = new Selector([
            new Sequence([new Cond(AI_RULE.needHeal), new Act(HEAL_UP)]),
            new Sequence([
                new Cond(AI_RULE.skillReady),
                new Selector([
                    new Cond(AI_RULE.foeDying),
                    new Cond(AI_RULE.healthy),
                    new Cond(AI_RULE.outgun)
                ]),
                new Act(SKILL_DIVE)
            ]),
            new Sequence([new Cond(AI_RULE.faster), new Act(ATK_JUMP)]),
            new Sequence([new Cond(AI_RULE.losing), new Act(ATK_DIVE)]),
            new Sequence([new Cond(AI_RULE.canPierce), new Act(ATK_PECK)]),
            new Act(ATK_DIVE)
        ]);
        this.tree = new BehaviorTree(root, this.board);
    }

    think(self: AiFighter, foe: AiFighter): BattleDecision {
        this.board.self = self;
        this.board.foe = foe;
        this.board.decision = ATK_DIVE;
        this.tree.run();
        return this.board.decision;
    }
}
