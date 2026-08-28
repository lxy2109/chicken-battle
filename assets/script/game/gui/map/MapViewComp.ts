import { Label, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { getStages } from "../../core/Catalog";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("MapViewComp")
@ecs.register("MapView", false)
@gui.register("MapView", { layer: LayerType.UI, prefab: "gui/map/map" })
export class MapViewComp extends CCView<ChickenRun> {
    start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        setLabel(this, "LabTitle", "村口战场");
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabHint", run.mapHint());
        const stages = getStages();
        for (let i = 1; i <= 8; i++) {
            const name = `BtnStage${i}`;
            const node = this.getNode(name);
            const row = stages[i - 1];
            if (node) node.active = !!row;
            if (!row) continue;
            const lab = node?.getComponentInChildren(Label);
            const done = i < run.stage || (i === run.stage && run.phase === "boss");
            const current = i === run.stage && run.phase !== "boss";
            if (lab) lab.string = `${i}.${row.name}${done ? " ✓" : current ? " ◀" : ""}`;
            if (node) {
                if (current) setSpriteColor(node, "#FFFFFF");
                else if (done) setSpriteColor(node, "#C8B89A");
                else setSpriteColor(node, "#8A7A62");
            }
            bindClick(this, name, () => this.onStage(i));
        }
        bindClick(this, "BtnBoss", () => this.onBoss());
        bindClick(this, "BtnShop", () => this.onShop());
        const boss = this.getNode("BtnBoss");
        if (boss) boss.active = run.phase === "boss";
        const shop = this.getNode("BtnShop");
        if (shop) shop.active = run.shopPending;
    }

    private async onStage(i: number) {
        const run = this.ent.run;
        if (run.phase === "boss") return;
        if (i !== run.stage) return;
        run.enterFight();
        await goScreen(this, "prebattle");
    }

    private async onBoss() {
        if (this.ent.run.phase !== "boss") return;
        this.ent.run.enterFight();
        await goScreen(this, "prebattle");
    }

    private async onShop() {
        if (!this.ent.run.shopPending) return;
        this.ent.run.openShop();
        await goScreen(this, "shop");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("map", MapViewComp);
