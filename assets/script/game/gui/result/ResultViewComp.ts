import { gameText } from "../../core/GameConfig";
import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { getMaps, TEX, routeNode } from "../../core/Catalog";
import { Appearance } from "../../core/Types";
import { celebrateChicken, mournChicken, spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { playResultSuitVideo, stopSlotVideo } from "../SlotVideo";
import { bindClick, setLabel, setNodeActive, setNodeSprite } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("ResultViewComp")
@ecs.register("ResultView", false)
@gui.register("ResultView", { layer: LayerType.UI, prefab: "gui/result/result" })
export class ResultViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const win = run.lastWin;
        const battleNode = routeNode(run.lastBattleNode);
        const boss = battleNode.kind === "boss";
        setLabel(this, "LabHeader", run.playerFighter().name);
        setLabel(this, "BtnNextLab", win && boss
            ? (battleNode.encounter === "final" ? gameText("ResultViewComp_001") : gameText("ResultViewComp_002")) : run.upgrades.length ? gameText("ResultViewComp_003") : gameText("ResultViewComp_004"));
        setLabel(this, "LabGold", `+${run.lastGoldGain}`);
        setLabel(this, "LabDesc", run.lastFirstClear ? gameText("ResultViewComp_007") : win ? gameText("ResultViewComp_008") : gameText("ResultViewComp_009"));

        // 按钮上已经写着"继续"，这里就别再喊一遍"点击继续"，直接告诉玩家下一步是什么。
        let hint: string;
        if (boss) hint = win ? battleNode.encounter === "final" ? gameText("ResultViewComp_010") : gameText("ResultViewComp_011", getMaps().find(map => map.id === (battleNode.mapId || 1))!.name)
            : gameText("ResultViewComp_015", battleNode.encounter === "final" ? gameText("ResultViewComp_012") : gameText("ResultViewComp_013"), run.playerFighter().stats.retainGrowth ? gameText("ResultViewComp_014") : "");
        else hint = win ? gameText("ResultViewComp_016") : gameText("ResultViewComp_017");
        if (run.upgrades.length > 0) hint += gameText("ResultViewComp_018");
        // 失败底图已经写了「失败 / 变强继续挑战！」，不再叠爆炸框和底部说明。
        setLabel(this, "LabHint", win ? hint : "");
        setNodeActive(this, "LossBanner", false);
        setNodeActive(this, "LabHint", win);
        await setNodeSprite(this, "result", TEX.background(win ? "result_figma" : "result_lose_figma"));
        const appearance = run.playerFighter().appearance;
        const look: Appearance = win ? appearance : { ...appearance, face: "sad" };
        // 成套后在 ChickenSlot 播套装视频，尺寸跟现有 slot 一致；没有片源时仍展示立绘/拼装鸡。
        if (!await playResultSuitVideo(this, "ChickenSlot", look)) {
            const chicken = await spawnChicken(this, "ChickenSlot", look, 1.2);
            if (win) celebrateChicken(chicken, look);
            else mournChicken(chicken);
        }
        bindClick(this, "BtnNext", this.onNext.bind(this));
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
