import { view } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { UIID } from "../../shared/config/GameUIConfig";
import { FinalChallengeParams, FinalChallengeViewComp } from "./FinalChallengeViewComp";

/**
 * 打开最终挑战介绍弹窗（Dialog 层全屏蒙版 + 立绘/名字/介绍）。
 * 与绝招解锁弹窗同比例缩放，保证蒙版盖住整屏。
 */
export function showFinalChallengeModal(params: FinalChallengeParams): Promise<"challenge" | "later"> {
    return new Promise(resolve => {
        let settled = false;
        const finish = (result: "challenge" | "later") => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        const data: FinalChallengeParams = {
            ...params,
            onChallenge: () => {
                params.onChallenge?.();
                finish("challenge");
            },
            onLater: () => {
                params.onLater?.();
                finish("later");
            }
        };
        void oops.gui.open(UIID.FinalChallenge, {
            data,
            onAdded: (node, openParams) => {
                const scale = view.getDesignResolutionSize().height / 1280;
                node.setScale(scale, scale, 1);
                const comp = node.getComponent(FinalChallengeViewComp)
                    || node.addComponent(FinalChallengeViewComp);
                void comp.boot((openParams as FinalChallengeParams) || data);
            }
        }).catch(error => {
            console.error("[FinalChallenge] 打开失败", error);
            finish("later");
        });
    });
}
