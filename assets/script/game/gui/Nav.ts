import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../chicken/ChickenRun";
import { RunScreen } from "../core/Types";
import { openRunView } from "./RunGui";

const SCREEN_VIEW: Partial<Record<RunScreen, any>> = {};

export function registerScreen(screen: RunScreen, ctor: any) {
    SCREEN_VIEW[screen] = ctor;
}

export async function goScreen(from: CCView<ChickenRun>, screen?: RunScreen) {
    const target = screen ?? from.ent.run.screen;
    const ctor = SCREEN_VIEW[target];
    if (!ctor) {
        console.error(`未注册界面 ${target}`);
        return;
    }
    const ent = from.ent;
    // 先把新界面开出来盖住旧的再撤旧界面。反过来做的话，加载新预制体的这段时间
    // 屏幕上什么都没有，跳转就会闪一下黑。
    await openRunView(ent, ctor);
    from.remove();
}
