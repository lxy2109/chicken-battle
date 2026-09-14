import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { MAPS, TEX, routeNode } from "../../core/Catalog";
import { celebrateChicken, spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
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
            ? (run.routeNode > run.lastBattleNode ? "前往下一关" : "查看总战绩") : run.upgrades.length ? "选择强化" : "返回地图");
        setLabel(this, "LabTitle", win ? "胜利" : "失败");
        setLabel(this, "LabGold", `+${run.lastGoldGain}`);
        setLabel(this, "LabDesc", run.lastFirstClear ? "首通奖励" : win ? "首通奖励已领取" : "本局获得");

        // 按钮上已经写着"继续"，这里就别再喊一遍"点击继续"，直接告诉玩家下一步是什么。
        let hint: string;
        if (boss) hint = win ? battleNode.encounter === "final" ? "新鸡王诞生！已获得鸡王中王套" : `${MAPS.find(map => map.id === (battleNode.mapId || 1))!.name}正式赛获胜`
            : `${battleNode.encounter === "final" ? "重新准备后可再挑战坤坤" : "本图热身赛重新开始"}，成长重置，金币与装备保留${run.playerFighter().stats.retainGrowth ? "；诸葛亮套保留一项成长" : ""}`;
        else hint = win ? "本节点已完成" : "节点未完成，可以再次挑战";
        if (run.upgrades.length > 0) hint += "，下一步选择一项强化";
        setLabel(this, "LabHint", hint);

        setNodeActive(this, "LossBanner", !win);
        await setNodeSprite(this, "result", TEX.background(win ? "result_figma" : "result_lose_figma"));
        const chicken = await spawnChicken(this, "ChickenSlot", run.playerFighter().appearance, 1.2);
        if (win) celebrateChicken(chicken, run.playerFighter().appearance);
        bindClick(this, "BtnNext", this.onNext.bind(this));
    }

    private async onNext() {
        this.ent.run.afterResult();
        await goScreen(this);
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("result", ResultViewComp);
