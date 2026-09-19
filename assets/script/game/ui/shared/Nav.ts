import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerUIElement } from "db://oops-framework/core/gui/layer/LayerUIElement";
import { oops } from "db://oops-framework/core/Oops";
import { ECSModel } from "db://oops-framework/libs/ecs/ECSModel";
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

/** 关掉来源界面：GUI 已无登记或 prefab 路径漂移时不走 removeUi，避免「界面重复关闭」。 */
function closeFromView(from: CCView<ChickenRun>) {
    if (!from.ent) return;
    const key = gui.internal.getKey(from.constructor);
    const tracked = key ? oops.gui.get(key) : null;
    // 登记节点就是当前界面时，走标准 removeUi。
    if (tracked && tracked === from.node) {
        from.remove();
        return;
    }
    const cct = ECSModel.compCtors[from.tid];
    if (from.node?.isValid) {
        const el = from.node.getComponent(LayerUIElement);
        if (el) {
            if (cct) el.onClose = from.ent.remove.bind(from.ent, cct);
            el.remove(true);
            return;
        }
        from.node.destroy();
    }
    if (cct && from.ent.has(cct as any)) from.ent.remove(cct);
}

export async function goScreen(from: CCView<ChickenRun>, screen?: RunScreen) {
    if (openingViews.has(from)) return;
    if (!from.ent || !from.node?.isValid) return;
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
        if (!newNode?.isValid) throw new Error(`界面未打开: ${target}`);
        playScreenMusic(target, ent.run.currentRoute().enemyId);
        if (!useOwnAnim && oldNode?.isValid && newNode.isValid && oldNode !== newNode) {
            await playScreenTransition(oldNode, newNode, fromScreen, target);
        }
        closeFromView(from);
    } catch (error) {
        console.error("[Nav] 界面资源加载失败，可重试", target, error);
        // 打开失败时务必放开锁，并关掉可能残留的全屏等待遮罩，否则真机上按钮会像「没反应」。
        try { oops.gui.waitClose(); } catch { /* ignore */ }
    } finally {
        openingViews.delete(from);
    }
}
