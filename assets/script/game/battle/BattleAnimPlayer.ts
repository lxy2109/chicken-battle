import { Node, tween, v3 } from "cc";
import { AnimationPlayer } from "db://oops-framework/libs/animator/core/AnimatorBase";
import AnimatorBase from "db://oops-framework/libs/animator/core/AnimatorBase";

/** 用缓动模拟爽感动画，驱动自定义状态机 */
export class BattleAnimPlayer implements AnimationPlayer {
    private target: Node | null = null;
    private animator: AnimatorBase | null = null;
    private speed = 1;

    attach(animator: AnimatorBase, node: Node) {
        this.animator = animator;
        this.target = node;
    }

    onFinishedCallback(_target: AnimatorBase): void { }

    onFrameEventCallback(_type: string, _target: AnimatorBase): void { }

    playAnimation(animName: string, loop: boolean): void {
        if (loop || animName === "idle") return;
        const node = this.target;
        if (!node) return;
        const dur = 0.28 / Math.max(0.1, this.speed);
        const seq = tween(node);
        if (animName === "win") {
            seq.to(dur / 2, { scale: v3(node.scale.x * 1.15, node.scale.y * 1.15, 1) });
        }
        else if (animName === "lose") {
            seq.to(dur, { eulerAngles: v3(0, 0, -40) });
        }
        seq.call(() => {
            if (this.animator) (this.animator as any).onAnimFinished();
        }).start();
    }

    scaleTime(scale: number): void {
        this.speed = scale || 1;
    }
}
