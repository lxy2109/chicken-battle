import { Button, Label, Sprite, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX } from "../../core/Catalog";
import { PART_TEXT, RewardOption } from "../../core/Types";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, bindNodeClick, clearChildren, setLabel, setNodeActive, setSpriteColor } from "../UiUtil";

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
    return `${PART_TEXT[opt.part]}强化\nLv${opt.nextLevel}/${opt.maxLevel}`;
}

@ccclass("RewardViewComp")
@ecs.register("RewardView", false)
@gui.register("RewardView", { layer: LayerType.UI, prefab: "gui/reward/reward" })
export class RewardViewComp extends CCView<ChickenRun> {
    private selectedId: string | null = null;
    private confirming = false;
    private ready = false;

    async start() {
        this.nodeTreeInfoLite();
        // v7 强化必须明确选一张，结算页的金币不会再挤占三选一名额。
        setNodeActive(this, "BtnSkip", false);
        bindClick(this, "BtnConfirm", this.onConfirm.bind(this));
        await this.fill();
    }

    /** 摆出当前战斗产生的三张部位强化牌。 */
    private async fill() {
        this.ready = false;
        const run = this.ent.run;
        const cards = run.upgrades;
        this.selectedId = null;
        const confirm = this.getNode("BtnConfirm")?.getComponent(Button);
        if (confirm) confirm.interactable = false;
        setLabel(this, "BtnConfirmLab", "请先选择强化");

        setLabel(this, "LabTitle", "选择强化");
        setLabel(this, "LabHint", cards.length === 3 ? "请选择 1 项强化（三选一）" : `剩余 ${cards.length} 项可强化部位，请选择 1 项`);

        const slot = this.getNode("CardSlot");
        clearChildren(slot);
        if (!slot) return;
        for (const opt of cards) {
            const card = await this.createPrefabNode(PREFAB_PATH.rewardCard);
            if (!this.node.isValid) { card.destroy(); return; }
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

            setSpriteColor(card, opt.id === this.selectedId ? "#FFD23F" : "#FFFFFF");
            bindNodeClick(card, () => this.select(opt.id), this);
        }
        this.ready = true;
    }

    private select(id: string) {
        if (this.confirming || !this.ready) return;
        this.selectedId = id;
        const cards = this.ent.run.upgrades;
        this.getNode("CardSlot")?.children.forEach((node, i) => setSpriteColor(node, cards[i]?.id === id ? "#FFD23F" : "#FFFFFF"));
        const confirm = this.getNode("BtnConfirm")?.getComponent(Button);
        if (confirm) confirm.interactable = true;
        setLabel(this, "BtnConfirmLab", "确认强化");
    }

    private async onConfirm() {
        if (!this.selectedId || this.confirming) return;
        this.confirming = true;
        if (!this.ent.run.pickReward(this.selectedId)) {
            this.confirming = false;
            return;
        }
        await this.next();
    }

    /** 选完强化后由 RunState 决定回到路线还是打开固定商店。 */
    private async next() {
        if (this.ent.run.screen === "reward") await this.fill();
        else await goScreen(this);
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("reward", RewardViewComp);
