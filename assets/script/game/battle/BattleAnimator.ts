import { JsonAsset, _decorator } from "cc";
import AnimatorCustomization from "db://oops-framework/libs/animator/AnimatorCustomization";
import { AnimationPlayer } from "db://oops-framework/libs/animator/core/AnimatorBase";
import { AnimatorStateLogic } from "db://oops-framework/libs/animator/core/AnimatorStateLogic";

const { ccclass } = _decorator;

@ccclass("BattleAnimator")
export class BattleAnimator extends AnimatorCustomization {
    initWithJson(
        json: any,
        player: AnimationPlayer,
        onChange?: (from: string, to: string) => void,
        logic?: Map<string, AnimatorStateLogic>
    ) {
        if (this["_hasInit"]) return;
        this["_hasInit"] = true;
        const args: Array<Map<string, AnimatorStateLogic> | ((fromState: string, toState: string) => void) | AnimationPlayer> = [];
        if (logic) args.push(logic);
        if (onChange) args.push(onChange);
        args.push(player);
        this["initArgs"](...args);
        this["initJson"](json);
    }

    loadFromAsset(asset: JsonAsset, player: AnimationPlayer, onChange?: (from: string, to: string) => void) {
        this.initWithJson(asset.json, player, onChange);
    }
}
