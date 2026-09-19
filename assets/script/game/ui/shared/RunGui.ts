import { revealUI } from "./UiUtil";
import { Node, SpriteFrame, view } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerUIElement } from "db://oops-framework/core/gui/layer/LayerUIElement";
import { oops } from "db://oops-framework/core/Oops";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { ECSCtor, ECSView } from "db://oops-framework/module/common/CCEntity";
import { ChickenRun } from "../../run/ChickenRun";
import { mapPrefab } from "../../domain/Catalog";
import { applyConfiguredTexts } from "./UiUtil";

const preparedDirectories = new Map<string, Promise<void>>();

export type OpenRunViewOptions = {
    /** 是否播放控件错落入场；切图/切屏滑动时关掉，避免和整页滑动抢戏。 */
    entrance?: boolean;
};

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
    try {
        // Dynamic sprites are not prefab dependencies. Finish their downloads and
        // decoding while the loading/previous view is still visible.
        // 图片统一在 game/image/ 下；texture 子目录仅特效贴图
        const directories: string[] = ["actor", "equip", "ui"].map(d => `game/image/${d}`);
        if (key === "MapView") directories.push("game/image/map");
        if (key === "RewardView") directories.push("game/image/icon");
        if (key === "BattleView") directories.push("game/image/texture");
        if (key === "MapView") gui.internal.getConfig(key).prefab = mapPrefab(entity.run.currentMap().id);
        const prefab = gui.internal.getConfig(key).prefab;
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
        throw error;
    }
}
