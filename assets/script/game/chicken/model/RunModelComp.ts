import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { RunState } from "../../core/RunState";
import { Game, game, sys } from "cc";
import { RunSaveStore } from "../../core/RunSave";

@ecs.register("RunModel")
export class RunModelComp extends ecs.Comp {
    data: RunState = new RunState();
    loadError = "";
    private store = new RunSaveStore(sys.localStorage);
    private cleared = false;
    private changed = () => {
        this.cleared = false;
        this.save();
    };

    /** 配表加载完成后恢复，因为读档需要校验关卡和装备 id。 */
    load() {
        this.loadError = "";
        try { this.data = this.store.load(); }
        catch (error) {
            this.loadError = "存档读取失败，原存档已保留；可清除本地存档后重新开始。";
            console.error("[RunSave] 读档失败", error);
        }
        this.cleared = false;
        this.data.onChanged = this.changed;
        game.off(Game.EVENT_HIDE, this.save, this);
        game.on(Game.EVENT_HIDE, this.save, this);
        if (sys.isBrowser) {
            window.removeEventListener("pagehide", this.save);
            window.removeEventListener("beforeunload", this.save);
            window.addEventListener("pagehide", this.save);
            window.addEventListener("beforeunload", this.save);
        }
    }

    save = () => {
        if (this.cleared || this.loadError) return;
        try { this.store.save(this.data); }
        catch (error) { console.error("[RunSave] 保存失败", error); }
    };

    clearSave() {
        this.store.clear();
        this.loadError = "";
        this.data.onChanged = undefined;
        this.data = new RunState();
        this.cleared = true;
        this.data.onChanged = this.changed;
    }

    reset() {
        this.save();
        this.data.onChanged = undefined;
        game.off(Game.EVENT_HIDE, this.save, this);
        if (sys.isBrowser) {
            window.removeEventListener("pagehide", this.save);
            window.removeEventListener("beforeunload", this.save);
        }
        this.data = new RunState();
    }
}
