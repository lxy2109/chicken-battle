import { Color, Graphics, Label, Node, Sprite, UITransform, _decorator } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { GameComponent } from "db://oops-framework/module/common/GameComponent";
import { SKILL_ICON } from "../../domain/BattleStyle";
import { TEX } from "../../domain/Catalog";
import { gameText, gameTextOr } from "../../domain/GameConfig";
import { StrikeStyle } from "../../domain/Types";
import { bindClick, hexColor } from "./UiUtil";

const { ccclass } = _decorator;

const RGB: Record<StrikeStyle, [number, number, number]> = {
    peck: [255, 196, 72],
    jump: [255, 220, 110],
    dive: [110, 190, 255],
    leap: [255, 120, 48],
    charge: [255, 150, 60],
    tail: [90, 220, 170],
    combo: [255, 230, 90],
    feint: [180, 120, 255]
};

const SKILL_NAME: Record<StrikeStyle, () => string> = {
    peck: () => gameText("BattleViewComp_001"),
    jump: () => gameText("BattleViewComp_002"),
    dive: () => gameText("BattleViewComp_003"),
    leap: () => gameText("BattleViewComp_004"),
    charge: () => gameText("BattleViewComp_005"),
    tail: () => gameText("BattleViewComp_006"),
    combo: () => gameText("BattleViewComp_007"),
    feint: () => gameText("BattleViewComp_008")
};

export interface SkillUnlockParams {
    skills: readonly StrikeStyle[];
    onOk?: () => void;
}

/**
 * 绝招解锁弹窗（gui/skill_unlock/skill_unlock 预制体）。
 * Dialog 层 + mask，全屏蒙版；槽位图标运行时填充。
 */
@ccclass("SkillUnlockViewComp")
@gui.register("SkillUnlockView", {
    layer: LayerType.Dialog,
    prefab: "gui/skill_unlock/skill_unlock",
    mask: true
})
export class SkillUnlockViewComp extends GameComponent {
    private params: SkillUnlockParams | null = null;
    private booted = false;

    /** 预制体已挂脚本时由框架调用；否则由 showSkillUnlockModal 的 onAdded 调用。 */
    onAdded(params: SkillUnlockParams): boolean {
        if (!params?.skills?.length) return false;
        void this.boot(params);
        return true;
    }

    async boot(params: SkillUnlockParams) {
        if (this.booted || !params?.skills?.length) return;
        this.booted = true;
        this.params = params;
        this.nodeTreeInfoLite();
        await this.refresh();
    }

    private async refresh() {
        const skills = this.params?.skills || [];
        const title = this.getNode("LabTitle")?.getComponent(Label);
        if (title) {
            title.string = gameTextOr("MapViewComp_014", "新绝招解锁");
            title.fontSize = 42;
            title.lineHeight = 52;
            title.color = hexColor("#3E2814");
            title.isBold = true;
        }
        const hint = this.getNode("LabHint")?.getComponent(Label);
        if (hint) {
            hint.string = gameTextOr("MapViewComp_015", "已学会以下绝招，对战中点按钮释放");
            hint.fontSize = 24;
            hint.lineHeight = 32;
            hint.color = hexColor("#6B4A2A");
            hint.isBold = false;
        }
        const okLab = this.getNode("BtnOkLab")?.getComponent(Label);
        if (okLab) {
            okLab.string = gameTextOr("MapViewComp_016", "太棒了");
            okLab.fontSize = 32;
            okLab.lineHeight = 40;
        }

        for (let i = 0; i < 2; i++) {
            const slot = this.getNode(`SkillSlot${i}`);
            if (!slot) continue;
            const style = skills[i];
            slot.active = !!style;
            if (!style) continue;
            // 单招时槽位居中。
            slot.setPosition(skills.length === 1 ? 0 : (i === 0 ? -138 : 138), -8, 0);
            const nameLab = this.getNode(`SkillName${i}`)?.getComponent(Label);
            if (nameLab) {
                nameLab.string = SKILL_NAME[style]();
                nameLab.fontSize = 28;
                nameLab.lineHeight = 36;
                nameLab.color = hexColor("#3E2814");
                nameLab.isBold = true;
            }
            await this.paintSlot(i, style);
        }

        bindClick(this, "BtnOk", this.onOk.bind(this));
    }

    private async paintSlot(index: number, style: StrikeStyle) {
        const slot = this.getNode(`SkillSlot${index}`);
        const disc = this.getNode(`SkillDisc${index}`);
        if (!slot || !disc) return;

        // 关掉底盘 Sprite：不要黑底；父节点半透明 Sprite 也可能让子图标画不出来。
        const discSp = disc.getComponent(Sprite);
        if (discSp) {
            discSp.enabled = false;
            discSp.spriteFrame = null;
        }

        const rgb = RGB[style];
        const ringName = `SkillRing${index}`;
        let ring = disc.getChildByName(ringName) || this.getNode(ringName);
        if (!ring) {
            ring = new Node(ringName);
            ring.layer = disc.layer;
            disc.addChild(ring);
            (ring.addComponent(UITransform)).setContentSize(132, 132);
        }
        ring.setPosition(0, 0, 0);
        const g = ring.getComponent(Graphics) || ring.addComponent(Graphics);
        g.clear();
        // 外圈细黑框 + 技能色描边，不填充底色（图标自带圆形）。
        g.strokeColor = new Color(40, 28, 16, 255);
        g.lineWidth = 5;
        g.circle(0, 0, 62);
        g.stroke();
        g.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 230);
        g.lineWidth = 3;
        g.circle(0, 0, 58);
        g.stroke();

        // 图标挂在槽位上（与 Disc 同级、最后绘制），避免被底盘/描边挡住。
        const iconName = `SkillIcon${index}`;
        let iconNode = this.getNode(iconName)
            || slot.getChildByName(iconName)
            || disc.getChildByName(iconName);
        if (!iconNode) {
            iconNode = new Node(iconName);
            iconNode.layer = slot.layer;
            slot.addChild(iconNode);
            this.nodes?.set(iconName, iconNode);
        }
        else if (iconNode.parent !== slot) {
            iconNode.parent = slot;
            this.nodes?.set(iconName, iconNode);
        }
        iconNode.active = true;
        iconNode.setPosition(disc.position.x, disc.position.y, 0);
        iconNode.setSiblingIndex(slot.children.length - 1);
        const ut = iconNode.getComponent(UITransform) || iconNode.addComponent(UITransform);
        ut.setContentSize(112, 112);
        const icon = iconNode.getComponent(Sprite) || iconNode.addComponent(Sprite);
        icon.enabled = true;
        icon.sizeMode = Sprite.SizeMode.CUSTOM;
        icon.type = Sprite.Type.SIMPLE;
        icon.color = Color.WHITE;
        const path = TEX.icon(SKILL_ICON[style]);
        await this.setSprite(icon, path, "bundle");
        // setSprite 失败不抛错，需自行检查；无贴图时用技能色占位，避免空白槽。
        if (!icon.isValid) return;
        if (!icon.spriteFrame) {
            icon.color = new Color(rgb[0], rgb[1], rgb[2], 255);
        }
    }

    private onOk() {
        const done = this.params?.onOk;
        this.params = null;
        this.remove();
        done?.();
    }

    reset() {
        this.params = null;
        this.node.destroy();
    }
}
