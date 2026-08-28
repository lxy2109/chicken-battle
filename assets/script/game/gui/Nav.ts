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
    from.remove();
    await openRunView(ent, ctor);
}
