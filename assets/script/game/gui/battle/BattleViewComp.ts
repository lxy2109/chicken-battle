import { JsonAsset, Label, Node, Sprite, Vec3, _decorator } from "cc";
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
    private brain = new BattleBrain();
    private closed = false;

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();
        const foe = run.enemyFighter();
        setLabel(this, "LabTitle", run.fightTitle());
        this.playerNode = await spawnChicken(this, "PlayerSlot", me.appearance, 0.72);
        this.enemyNode = await spawnChicken(this, "EnemySlot", foe.appearance, 0.72, true);
        const arena = this.getNode("Arena");
        const pHome = new Vec3(-90, -310, 0);
        const eHome = new Vec3(90, 300, 0);
        if (arena && this.playerNode) {
            this.playerNode.parent = arena;
            this.playerNode.setPosition(pHome);
        }
        if (arena && this.enemyNode) {
            this.enemyNode.parent = arena;
            this.enemyNode.setPosition(eHome);
        }
        if (this.playerNode) this.playerActor = new ChickenActor(this.playerNode, pHome);
        if (this.enemyNode) this.enemyActor = new ChickenActor(this.enemyNode, eHome);
        this.session = new BattleSession(me, foe, run.rng().int(1, 999999), run.phase === "boss");
        this.anim = this.node.getComponent(BattleAnimator) || this.node.addComponent(BattleAnimator);
        const json = await this.load("bundle", "game/animator/chicken_battle", JsonAsset);
        if (this.playerNode) this.playerAnim.attach(this.anim, this.playerNode);
        if (json) this.anim.initWithJson(json.json, this.playerAnim);
        this.playerActor?.startRoam();
        this.enemyActor?.startRoam();
        this.refreshHp();
        this.playLoop();
    }

    private async playLoop() {
        const intro = this.session.step();
        for (const ev of intro) await this.playEvent(ev);
        this.trig("toCombat");
        while (!this.session.done && !this.closed) {
            const batch = this.session.step();
            for (const ev of batch) await this.playEvent(ev);
        }
    }

    private async playEvent(ev: BattleEvent) {
        if (this.closed) return;
        if (ev.type === "taunt") {
            this.trig("toTaunt");
            this.actor(ev.side)?.hop();
            await this.spawnFx(PREFAB_PATH.taunt, ev.side, ev.text);
            await this.wait(0.45);
        }
        else if (ev.type === "start") {
            this.trig("toStart");
            await this.spawnFx(PREFAB_PATH.fxStart, "player", "开战！");
            await this.playerActor?.hop();
            await this.enemyActor?.hop();
        }
        else if (ev.type === "action") {
            const ctx = this.session.context(ev.side);
            const d = this.brain.think(ctx.self, ctx.foe);
            const style = d.kind === ev.kind ? d.style : ev.style;
            const word = ev.kind === "heal" ? "回血" : style === "jump" ? "跳踢" : style === "dive" ? "飞扑" : "啄击";
            setLabel(this, "LabLog", `${ev.side === "player" ? "我方" : "敌方"} ${word}`);
            if (ev.kind === "heal") {
                await this.actor(ev.side)?.hop();
                return;
            }
            const self = this.actor(ev.side);
            const foe = this.chicken(ev.side === "player" ? "enemy" : "player");
            if (!self || !foe) {
                for (const more of this.session.whiff()) await this.playEvent(more);
                return;
            }
            const hit = await self.connect(foe, style);
            const rest = hit ? this.session.landHit() : this.session.whiff();
            for (const more of rest) await this.playEvent(more);
            if (hit && !this.session.done) await self.retreat();
        }
        else if (ev.type === "hit") {
            const path = ev.crit ? PREFAB_PATH.fxSkill : PREFAB_PATH.fxHit;
            await this.spawnFx(path, ev.to, ev.crit ? "暴击!" : `-${ev.dmg}`);
            await this.actor(ev.to)?.hit();
            this.refreshHp();
        }
        else if (ev.type === "heal") {
            await this.spawnFx(PREFAB_PATH.fxHeal, ev.side, `+${ev.amount}`);
            this.refreshHp();
        }
        else if (ev.type === "revive") {
            await this.spawnFx(PREFAB_PATH.fxHeal, ev.side, "复活!");
            await this.actor(ev.side)?.hop();
            this.refreshHp();
        }
        else if (ev.type === "miss") {
            setLabel(this, "LabLog", `${ev.side === "player" ? "我方" : "敌方"} 没碰到`);
            await this.wait(0.2);
        }
        else if (ev.type === "lock") {
            await this.spawnFx(PREFAB_PATH.fxSkill, ev.side, "锁血!");
        }
        else if (ev.type === "end") {
            this.trig(ev.win ? "toWin" : "toLose");
            this.ent.run.settle(ev.win);
            if (ev.win) {
                await this.playerActor?.win();
                await this.enemyActor?.lose();
            }
            else {
                await this.playerActor?.lose();
                await this.enemyActor?.win();
            }
            await this.wait(0.35);
            await goScreen(this, "result");
        }
    }

    private refreshHp() {
        const php = this.session.hp("player");
        const pmax = this.session.maxHp("player");
        const ehp = this.session.hp("enemy");
        const emax = this.session.maxHp("enemy");
        setLabel(this, "LabPlayerHp", `HP ${php}/${pmax}`);
        setLabel(this, "LabEnemyHp", `HP ${ehp}/${emax}`);
        this.setBar("BarPlayerFill", pmax > 0 ? php / pmax : 0);
        this.setBar("BarEnemyFill", emax > 0 ? ehp / emax : 0);
    }

    private setBar(name: string, ratio: number) {
        const node = this.getNode(name);
        if (!node) return;
        const sp = node.getComponent(Sprite);
        if (sp) sp.fillRange = Math.max(0, Math.min(1, ratio));
    }

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

    private async spawnFx(path: string, side: BattleSide, text: string) {
        const parent = this.chicken(side) || this.getNode("FxLayer") || this.node;
        let node: Node | null = null;
        try {
            node = await this.createPrefabNode(path);
        }
        catch {
            return;
        }
        if (!node) return;
        node.parent = parent;
        node.setPosition(0, 110, 0);
        const lab = node.getComponentInChildren(Label);
        if (lab) lab.string = text;
        await this.wait(0.28);
        if (node.isValid) node.destroy();
    }

    private wait(sec: number) {
        return new Promise<void>((resolve) => this.scheduleOnce(() => resolve(), sec));
    }

    reset() {
        this.closed = true;
        this.playerActor?.stopRoam();
        this.enemyActor?.stopRoam();
        this.node.destroy();
    }
}

registerScreen("battle", BattleViewComp);
