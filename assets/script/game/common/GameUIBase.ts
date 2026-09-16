import { _decorator } from "cc";
import { CCView } from "db://oops-framework/module/common/CCView";
import { CCEntity } from "db://oops-framework/module/common/CCEntity";
import { adaptView } from "../gui/adaptView";

const { ccclass, executionOrder } = _decorator;

/** 全屏界面基类：挂上即做 Widget 四边拉伸 + 背景 Cover 适配。 */
@ccclass("GameUIBase")
@executionOrder(-100)
export abstract class GameUIBase<T extends CCEntity> extends CCView<T> {
    onLoad() {
        adaptView(this.node);
    }
}
