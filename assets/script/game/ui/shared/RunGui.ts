import { revealUI } from "./UiUtil";
import { Node, SpriteFrame, view } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerUIElement } from "db://oops-framework/core/gui/layer/LayerUIElement";
import { oops } from "db://oops-framework/core/Oops";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { ECSCtor, ECSView } from "db://oops-framework/module/common/CCEntity";
import { ChickenRun } from "../../run/ChickenRun";
import { getMaps, mapPrefab } from "../../domain/Catalog";
import { applyConfiguredTexts } from "./UiUtil";

const preparedDirectories = new Map<string, Promise<void>>();

export type OpenRunViewOptions = {
    /** 是否播放控件错落入场；切图/切屏滑动时关掉，避免和整页滑动抢戏。 */
    entrance?: boolean;
};

/**
 * MapView 会按地图改写共享 gui config.prefab。preload 未 show 或关闭失败时，
 * map_* 会留在 LayerUI 登记表里，再次进入同图会卡住。
 * 只清「无效 / 未上舞台」的残留；切图动画中仍挂着的旧图不能动。
 */
function purgeMapGuiEntries() {
    const cfg = gui.internal.getConfig("MapView");
    if (!cfg) return;
    const previous = cfg.prefab;
    const ids = new Set<number>([1, 2, 3, 4, 5, 6]);
    try {
        for (const map of getMaps()) ids.add(map.id);
    } catch {
        /* 配表未就绪时仍清默认图号 */
    }
    try {
        for (const id of ids) {
            cfg.prefab = mapPrefab(id);
            if (!oops.gui.has("MapView")) continue;
            const node = oops.gui.get("MapView");
            if (node?.isValid && node.parent) continue;
            oops.gui.remove("MapView");
        }
    } finally {
        cfg.prefab = previous;
    }
}

/** 卸掉实体上残留的同名界面，避免 entity.add 抛「组件已经存在」。 */
function detachStaleView(entity: ChickenRun, ctor: ECSCtor<any>) {
    if (!entity.has(ctor as any)) return;
    const comp = entity.get(ctor as any) as { node?: Node } | null;
    const node = comp?.node;
    if (node?.isValid) {
        const el = node.getComponent(LayerUIElement);
        if (el) {
            el.onClose = () => {
                if (entity.has(ctor as any)) entity.remove(ctor as any);
            };
            el.remove(true);
            if (entity.has(ctor as any)) entity.remove(ctor as any);
            return;
        }
        entity.remove(ctor as any);
        node.destroy();
        return;
    }
    entity.remove(ctor as any);
}

