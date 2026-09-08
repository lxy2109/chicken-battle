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

@ccclass("EndingViewComp")
@ecs.register("EndingView", false)
@gui.register("EndingView", { layer: LayerType.UI, prefab: "gui/ending/ending" })
export class EndingViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        setLabel(this, "LabTitle", this.ent.run.playerFighter().name);
        setLabel(this, "LabGold", `${this.ent.run.gold}`);
        setLabel(this, "LabDesc", "你打败了坤坤。村口从今以后，你说了算。");
        setLabel(this, "LabHint", `五张地图全部完成 · 剩余 ${this.ent.run.gold} 金币`);
        await spawnChicken(this, "ChickenSlot", this.ent.run.playerFighter().appearance, 0.72);
        bindClick(this, "BtnRestart", this.onRestart.bind(this));
    }

    private async onRestart() {
        await goScreen(this, "customize");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("ending", EndingViewComp);
