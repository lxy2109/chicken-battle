import { CCView } from "db://oops-framework/module/common/CCView";
import { ChickenRun } from "../../run/ChickenRun";
import { RunScreen } from "../../domain/Types";
import { openRunView } from "./RunGui";
import { playScreenMusic } from "./GameAudio";
import { playScreenTransition } from "./ScreenTransition";

const SCREEN_VIEW: Partial<Record<RunScreen, any>> = {};
const openingViews = new WeakSet<CCView<ChickenRun>>();

export function registerScreen(screen: RunScreen, ctor: any) {
    SCREEN_VIEW[screen] = ctor;
}

function screenOfView(view: CCView<ChickenRun>): RunScreen | undefined {
    for (const key of Object.keys(SCREEN_VIEW) as RunScreen[]) {
        const ctor = SCREEN_VIEW[key];
        if (ctor && view instanceof ctor) return key;
    }
    return undefined;
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
    const fromScreen = screenOfView(from);
    const oldNode = from.node;
    ent.RunModel.save();
    // 先把新界面开出来盖住旧的再撤旧界面。反过来做的话，加载新预制体的这段时间
    // 屏幕上什么都没有，跳转就会闪一下黑。
    openingViews.add(from);
    try {
        // 准备战斗有自己的左右面板入场/退场，不套全局整页滑动。
        const useOwnAnim = target === "prebattle" || fromScreen === "prebattle";
        const newNode = await openRunView(ent, ctor, { entrance: useOwnAnim ? undefined : false });
        playScreenMusic(target, from.ent.run.currentRoute().enemyId);
        if (!useOwnAnim && oldNode?.isValid && newNode?.isValid && oldNode !== newNode) {
            await playScreenTransition(oldNode, newNode, fromScreen, target);
        }
        from.remove();
    } catch (error) {
        console.error("[Nav] 界面资源加载失败，可重试", target, error);
    } finally {
        openingViews.delete(from);
    }
}