/** 打开界面：预制体缺脚本时补挂，保证动态加载预制体可跑 */
export async function openRunView<T extends ECSView>(
    entity: ChickenRun,
    ctor: ECSCtor<T>,
    options: OpenRunViewOptions = {}
): Promise<Node> {
    const key = gui.internal.getKey(ctor);
    // 进战斗要拉 texture 目录和特效，冷启动会顿一下；转圈盖住预载，BattleView 就绪后再关。
    const battleLoad = key === "BattleView";
    if (battleLoad) oops.gui.waitOpen();
    let openedPrefab = "";
    try {
        // Dynamic sprites are not prefab dependencies. Finish their downloads and
        // decoding while the loading/previous view is still visible.
        // 图片统一在 game/image/ 下；texture 子目录仅特效贴图
        const directories: string[] = ["actor", "equip", "ui"].map(d => `game/image/${d}`);
        if (key === "MapView") directories.push("game/image/map");
        if (key === "RewardView") directories.push("game/image/icon");
        if (key === "BattleView") directories.push("game/image/texture");
        if (key === "MapView") {
            // 清掉历史地图预制登记，再绑当前地图路径。
            purgeMapGuiEntries();
            gui.internal.getConfig(key).prefab = mapPrefab(entity.run.currentMap().id);
        }
        // 同 tid 只能挂一份；回家/清档后若 ECS 未卸干净，这里先摘掉。
        detachStaleView(entity, ctor);
        // 非地图界面：若 GUI 仍占着同 key，先关掉再开，避免重复登记挂起。
        if (key !== "MapView" && oops.gui.has(key)) oops.gui.remove(key);

        const prefab = gui.internal.getConfig(key).prefab;
        openedPrefab = prefab;
        const backgrounds = key === "ShopView" ? ["shop_figma"]
            : key === "ResultView" ? ["result_figma", "result_lose_figma"] : [];
        await Promise.all([
            ...directories.map(dir => {
                let ready = preparedDirectories.get(dir);
                if (!ready) {
                    ready = new Promise<void>((resolve, reject) => {
                        oops.res.loadDir("bundle", dir, SpriteFrame, (error: Error | null) => {
                            if (error) reject(error);
                            else resolve();
                        });
                    }).catch(error => {
                        preparedDirectories.delete(dir);
                        throw error;
                    });
                    preparedDirectories.set(dir, ready);
                }
                return ready;
            }),
            new Promise<void>((resolve, reject) => {
                oops.res.loadAny("bundle", [prefab,
                    "game/prefab/actor/chicken", "game/effect/feather-gradient",
                    ...((key === "ResultView") ? ["game/prefab/fx/ribbon/fx_ribbon"] : []),
                    ...((key === "EndingView") ? ["game/media/video/ending"] : []),
                    ...backgrounds.map(bg => `game/image/bg/${bg}/spriteFrame`)],
                null, (error: Error | null) => error ? reject(error) : resolve());
            })
        ]);
        const node = await oops.gui.open(key, { preload: true });
        if (!node?.isValid) throw new Error(`[RunGui] 打开界面失败: ${key} (${prefab})`);
        // LayerUI 预制体加载结束会 waitClose；进战后续还要 spawn/预热，把转圈续上。
        if (battleLoad) oops.gui.waitOpen();
        // MapView 会改写共享 gui config.prefab；LayerUI 若持同一引用，切图后
        // closeUi 会按新路径从 ui_nodes 删错条目，导致之后 removeUi 报「重复关闭」。
        const layerEl = node.getComponent(LayerUIElement);
        if (layerEl?.state?.config) {
            layerEl.state.config = { ...layerEl.state.config };
        }
        applyConfiguredTexts(node);
        // LayerGame resets prefab scale on open. Keep the game's 720x1280 local
        // coordinates proportional to the project's current design canvas.
        const scale = view.getDesignResolutionSize().height / 1280;
        node.setScale(scale, scale, 1);
        let comp = node.getComponent(ctor as any) as unknown as ecs.Comp;
        if (!comp) {
            comp = node.addComponent(ctor as any) as unknown as ecs.Comp;
        }
        if (entity.has(ctor as any)) detachStaleView(entity, ctor);
        entity.add(comp);
        oops.gui.show(key);
        if (options.entrance === false) return node;
        const entrances: Record<string, string[]> = {
            customize: ["BtnStart", "LabSaveHint"],
            map: ["BtnCharacter", "GoldCard", "BtnChallenge"],
            character: ["PowerCard", "BtnHideAppearance"],
            result: ["LabHeader", "LabGold", "BtnNext"],
            reward: ["BtnConfirm"],
            shop: ["BtnLeave"],
            ending: ["LabChampion", "BtnHome"]
        };
        const names = entrances[node.name] || [];
        const visit = (parent: Node) => {
            for (const child of parent.children) {
                const index = names.indexOf(child.name);
                if (index >= 0) revealUI(child, index * 0.07);
                else if (child.active) visit(child);
            }
        };
        visit(node);
        return node;
    } catch (error) {
        if (battleLoad) oops.gui.waitClose();
        // preload 成功但后续失败时，主动摘掉 GUI 登记，避免下次点确定挂死。
        try {
            if (key === "MapView") purgeMapGuiEntries();
            else if (key && oops.gui.has(key)) oops.gui.remove(key);
        } catch (cleanupError) {
            console.warn("[RunGui] 打开失败后清理界面残留出错", openedPrefab || key, cleanupError);
        }
        throw error;
    }
}
