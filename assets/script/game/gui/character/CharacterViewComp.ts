import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX, getSets, itemById } from "../../core/Catalog";
import { combatPower, ownedSetCount } from "../../core/EquipMath";
import { levelOf } from "../../core/PartUpgrade";
import { EquipItem, PartId } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

const TABS: Array<{ name: string; part: PartId; slots: EquipItem["slot"][] }> = [
    { name: "头", part: "head", slots: ["comb", "head", "face"] },
    { name: "翅膀", part: "wing", slots: ["wing"] },
    { name: "躯干", part: "body", slots: ["body", "neck", "tail"] },
    { name: "脚", part: "leg", slots: ["leg"] }
];

@ccclass("CharacterViewComp")
@ecs.register("CharacterView", false)
@gui.register("CharacterView", { layer: LayerType.UI, prefab: "gui/character/character" })
export class CharacterViewComp extends CCView<ChickenRun> {
    private tab = 0;
    private page = 0;
    private refreshId = 0;
    private equipping = false;

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();

        setLabel(this, "LabTitle", me.name);
        setLabel(this, "LabGold", `${run.gold}`);
        setLabel(this, "LabPower", `${combatPower(me.stats)}`);
        setLabel(this, "LabHp", `${me.stats.maxHp}`);
        setLabel(this, "LabAtk", `${me.stats.atk}`);
        setLabel(this, "LabCombo", `${me.stats.combo ?? 0}%`);
        setLabel(this, "LabSpd", `${me.stats.spd}`);
        await spawnChicken(this, "ChickenSlot", me.appearance, 0.95, true);
        if (!this.node.isValid) return;
        await this.fillSlots();
        for (let i = 0; i < 5; i++) bindClick(this, `BtnTab${i}`, async () => {
            if (this.equipping) return;
            this.equipping = true;
            this.tab = i;
            this.page = 0;
            try { await this.fillSlots(); }
            finally { this.equipping = false; }
        });
        bindClick(this, "BtnBack", this.onBack.bind(this));
        bindClick(this, "BtnPagePrev", () => { this.page = Math.max(0, this.page - 1); void this.fillSlots(); });
        bindClick(this, "BtnPageNext", () => { this.page++; void this.fillSlots(); });
    }

    private async fillSlots() {
        const id = ++this.refreshId;
        const run = this.ent.run;
        const tab = TABS[this.tab];
        const items = tab ? run.ownedIds.map(itemById).filter(item => tab.slots.includes(item.slot)) : [];
        const entries = tab ? items.map(item => ({
            id: item.id, icon: item.id, text: item.name, available: true,
            equipped: run.equippedIds.includes(item.id)
        })) : getSets().filter(set => !set.legacy || ownedSetCount(run.ownedIds, set.id) > 0).map(set => ({
            id: set.id, icon: set.pieceIds[0], text: set.name,
            available: set.pieceIds.every(id => run.ownedIds.includes(id)),
            equipped: set.pieceIds.every(id => run.equippedIds.includes(id))
        }));
        const pages = Math.max(1, Math.ceil(entries.length / 8));
        this.page = Math.min(this.page, pages - 1);
        setNodeActive(this, "BtnPagePrev", this.page > 0);
        setNodeActive(this, "BtnPageNext", this.page < pages - 1);
        for (let i = 0; i < 5; i++) {
            setSpriteColor(this.getNode(`BtnTab${i}`), i === this.tab ? "#FFFFFF" : "#000000");
            setSpriteColor(this.getNode(`EquipTabIcon${i}`), i === this.tab ? "#FFFFFF" : "#85818C");
        }
        setLabel(this, "LabPartInfo", tab ? `${tab.name} · 强化 Lv${levelOf(run.partLevels, tab.part)} · 已拥有 ${items.length} 件` : "穿戴同套两件 / 四件可获得套装加成");
        setNodeActive(this, "LabEmpty", entries.length === 0);
        const bonuses = getSets().filter(set => ownedSetCount(run.equippedIds, set.id) >= 2)
            .map(set => `${set.name}：${set.desc2}${ownedSetCount(run.equippedIds, set.id) >= 4 ? "；" + set.desc4 : ""}`).join("\n");
        setLabel(this, "LabSets", `点击穿戴 / 卸下，同槽位替换\n加成：${bonuses || "暂无套装加成"}`);
        for (let i = 0; i < 8; i++) {
            if (id !== this.refreshId || !this.node.isValid) return;
            const entry = entries[this.page * 8 + i];
            setNodeActive(this, `Slot${i}`, !!entry);
            if (!entry) continue;
            setLabel(this, `LabSlot${i}`, entry.text);
            setLabel(this, `LabSlotState${i}`, entry.equipped ? "已穿戴 · 卸下" : entry.available ? "点击穿戴" : "未集齐");
            setSpriteColor(this.getNode(`Slot${i}`), entry.equipped ? "#BCEA77" : entry.available ? "#FFFFFF" : "#808080");
            bindClick(this, `Slot${i}`, () => {
                if (id === this.refreshId && entry.available) void this.equip(entry.id, !tab);
            });
            await setNodeSprite(this, `SlotIcon${i}`, TEX.equip(entry.icon));
        }
    }

    private async equip(id: string, set: boolean) {
        if (this.equipping) return;
        const run = this.ent.run;
        if (!(set ? run.equipSet(id) : run.equipItem(id))) return;
        this.equipping = true;
        try {
            const me = run.playerFighter();
            setLabel(this, "LabPower", `${combatPower(me.stats)}`);
        setLabel(this, "LabHp", `${me.stats.maxHp}`);
        setLabel(this, "LabAtk", `${me.stats.atk}`);
        setLabel(this, "LabCombo", `${me.stats.combo ?? 0}%`);
        setLabel(this, "LabSpd", `${me.stats.spd}`);
            await spawnChicken(this, "ChickenSlot", me.appearance, 0.95, true);
            if (this.node.isValid) await this.fillSlots();
        }
        finally { this.equipping = false; }
    }

    private async onBack() {
        await goScreen(this, "map");
    }

    reset() {
        this.refreshId++;
        this.node.destroy();
    }
}

registerScreen("character", CharacterViewComp);
