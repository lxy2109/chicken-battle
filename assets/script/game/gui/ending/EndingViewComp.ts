import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { RunState } from "../../core/RunState";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("EndingViewComp")
@ecs.register("EndingView", false)
@gui.register("EndingView", { layer: LayerType.UI, prefab: "gui/ending/ending" })
export class EndingViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        setLabel(this, "LabTitle", "村口鸡王");
        setLabel(this, "LabGold", `${this.ent.run.gold}`);
        setLabel(this, "LabDesc", "你打败了坤坤。村口从今以后，你说了算。");
        await spawnChicken(this, "ChickenSlot", this.ent.run.playerFighter().appearance, 0.9);
        bindClick(this, "BtnRestart", this.onRestart.bind(this));
    }

    private async onRestart() {
        this.ent.RunModel.data = new RunState();
        await goScreen(this, "customize");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("ending", EndingViewComp);
