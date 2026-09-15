import { gameText } from "../../core/GameConfig";
import { BlockInputEvents, Color, Graphics, Label, Node, UIOpacity, UITransform, tween, view, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX, enemyToFighter } from "../../core/Catalog";
import { combatPower } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { openRunView } from "../RunGui";
import { playScreenMusic } from "../GameAudio";
import { spawnChicken } from "../ChickenBinder";
import { bindClick, setLabel, setNodeSprite, setSpriteColor } from "../UiUtil";

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
@gui.register("MapView", { layer: LayerType.UI, prefab: "gui/map/map_1" })
export class MapViewComp extends CCView<ChickenRun> {
    private switchingMap = false;

    async start() {
        this.nodeTreeInfoLite();
        await this.refreshMap();
    }

    private async refreshMap() {
        const run = this.ent.run;
        setLabel(this, "LabTitle", `${run.currentMap().id}/5 · ${run.currentMap().name}`);
        const sign = this.getNode("LabShopName");
        if (sign) {
            const label = sign.getComponent(Label)!;
            label.fontSize = 26;
            label.lineHeight = 34;
            label.isBold = true;
            label.color = new Color(255, 228, 145);
            sign.getComponent(UITransform)!.setContentSize(136, 40);
            const plaque = this.node.getChildByName("ShopSignBackdrop") || new Node("ShopSignBackdrop");
            plaque.layer = this.node.layer;
            plaque.parent = this.node;
            plaque.setPosition(sign.position);
            (plaque.getComponent(UITransform) || plaque.addComponent(UITransform)).setContentSize(136, 40);
            const graphic = plaque.getComponent(Graphics) || plaque.addComponent(Graphics);
            graphic.clear();
            graphic.fillColor = new Color(73, 40, 21, 245);
            graphic.strokeColor = new Color(255, 204, 94);
            graphic.lineWidth = 2;
            graphic.roundRect(-68, -20, 136, 40, 9);
            graphic.fill();
            graphic.stroke();
            sign.setSiblingIndex(this.node.children.length - 1);
        }
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", gameText("MapViewComp_001", combatPower(run.playerFighter().stats)));
        setLabel(this, "LabRouteTitle", run.currentRoute().name.split(" · ").pop()!);
        setLabel(this, "LabHint", run.mapHint());
        // Portrait uses the player's chosen colours/expression, cropped to the visible head.
        const avatar = await spawnChicken(this, "MapAvatarSlot", run.appearance, 0.76, true);
        if (avatar?.isValid) avatar.setPosition(33.6, -128.6, 0);
        await this.fillRoute();
        bindClick(this, "BtnCharacter", this.onCharacter.bind(this));
        bindClick(this, "BtnHome", () => goScreen(this, "customize"));
        setLabel(this, "BtnChallengeLab", run.nextMap ? gameText("MapViewComp_002") : gameText("MapViewComp_003"));
        bindClick(this, "BtnChallenge", () => run.nextMap ? this.onNextMap() : this.onBattleNode(run.routeNode));
        const shop = this.getNode("BtnShop");
        if (shop && shop.scale.z === 0) shop.setScale(shop.scale.x, shop.scale.y, 1);
        bindClick(this, "BtnShop", this.onShop.bind(this));
        bindClick(this, "LabShopName", this.onShop.bind(this));
    }

