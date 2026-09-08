import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { getColorPalette, getFaceList } from "../../core/Catalog";
import { Appearance, FaceId, PART_TEXT, PARTS, PartId, defaultAppearance } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { playScreenMusic } from "../GameAudio";
import { bindClick, setLabel, setNodeActive, setSpriteColor } from "../UiUtil";

const { ccclass } = _decorator;

const CUSTOMIZE_PARTS: PartId[] = ["head", "neck", "body", "wing", "leg"];
const COLOR_INDEXES = [0, 1, 9, 4, 7, 5];

@ccclass("CustomizeViewComp")
@ecs.register("CustomizeView", false)
@gui.register("CustomizeView", { layer: LayerType.UI, prefab: "gui/customize/customize" })
export class CustomizeViewComp extends CCView<ChickenRun> {
    private draft: Appearance = defaultAppearance();
    private part: PartId = "body";
    private nameRoll = 0;

    start() {
        this.nodeTreeInfoLite();
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
        setLabel(this, "BtnStartLab", this.ent.run.screen === "customize" ? "开始" : "继续游戏");
        setLabel(this, "LabSaveHint", this.ent.RunModel.loadError || "进度与养成自动保存到本机");
        bindClick(this, "BtnClearSave", () => setNodeActive(this, "ClearSaveModal", true));
        bindClick(this, "BtnCancelClear", () => setNodeActive(this, "ClearSaveModal", false));
        bindClick(this, "BtnConfirmClear", () => {
            try {
                this.ent.RunModel.clearSave();
                this.draft = defaultAppearance();
                this.part = "body";
                setNodeActive(this, "ClearSaveModal", false);
                setLabel(this, "BtnStartLab", "开始");
                setLabel(this, "LabSaveHint", "本地存档已清除");
                void this.refresh();
            } catch {
                setLabel(this, "LabClearDesc", "清除失败，请检查浏览器本地存储权限后重试。");
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
            for (let i = 0; i < COLOR_INDEXES.length; i++) {
                bindClick(this, `BtnColor${part.charAt(0).toUpperCase() + part.slice(1)}${i}`, () => this.selectColor(part, i));
            }
        }
        this.refresh();
    }

    private selectPart(part: PartId) {
        this.part = part;
        this.refresh();
    }

    private selectFace(face: FaceId) {
        this.draft.face = face;
        this.refresh();
    }

    private selectColor(part: PartId, i: number) {
        this.part = part;
        this.draft.colors[part] = getColorPalette()[COLOR_INDEXES[i]];
        this.refresh();
    }

    private async refresh() {
        setLabel(this, "LabTitle", "自定义你的专属战鸡");
        setLabel(this, "LabName", this.ent.run.playerName);
        setLabel(this, "LabPart", `正在染：${PART_TEXT[this.part]}`);
        for (const part of CUSTOMIZE_PARTS) {
            const suffix = part.charAt(0).toUpperCase() + part.slice(1);
            setNodeActive(this, "ColorRow" + suffix, part === this.part);
            setSpriteColor(this.getNode("BtnPart" + suffix), part === this.part ? "#FFFFFF" : "#82B96B");
        }
        await spawnChicken(this, "ChickenSlot", this.draft, 1.05);
    }

    private async onEnter() {
        this.ent.run.confirmAppearance(this.draft);
        await goScreen(this, "map");
    }

    private onReset() {
        this.draft = defaultAppearance();
        this.part = "body";
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
        const names = ["呆头王鸡", "铁嘴战鸡", "闪电羽", "村口霸王", "小鸡大将", "彩羽勇者"];
        this.nameRoll = (this.nameRoll + 1) % names.length;
        this.ent.run.setPlayerName(names[this.nameRoll]);
        void this.refresh();
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("customize", CustomizeViewComp);
