import { gameNumber, gameText } from "../../domain/GameConfig";
import { Button, Label, Node, Sprite, UITransform, Widget, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../shared/GameUIBase";
import { ChickenRun } from "../../run/ChickenRun";
import { TEX, compareSets, getSets } from "../../domain/Catalog";
import { combatPower, ownedSetCount } from "../../domain/EquipMath";
import { spawnChicken } from "../shared/ChickenBinder";
import { goScreen, registerScreen } from "../shared/Nav";
import { bindClick, setLabel, setNodeActive, setNodeSprite, setSpriteColor } from "../shared/UiUtil";

const { ccclass, executionOrder } = _decorator;

@ccclass("CharacterViewComp")
@executionOrder(-100)
@ecs.register("CharacterView", false)
@gui.register("CharacterView", { layer: LayerType.UI, prefab: "gui/character/character" })
export class CharacterViewComp extends GameUIBase<ChickenRun> {
    private page = 0;
    private refreshId = 0;
    private equipping = false;
    private slotRowBase = new Map<string, { x: number; y: number; sx: number; sy: number }>();
    private slotIconBox = new Map<string, { w: number; h: number }>();

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();

        setLabel(this, "LabTitle", me.name);
        setLabel(this, "LabGold", `${run.gold}`);
        this.refreshStats(me);
        this.fitBottomPanel();
        const modal = this.getNode("HideHintModal");
        if (modal?.parent) modal.setSiblingIndex(modal.parent.children.length - 1);
        await spawnChicken(this, "ChickenSlot", me.appearance, 0.95, true);
        if (!this.node.isValid) return;
        await this.fillSlots();
        bindClick(this, "BtnBack", this.onBack.bind(this));
        bindClick(this, "BtnPagePrev", () => { this.page = Math.max(0, this.page - 1); void this.fillSlots(); });
        bindClick(this, "BtnPageNext", () => { this.page++; void this.fillSlots(); });
        bindClick(this, "BtnHideAppearance", () => void this.toggleHide());
        bindClick(this, "BtnHideHint", () => this.showHideHint());
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

    /** 蒙版提到最上层并铺满父节点，避免套装格和底栏露在遮罩外面。 */
    private showHideHint() {
        setLabel(this, "LabHideHintTitle", gameText("CharacterViewComp_015"));
        setLabel(this, "LabHideHintDesc", gameText("CharacterViewComp_016"));
        setLabel(this, "BtnCloseHideHintLab", gameText("CharacterViewComp_017"));
        const modal = this.getNode("HideHintModal");
        if (modal?.parent) {
            modal.setSiblingIndex(modal.parent.children.length - 1);
            const parentUt = modal.parent.getComponent(UITransform);
            const ut = modal.getComponent(UITransform);
            if (parentUt && ut) ut.setContentSize(parentUt.width, parentUt.height);
            modal.getComponent(Widget)?.updateAlignment();
        }
        setNodeActive(this, "HideHintModal", true);
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
        this.fitBottomPanel();
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
            const icon = this.getNode(`SlotIcon${i}`);
            const iconUt = icon?.getComponent(UITransform);
            if (icon && iconUt && !this.slotIconBox.has(icon.name)) {
                this.slotIconBox.set(icon.name, { w: iconUt.width, h: iconUt.height });
            }
            const box = this.slotIconBox.get(`SlotIcon${i}`) || { w: 96, h: 96 };
            await setNodeSprite(this, `SlotIcon${i}`, entry.icon);
            this.fitSprite(icon?.getComponent(Sprite), box.w, box.h);
        }
    }

    /** 底部说明和套装格按 SetTray 宽度收拢，窄屏左右不再被裁。 */
    private fitBottomPanel() {
        const tray = this.getNode("SetTray");
        const host = tray?.parent ?? this.node;
        if (!host) return;
        const hostUt = host.getComponent(UITransform);
        const trayUt = tray?.getComponent(UITransform);
        if (!hostUt) return;
        const pad = 24;
        const maxW = Math.max(80, (trayUt?.width || hostUt.width) - pad * 2);

        const trayWidget = tray?.getComponent(Widget);
        if (trayWidget) {
            trayWidget.bottom = 124;
            trayWidget.updateAlignment();
        }

        const labNode = this.getNode("LabSets");
        if (labNode) {
            const labUt = labNode.getComponent(UITransform)!;
            labUt.setContentSize(maxW, 100);
            const lab = labNode.getComponent(Label);
            if (lab) {
                lab.overflow = Label.Overflow.SHRINK;
                lab.enableWrapText = true;
                lab.horizontalAlign = Label.HorizontalAlign.CENTER;
                lab.verticalAlign = Label.VerticalAlign.CENTER;
            }
            const widget = labNode.getComponent(Widget) || labNode.addComponent(Widget);
            widget.isAlignLeft = true;
            widget.isAlignRight = true;
            widget.isAlignBottom = true;
            widget.isAlignTop = false;
            widget.isAlignHorizontalCenter = false;
            widget.isAlignVerticalCenter = false;
            widget.left = pad;
            widget.right = pad;
            widget.bottom = 16;
            widget.alignMode = Widget.AlignMode.ALWAYS;
            widget.updateAlignment();
        }

        this.fitSlotRow(maxW);
    }

    private fitSlotRow(maxW: number) {
        const slots: Node[] = [];
        for (let i = 0; i < 8; i++) {
            const node = this.getNode(`Slot${i}`);
            if (!node) continue;
            if (!this.slotRowBase.has(node.name)) {
                this.slotRowBase.set(node.name, {
                    x: node.position.x, y: node.position.y,
                    sx: node.scale.x, sy: node.scale.y
                });
            }
            slots.push(node);
        }
        if (!slots.length) return;
        let minX = Infinity, maxX = -Infinity;
        for (const node of slots) {
            const base = this.slotRowBase.get(node.name)!;
            const ut = node.getComponent(UITransform)!;
            const hw = ut.width * 0.5 * Math.abs(base.sx);
            minX = Math.min(minX, base.x - hw);
            maxX = Math.max(maxX, base.x + hw);
        }
        const rowW = Math.max(1, maxX - minX);
        const s = Math.min(1, maxW / rowW);
        const cx = (minX + maxX) / 2;
        for (const node of slots) {
            const base = this.slotRowBase.get(node.name)!;
            node.setPosition(cx + (base.x - cx) * s, base.y, 0);
            node.setScale(base.sx * s, base.sy * s, 1);
        }
    }

    /** 套装立绘是竖图，按原比例放进格子，避免压成方块。 */
    private fitSprite(sprite: Sprite | null | undefined, boxW: number, boxH: number) {
        if (!sprite?.isValid || !sprite.spriteFrame || boxW <= 0 || boxH <= 0) return;
        const rect = sprite.spriteFrame.rect;
        if (rect.width <= 0 || rect.height <= 0) return;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const ratio = Math.min(boxW / rect.width, boxH / rect.height);
        sprite.getComponent(UITransform)!.setContentSize(rect.width * ratio, rect.height * ratio);
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
