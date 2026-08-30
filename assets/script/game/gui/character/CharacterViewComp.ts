import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX, getItems, getSets, itemById } from "../../core/Catalog";
import { combatPower, ownedSetCount } from "../../core/EquipMath";
import { levelOf } from "../../core/PartUpgrade";
import { PART_TEXT, PARTS, PartId, Stats } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel, setNodeActive, setNodeSprite } from "../UiUtil";

const { ccclass } = _decorator;

/** 槽位顺序要和 gen-prefabs 里的 SLOT_POS 一一对应，部位增减这里跟着 PARTS 走。 */
const SLOTS: Array<PartId | "face"> = [...PARTS, "face"];

const SLOT_TEXT: Record<string, string> = Object.assign({ face: "皮肤" }, PART_TEXT);

const STAT_ROWS: Array<{ suffix: string; key: keyof Stats }> = [
    { suffix: "Hp", key: "maxHp" },
    { suffix: "Atk", key: "atk" },
    { suffix: "Def", key: "def" },
    { suffix: "Spd", key: "spd" }
];

@ccclass("CharacterViewComp")
@ecs.register("CharacterView", false)
@gui.register("CharacterView", { layer: LayerType.UI, prefab: "gui/character/character" })
export class CharacterViewComp extends CCView<ChickenRun> {
    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();

        setLabel(this, "LabTitle", "我的斗鸡");
        setLabel(this, "LabPower", `${combatPower(me.stats)}`);
        for (const row of STAT_ROWS) {
            setLabel(this, `LabVal${row.suffix}`, `${me.stats[row.key]}`);
        }
        setLabel(this, "LabSets", this.setsText());

        await spawnChicken(this, "ChickenSlot", me.appearance, 0.68);
        await this.fillSlots();
        bindClick(this, "BtnBack", this.onBack.bind(this));
    }

    private async fillSlots() {
        const run = this.ent.run;
        const owned = run.ownedIds.map(itemById);
        for (let i = 0; i < SLOTS.length; i++) {
            const slot = SLOTS[i];
            const item = owned.find(it => it.slot === slot);
            // 练过的部位标上等级，不然玩家只能靠鸡的体型猜自己练了什么。
            const lv = slot === "face" ? 0 : levelOf(run.partLevels, slot);
            const tag = lv > 0 ? ` Lv${lv}` : "";
            setNodeActive(this, `SlotIcon${i}`, !!item);
            if (item) await setNodeSprite(this, `SlotIcon${i}`, TEX.equip(item.id));
            setLabel(this, `LabSlot${i}`, (item ? item.name : SLOT_TEXT[slot]) + tag);
        }
    }

    private setsText(): string {
        const run = this.ent.run;
        const active = getSets()
            .map(s => ({ name: s.name, n: ownedSetCount(run.ownedIds, s.id) }))
            .filter(v => v.n >= 2)
            .map(v => `${v.name}${v.n >= 4 ? "四件" : "两件"}`);
        const total = getItems().length;
        if (active.length === 0) {
            return `装备 ${run.ownedIds.length}/${total}，同套凑齐两件触发加成`;
        }
        return `套装加成：${active.join(" / ")}    装备 ${run.ownedIds.length}/${total}`;
    }

    private async onBack() {
        await goScreen(this, "map");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("character", CharacterViewComp);
