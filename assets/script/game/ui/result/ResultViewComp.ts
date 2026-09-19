import { gameText } from "../../domain/GameConfig";
import { _decorator, VideoClip } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../shared/GameUIBase";
import { ChickenRun } from "../../run/ChickenRun";
import { getMaps, TEX, routeNode } from "../../domain/Catalog";
import { Appearance } from "../../domain/Types";
import { celebrateChicken, mournChicken, spawnChicken } from "../shared/ChickenBinder";
import { coverBackgroundOf } from "../shared/adaptView";
import { goScreen, registerScreen } from "../shared/Nav";
import { playWinRibbon } from "../shared/RibbonFx";
import { playResultSuitVideo, stopSlotVideo } from "../shared/SlotVideo";
import { UIBgAdaptation } from "../shared/UIBgAdaptation";
import { tipChampionReward } from "../shared/GameTip";
import { bindClick, setCoverSprite, setLabel, setNodeActive } from "../shared/UiUtil";

const { ccclass, executionOrder } = _decorator;

@ccclass("ResultViewComp")
@executionOrder(-100)
@ecs.register("ResultView", false)
@gui.register("ResultView", { layer: LayerType.UI, prefab: "gui/result/result" })
export class ResultViewComp extends GameUIBase<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const win = run.lastWin;
        // 先挂继续按钮。结算演出失败时也不能把玩家关在这页。
        bindClick(this, "BtnNext", this.onNext.bind(this));
        const battleNode = routeNode(run.lastBattleNode);
        const boss = battleNode.kind === "boss";
        // 缝纫鸡赠套：先飘 tip，不依赖后续底图/立绘加载。
        if (win && boss && battleNode.mapId === 5 && battleNode.encounter === "official") tipChampionReward();
        const appearance = run.playerFighter().appearance;
        const look: Appearance = win ? appearance : { ...appearance, face: "sad" };
        try {
            // 胜/败底图都挂在 bg + UIBgAdaptation 上，换贴图后刷新 Cover。
            await setCoverSprite(this, TEX.background(win ? "result_figma" : "result_lose_figma"));
            coverBackgroundOf(this.node).getComponent(UIBgAdaptation)?.refresh();
            setLabel(this, "LabHeader", run.playerFighter().name);
            setLabel(this, "BtnNextLab", win && boss
                ? (battleNode.encounter === "final" ? gameText("ResultViewComp_001") : gameText("ResultViewComp_002")) : run.upgrades.length ? gameText("ResultViewComp_003") : gameText("ResultViewComp_004"));
            setLabel(this, "LabGold", `+${run.lastGoldGain}`);
            setLabel(this, "LabDesc", run.lastFirstClear ? gameText("ResultViewComp_007") : win ? gameText("ResultViewComp_008") : gameText("ResultViewComp_009"));

            // 按钮上已经写着"继续"，这里就别再喊一遍"点击继续"，直接告诉玩家下一步是什么。
            let hint: string;
            const mapName = getMaps().find(map => map.id === (battleNode.mapId || 1))?.name || "";
            if (boss) {
                if (win) {
                    if (battleNode.encounter === "final") hint = gameText("ResultViewComp_010");
                    else if (battleNode.mapId === 5 && battleNode.encounter === "official") {
                        hint = gameText("EndingViewComp_001");
                    }
                    else hint = gameText("ResultViewComp_011", mapName);
                }
                else {
                    hint = battleNode.encounter === "final" ? gameText("ResultViewComp_012") : gameText("ResultViewComp_013");
                }
            }
            else hint = win ? gameText("ResultViewComp_016") : gameText("ResultViewComp_017");
            if (run.upgrades.length > 0) hint += gameText("ResultViewComp_018");
            // 失败底图已经写了「失败 / 变强继续挑战！」，不再叠底部说明。
            setLabel(this, "LabHint", win ? hint : "");
            setNodeActive(this, "LabHint", win);
            if (win) void playWinRibbon(this);
            // 先出立绘，GIF 首帧好了再换上。安卓读 10MB 级动图可能要几秒，不能把槽位留空。
            const chicken = await spawnChicken(this, "ChickenSlot", look, 1.2);
            if (win) celebrateChicken(chicken, look);
            else mournChicken(chicken);
            if (win) void playResultSuitVideo(this, "ChickenSlot", look);
            if (win && boss && battleNode.encounter === "final") {
                void this.load("bundle", TEX.endingVideo, VideoClip).catch(error => {
                    console.warn("[Result] 结局视频预加载失败", error);
                });
            }
        } catch (error) {
            console.error("[Result] 结算演出失败，仍可继续", error);
            try {
                const chicken = await spawnChicken(this, "ChickenSlot", look, 1.2);
                if (win) celebrateChicken(chicken, look);
                else mournChicken(chicken);
            } catch { /* 按钮已可点 */ }
        }
    }

    private async onNext() {
        this.ent.run.afterResult();
        await goScreen(this);
    }

    reset() {
        stopSlotVideo(this.getNode("ChickenSlot"));
        this.node.destroy();
    }
}

registerScreen("result", ResultViewComp);
