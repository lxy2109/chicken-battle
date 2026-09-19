import { oops } from "db://oops-framework/core/Oops";
import { UIID } from "../../shared/config/GameUIConfig";

/** 打开项目通用 Alert 弹窗（common/prefab/alert + PromptBase）。 */
export function showGameAlert(opts: {
    title: string;
    content: string;
    okWord?: string;
    onOk?: () => void;
}): Promise<void> {
    return oops.gui.open(UIID.Alert, {
        data: {
            title: opts.title,
            content: opts.content,
            okWord: opts.okWord || "common_prompt_ok",
            onOk: opts.onOk
        }
    }).then(() => undefined);
}
