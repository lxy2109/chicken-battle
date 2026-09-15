import { gameNumber, gameText } from "../../core/GameConfig";
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
    { get name() { return gameText("CharacterViewComp_001"); }, part: "head", slots: ["comb", "head", "face"] },
    { get name() { return gameText("CharacterViewComp_002"); }, part: "wing", slots: ["wing"] },
    { get name() { return gameText("CharacterViewComp_003"); }, part: "body", slots: ["body", "neck", "tail"] },
    { get name() { return gameText("CharacterViewComp_004"); }, part: "leg", slots: ["leg"] }
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
        setLabel(this, "LabPartInfo", tab ? gameText("CharacterViewComp_005", tab.name, levelOf(run.partLevels, tab.part), items.length) : gameText("CharacterViewComp_006"));
        setNodeActive(this, "LabEmpty", entries.length === 0);
        const bonuses = getSets().filter(set => ownedSetCount(run.equippedIds, set.id) >= gameNumber("set_bonus2Count"))
            .map(set => `${set.name}：${set.desc2}${ownedSetCount(run.equippedIds, set.id) >= gameNumber("set_bonus4Count") ? "；" + set.desc4 : ""}`).join("\n");
        setLabel(this, "LabSets", gameText("CharacterViewComp_008", bonuses || gameText("CharacterViewComp_007")));
        for (let i = 0; i < 8; i++) {
            if (id !== this.refreshId || !this.node.isValid) return;
            const entry = entries[this.page * 8 + i];
            setNodeActive(this, `Slot${i}`, !!entry);
            if (!entry) continue;
            setLabel(this, `LabSlot${i}`, entry.text);
            setLabel(this, `LabSlotState${i}`, entry.equipped ? gameText("CharacterViewComp_009") : entry.available ? gameText("CharacterViewComp_010") : gameText("CharacterViewComp_011"));
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
