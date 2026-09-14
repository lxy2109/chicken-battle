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
import { DanmakuPool } from "../../core/Danmaku";
import { BattleDanmaku } from "./BattleDanmaku";
import { BattleEvent, BattleSide, StrikeStyle } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { setLabel } from "../UiUtil";
import { playGameEffect } from "../GameAudio";

const { ccclass } = _decorator;

/** 与 battle.prefab 里 PlayerSlot / EnemySlot 的落点保持一致。 */
const P_HOME = new Vec3(-160, -76, 0);
const E_HOME = new Vec3(160, -76, 0);
const ARENA_HOME = new Vec3(0, 0, 0);
/** 血条追赶实际血量的速度，越大越跟手。 */
const BAR_EASE = 8;
const LOG_HOLD = 1.6;

/** 战报里管招式叫什么。 */
const STYLE_TEXT: Record<StrikeStyle, string> = {
    peck: "贴身啄",
    jump: "跳踢",
    dive: "飞扑",
    leap: "腾空下砸",
    charge: "扑翅冲撞",
    tail: "转身扫尾",
    combo: "连啄",
    feint: "假动作偷袭"
};

/** 各招式打中时的震屏力度，整只砸下来的自然要比啄一口重。 */
const HIT_QUAKE: Record<StrikeStyle, number> = {
    peck: 6,
    jump: 9,
    dive: 11,
    leap: 20,
    charge: 16,
    tail: 12,
    combo: 7,
    feint: 8
};

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
    /** 双方最近一击用的招式，伤害事件回来时靠它决定震屏力度。 */
    private styleOf: Record<BattleSide, StrikeStyle> = { player: "peck", enemy: "peck" };
    private logLeft = 0;
    private danmaku?: BattleDanmaku;

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();
        const foe = run.enemyFighter();
        setLabel(this, "LabTitle", "自动战斗");
        setLabel(this, "LabPlayerName", me.name);
        setLabel(this, "LabEnemyName", foe.name);
        setLabel(this, "LabLog", "");
        const layer = this.getNode("DanmakuLayer");
        const encounter = run.currentRoute().encounter;
        if (layer) this.danmaku = new BattleDanmaku(layer,
            new DanmakuPool(encounter === "warmup" ? "warmup" : run.phase === "boss" ? "boss" : "official", foe.name));

        const playerPortrait = await spawnChicken(this, "PlayerPortrait", run.appearance, 0.76, true);
        playerPortrait?.setPosition(33.6, -128.6, 0);
        const enemyPortrait = await spawnChicken(this, "EnemyPortrait", foe.appearance, 1, true);
        const art = enemyPortrait?.getChildByName("Illustration")?.getComponent(UITransform);
        if (enemyPortrait && art) {
            // Head framing is proportional to each illustration, independent of whole-body height.
            const id = foe.appearance.illustration || "";
            const heads: Record<string, [number, number, number, number]> = {
                s1_warmup: [0.38, 0.23, 0.58, 0.43],
                s2_warmup: [0.43, 0.2, 0.59, 0.36],
                s3_warmup: [0.43, 0.22, 0.62, 0.42],
                s4_warmup: [0.4, 0.22, 0.57, 0.4],
                s5_warmup: [0.43, 0.22, 0.61, 0.41],
            };
            const [x, y, w, h] = heads[id] || [0.5, 0.13, 0.5, 0.23];
            const size = this.getNode("EnemyPortrait")!.getComponent(UITransform)!;
            const scale = Math.min(size.width / (art.width * w), size.height / (art.height * h));
            enemyPortrait.setScale(-scale, scale, 1);
            enemyPortrait.setPosition((0.5 - x) * art.width * scale, (y - 0.5) * art.height * scale);
        }
        this.playerNode = await spawnChicken(this, "PlayerSlot", me.appearance, 0.9);
        this.enemyNode = await spawnChicken(this, "EnemySlot", foe.appearance, 0.9, true);
        const arena = this.getNode("Arena");
        if (arena && this.playerNode) {
            this.playerNode.parent = arena;
            this.playerNode.setPosition(P_HOME);
        }
        if (arena && this.enemyNode) {
            this.enemyNode.parent = arena;
            this.enemyNode.setPosition(E_HOME);
        }
        // 必须等 spawnChicken 建完再造 Actor：它会记下各部位此刻的位置当复位基准，
        // 而强化撑大部位时连带把位置挪过，倒过来建的话复位就会把强化的体型抹平。
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
        playGameEffect("start");
        await this.spawnFx(PREFAB_PATH.fxStart, "player", "开战！", 0.55);
        this.trig("toCombat");
    }

    private onTick = (dt: number) => {
        if (this.closed || !this.running) return;
        for (const ev of this.session.tick(dt)) this.dispatch(ev);
        this.easeBars(dt);
        this.danmaku?.tick(dt, this.session.hp("player") <= this.session.maxHp("player") / 2
            || this.session.hp("enemy") <= this.session.maxHp("enemy") / 2);
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
            this.onHit(ev.from, ev.to, ev.dmg, ev.crit);
        }
        else if (ev.type === "heal") {
            playGameEffect("heal");
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
    private async runStrike(side: BattleSide, style: StrikeStyle, skill: boolean) {
        const self = this.actor(side);
        const foe = this.chicken(side === "player" ? "enemy" : "player");
        if (!self || !foe) {
            this.applyResult(this.session.resolveStrike(side, false));
            return;
        }
        // 记下这一击用的招式，等伤害事件回来时按招式定震屏力度。
        this.styleOf[side] = style;
        this.log(side, skill ? `绝招·${STYLE_TEXT[style]}` : STYLE_TEXT[style]);
        await self.strike(foe, style, (hit) => {
            this.applyResult(this.session.resolveStrike(side, hit));
        });
    }

    private applyResult(evs: BattleEvent[]) {
        for (const ev of evs) this.dispatch(ev);
    }

    private onHit(from: BattleSide, to: BattleSide, dmg: number, crit: boolean) {
        const style = this.styleOf[from];
        playGameEffect(crit ? "critical" : style === "peck" || style === "combo" ? "peck"
            : style === "dive" || style === "charge" ? "wing" : style === "leap" ? "skill" : "hit");
        this.actor(to)?.flinch();
        void this.spawnFx(
            crit ? PREFAB_PATH.fxSkill : PREFAB_PATH.fxHit, to,
            crit ? `暴击 -${dmg}` : `-${dmg}`,
            crit ? 0.7 : 0.5, crit ? 1.25 : 1
        );
        // 整只砸下来和啄一口不该抖得一样重，按招式给个底，暴击再往上加。
        this.shake(HIT_QUAKE[this.styleOf[from]] + (crit ? 11 : 0));
        if (crit) this.log(to === "player" ? "enemy" : "player", "暴击");
        this.refreshHp(false);
    }

    private async finish(win: boolean) {
        if (!this.running) return;
        this.running = false;
        this.danmaku?.clear();
        playGameEffect(win ? "win" : "lose");
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
        this.danmaku?.clear();
        this.running = false;
        this.stopTick();
        this.playerActor?.stopRoam();
        this.enemyActor?.stopRoam();
        this.node.destroy();
    }
}

registerScreen("battle", BattleViewComp);
