import { view } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { UIID } from "../../shared/config/GameUIConfig";
import { StrikeStyle } from "../../domain/Types";
import { SkillUnlockParams, SkillUnlockViewComp } from "./SkillUnlockViewComp";

/**
 * 打开绝招解锁弹窗预制体（Dialog 层全屏蒙版 + 技能图标）。
 * 预制体无脚本时在 onAdded 里补挂并 boot；按全屏界面同样比例缩放。
 */
export function showSkillUnlockModal(skills: readonly StrikeStyle[]): Promise<void> {
    if (!skills.length) return Promise.resolve();
    return new Promise(resolve => {
        const data: SkillUnlockParams = {
            skills,
            onOk: () => resolve()
        };
        void oops.gui.open(UIID.SkillUnlock, {
            data,
            onAdded: (node, params) => {
                // 与 openRunView 一致：720 设计区按当前画布高度放大，蒙版才能盖住整屏。
                const scale = view.getDesignResolutionSize().height / 1280;
                node.setScale(scale, scale, 1);
                const comp = node.getComponent(SkillUnlockViewComp)
                    || node.addComponent(SkillUnlockViewComp);
                void comp.boot((params as SkillUnlockParams) || data);
            }
        }).catch(error => {
            console.error("[SkillUnlock] 打开失败", error);
            resolve();
        });
    });
}