    private async fillRoute() {
        const run = this.ent.run;
        const nodes = run.route();
        const current = run.routeNode;
        const battleNodes = nodes.filter(node => node.kind === "battle");
        for (let i = 0; i < battleNodes.length; i++) {
            const node = battleNodes[i];
            const stage = this.getNode(`BtnStage${i + 1}`);
            if (!node || !stage) continue;
            const cleared = node.id < current;
            const active = node.id === current;
            await setNodeSprite(this, `BtnStage${i + 1}`, TEX.mapNode(cleared ? "chest" : active ? "stage" : "lock"));
            setSpriteColor(stage, cleared || active ? "#FFFFFF" : "#9C8A72");
            setLabel(this, `LabStageNum${i + 1}`, cleared ? "✓" : `${run.currentMap().id}-${i + 1}`);
            setLabel(this, `LabStageName${i + 1}`, node.name.split(" · ").pop()!);
            if (node.enemyId) await this.placeEnemy(`StageEnemySlot${i + 1}`, node.enemyId, stage, 0.24);
            bindClick(this, `BtnStage${i + 1}`, () => this.onBattleNode(node.id));
        }

        const boss = nodes.find(node => node.kind === "boss" && node.id >= current) || nodes.filter(node => node.kind === "boss").slice(-1)[0];
        const bossView = this.getNode("BtnBoss");
        if (boss && bossView) {
            const cleared = boss.id < current || run.claimedGoldNodes.includes(boss.id);
            const active = boss.id === current && !cleared;
            await setNodeSprite(this, "BtnBoss", TEX.mapNode(cleared ? "chest" : "boss"));
            setSpriteColor(bossView, active || cleared ? "#FFFFFF" : "#9C8A72");
            if (boss.enemyId) await this.placeEnemy("MapBossSlot", boss.enemyId, bossView, 0.32, true);
            setLabel(this, "LabBossName", boss.encounter === "final" ? gameText("MapViewComp_004") : gameText("MapViewComp_005"));
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
        if (this.switchingMap) return;
        const run = this.ent.run;
        if (run.nextMap) {
            this.warn(gameText("MapViewComp_006"));
            return;
        }
        if (run.currentRoute().encounter === "final" && run.claimedGoldNodes.includes(run.routeNode)) {
            await goScreen(this, "ending");
            return;
        }
        if (id !== run.routeNode) {
            this.warn(id < run.routeNode ? gameText("MapViewComp_007") : gameText("MapViewComp_008"));
            return;
        }
        const node = run.currentRoute();
        if (node.kind !== "battle" && node.kind !== "boss") {
            this.warn(gameText("MapViewComp_009"));
            return;
        }
        run.enterFight();
        if (run.screen === "prebattle") await goScreen(this);
    }

    private async onShop() {
        if (this.switchingMap) return;
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
        if (this.switchingMap) return;
        await goScreen(this, "character");
    }

    private async onNextMap() {
        const run = this.ent.run;
        const next = run.nextMap;
        if (!next || this.switchingMap) return;
        this.switchingMap = true;
        const ent = this.ent;
        const curtain = new Node("MapTransition");
        curtain.layer = this.node.layer;
        curtain.parent = this.node.parent;
        curtain.setPosition(this.node.position);
        curtain.setScale(this.node.scale);
        const size = view.getVisibleSize();
        const width = Math.max(720, size.width / this.node.scale.x);
        const height = Math.max(1280, size.height / this.node.scale.y);
        curtain.addComponent(UITransform).setContentSize(width, height);
        curtain.addComponent(BlockInputEvents);
        const graphics = curtain.addComponent(Graphics);
        graphics.fillColor = new Color(24, 35, 27);
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        const title = new Node("MapName");
        title.layer = curtain.layer;
        title.parent = curtain;
        title.addComponent(UITransform).setContentSize(640, 100);
        const label = title.addComponent(Label);
        label.string = gameText("MapViewComp_010", next.name);
        label.fontSize = 42;
        label.lineHeight = 56;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.color = new Color(255, 228, 145);
        const opacity = curtain.addComponent(UIOpacity);
        opacity.opacity = 0;
        try {
            await new Promise<void>(resolve => tween(opacity).to(0.4, { opacity: 255 }).call(() => resolve()).start());
            if (!run.enterNextMap()) return;
            this.remove();
            await openRunView(ent, MapViewComp);
            playScreenMusic("map");
            await new Promise<void>(resolve => tween(opacity).delay(0.3).to(0.45, { opacity: 0 }).call(() => resolve()).start());
        } catch (error) {
            console.error("[MapView] 切换地图失败", error);
            if (this.node?.isValid) this.warn(gameText("MapViewComp_011"));
        } finally {
            if (curtain.isValid) curtain.destroy();
        }
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("map", MapViewComp);
