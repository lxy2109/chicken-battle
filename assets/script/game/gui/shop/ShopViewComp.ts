import { Label, Node, Sprite, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, TEX, getSets } from "../../core/Catalog";
import { combatPower, ownedSetCount, setPrice } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, bindNodeClick, clearChildren, setLabel, setSpriteColor } from "../UiUtil";

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
    async start() {
        this.nodeTreeInfoLite();
        bindClick(this, "BtnLeave", this.onLeave.bind(this));
        await this.refresh();
    }

    private async refresh() {
        const run = this.ent.run;
        setLabel(this, "LabTitle", "鸡市");
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(run.playerFighter().stats)}`);
        setLabel(this, "LabHint", run.phase === "warmup" ? "热身补给，买完再去正式赛" : "胜后补给");
        setLabel(this, "LabDesc", "同套凑齐两件触发加成，整套买有折扣");

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
                });
            }
        }

        const setSlot = this.getNode("SetSlot");
        clearChildren(setSlot);
        if (setSlot) {
            for (const set of getSets()) {
                const owned = ownedSetCount(run.ownedIds, set.id);
                const price = setPrice(set.id);
                await this.addCard(setSlot, {
                    title: `${set.name} ${owned}/${set.pieceIds.length}`,
                    desc: owned >= set.pieceIds.length ? "已集齐" : `补齐整套 ${set.pieceIds.length} 件`,
                    price,
                    icon: TEX.equip(set.pieceIds[0]),
                    affordable: run.gold >= price && owned < set.pieceIds.length,
                    onBuy: () => this.buySet(set.id)
                });
            }
        }
    }

    private async addCard(parent: Node, view: ItemView) {
        const node = await this.createPrefabNode(PREFAB_PATH.shopItem);
        node.parent = parent;

        const text = (target: Node | null, value: string) => {
            const lab = target?.getComponent(Label);
            if (lab) lab.string = value;
        };
        text(node.getChildByName("LabTitle"), view.title);
        text(node.getChildByName("LabDesc"), view.desc);
        text(node.getChildByName("PriceRow")?.getChildByName("LabPrice") ?? null, `${view.price}`);

        const icon = node.getChildByName("IconSlot")?.getChildByName("Icon")?.getComponent(Sprite);
        if (icon) await this.setSprite(icon, view.icon);

        // 买不起只压暗按钮，仍然可点，让 RunState 去拒绝，避免两处各判一次条件。
        const buy = node.getChildByName("BtnBuy");
        setSpriteColor(buy ?? undefined, view.affordable ? "#FFFFFF" : "#9A9A9A");
        bindNodeClick(buy || node, view.onBuy, this);
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
