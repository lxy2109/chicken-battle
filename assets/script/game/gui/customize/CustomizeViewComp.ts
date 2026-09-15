import { gameNumber, gameText } from "../../core/GameConfig";
import { _decorator, EditBox } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { getColorPalette, getFaceList, getPlayer, getStory } from "../../core/Catalog";
import { Appearance, FaceId, PART_TEXT, PARTS, PartId, defaultAppearance } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { playScreenMusic } from "../GameAudio";
import { bindClick, setLabel, setNodeActive, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

const CUSTOMIZE_PARTS: Array<PartId | "face"> = ["head", "face", "wing", "body", "leg"];
const COLOR_INDEXES = [0, 1, 9, 4, 7, 5];

@ccclass("CustomizeViewComp")
@ecs.register("CustomizeView", false)
@gui.register("CustomizeView", { layer: LayerType.UI, prefab: "gui/customize/customize" })
export class CustomizeViewComp extends CCView<ChickenRun> {
    private draft: Appearance = defaultAppearance();
    private part: PartId | "face" = "head";
    private nameInput!: EditBox;

    start() {
        this.nodeTreeInfoLite();
        this.nameInput = this.getNode("NameInput")!.getComponent(EditBox)!;
        this.nameInput.maxLength = gameNumber("player_nameLength");
        this.nameInput.string = this.ent.run.playerName;
        this.nameInput.node.on(EditBox.EventType.EDITING_DID_ENDED, () => {
            this.ent.run.setPlayerName(this.nameInput.string);
            this.nameInput.string = this.ent.run.playerName;
        }, this);
        setLabel(this, "LabStory", getStory("intro"));
        this.draft = {
            face: this.ent.run.appearance.face,
            colors: { ...this.ent.run.appearance.colors }
        };
        bindClick(this, "BtnStart", () => {
            if (this.ent.RunModel.loadError) return;
            playScreenMusic("customize");
            if (this.ent.run.screen !== "customize") {
                void goScreen(this);
                return;
            }
            setNodeActive(this, "StartPanel", false);
            setNodeActive(this, "CustomizePanel", true);
        });
        setLabel(this, "BtnStartLab", this.ent.run.screen === "customize" ? gameText("CustomizeViewComp_001") : gameText("CustomizeViewComp_002"));
        setLabel(this, "LabSaveHint", this.ent.RunModel.loadError || gameText("CustomizeViewComp_003"));
        bindClick(this, "BtnClearSave", () => setNodeActive(this, "ClearSaveModal", true));
        bindClick(this, "BtnCancelClear", () => setNodeActive(this, "ClearSaveModal", false));
        bindClick(this, "BtnConfirmClear", () => {
            try {
                this.ent.RunModel.clearSave();
                this.draft = defaultAppearance();
                this.part = "head";
                setNodeActive(this, "ClearSaveModal", false);
                setLabel(this, "BtnStartLab", gameText("CustomizeViewComp_004"));
                setLabel(this, "LabSaveHint", gameText("CustomizeViewComp_005"));
                void this.refresh();
            } catch {
                setLabel(this, "LabClearDesc", gameText("CustomizeViewComp_006"));
            }
        });
        bindClick(this, "BtnEnter", this.onEnter.bind(this));
        bindClick(this, "BtnReset", this.onReset.bind(this));
        bindClick(this, "BtnRandomSet", this.onRandomSet.bind(this));
        bindClick(this, "BtnRandomName", this.onRandomName.bind(this));
        // 按钮名由部位 id 首字母大写拼出来，加部位时只改 PARTS 和 gen-prefabs，不用动这里。
        for (const part of CUSTOMIZE_PARTS) {
            bindClick(this, "BtnPart" + part.charAt(0).toUpperCase() + part.slice(1), () => this.selectPart(part));
        }
        getFaceList().forEach((face, i) => bindClick(this, `BtnFace${i}`, () => this.selectFace(face)));
        for (const part of CUSTOMIZE_PARTS) {
            if (part === "face") continue;
            for (let i = 0; i < COLOR_INDEXES.length; i++) {
                bindClick(this, `BtnColor${part.charAt(0).toUpperCase() + part.slice(1)}${i}`, () => this.selectColor(part, i));
            }
        }
        this.refresh();
    }

    private selectPart(part: PartId | "face") {
        this.part = part;
        this.refresh();
    }

    private selectFace(face: FaceId) {
        this.draft.face = face;
        this.refresh();
    }

    private selectColor(part: PartId, i: number) {
        this.part = part;
        const color = getColorPalette()[COLOR_INDEXES[i]];
        this.draft.colors[part] = color;
        if (part === "head") this.draft.colors.comb = color;
        if (part === "body") {
            this.draft.colors.neck = color;
            this.draft.colors.tail = color;
        }
        this.refresh();
    }

    private async refresh() {
        setLabel(this, "LabTitle", gameText("CustomizeViewComp_007"));
        this.nameInput.string = this.ent.run.playerName;
        setLabel(this, "LabPart", this.part === "face" ? gameText("CustomizeViewComp_008") : this.part === "body" ? gameText("CustomizeViewComp_009") : gameText("CustomizeViewComp_010", PART_TEXT[this.part]));
        setNodeActive(this, "ColorOptions", this.part !== "face");
        setNodeActive(this, "FaceOptions", this.part === "face");
        getFaceList().forEach((face, i) => setSpriteColor(this.getNode(`BtnFace${i}`), face === this.draft.face ? "#FFFFFF" : "#898596"));
        for (const part of CUSTOMIZE_PARTS) {
            const suffix = part.charAt(0).toUpperCase() + part.slice(1);
            setNodeActive(this, "ColorRow" + suffix, part === this.part);
            setSpriteColor(this.getNode("BtnPart" + suffix), part === this.part ? "#FFFFFF" : "#000000");
            setSpriteColor(this.getNode("TabIcon" + suffix), part === this.part ? "#FFFFFF" : "#85818C");
        }
        await spawnChicken(this, "ChickenSlot", this.draft, 4 / 3, true);
    }

    private async onEnter() {
        this.ent.run.setPlayerName(this.nameInput.string);
        this.ent.run.confirmAppearance(this.draft);
        await goScreen(this, "map");
    }

    private onReset() {
        this.draft = defaultAppearance();
        this.part = "head";
        void this.refresh();
    }

    private onRandomSet() {
        const palette = getColorPalette();
        const colors = { ...this.draft.colors };
        for (const part of PARTS) colors[part] = palette[Math.floor(Math.random() * palette.length)];
        const faces = getFaceList();
        this.draft = { colors, face: faces[Math.floor(Math.random() * faces.length)] || this.draft.face };
        void this.refresh();
    }

    private onRandomName() {
        const names = (getPlayer().randomNames as string[])
            .filter(name => name !== this.nameInput.string.trim());
        this.ent.run.setPlayerName(names[Math.floor(Math.random() * names.length)]);
        this.nameInput.string = this.ent.run.playerName;
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("customize", CustomizeViewComp);
