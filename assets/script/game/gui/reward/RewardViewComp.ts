import { Label, Sprite, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX } from "../../core/Catalog";
import { combatPower } from "../../core/EquipMath";
import { PART_TEXT, RewardOption } from "../../core/Types";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, bindNodeClick, clearChildren, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

/** 按加成主项挑图标，纯金币奖励落到星星。 */
function rewardIcon(opt: RewardOption): string {
    const s = opt.stats;
    if (s.atk) return "atk";
    if (s.maxHp || s.hp) return "hp";
    if (s.def) return "def";
    if (s.spd) return "spd";
    if (s.crit) return "power";
    return "star";
}

/** 部位强化的牌面写清练哪儿、练到几级，纯 buff 就只有名字。 */
function cardTitle(opt: RewardOption): string {
    if (!opt.part) return opt.title;
    return `${opt.title} · ${PART_TEXT[opt.part]} Lv${opt.nextLevel}/${opt.maxLevel}`;
}

@ccclass("RewardViewComp")
@ecs.register("RewardView", false)
@gui.register("RewardView", { layer: LayerType.UI, prefab: "gui/reward/reward" })
export class RewardViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        bindClick(this, "BtnSkip", this.skip.bind(this));
        await this.fill();
    }

    /**
     * 摆出当前这一组牌。
     *
     * 一场打完要连挑两次：先战后奖励，再部位强化。两组共用这一屏，挑完前一组就地换牌，
     * 不跳界面——为这一步单开一个界面只是把同样的三张牌换个地方摆。
     */
    private async fill() {
        const run = this.ent.run;
        const buff = run.rewards.length > 0;
        const cards = buff ? run.rewards : run.upgrades;

        setLabel(this, "LabTitle", buff ? "战后奖励" : "部位强化");
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabHint", buff ? "免费挑一份带走" : "免费挑一个部位练，练过的部位会长大");

        const slot = this.getNode("CardSlot");
        clearChildren(slot);
        if (!slot) return;
        for (const opt of cards) {
            const card = await this.createPrefabNode(PREFAB_PATH.rewardCard);
            card.parent = slot;

            const title = card.getChildByName("LabTitle")?.getComponent(Label);
            const desc = card.getChildByName("LabDesc")?.getComponent(Label);
            const gold = card.getChildByName("GoldRow")?.getChildByName("LabGold")?.getComponent(Label);
            if (title) title.string = cardTitle(opt);
            if (desc) desc.string = opt.desc;
            if (gold) gold.string = `+${opt.gold}`;
            const goldRow = card.getChildByName("GoldRow");
            if (goldRow) goldRow.active = opt.gold > 0;

            const icon = card.getChildByName("IconSlot")?.getChildByName("Icon")?.getComponent(Sprite);
            if (icon) await this.setSprite(icon, TEX.icon(rewardIcon(opt)));

            bindNodeClick(card.getChildByName("BtnPick") || card, () => this.pick(opt.id), this);
        }
    }

    private async pick(id: string) {
        this.ent.run.pickReward(id);
        await this.next();
    }

    private async skip() {
        this.ent.run.skipReward();
        await this.next();
    }

    /** 还剩一组牌就留在这屏换牌，两组都挑完了才走。去哪由 RunState 定，这里别写死。 */
    private async next() {
        if (this.ent.run.screen === "reward") await this.fill();
        else await goScreen(this);
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("reward", RewardViewComp);
