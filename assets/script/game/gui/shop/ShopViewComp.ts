import { Label, Node, Sprite, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX, getSets } from "../../core/Catalog";
import { combatPower, ownedSetCount, setPrice } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { spawnChicken } from "../ChickenBinder";
import { bindClick, bindNodeClick, clearChildren, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

interface ItemView {
    title: string;
    desc: string;
    price: number;
    icon: string;
    affordable: boolean;
    onBuy: () => void;
}

@ccclass("ShopViewComp")
@ecs.register("ShopView", false)
@gui.register("ShopView", { layer: LayerType.UI, prefab: "gui/shop/shop" })
export class ShopViewComp extends CCView<ChickenRun> {
    private selected: ItemView | null = null;

    async start() {
        this.nodeTreeInfoLite();
        const backgrounds = ["shop_figma", "village_figma"];
        const index = this.ent.run.phase === "boss" ? 1 : 0;
        await setNodeSprite(this, "shop", TEX.background(backgrounds[index % backgrounds.length]));
        await spawnChicken(this, "ShopkeeperSlot", this.ent.run.playerFighter().appearance, 0.22, true);
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
        setLabel(this, "LabTitle", "鸡友杂货铺");
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabDesc", "点击商品查看效果与价格，确认后购买");

        const itemSlot = this.getNode("ItemSlot");
        clearChildren(itemSlot);
        if (itemSlot) {
            for (const item of run.shopItems) {
                await this.addCard(itemSlot, {
                    title: item.name,
                    desc: item.desc,
                price: item.price,
                icon: TEX.equip(item.id),
                affordable: run.gold >= item.price,
                onBuy: () => this.buyItem(item.id)
                }, PREFAB_PATH.shopItem);
            }
        }

        const setSlot = this.getNode("SetSlot");
        clearChildren(setSlot);
        if (setSlot) {
            for (const set of getSets()) {
                const owned = ownedSetCount(run.ownedIds, set.id);
                const price = setPrice(set.id);
                await this.addCard(setSlot, {
                    title: set.name,
                    desc: owned >= set.pieceIds.length ? "已集齐" : `补齐整套 ${set.pieceIds.length} 件`,
                    price,
                    icon: TEX.equip(set.pieceIds[0]),
                    affordable: run.gold >= price && owned < set.pieceIds.length,
                    onBuy: () => this.buySet(set.id)
                }, PREFAB_PATH.shopSetItem);
            }
        }
    }

    private async addCard(parent: Node, view: ItemView, prefab: string) {
        const node = await this.createPrefabNode(prefab);
        node.parent = parent;

        const text = (target: Node | null, value: string) => {
            const lab = target?.getComponent(Label);
            if (lab) lab.string = value;
        };
        text(node.getChildByName("LabTitle"), view.title);
        text(node.getChildByName("LabDesc"), view.affordable ? "点击购买" : view.desc === "已集齐" ? "已集齐" : "点击查看");
        text(node.getChildByName("PriceRow")?.getChildByName("LabPrice") ?? null, `${view.price}`);

        const icon = node.getChildByName("IconSlot")?.getChildByName("Icon")?.getComponent(Sprite);
        if (icon) await this.setSprite(icon, view.icon);

        // 先展示价格和效果，确认后仍由 RunState 校验余额和已购状态。
        bindNodeClick(node, () => this.showPurchase(view), this);
    }

    private showPurchase(view: ItemView) {
        this.selected = view;
        setLabel(this, "LabPurchaseTitle", view.title);
        setLabel(this, "LabPurchaseDesc", view.desc);
        setLabel(this, "LabPurchasePrice", `${view.price} 金币 · 当前拥有 ${this.ent.run.gold}`);
        setLabel(this, "BtnConfirmBuyLab", view.affordable ? "确认购买" : "暂不可购买");
        setSpriteColor(this.getNode("BtnConfirmBuy"), view.affordable ? "#FFFFFF" : "#9A9A9A");
        void setNodeSprite(this, "PurchaseIcon", view.icon);
        setNodeActive(this, "PurchaseModal", true);
    }

    private closePurchase() {
        this.selected = null;
        setNodeActive(this, "PurchaseModal", false);
    }

    private async buyItem(id: string) {
        this.ent.run.buyItem(id);
        await this.refresh();
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
