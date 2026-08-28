import { JsonAsset, Label, Node, Sprite, UIOpacity, UITransform, Vec3, _decorator, tween, v3 } from "cc";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { CCView } from "db://oops-framework/module/common/CCView";
import { BattleAnimPlayer } from "../../battle/BattleAnimPlayer";
import { BattleAnimator } from "../../battle/BattleAnimator";
import { BattleBrain } from "../../battle/BattleBrain";
import { ChickenActor } from "../../battle/ChickenActor";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH } from "../../core/Catalog";
import { BattleSession } from "../../core/BattleSession";
import { BattleEvent, BattleSide } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { setLabel } from "../UiUtil";

const { ccclass } = _decorator;

/** 与 battle.prefab 里 PlayerSlot / EnemySlot 的落点保持一致。 */
const P_HOME = new Vec3(-100, -160, 0);
const E_HOME = new Vec3(100, 160, 0);
const ARENA_HOME = new Vec3(0, 10, 0);
/** 血条追赶实际血量的速度，越大越跟手。 */
const BAR_EASE = 8;
const LOG_HOLD = 1.6;

/**
 * 即时战斗界面。
 *
 * 逻辑层按时间推进，双方谁的冷却先走完谁就出手；这里每帧把新事件取出来分发，
 * 出招演出是各跑各的异步链，互相不等待，所以场上会出现两只鸡同时扑上去的画面。
 */
@ccclass("BattleViewComp")
@ecs.register("BattleView", false)
@gui.register("BattleView", { layer: LayerType.UI, prefab: "gui/battle/battle" })
export class BattleViewComp extends CCView<ChickenRun> {
    private session!: BattleSession;
    private playerNode: Node | null = null;
    private enemyNode: Node | null = null;
    private playerActor: ChickenActor | null = null;
    private enemyActor: ChickenActor | null = null;
    private anim!: BattleAnimator;
    private playerAnim = new BattleAnimPlayer();
    private closed = false;
    private running = false;
    private ticking = false;
    private shown: Record<BattleSide, number> = { player: 1, enemy: 1 };
    private logLeft = 0;

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();
        const foe = run.enemyFighter();
        setLabel(this, "LabTitle", run.fightTitle());
        setLabel(this, "LabPlayerName", me.name);
        setLabel(this, "LabEnemyName", foe.name);
        setLabel(this, "LabLog", "");

        this.playerNode = await spawnChicken(this, "PlayerSlot", me.appearance, 0.72);
        this.enemyNode = await spawnChicken(this, "EnemySlot", foe.appearance, 0.72, true);
        const arena = this.getNode("Arena");
        if (arena && this.playerNode) {
            this.playerNode.parent = arena;
            this.playerNode.setPosition(P_HOME);
        }
        if (arena && this.enemyNode) {
            this.enemyNode.parent = arena;
            this.enemyNode.setPosition(E_HOME);
        }
        if (this.playerNode) this.playerActor = new ChickenActor(this.playerNode, P_HOME);
        if (this.enemyNode) this.enemyActor = new ChickenActor(this.enemyNode, E_HOME);

        // 出招交给行为树来判，双方共用一棵：它每次都从根重跑，不存跨次状态。
        const brain = new BattleBrain();
        this.session = new BattleSession(
            me, foe, run.rng().int(1, 999999), run.phase === "boss",
            (self, opponent) => brain.think(self, opponent)
        );
        this.anim = this.node.getComponent(BattleAnimator) || this.node.addComponent(BattleAnimator);
        const json = await this.load("bundle", "game/animator/chicken_battle", JsonAsset);
        if (this.playerNode) this.playerAnim.attach(this.anim, this.playerNode);
        if (json) this.anim.initWithJson(json.json, this.playerAnim);

