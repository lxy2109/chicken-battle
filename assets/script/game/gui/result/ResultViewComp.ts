import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX } from "../../core/Catalog";
import { spawnChicken } from "../ChickenBinder";
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
        const warmup = run.phase === "warmup";

        setLabel(this, "LabTitle", win ? "胜利" : (warmup ? "热身落败" : "败北"));
        setLabel(this, "LabGold", `+${run.lastGoldGain}`);
        setLabel(this, "LabDesc", `现有金币 ${run.gold}`);

        // 按钮上已经写着"继续"，这里就别再喊一遍"点击继续"，直接告诉玩家下一步是什么。
        let hint: string;
        if (run.phase === "boss") hint = win ? "鸡王已败，村口从此姓你" : "鸡王暂时打不过，回去再练";
        else if (warmup) hint = win ? "热身拿下" : "热身可败，仍能进正式赛";
        else hint = win ? "正式赛拿下" : "正式赛失败，本局从热身赛重来";
        // 奖励那组默认是空的（战后就给金币，不用挑），配表开了才会有两组要挑。
        if (run.rewards.length > 0) hint += "，先挑奖励和强化";
        else if (run.upgrades.length > 0) hint += "，先挑个部位练";
        setLabel(this, "LabHint", hint);

        setNodeActive(this, "Confetti", win);
        await setNodeSprite(this, "Burst", TEX.ui(win ? "burst_win" : "burst_lose"));
        await spawnChicken(this, "ChickenSlot", run.playerFighter().appearance, 0.72);
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
