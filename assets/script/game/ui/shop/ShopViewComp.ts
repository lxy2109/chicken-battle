import { gameText } from "../../domain/GameConfig";
import { Label, Layout, Node, Sprite, UITransform, Widget, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../shared/GameUIBase";
import { ChickenRun } from "../../run/ChickenRun";
import { PREFAB_PATH, TEX, compareSets, getSets } from "../../domain/Catalog";
import { combatPower, ownedSetCount } from "../../domain/EquipMath";
import { tipBoughtSet } from "../shared/GameTip";
import { goScreen, registerScreen } from "../shared/Nav";
import { revealUI, bindClick, bindNodeClick, clearChildren, hexColor, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../shared/UiUtil";

const { ccclass, executionOrder } = _decorator;

/** 背景图 720×1280 上量出的 2×3 空货架，中心原点、y 向上。 */
const SHELF_CELLS = [
    { x: -116, y: -111 }, { x: 26, y: -111 }, { x: 170, y: -111 },
    { x: -116, y: -276 }, { x: 26, y: -276 }, { x: 170, y: -276 }
];
const SHELF_CELL_W = 122;
const SHELF_CELL_H = 128;
const ITEM_SRC_W = 180;
const ITEM_SRC_H = 164;
const SHELF_PAGE_SIZE = SHELF_CELLS.length;

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
@executionOrder(-100)
@ecs.register("ShopView", false)
@gui.register("ShopView", { layer: LayerType.UI, prefab: "gui/shop/shop" })
export class ShopViewComp extends GameUIBase<ChickenRun> {
    private selected: ItemView | null = null;
    private page = 0;
    private goods: ItemView[] = [];

    async start() {
        this.nodeTreeInfoLite();
        this.prepareShelf();
        bindClick(this, "BtnBack", this.onLeave.bind(this));
        bindClick(this, "BtnCancelBuy", () => this.closePurchase());
        bindClick(this, "BtnConfirmBuy", () => {
            const selected = this.selected;
            if (!selected || !selected.affordable) return;
            this.closePurchase();
            selected.onBuy();
        });
        bindClick(this, "BtnLeave", this.onLeave.bind(this));
        await this.ensurePager();
        await this.refresh();
    }

    /** 关掉自动网格，改按背景货架格子摆商品。 */
    private prepareShelf() {
        const itemSlot = this.getNode("ItemSlot");
        if (!itemSlot) return;
        const layout = itemSlot.getComponent(Layout);
        if (layout) layout.enabled = false;
        const widget = itemSlot.getComponent(Widget);
        if (widget) widget.enabled = false;
        itemSlot.setPosition(0, 0, 0);
        itemSlot.getComponent(UITransform)?.setContentSize(720, 1280);
        itemSlot.setSiblingIndex(0);
    }

    private async ensurePager() {
        if (this.getNode("BtnShopNext")) {
            bindClick(this, "BtnShopPrev", () => void this.turnPage(-1));
            bindClick(this, "BtnShopNext", () => void this.turnPage(1));
            return;
        }
        const host = this.getNode("ItemSlot")?.parent ?? this.node;
        await this.makePagerButton(host, "BtnShopPrev", "‹", -118, -400);
        await this.makePagerButton(host, "BtnShopNext", "›", 118, -400);
        this.makePagerLabel(host, "LabShopPage", "1 / 1", 0, -400);
        this.nodeTreeInfoLite();
        bindNodeClick(this.getNode("BtnShopPrev"), () => void this.turnPage(-1), this);
        bindNodeClick(this.getNode("BtnShopNext"), () => void this.turnPage(1), this);
        this.getNode("PurchaseModal")?.setSiblingIndex(host.children.length - 1);
    }

    private async makePagerButton(parent: Node, name: string, text: string, x: number, y: number) {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(x, y, 0);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(64, 52);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SLICED;
        await this.setSprite(sprite, TEX.ui("figma_button_yellow"));
        this.makePagerLabel(node, name + "Lab", text, 0, 0, 56, 40, 34);
        return node;
    }

    private makePagerLabel(parent: Node, name: string, text: string, x: number, y: number, w = 120, h = 40, font = 24) {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(x, y, 0);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(w, h);
        const lab = node.addComponent(Label);
        lab.string = text;
        lab.fontSize = font;
        lab.lineHeight = Math.round(font * 1.2);
        lab.isBold = true;
        lab.overflow = Label.Overflow.SHRINK;
        lab.enableWrapText = false;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.color = hexColor("#FFFAEC");
        lab.enableOutline = true;
        lab.outlineColor = hexColor("#3A220C");
        lab.outlineWidth = 3;
        lab.useSystemFont = true;
        lab.fontFamily = "Arial";
        return node;
    }

    private async turnPage(delta: number) {
        const pages = Math.max(1, Math.ceil(this.goods.length / SHELF_PAGE_SIZE));
        if (pages <= 1) return;
        this.page = (this.page + delta + pages) % pages;
        await this.refresh();
    }

    private async refresh() {
        const run = this.ent.run;
        setLabel(this, "LabTitle", gameText("ShopViewComp_001"));
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabDesc", gameText("ShopViewComp_002"));

        const sets = getSets().filter(set => !set.legacy && !set.rewardOnly && set.unlockMap <= run.currentMap().id).sort(compareSets);
        this.goods = sets.map(set => {
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
        const pages = Math.max(1, Math.ceil(this.goods.length / SHELF_PAGE_SIZE));
        this.page = Math.min(this.page, pages - 1);
        const paged = pages > 1;
        setNodeActive(this, "BtnShopPrev", paged);
        setNodeActive(this, "BtnShopNext", paged);
        setNodeActive(this, "LabShopPage", paged);
        setLabel(this, "LabShopPage", `${this.page + 1} / ${pages}`);

        await setNodeSprite(this, "shop", TEX.background("shop_figma"));
        if (!this.node.isValid) return;
        const itemSlot = this.getNode("ItemSlot");
        clearChildren(itemSlot);
        if (!itemSlot) return;
        const start = this.page * SHELF_PAGE_SIZE;
        const visible = this.goods.slice(start, start + SHELF_PAGE_SIZE);
        for (let i = 0; i < visible.length; i++) {
            if (!itemSlot.isValid) return;
            await this.addCard(itemSlot, visible[i], PREFAB_PATH.shopItem, SHELF_CELLS[i]);
        }
    }

    private async addCard(parent: Node, view: ItemView, prefab: string, cell: { x: number; y: number }) {
        const node = await this.createPrefabNode(prefab);
        if (!parent.isValid) { node.destroy(); return; }
        node.parent = parent;
        const scale = Math.min(SHELF_CELL_W / ITEM_SRC_W, SHELF_CELL_H / ITEM_SRC_H);
        node.setScale(scale, scale, 1);
        node.setPosition(cell.x, cell.y, 0);

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
            const box = icon.getComponent(UITransform)!;
            const boxW = box.width;
            const boxH = box.height;
            await this.setSprite(icon, view.icon);
            this.fitSprite(icon, boxW, boxH);
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
        void this.setPurchaseIcon(view.icon);
        setNodeActive(this, "PurchaseModal", true);
    }

    /** 套装立绘是竖图，按原比例放进预览框，避免压成方块。 */
    private async setPurchaseIcon(path: string) {
        const node = this.getNode("PurchaseIcon");
        const sprite = node?.getComponent(Sprite);
        if (!sprite) return;
        await this.setSprite(sprite, path);
        this.fitSprite(sprite, 180, 150);
    }

    private fitSprite(sprite: Sprite | null | undefined, boxW: number, boxH: number) {
        if (!sprite?.isValid || !sprite.spriteFrame || boxW <= 0 || boxH <= 0) return;
        const rect = sprite.spriteFrame.rect;
        if (rect.width <= 0 || rect.height <= 0) return;
        const ratio = Math.min(boxW / rect.width, boxH / rect.height);
        sprite.getComponent(UITransform)!.setContentSize(rect.width * ratio, rect.height * ratio);
    }

    private closePurchase() {
        this.selected = null;
        setNodeActive(this, "PurchaseModal", false);
    }

    private async buySet(id: string) {
        if (!this.ent.run.buySet(id)) return;
        tipBoughtSet(id);
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
