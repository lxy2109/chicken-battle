import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX, getStages } from "../../core/Catalog";
import { combatPower } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

/** 路线上的节点数，与 gen-prefabs 的 MAP_NODES 长度一致。 */
const NODE_COUNT = 5;

@ccclass("MapViewComp")
@ecs.register("MapView", false)
@gui.register("MapView", { layer: LayerType.UI, prefab: "gui/map/map" })
export class MapViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        setLabel(this, "LabTitle", "冒险路线");
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabHint", run.mapHint());

        await this.fillStages();
        this.fillBoss();
        this.fillShop();

        bindClick(this, "BtnShop", this.onShop.bind(this));
        bindClick(this, "BtnBoss", this.onBoss.bind(this));
        bindClick(this, "BtnCharacter", this.onCharacter.bind(this));
    }

    private async fillStages() {
        const run = this.ent.run;
        const stages = getStages();
        for (let i = 1; i <= NODE_COUNT; i++) {
            const row = stages[i - 1];
            const node = this.getNode(`BtnStage${i}`);
            if (node) node.active = !!row;
            setNodeActive(this, `LabStageName${i}`, !!row);
            if (!row || !node) continue;

            const cleared = i < run.stage || run.phase === "boss";
            const current = i === run.stage && run.phase !== "boss";
            // 打完的关放宝箱，当前关放旗标，没走到的上锁。
            await setNodeSprite(this, `BtnStage${i}`, TEX.mapNode(cleared ? "chest" : current ? "stage" : "lock"));
            setSpriteColor(node, current || cleared ? "#FFFFFF" : "#9C8A72");
            node.setScale(current ? 1.16 : 1, current ? 1.16 : 1, 1);

            const phase = current ? (run.phase === "warmup" ? " · 热身" : " · 正式") : "";
            setLabel(this, `LabStageName${i}`, `${row.name}${phase}`);
            setLabel(this, `LabStageNum${i}`, cleared ? "✓" : `${i}`);
            bindClick(this, `BtnStage${i}`, () => this.onStage(i));
        }
    }

    /** 没开张也留在图上，只是灰着。整个节点藏掉玩家会以为这局没有商店。 */
    private fillShop() {
        const open = this.ent.run.shopPending;
        const shop = this.getNode("BtnShop");
        if (shop) shop.setScale(open ? 1.1 : 1, open ? 1.1 : 1, 1);
        setSpriteColor(shop, open ? "#FFFFFF" : "#9C8A72");
        setLabel(this, "LabShopName", open ? "鸡市 · 开张" : "鸡市");
    }

    private fillBoss() {
        const run = this.ent.run;
        const ready = run.phase === "boss";
        const boss = this.getNode("BtnBoss");
        if (boss) boss.setScale(ready ? 1.16 : 1, ready ? 1.16 : 1, 1);
        setSpriteColor(boss, ready ? "#FFFFFF" : "#9C8A72");
        setLabel(this, "LabBossName", ready ? "鸡王 · 决战" : "鸡王");
    }

    private async onStage(i: number) {
        const run = this.ent.run;
        if (run.phase === "boss") {
            this.warn("五关都过了，去村口会会鸡王");
            return;
        }
        if (i < run.stage) {
            this.warn(`第 ${i} 关已经打完了`);
            return;
        }
        if (i > run.stage) {
            this.warn(`得先打完第 ${run.stage} 关`);
            return;
        }
        run.enterFight();
        await goScreen(this, "prebattle");
    }

    private async onBoss() {
        if (this.ent.run.phase !== "boss") {
            this.warn("打完五关，鸡王才肯露面");
            return;
        }
        this.ent.run.enterFight();
        await goScreen(this, "prebattle");
    }

    private async onShop() {
        if (!this.ent.run.shopPending) {
            this.warn("鸡市这会儿没开张");
            return;
        }
        this.ent.run.openShop();
        await goScreen(this, "shop");
    }

    /** 点了去不了的地方要说明白为什么，过一会儿再换回常规提示。 */
    private warn(text: string) {
        setLabel(this, "LabHint", text);
        this.unschedule(this.restoreHint);
        this.scheduleOnce(this.restoreHint, 1.8);
    }

    private restoreHint = () => {
        if (this.node && this.node.isValid) setLabel(this, "LabHint", this.ent.run.mapHint());
    };

    private async onCharacter() {
        await goScreen(this, "character");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("map", MapViewComp);
