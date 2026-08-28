import { Label, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH } from "../../core/Catalog";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, bindNodeClick, clearChildren, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("RewardViewComp")
@ecs.register("RewardView", false)
@gui.register("RewardView", { layer: LayerType.UI, prefab: "gui/reward/reward" })
export class RewardViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        setLabel(this, "LabTitle", "三选一");
        setLabel(this, "LabGold", `${this.ent.run.gold}`);
        setLabel(this, "LabHint", "挑一份带走，或只要金币");
        const slot = this.getNode("CardSlot");
        clearChildren(slot);
        if (!slot) return;
        for (const opt of this.ent.run.rewards) {
            const card = await this.createPrefabNode(PREFAB_PATH.rewardCard);
            card.parent = slot;
            const title = card.getChildByName("LabTitle")?.getComponent(Label);
            const desc = card.getChildByName("LabDesc")?.getComponent(Label);
            if (title) title.string = opt.title;
            if (desc) desc.string = opt.desc;
            bindNodeClick(card.getChildByName("BtnPick") || card, () => this.pick(opt.id), this);
        }
        bindClick(this, "BtnSkip", this.skip.bind(this));
    }

    private async pick(id: string) {
        this.ent.run.pickReward(id);
        await goScreen(this, "shop");
    }

    private async skip() {
        this.ent.run.skipReward();
        await goScreen(this, "shop");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("reward", RewardViewComp);
