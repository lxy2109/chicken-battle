import { gameText } from "../../core/GameConfig";
import { Label, Node, Sprite, UITransform, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX, getSets } from "../../core/Catalog";
import { combatPower, ownedSetCount } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { revealUI, bindClick, bindNodeClick, clearChildren, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

interface ItemView {
    title: string;
    desc: string;
    price: number;
    icon: string;
    affordable: boolean;
    collected?: boolean;
    onBuy: () => void;
}

@ccclass("ShopViewComp")
@ecs.register("ShopView", false)
@gui.register("ShopView", { layer: LayerType.UI, prefab: "gui/shop/shop" })
export class ShopViewComp extends CCView<ChickenRun> {
    private selected: ItemView | null = null;

    async start() {
        this.nodeTreeInfoLite();
        bindClick(this, "BtnBack", this.onLeave.bind(this));
        bindClick(this, "BtnCancelBuy", () => this.closePurchase());
        bindClick(this, "BtnConfirmBuy", () => {
            const selected = this.selected;
            if (!selected || !selected.affordable) return;
            this.closePurchase();
            selected.onBuy();
        });
        bindClick(this, "BtnLeave", this.onLeave.bind(this));
        await this.refresh();
    }

    private async refresh() {
        const run = this.ent.run;
        setLabel(this, "LabTitle", gameText("ShopViewComp_001"));
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabDesc", gameText("ShopViewComp_002"));

        const sets = getSets().filter(set => !set.legacy && !set.rewardOnly && set.unlockMap <= run.currentMap().id);
        const goods: ItemView[] = sets.map(set => {
            const owned = ownedSetCount(run.ownedIds, set.id);
            const collected = owned >= set.pieceIds.length;
            const price = run.setPrice(set.id);
            const unlocked = set.unlockMap <= run.currentMap().id;
            return {
                title: set.name,
                desc: collected ? gameText("ShopViewComp_003") : gameText("ShopViewComp_006", unlocked ? gameText("ShopViewComp_004") : gameText("ShopViewComp_005", set.unlockMap), set.desc2, set.desc4),
                price, icon: TEX.set(set.id),
                affordable: unlocked && !collected && run.gold >= price,
                collected,
                onBuy: () => this.buySet(set.id)
            };
        });
        await setNodeSprite(this, "shop", TEX.background("shop_figma"));
        if (!this.node.isValid) return;
        const itemSlot = this.getNode("ItemSlot");
        clearChildren(itemSlot);
        if (!itemSlot) return;
        for (const item of goods) {
            if (!itemSlot.isValid) return;
            await this.addCard(itemSlot, item, PREFAB_PATH.shopItem);
        }
    }

    private async addCard(parent: Node, view: ItemView, prefab: string) {
        const node = await this.createPrefabNode(prefab);
        if (!parent.isValid) { node.destroy(); return; }
        node.parent = parent;

        const text = (target: Node | null, value: string) => {
            const lab = target?.getComponent(Label);
            if (lab) lab.string = value;
        };
        text(node.getChildByName("LabTitle"), view.title);
        text(node.getChildByName("LabDesc"), view.affordable ? gameText("ShopViewComp_010") : view.collected ? gameText("ShopViewComp_011") : gameText("ShopViewComp_012"));
        text(node.getChildByName("PriceRow")?.getChildByName("LabPrice") ?? null, `${view.price}`);
        const priceRow = node.getChildByName("PriceRow");
        if (priceRow) priceRow.active = !view.collected;

        const icon = node.getChildByName("IconSlot")?.getChildByName("Icon")?.getComponent(Sprite);
        if (icon) {
            await this.setSprite(icon, view.icon);
            if (icon.isValid && icon.spriteFrame) {
                const transform = icon.getComponent(UITransform)!;
                const rect = icon.spriteFrame.rect;
                const ratio = Math.min(transform.width / rect.width, transform.height / rect.height);
                transform.setContentSize(rect.width * ratio, rect.height * ratio);
            }
            if (icon.isValid && view.collected) setSpriteColor(icon.node, "#888888");
        }

        const mask = node.getChildByName("SoldMask");
        if (mask) mask.active = !!view.collected;

        // 先展示价格和效果，确认后仍由 RunState 校验余额和已购状态。
        if (node.isValid) {
            bindNodeClick(node, () => this.showPurchase(view), this);
            revealUI(node.getChildByName("IconSlot"), node.getSiblingIndex() * 0.045);
        }
    }

    private showPurchase(view: ItemView) {
        this.selected = view;
        setLabel(this, "LabPurchaseTitle", view.title);
        setLabel(this, "LabPurchaseDesc", view.desc);
        setLabel(this, "LabPurchasePrice", view.collected ? gameText("ShopViewComp_003") : gameText("ShopViewComp_013", view.price, this.ent.run.gold));
        setLabel(this, "BtnConfirmBuyLab", view.affordable ? gameText("ShopViewComp_014") : view.collected ? gameText("ShopViewComp_011") : gameText("ShopViewComp_015"));
        setSpriteColor(this.getNode("BtnConfirmBuy"), view.affordable ? "#FFFFFF" : "#9A9A9A");
        void setNodeSprite(this, "PurchaseIcon", view.icon);
        setNodeActive(this, "PurchaseModal", true);
    }

    private closePurchase() {
        this.selected = null;
        setNodeActive(this, "PurchaseModal", false);
    }

    private async buySet(id: string) {
        this.ent.run.buySet(id);
        await this.refresh();
    }

    private async onLeave() {
        this.ent.run.leaveShop();
        await goScreen(this, "map");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("shop", ShopViewComp);
