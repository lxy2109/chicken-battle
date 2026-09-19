import { gameText } from "../../domain/GameConfig";
import { Button, Label, Sprite, UITransform, Widget, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../shared/GameUIBase";
import { ChickenRun } from "../../run/ChickenRun";
import { PREFAB_PATH, TEX } from "../../domain/Catalog";
import { levelOf } from "../../domain/PartUpgrade";
import { PART_TEXT, RewardOption } from "../../domain/Types";
import { tipGain } from "../shared/GameTip";
import { goScreen, registerScreen } from "../shared/Nav";
import { bindClick, bindNodeClick, clearChildren, setLabel, setNodeActive, setSpriteColor } from "../shared/UiUtil";

const { ccclass, executionOrder } = _decorator;

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

/** 部位强化的牌面写清练哪儿、练到几级，等级按当前 partLevels 现算，避免存档里的 nextLevel 过期。 */
function cardLines(opt: RewardOption, currentLevel: number): { title: string; level: string } {
    if (!opt.part) return { title: opt.title, level: "" };
    const text = gameText("RewardViewComp_001", PART_TEXT[opt.part], currentLevel);
    const split = text.split("\n");
    return { title: split[0] || text, level: split[1] || `Lv${currentLevel}` };
}

@ccclass("RewardViewComp")
@executionOrder(-100)
@ecs.register("RewardView", false)
@gui.register("RewardView", { layer: LayerType.UI, prefab: "gui/reward/reward" })
export class RewardViewComp extends GameUIBase<ChickenRun> {
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
        setLabel(this, "BtnConfirmLab", gameText("RewardViewComp_002"));

        setLabel(this, "LabTitle", gameText("RewardViewComp_003"));
        setLabel(this, "LabHint", cards.length === 3 ? gameText("RewardViewComp_004") : gameText("RewardViewComp_005", cards.length));

        const slot = this.getNode("CardSlot");
        clearChildren(slot);
        if (!slot) return;
        for (const opt of cards) {
            const card = await this.createPrefabNode(PREFAB_PATH.rewardCard);
            if (!this.node.isValid) { card.destroy(); return; }
            card.parent = slot;

            const title = card.getChildByName("LabTitle")?.getComponent(Label);
            const levelLab = card.getChildByName("LabLevel")?.getComponent(Label);
            const desc = card.getChildByName("LabDesc")?.getComponent(Label);
            const gold = card.getChildByName("GoldRow")?.getChildByName("LabGold")?.getComponent(Label);
            const nextLevel = opt.part ? levelOf(run.partLevels, opt.part) + 1 : 0;
            if (opt.part) opt.nextLevel = nextLevel;
            const lines = cardLines(opt, nextLevel);
            if (title) {
                title.string = levelLab ? lines.title : (lines.level ? `${lines.title}\n${lines.level}` : lines.title);
                title.enableWrapText = !levelLab;
            }
            if (levelLab) {
                levelLab.node.active = !!lines.level;
                levelLab.string = lines.level;
            }
            if (desc) desc.string = opt.desc;
            if (gold) gold.string = `+${opt.gold}`;
            const goldRow = card.getChildByName("GoldRow");
            if (goldRow) goldRow.active = opt.gold > 0;

            const icon = card.getChildByName("IconSlot")?.getChildByName("Icon")?.getComponent(Sprite);
            if (icon) await this.setSprite(icon, TEX.icon(rewardIcon(opt)));

            setSpriteColor(card, opt.id === this.selectedId ? "#FFD23F" : "#FFFFFF");
            bindNodeClick(card, () => this.select(opt.id), this);
        }
        this.fitCardSlot();
        this.ready = true;
    }

    /** 三张强化牌按父节点宽度等比缩小并水平居中，窄屏不再偏到一侧被裁。 */
    private fitCardSlot() {
        const slot = this.getNode("CardSlot");
        if (!slot?.parent) return;
        const widget = slot.getComponent(Widget);
        if (widget) {
            widget.isAlignLeft = false;
            widget.isAlignRight = false;
            widget.isAlignHorizontalCenter = true;
            widget.horizontalCenter = 0;
            widget.updateAlignment();
        }
        else {
            slot.setPosition(0, slot.position.y, 0);
        }
        const parentUt = slot.parent.getComponent(UITransform);
        const slotUt = slot.getComponent(UITransform);
        if (!parentUt || !slotUt || slotUt.width <= 0) return;
        const pad = 16;
        const maxW = Math.max(120, parentUt.width - pad * 2);
        const scale = Math.min(1, maxW / slotUt.width);
        slot.setScale(scale, scale, 1);
    }

    private select(id: string) {
        if (this.confirming || !this.ready) return;
        this.selectedId = id;
        const cards = this.ent.run.upgrades;
        this.getNode("CardSlot")?.children.forEach((node, i) => setSpriteColor(node, cards[i]?.id === id ? "#FFD23F" : "#FFFFFF"));
        const confirm = this.getNode("BtnConfirm")?.getComponent(Button);
        if (confirm) confirm.interactable = true;
        setLabel(this, "BtnConfirmLab", gameText("RewardViewComp_006"));
    }

    private async onConfirm() {
        if (!this.selectedId || this.confirming) return;
        this.confirming = true;
        const picked = this.ent.run.upgrades.find(opt => opt.id === this.selectedId);
        if (!this.ent.run.pickReward(this.selectedId)) {
            this.confirming = false;
            return;
        }
        if (picked) tipGain(picked.title, picked.desc);
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