        this.refreshHp(true);
        await this.playIntro();
        if (this.closed) return;
        this.playerActor?.startRoam();
        this.enemyActor?.startRoam();
        this.session.beginCombat();
        this.running = true;
        this.ticking = true;
        this.schedule(this.onTick, 0);
    }

    /**
     * 开场：双方对着骂完再开打。
     * 两句话一句接一句地等太拖沓，这里错开半拍同时挂在场上，像真的在互喷。
     */
    private async playIntro() {
        const taunts = this.session.intro().filter(ev => ev.type === "taunt");
        this.trig("toTaunt");
        for (let i = 0; i < taunts.length; i++) {
            const ev = taunts[i];
            if (this.closed || ev.type !== "taunt") return;
            this.actor(ev.side)?.hop();
            void this.spawnFx(PREFAB_PATH.taunt, ev.side, ev.text, 1.1);
            if (i < taunts.length - 1) await this.wait(0.3);
        }
        await this.wait(0.95);
        if (this.closed) return;
        this.trig("toStart");
        await this.spawnFx(PREFAB_PATH.fxStart, "player", "开战！", 0.55);
        this.trig("toCombat");
    }

    private onTick = (dt: number) => {
        if (this.closed || !this.running) return;
        for (const ev of this.session.tick(dt)) this.dispatch(ev);
        this.easeBars(dt);
        if (this.logLeft > 0) {
            this.logLeft -= dt;
            if (this.logLeft <= 0) setLabel(this, "LabLog", "");
        }
    };

    private dispatch(ev: BattleEvent) {
        if (this.closed) return;
        if (ev.type === "action") {
            if (ev.kind === "heal") return;
            void this.runStrike(ev.side, ev.style, ev.kind === "skill");
        }
        else if (ev.type === "hit") {
            this.onHit(ev.to, ev.dmg, ev.crit);
        }
        else if (ev.type === "heal") {
            this.actor(ev.side)?.hop();
            void this.spawnFx(PREFAB_PATH.fxHeal, ev.side, `+${ev.amount}`, 0.5);
            this.log(ev.side, "回血");
        }
        else if (ev.type === "revive") {
            void this.spawnFx(PREFAB_PATH.fxHeal, ev.side, "复活!", 0.7);
            this.actor(ev.side)?.hop();
            this.shake(14);
            this.log(ev.side, "复活");
        }
        else if (ev.type === "lock") {
            void this.spawnFx(PREFAB_PATH.fxSkill, ev.side, "锁血!", 0.6);
            this.log(ev.side, "锁血");
        }
        else if (ev.type === "miss") {
            void this.spawnFx(PREFAB_PATH.fxHit, ev.side, "落空", 0.4);
        }
        else if (ev.type === "end") {
            void this.finish(ev.win);
        }
    }

    /** 一次出招的完整演出。命中判定交给碰撞，结果回给逻辑层结算。 */
    private async runStrike(side: BattleSide, style: "peck" | "jump" | "dive", skill: boolean) {
        const self = this.actor(side);
        const foe = this.chicken(side === "player" ? "enemy" : "player");
        if (!self || !foe) {
            this.applyResult(this.session.resolveStrike(side, false));
            return;
        }
        if (skill) this.log(side, style === "dive" ? "飞扑" : "绝招");
        await self.strike(foe, style, (hit) => {
            this.applyResult(this.session.resolveStrike(side, hit));
        });
    }

    private applyResult(evs: BattleEvent[]) {
        for (const ev of evs) this.dispatch(ev);
    }

    private onHit(to: BattleSide, dmg: number, crit: boolean) {
        this.actor(to)?.flinch();
        void this.spawnFx(
            crit ? PREFAB_PATH.fxSkill : PREFAB_PATH.fxHit, to,
            crit ? `暴击 -${dmg}` : `-${dmg}`,
            crit ? 0.7 : 0.5, crit ? 1.25 : 1
        );
        this.shake(crit ? 18 : 7);
        if (crit) this.log(to === "player" ? "enemy" : "player", "暴击");
        this.refreshHp(false);
    }

    private async finish(win: boolean) {
        if (!this.running) return;
        this.running = false;
        this.stopTick();
        this.trig(win ? "toWin" : "toLose");
        this.ent.run.settle(win);
        setLabel(this, "LabLog", win ? "胜！" : "败…");
        this.refreshHp(true);
        if (win) {
            this.playerActor?.win();
            await this.enemyActor?.lose();
        }
        else {
            this.enemyActor?.win();
            await this.playerActor?.lose();
        }
        if (this.closed) return;
        await this.wait(0.5);
        if (this.closed) return;
        await goScreen(this, "result");
    }

    //#region 表现细节

    /** 血条不瞬移，每帧往真实血量追一段，掉血才看得出来。 */
    private easeBars(dt: number) {
        const k = Math.min(1, dt * BAR_EASE);
        for (const side of ["player", "enemy"] as BattleSide[]) {
            const max = this.session.maxHp(side);
            const target = max > 0 ? this.session.hp(side) / max : 0;
            this.shown[side] += (target - this.shown[side]) * k;
            if (Math.abs(target - this.shown[side]) < 0.002) this.shown[side] = target;
            this.setBar(side === "player" ? "BarPlayerFill" : "BarEnemyFill", this.shown[side]);
        }
    }

    private refreshHp(snap: boolean) {
        for (const side of ["player", "enemy"] as BattleSide[]) {
            const hp = this.session.hp(side);
            const max = this.session.maxHp(side);
            setLabel(this, side === "player" ? "LabPlayerHp" : "LabEnemyHp", `${hp}/${max}`);
            if (snap) {
                this.shown[side] = max > 0 ? hp / max : 0;
                this.setBar(side === "player" ? "BarPlayerFill" : "BarEnemyFill", this.shown[side]);
            }
        }
    }

    private setBar(name: string, ratio: number) {
        const node = this.getNode(name);
        if (!node) return;
        const sp = node.getComponent(Sprite);
        if (sp) sp.fillRange = Math.max(0, Math.min(1, ratio));
    }

    /** 打中了抖一下整个场地，暴击抖得狠些。 */
    private shake(power: number) {
        const arena = this.getNode("Arena");
        if (!arena) return;
        tween(arena).stop();
        arena.setPosition(ARENA_HOME);
        tween(arena)
            .by(0.04, { position: v3(power, -power * 0.5, 0) })
            .by(0.05, { position: v3(-power * 2, power, 0) })
            .by(0.05, { position: v3(power, -power * 0.5, 0) })
            .call(() => arena.setPosition(ARENA_HOME))
            .start();
    }

    private log(side: BattleSide, word: string) {
        setLabel(this, "LabLog", `${side === "player" ? "我方" : "敌方"} ${word}`);
        this.logLeft = LOG_HOLD;
    }

    /**
     * 飘字挂在 FxLayer 而不是鸡身上：鸡一直在跑，挂它身上字会跟着满场飞。
     */
    private async spawnFx(path: string, side: BattleSide, text: string, life: number, scale = 1) {
        const layer = this.getNode("FxLayer") || this.node;
        let node: Node | null = null;
        try {
            node = await this.createPrefabNode(path);
        }
        catch {
            return;
        }
        if (!node || this.closed) {
            node?.destroy();
            return;
        }
        node.parent = layer;
        const src = this.chicken(side);
        const box = layer.getComponent(UITransform);
        // 出手很密，飘字全落同一点会糊成一坨，左右撒开一些。
        const jitter = (Math.random() - 0.5) * 56;
        if (src && box) {
            const p = box.convertToNodeSpaceAR(src.worldPosition);
            node.setPosition(p.x + jitter, p.y + 96, 0);
        }
        else {
            node.setPosition(jitter, side === "player" ? -160 : 160, 0);
        }
        if (scale !== 1) node.setScale(scale, scale, 1);
        const lab = node.getComponentInChildren(Label);
        if (lab) lab.string = text;
        const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        tween(node).by(life, { position: v3(0, 70, 0) }).start();
        tween(op).delay(life * 0.55).to(life * 0.45, { opacity: 0 }).start();
        await this.wait(life);
        if (node.isValid) node.destroy();
    }

    //#endregion

    private trig(name: string) {
        try {
            this.anim.setTrigger(name);
        }
        catch {
            /* 状态机未就绪时跳过 */
        }
    }

    private actor(side: BattleSide) {
        return side === "player" ? this.playerActor : this.enemyActor;
    }

    private chicken(side: BattleSide) {
        return side === "player" ? this.playerNode : this.enemyNode;
    }

    private wait(sec: number) {
        return new Promise<void>((resolve) => this.scheduleOnce(() => resolve(), sec));
    }

    private stopTick() {
        if (!this.ticking) return;
        this.ticking = false;
        this.unschedule(this.onTick);
    }

    reset() {
        this.closed = true;
        this.running = false;
        this.stopTick();
        this.playerActor?.stopRoam();
        this.enemyActor?.stopRoam();
        this.node.destroy();
    }
}

registerScreen("battle", BattleViewComp);
