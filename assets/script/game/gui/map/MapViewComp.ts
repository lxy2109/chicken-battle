import { Color, Graphics, Label, Node, Sprite, UITransform, _decorator } from "cc";
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

/** 原图中脚底区域的中点（归一化坐标），排除透明边距和偏向一侧的尾巴。 */
const MAP_FEET: Record<string, [number, number]> = {
    warmup_1: [0.4074, 0.9421], warmup_2: [0.3612, 0.9482],
    warmup_3: [0.3133, 0.9890], warmup_4: [0.4036, 0.9472],
    warmup_5: [0.4343, 0.9510], warmup_6: [0.3517, 0.9267],
    warmup_7: [0.3988, 0.9499], warmup_8: [0.3667, 0.9465],
    warmup_9: [0.3854, 0.9499], warmup_10: [0.3532, 0.9423],
    warmup_11: [0.4429, 0.9439], warmup_12: [0.3158, 0.9426],
    s1_official: [0.5172, 0.9990], s2_official: [0.4197, 0.9991],
    s3_official: [0.3495, 0.9991], s4_official: [0.5289, 1],
    s5_official: [0.4926, 1], kun_boss: [0.5471, 0.9990]
};

@ccclass("MapViewComp")
@ecs.register("MapView", false)
@gui.register("MapView", { layer: LayerType.UI, prefab: "gui/map/map" })
export class MapViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        setLabel(this, "LabTitle", `${run.currentMap().id}/5 · ${run.currentMap().name}`);
        await this.setSprite(this.node.getComponent(Sprite)!, TEX.background(run.currentMap().background));
        const placement = run.currentMap().shop;
        const shop = this.getNode("BtnShop")!;
        const x = (placement.x - 540) / 1.5;
        const y = (960 - placement.y) / 1.5;
        shop.setPosition(x, y, 0);
        shop.setScale(placement.scale, placement.scale, 1);
        const sign = this.getNode("LabShopName")!;
        sign.setPosition(x, y + shop.getComponent(UITransform)!.height * placement.scale / 2 + 22, 0);
        const label = sign.getComponent(Label)!;
        label.fontSize = 26;
        label.lineHeight = 34;
        label.isBold = true;
        label.color = new Color(255, 228, 145);
        sign.getComponent(UITransform)!.setContentSize(136, 40);
        const plaque = new Node("ShopSignBackdrop");
        plaque.layer = this.node.layer;
        plaque.parent = this.node;
        plaque.setPosition(sign.position);
        plaque.addComponent(UITransform).setContentSize(136, 40);
        const graphic = plaque.addComponent(Graphics);
        graphic.fillColor = new Color(73, 40, 21, 245);
        graphic.strokeColor = new Color(255, 204, 94);
        graphic.lineWidth = 2;
        graphic.roundRect(-68, -20, 136, 40, 9);
        graphic.fill();
        graphic.stroke();
        sign.setSiblingIndex(this.node.children.length - 1);
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `战力 ${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabRouteTitle", run.currentRoute().name.split(" · ").pop()!);
        setLabel(this, "LabHint", run.mapHint());
        // Portrait uses the player's chosen colours/expression, cropped to the visible head.
        const avatar = await spawnChicken(this, "MapAvatarSlot", run.appearance, 0.76, true);
        if (avatar?.isValid) avatar.setPosition(33.6, -128.6, 0);
        await this.fillRoute();
        bindClick(this, "BtnCharacter", this.onCharacter.bind(this));
        bindClick(this, "BtnHome", () => goScreen(this, "customize"));
        setLabel(this, "BtnChallengeLab", "开始挑战");
        bindClick(this, "BtnChallenge", () => this.onBattleNode(run.routeNode));
        bindClick(this, "BtnShop", this.onShop.bind(this));
        bindClick(this, "LabShopName", this.onShop.bind(this));
    }

    private async fillRoute() {
        const run = this.ent.run;
        const nodes = run.route();
        const current = run.routeNode;
        const battleNodes = nodes.filter(node => node.kind === "battle");
        for (let i = 0; i < 5; i++) {
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
            if (node.enemyId) await this.placeEnemy(`StageEnemySlot${i + 1}`, node.enemyId, view, 0.24);
            bindClick(this, `BtnStage${i + 1}`, () => this.onBattleNode(node.id));
        }

        const boss = nodes.find(node => node.kind === "boss" && node.id >= current) || nodes.filter(node => node.kind === "boss").slice(-1)[0];
        const bossView = this.getNode("BtnBoss");
        if (boss && bossView) {
            const active = boss.id === current;
            const cleared = boss.id < current;
            await setNodeSprite(this, "BtnBoss", TEX.mapNode(cleared ? "chest" : "boss"));
            setSpriteColor(bossView, active || cleared ? "#FFFFFF" : "#9C8A72");
            bossView.setScale(active ? 1.16 : 1, active ? 1.16 : 1, 1);
            if (boss.enemyId) await this.placeEnemy("MapBossSlot", boss.enemyId, bossView, 0.32, true);
            setLabel(this, "LabBossName", boss.encounter === "final" ? "坤坤 · 最终战" : "BOSS正式赛");
            bindClick(this, "BtnBoss", () => this.onBattleNode(boss.id));
        }
    }

    private async placeEnemy(slotName: string, enemyId: string, platform: Node, scale: number, flip = false) {
        const appearance = enemyToFighter(enemyId).appearance;
        const chicken = await spawnChicken(this, slotName, appearance, scale, flip);
        const art = chicken?.getChildByName("Illustration");
        const box = art?.getComponent(UITransform);
        if (!chicken || !art || !box) return;
        const [fx, fy] = MAP_FEET[appearance.illustration!] || [0.5, 1];
        const slot = this.getNode(slotName)!;
        const top = platform.getComponent(UITransform)!.height * platform.scale.y * 0.12;
        slot.setPosition(platform.position.x, platform.position.y + top, 0);
        chicken.setPosition(-(fx - 0.5) * box.width * art.scale.x * chicken.scale.x,
            -(0.5 - fy) * box.height * chicken.scale.y, 0);
    }

    private async onBattleNode(id: number) {
        const run = this.ent.run;
        if (run.currentRoute().encounter === "final" && run.claimedGoldNodes.includes(run.routeNode)) {
            await goScreen(this, "ending");
            return;
        }
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
