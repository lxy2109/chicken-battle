import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("ResultViewComp")
@ecs.register("ResultView", false)
@gui.register("ResultView", { layer: LayerType.UI, prefab: "gui/result/result" })
export class ResultViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const win = run.lastWin;
        const warmup = run.phase === "warmup";
        setLabel(this, "LabTitle", win ? "战胜！" : (warmup ? "热身落败" : "败北"));
        setLabel(this, "LabGold", `+${run.lastGoldGain}   现有 ${run.gold}`);
        let hint = "点击继续";
        if (!win && !warmup && run.phase !== "boss") hint = "正式赛失败，本局重来";
        if (!win && warmup) hint = "热身可败，仍可进入正式赛";
        if (win && run.phase === "boss") hint = "鸡王已败！";
        setLabel(this, "LabHint", hint);
        await spawnChicken(this, "ChickenSlot", run.playerFighter().appearance, 0.85);
        bindClick(this, "BtnNext", this.onNext.bind(this));
    }

    private async onNext() {
        this.ent.run.afterResult();
        await goScreen(this);
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("result", ResultViewComp);
