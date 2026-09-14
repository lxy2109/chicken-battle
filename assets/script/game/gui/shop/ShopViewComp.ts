import { Label, Node, Sprite, UITransform, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX, getSets, itemById } from "../../core/Catalog";
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
    onBuy: () => void;
}

@ccclass("ShopViewComp")
@ecs.register("ShopView", false)
@gui.register("ShopView", { layer: LayerType.UI, prefab: "gui/shop/shop" })
export class ShopViewComp extends CCView<ChickenRun> {
    private selected: ItemView | null = null;
    private page = 0;
    private pageCount = 1;
    private refreshing = false;

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
        bindClick(this, "BtnShopPrev", () => this.turnPage(-1));
        bindClick(this, "BtnShopNext", () => this.turnPage(1));
        await this.refresh();
    }

    private async turnPage(direction: number) {
        if (this.refreshing) return;
        const page = Math.max(0, Math.min(this.pageCount - 1, this.page + direction));
        if (page === this.page) return;
        this.page = page;
        this.refreshing = true;
        try { await this.refresh(); }
        finally { this.refreshing = false; }
    }

    private async refresh() {
        const run = this.ent.run;
        setLabel(this, "LabTitle", "鸡友杂货铺");
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabDesc", "点击商品查看效果与价格，确认后购买");

        const sets = getSets().filter(set => !set.legacy && !set.rewardOnly);
        this.pageCount = Math.max(1, sets.length);
        this.page = Math.min(this.page, this.pageCount - 1);
        const set = sets[this.page];
        const goods: ItemView[] = [];
        if (set) {
            const owned = ownedSetCount(run.ownedIds, set.id);
            const price = run.setPrice(set.id);
            const unlocked = set.unlockMap <= run.currentMap().id;
            goods.push({
                title: set.name,
                desc: owned >= set.pieceIds.length ? "已集齐" : `${unlocked ? "补齐未拥有部件" : `第${set.unlockMap}图解锁`}\n2件 ${set.desc2}\n4件 ${set.desc4}`,
                price, icon: `game/texture/equip/set_${set.id}/spriteFrame`,
                affordable: unlocked && run.gold >= price && owned < set.pieceIds.length,
                onBuy: () => this.buySet(set.id)
            });
            for (const id of set.pieceIds) {
                const item = itemById(id);
                const owned = run.ownedIds.includes(id);
                const price = run.itemPrice(id);
                goods.push({
                    title: item.name,
                    desc: `${owned ? "已拥有\n" : !unlocked ? `第${set.unlockMap}图解锁\n` : ""}${item.desc}`,
                    price, icon: TEX.equip(id),
                    affordable: unlocked && !owned && run.gold >= price,
                    onBuy: () => this.buyItem(id)
                });
            }
        }
        await setNodeSprite(this, "shop", TEX.background(this.page % 2 ? "shop_weapon_figma" : "shop_figma"));
        if (!this.node.isValid) return;
        setLabel(this, "LabShopPage", `${set?.name || "商店"} · ${this.page + 1} / ${this.pageCount}`);
        setSpriteColor(this.getNode("BtnShopPrev"), this.page > 0 ? "#FFFFFF" : "#777777");
        setSpriteColor(this.getNode("BtnShopNext"), this.page < this.pageCount - 1 ? "#FFFFFF" : "#777777");
        const itemSlot = this.getNode("ItemSlot");
        clearChildren(itemSlot);
        if (!itemSlot) return;
        this.refreshing = true;
        try {
            for (const item of goods) {
                if (!itemSlot.isValid) return;
                await this.addCard(itemSlot, item, PREFAB_PATH.shopItem);
            }
        } finally { this.refreshing = false; }
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
        text(node.getChildByName("LabDesc"), view.affordable ? "点击购买" : view.desc === "已集齐" ? "已集齐" : "点击查看");
        text(node.getChildByName("PriceRow")?.getChildByName("LabPrice") ?? null, `${view.price}`);

        const icon = node.getChildByName("IconSlot")?.getChildByName("Icon")?.getComponent(Sprite);
        if (icon) {
            await this.setSprite(icon, view.icon);
            if (icon.isValid && icon.spriteFrame) {
                const transform = icon.getComponent(UITransform)!;
                const rect = icon.spriteFrame.rect;
                const ratio = Math.min(transform.width / rect.width, transform.height / rect.height);
                transform.setContentSize(rect.width * ratio, rect.height * ratio);
            }
        }

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
