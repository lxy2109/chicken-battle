import { gameText } from "../../core/GameConfig";
import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../common/GameUIBase";
import { ChickenRun } from "../../chicken/ChickenRun";
import { getStory } from "../../core/Catalog";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { playWinRibbon } from "../RibbonFx";
import { bindClick, setLabel, playSparkles } from "../UiUtil";

const { ccclass, executionOrder } = _decorator;

@ccclass("EndingViewComp")
@executionOrder(-100)
@ecs.register("EndingView", false)
@gui.register("EndingView", { layer: LayerType.UI, prefab: "gui/ending/ending" })
export class EndingViewComp extends GameUIBase<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        setLabel(this, "LabTitle", this.ent.run.playerFighter().name);
        setLabel(this, "LabGold", `${this.ent.run.gold}`);
        setLabel(this, "LabDesc", getStory("ending"));
        setLabel(this, "LabHint", gameText("EndingViewComp_001"));
        await spawnChicken(this, "ChickenSlot", this.ent.run.playerFighter().appearance, 0.72);
        void playWinRibbon(this);
        const slot = this.getNode("ChickenSlot");
        if (slot) {
            void playSparkles(slot, 12);
            this.schedule(() => void playSparkles(slot, 12), 1.5);
        }
        bindClick(this, "BtnRestart", this.onRestart.bind(this));
        bindClick(this, "BtnCharacter", () => goScreen(this, "character"));
    }

    private async onRestart() {
        await goScreen(this, "customize");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("ending", EndingViewComp);
