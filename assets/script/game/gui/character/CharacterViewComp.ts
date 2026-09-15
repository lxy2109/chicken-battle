import { gameNumber, gameText } from "../../core/GameConfig";
import { Button, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { TEX, compareSets, getSets } from "../../core/Catalog";
import { combatPower, ownedSetCount } from "../../core/EquipMath";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("CharacterViewComp")
@ecs.register("CharacterView", false)
@gui.register("CharacterView", { layer: LayerType.UI, prefab: "gui/character/character" })
export class CharacterViewComp extends CCView<ChickenRun> {
    private page = 0;
    private refreshId = 0;
    private equipping = false;

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();

        setLabel(this, "LabTitle", me.name);
        setLabel(this, "LabGold", `${run.gold}`);
        this.refreshStats(me);
        await spawnChicken(this, "ChickenSlot", me.appearance, 0.95, true);
        if (!this.node.isValid) return;
        await this.fillSlots();
        bindClick(this, "BtnBack", this.onBack.bind(this));
        bindClick(this, "BtnPagePrev", () => { this.page = Math.max(0, this.page - 1); void this.fillSlots(); });
        bindClick(this, "BtnPageNext", () => { this.page++; void this.fillSlots(); });
        bindClick(this, "BtnHideAppearance", () => void this.toggleHide());
        bindClick(this, "BtnHideHint", () => {
            setLabel(this, "LabHideHintTitle", gameText("CharacterViewComp_015"));
            setLabel(this, "LabHideHintDesc", gameText("CharacterViewComp_016"));
            setLabel(this, "BtnCloseHideHintLab", gameText("CharacterViewComp_017"));
            setNodeActive(this, "HideHintModal", true);
        });
        bindClick(this, "BtnCloseHideHint", () => setNodeActive(this, "HideHintModal", false));
    }

    private refreshStats(me = this.ent.run.playerFighter()) {
        setLabel(this, "LabPower", `${combatPower(me.stats)}`);
        const worn = this.ent.run.equippedIds.length > 0;
        setLabel(this, "BtnHideAppearanceLab", worn && this.ent.run.hideEquippedAppearance
            ? gameText("CharacterViewComp_013") : gameText("CharacterViewComp_012"));
        setSpriteColor(this.getNode("BtnHideAppearance"), worn ? "#FFFFFF" : "#9A9A9A");
        const btn = this.getNode("BtnHideAppearance")?.getComponent(Button);
        if (btn) btn.interactable = worn;
    }

    private ownedSets() {
        const run = this.ent.run;
        return getSets().filter(set => set.pieceIds.every(id => run.ownedIds.includes(id))).sort(compareSets).map(set => ({
            id: set.id,
            text: set.name,
            icon: TEX.set(set.id),
            equipped: set.pieceIds.every(id => run.equippedIds.includes(id))
        }));
    }

    private async fillSlots() {
        const id = ++this.refreshId;
        const run = this.ent.run;
        const entries = this.ownedSets();
        const pages = Math.max(1, Math.ceil(entries.length / 8));
        this.page = Math.min(this.page, pages - 1);
        setNodeActive(this, "BtnPagePrev", this.page > 0);
        setNodeActive(this, "BtnPageNext", this.page < pages - 1);
        setNodeActive(this, "LabEmpty", entries.length === 0);
        setLabel(this, "LabEmpty", gameText("CharacterViewComp_011"));
        const bonuses = getSets().filter(set => ownedSetCount(run.equippedIds, set.id) >= gameNumber("set_bonus2Count"))
            .map(set => `${set.name}：${set.desc2}${ownedSetCount(run.equippedIds, set.id) >= gameNumber("set_bonus4Count") ? "；" + set.desc4 : ""}`).join("\n");
        setNodeActive(this, "LabSets", !!bonuses);
        setLabel(this, "LabSets", bonuses ? gameText("CharacterViewComp_008", bonuses) : "");
        this.refreshStats();
        for (let i = 0; i < 8; i++) {
            if (id !== this.refreshId || !this.node.isValid) return;
            const entry = entries[this.page * 8 + i];
            setNodeActive(this, `Slot${i}`, !!entry);
            if (!entry) continue;
            setLabel(this, `LabSlot${i}`, entry.text);
            setLabel(this, `LabSlotState${i}`, entry.equipped
                ? (run.hideEquippedAppearance ? gameText("CharacterViewComp_014") : gameText("CharacterViewComp_009"))
                : gameText("CharacterViewComp_010"));
            setSpriteColor(this.getNode(`Slot${i}`), entry.equipped
                ? (run.hideEquippedAppearance ? "#C9C9C9" : "#BCEA77") : "#FFFFFF");
            bindClick(this, `Slot${i}`, () => {
                if (id === this.refreshId) void this.equip(entry.id);
            });
            await setNodeSprite(this, `SlotIcon${i}`, entry.icon);
        }
    }

    private async equip(id: string) {
        if (this.equipping) return;
        const run = this.ent.run;
        if (!run.equipSet(id)) return;
        this.equipping = true;
        try {
            const me = run.playerFighter();
            this.refreshStats(me);
            await spawnChicken(this, "ChickenSlot", me.appearance, 0.95, true);
            if (this.node.isValid) await this.fillSlots();
        }
        finally { this.equipping = false; }
    }

    private async toggleHide() {
        if (this.equipping) return;
        if (!this.ent.run.toggleHideAppearance()) return;
        this.equipping = true;
        try {
            const me = this.ent.run.playerFighter();
            this.refreshStats(me);
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
