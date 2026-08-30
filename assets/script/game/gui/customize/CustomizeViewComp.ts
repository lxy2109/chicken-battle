import { _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../chicken/ChickenRun";
import { getColorPalette, getFaceList } from "../../core/Catalog";
import { combatPower, formatStatsLine } from "../../core/EquipMath";
import { Appearance, FaceId, PART_TEXT, PARTS, PartId, defaultAppearance } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { bindClick, setLabel } from "../UiUtil";

const { ccclass } = _decorator;

@ccclass("CustomizeViewComp")
@ecs.register("CustomizeView", false)
@gui.register("CustomizeView", { layer: LayerType.UI, prefab: "gui/customize/customize" })
export class CustomizeViewComp extends CCView<ChickenRun> {
    private draft: Appearance = defaultAppearance();
    private part: PartId = "body";

    start() {
        this.nodeTreeInfoLite();
        this.draft = {
            face: this.ent.run.appearance.face,
            colors: { ...this.ent.run.appearance.colors }
        };
        bindClick(this, "BtnEnter", this.onEnter.bind(this));
        // 按钮名由部位 id 首字母大写拼出来，加部位时只改 PARTS 和 gen-prefabs，不用动这里。
        for (const part of PARTS) {
            bindClick(this, "BtnPart" + part.charAt(0).toUpperCase() + part.slice(1), () => this.selectPart(part));
        }
        getFaceList().forEach((face, i) => bindClick(this, `BtnFace${i}`, () => this.selectFace(face)));
        getColorPalette().forEach((_, i) => bindClick(this, `BtnColor${i}`, () => this.selectColor(i)));
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

    private selectColor(i: number) {
        this.draft.colors[this.part] = getColorPalette()[i];
        this.refresh();
    }

    private async refresh() {
        const stats = this.ent.run.playerFighter().stats;
        setLabel(this, "LabTitle", "开局一只鸡");
        setLabel(this, "LabPart", `正在染：${PART_TEXT[this.part]}`);
        setLabel(this, "LabStats", `战力 ${combatPower(stats)}\n${formatStatsLine(stats)}`);
        await spawnChicken(this, "ChickenSlot", this.draft, 0.86);
    }

    private async onEnter() {
        this.ent.run.confirmAppearance(this.draft);
        await goScreen(this, "map");
    }

    reset() {
        this.node.destroy();
    }
}

registerScreen("customize", CustomizeViewComp);
