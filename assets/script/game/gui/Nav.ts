import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../chicken/ChickenRun";
import { RunScreen } from "../core/Types";
import { openRunView } from "./RunGui";
import { playScreenMusic } from "./GameAudio";

const SCREEN_VIEW: Partial<Record<RunScreen, any>> = {};
const openingViews = new WeakSet<CCView<ChickenRun>>();

export function registerScreen(screen: RunScreen, ctor: any) {
    SCREEN_VIEW[screen] = ctor;
}

export async function goScreen(from: CCView<ChickenRun>, screen?: RunScreen) {
    if (openingViews.has(from)) return;
    const target = screen ?? from.ent.run.screen;
    const ctor = SCREEN_VIEW[target];
    if (!ctor) {
        console.error(`未注册界面 ${target}`);
        return;
    }
    const ent = from.ent;
    ent.RunModel.save();
    // 先把新界面开出来盖住旧的再撤旧界面。反过来做的话，加载新预制体的这段时间
    // 屏幕上什么都没有，跳转就会闪一下黑。
    openingViews.add(from);
    try {
        await openRunView(ent, ctor);
        playScreenMusic(target);
        from.remove();
    } catch (error) {
        console.error("[Nav] 界面资源加载失败，可重试", target, error);
    } finally {
        openingViews.delete(from);
    }
}
