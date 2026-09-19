import { Label, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { enemyToFighter, getStory } from "../../domain/Catalog";
import { gameTextOr } from "../../domain/GameConfig";
import { spawnChicken } from "./ChickenBinder";
import { bindClick, hexColor } from "./UiUtil";

const { ccclass } = _decorator;

export interface FinalChallengeParams {
    enemyId: string;
    name: string;
    /** 介绍文案；缺省用 Story.boss。 */
    intro?: string;
    storyId?: string;
    onChallenge?: () => void;
    onLater?: () => void;
}

/**
 * 最终挑战弹窗（gui/final_challenge/final_challenge）。
 * Dialog 层 + mask：立绘、名字、介绍，确认后进战前准备。
 */
@ccclass("FinalChallengeViewComp")
@gui.register("FinalChallengeView", {
    layer: LayerType.Dialog,
    prefab: "gui/final_challenge/final_challenge",
    mask: true
})
export class FinalChallengeViewComp extends GameComponent {
    private params: FinalChallengeParams | null = null;
    private booted = false;
    private closing = false;

    onAdded(params: FinalChallengeParams): boolean {
        if (!params?.enemyId) return false;
        void this.boot(params);
        return true;
    }

    async boot(params: FinalChallengeParams) {
        if (this.booted || !params?.enemyId) return;
        this.booted = true;
        this.params = params;
        this.nodeTreeInfoLite();
        await this.refresh();
    }

    private async refresh() {
        const p = this.params!;
        const foe = enemyToFighter(p.enemyId);
        const title = this.getNode("LabTitle")?.getComponent(Label);
        if (title) {
            title.string = gameTextOr("FinalChallenge_001", "最终挑战");
            title.fontSize = 42;
            title.lineHeight = 52;
            title.color = hexColor("#3E2814");
            title.isBold = true;
        }
        const name = this.getNode("LabName")?.getComponent(Label);
        if (name) {
            name.string = p.name || foe.name;
            name.fontSize = 34;
            name.lineHeight = 44;
            name.color = hexColor("#3E2814");
            name.isBold = true;
        }
        const intro = this.getNode("LabIntro")?.getComponent(Label);
        if (intro) {
            intro.string = p.intro
                || (p.storyId ? getStory(p.storyId) : "")
                || getStory("boss")
                || gameTextOr("FinalChallenge_002", "五图赛程已毕，鸡王坤坤在全村注视下等你。");
            intro.fontSize = 24;
            intro.lineHeight = 34;
            intro.color = hexColor("#6B4A2A");
            intro.overflow = Label.Overflow.RESIZE_HEIGHT;
            intro.isBold = false;
        }
        const challengeLab = this.getNode("BtnChallengeLab")?.getComponent(Label);
        if (challengeLab) {
            challengeLab.string = gameTextOr("FinalChallenge_003", "去挑战");
            challengeLab.fontSize = 32;
            challengeLab.lineHeight = 40;
        }
        const laterLab = this.getNode("BtnLaterLab")?.getComponent(Label);
        if (laterLab) {
            laterLab.string = gameTextOr("FinalChallenge_004", "稍后再说");
            laterLab.fontSize = 28;
            laterLab.lineHeight = 36;
        }

        await spawnChicken(this, "PortraitSlot", foe.appearance, 0.62, true);
        bindClick(this, "BtnChallenge", this.onChallenge.bind(this));
        bindClick(this, "BtnLater", this.onLater.bind(this));
    }

    private onChallenge() {
        if (this.closing) return;
        this.closing = true;
        const go = this.params?.onChallenge;
        this.params = null;
        this.remove();
        go?.();
    }

    private onLater() {
        if (this.closing) return;
        this.closing = true;
        const later = this.params?.onLater;
        this.params = null;
        this.remove();
        later?.();
    }

    reset() {
        this.params = null;
        this.node.destroy();
    }
}
