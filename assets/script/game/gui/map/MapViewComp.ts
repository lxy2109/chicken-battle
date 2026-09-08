import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX, enemyToFighter } from "../../core/Catalog";
import { combatPower } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { spawnChicken } from "../ChickenBinder";
import { bindClick, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("MapViewComp")
@ecs.register("MapView", false)
@gui.register("MapView", { layer: LayerType.UI, prefab: "gui/map/map" })
export class MapViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        setLabel(this, "LabTitle", `${run.currentMap().id}/5 · ${run.currentMap().name}`);
        await setNodeSprite(this, "map", TEX.background(run.currentMap().background));
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `战力 ${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabRouteTitle", run.currentRoute().name.split(" · ").pop()!);
        setLabel(this, "LabHint", run.mapHint());
        await this.fillRoute();
        bindClick(this, "BtnCharacter", this.onCharacter.bind(this));
        bindClick(this, "BtnHome", () => goScreen(this, "customize"));
        setLabel(this, "BtnChallengeLab", "开始挑战");
        bindClick(this, "BtnChallenge", () => this.onBattleNode(run.routeNode));
        bindClick(this, "BtnShop", this.onShop.bind(this));
    }

    private async fillRoute() {
        const run = this.ent.run;
        const nodes = run.route();
        const current = run.routeNode;
        const battleNodes = nodes.filter(node => node.kind === "battle");
        const preview = battleNodes.find(node => node.id >= current) || battleNodes[battleNodes.length - 1];
        if (preview?.enemyId) await spawnChicken(this, "MapEnemySlot", enemyToFighter(preview.enemyId).appearance, 0.25);
        for (let i = 0; i < 3; i++) {
            const node = battleNodes[i];
            const view = this.getNode(`BtnStage${i + 1}`);
            setNodeActive(this, `BtnStage${i + 1}`, !!node);
            setNodeActive(this, `LabStageName${i + 1}`, !!node);
            if (!node || !view) continue;
            const cleared = node.id < current;
            const active = node.id === current;
            await setNodeSprite(this, `BtnStage${i + 1}`, TEX.mapNode(cleared ? "chest" : active ? "stage" : "lock"));
            setSpriteColor(view, cleared || active ? "#FFFFFF" : "#9C8A72");
            view.setScale(active ? 1.16 : 1, active ? 1.16 : 1, 1);
            setLabel(this, `LabStageNum${i + 1}`, cleared ? "✓" : `${run.currentMap().id}-${i + 1}`);
            setLabel(this, `LabStageName${i + 1}`, node.name.split(" · ").pop()!);
            bindClick(this, `BtnStage${i + 1}`, () => this.onBattleNode(node.id));
        }

        const boss = nodes.find(node => node.kind === "boss");
        const bossView = this.getNode("BtnBoss");
        if (boss && bossView) {
            if (boss.enemyId) await spawnChicken(this, "MapBossSlot", enemyToFighter(boss.enemyId).appearance, 0.32, true);
            const active = boss.id === current;
            const cleared = boss.id < current;
            await setNodeSprite(this, "BtnBoss", TEX.mapNode(cleared ? "chest" : "boss"));
            setSpriteColor(bossView, active || cleared ? "#FFFFFF" : "#9C8A72");
            bossView.setScale(active ? 1.16 : 1, active ? 1.16 : 1, 1);
            setLabel(this, "LabBossName", active ? "鸡王 · 决战" : "鸡王");
            bindClick(this, "BtnBoss", () => this.onBattleNode(boss.id));
        }
    }

    private async onBattleNode(id: number) {
        const run = this.ent.run;
        if (id !== run.routeNode) {
            this.warn(id < run.routeNode ? "本关已完成" : "请先挑战当前关卡");
            return;
        }
        const node = run.currentRoute();
        if (node.kind !== "battle" && node.kind !== "boss") {
            this.warn("当前节点不是战斗");
            return;
        }
        run.enterFight();
        if (run.screen === "prebattle") await goScreen(this);
    }

    private async onShop() {
        const run = this.ent.run;
        run.openShop();
        await goScreen(this, "shop");
    }

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
