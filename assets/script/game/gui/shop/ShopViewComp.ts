import { Label, Node, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH, getSets, itemById } from "../../core/Catalog";
import { ownedSetCount, setPrice } from "../../core/EquipMath";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, bindNodeClick, clearChildren, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

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
        setLabel(this, "LabHint", run.phase === "warmup" ? "热身补给，买完再去正式赛" : "胜后补给");
        const itemSlot = this.getNode("ItemSlot");
        const setSlot = this.getNode("SetSlot");
        clearChildren(itemSlot);
        clearChildren(setSlot);
        if (itemSlot) {
            for (const item of run.shopItems) {
                const node = await this.createPrefabNode(PREFAB_PATH.shopItem);
                node.parent = itemSlot;
                this.fillItem(node, item.name, `${item.price}金 · ${item.desc}`, () => this.buyItem(item.id));
            }
        }
        if (setSlot) {
            for (const set of getSets()) {
                const owned = ownedSetCount(run.ownedIds, set.id);
                const price = setPrice(set.id);
                const node = await this.createPrefabNode(PREFAB_PATH.shopItem);
                node.parent = setSlot;
                const names = set.pieceIds.map(id => itemById(id).name).join(" / ");
                this.fillItem(
                    node,
                    `${set.name} (${owned}/4)`,
                    `${names}\n整套 ${price}金`,
                    () => this.buySet(set.id)
                );
            }
        }
    }

    private fillItem(node: Node, title: string, desc: string, onBuy: () => void) {
        const t = node.getChildByName("LabTitle")?.getComponent(Label);
        const d = node.getChildByName("LabDesc")?.getComponent(Label);
        if (t) t.string = title;
        if (d) d.string = desc;
        bindNodeClick(node.getChildByName("BtnBuy") || node, onBuy, this);
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
