import { gameText, gameTextOr } from "../../core/GameConfig";
import { JsonAsset, Label, Node, Prefab, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, _decorator, tween, v3 } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../common/GameUIBase";
import { BattleAnimPlayer } from "../../battle/BattleAnimPlayer";
import { BattleAnimator } from "../../battle/BattleAnimator";
import { BattleBrain } from "../../battle/BattleBrain";
import { ChickenActor } from "../../battle/ChickenActor";
import { ChickenRun } from "../../chicken/ChickenRun";
import { PREFAB_PATH } from "../../core/Catalog";
import { BattleSession } from "../../core/BattleSession";
import { DanmakuPool } from "../../core/Danmaku";
import { BattleDanmaku } from "./BattleDanmaku";
import { BattleFx } from "./BattleFx";
import { BattleImpact } from "./BattleImpact";
import { BattleScreenEffects } from "./BattleScreenEffects";
import { SIGNATURE_LABEL, STYLE_LABEL, stageMood, styleRhythm } from "../../core/BattleStyle";
import { BattleEvent, BattleSide, StrikeStyle } from "../../core/Types";
import { spawnChicken } from "../ChickenBinder";
import { goScreen, registerScreen } from "../Nav";
import { preloadResultSuitGif } from "../SlotVideo";
import { hexColor, setLabel } from "../UiUtil";
import { playGameEffect } from "../GameAudio";

const { ccclass, executionOrder } = _decorator;

/** 与 battle.prefab 里 PlayerSlot / EnemySlot 的落点保持一致。 */
const P_HOME = new Vec3(-160, -76, 0);
const E_HOME = new Vec3(160, -76, 0);
/** 血条追赶实际血量的速度，越大越跟手。 */
const BAR_EASE = 8;
const LOG_HOLD = 1.6;

/** 绝招战报用的招式名，和全屏/半屏特效绑在一起。 */
const STYLE_TEXT: Record<StrikeStyle, string> = {
    get peck() { return gameText("BattleViewComp_001"); },
    get jump() { return gameText("BattleViewComp_002"); },
    get dive() { return gameText("BattleViewComp_003"); },
    get leap() { return gameText("BattleViewComp_004"); },
    get charge() { return gameText("BattleViewComp_005"); },
    get tail() { return gameText("BattleViewComp_006"); },
    get combo() { return gameText("BattleViewComp_007"); },
    get feint() { return gameText("BattleViewComp_008"); }
};

/** 普攻只报动作，不占用绝招名。 */
const BASIC_TEXT: Record<StrikeStyle, string> = {
    peck: "啄",
    jump: "跳踢",
    dive: "扑",
    leap: "砸",
    charge: "撞",
    tail: "扫尾",
    combo: "连啄",
    feint: "晃身"
};

/** 各招式打中时的震屏力度，整只砸下来的自然要比啄一口重。 */
const HIT_QUAKE: Record<StrikeStyle, number> = {
    peck: 8,
    jump: 11,
    dive: 13,
    leap: 22,
    charge: 18,
    tail: 14,
    combo: 9,
    feint: 10
};

/**
 * 即时战斗界面。
 *
 * 逻辑层按时间推进，双方谁的冷却先走完谁就出手；这里每帧把新事件取出来分发。
 * 普攻演出各跑各的，场上可以两只鸡同时扑上去；绝招立绘会错开，叠上时只喊自己的招。
 */
@ccclass("BattleViewComp")
@executionOrder(-100)
@ecs.register("BattleView", false)
@gui.register("BattleView", { layer: LayerType.UI, prefab: "gui/battle/battle" })
export class BattleViewComp extends GameUIBase<ChickenRun> {
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
    private impact?: BattleImpact;
    private screenEffects?: BattleScreenEffects;
    private fx?: BattleFx;
    private skillOf: Record<BattleSide, boolean> = { player: false, enemy: false };
    private featherColors: Record<BattleSide, string> = { player: "#fff0c0", enemy: "#fff0c0" };

    async start() {
        this.nodeTreeInfoLite();
        const run = this.ent.run;
        const me = run.playerFighter();
        const foe = run.enemyFighter();
        this.featherColors = { player: me.appearance.colors.wing, enemy: foe.appearance.colors.wing };
        const mapId = run.currentMap().id;
        const encounter = run.currentRoute().encounter;
        const mood = stageMood(mapId, encounter);
        const bg = this.node.getComponent(Sprite);
        if (bg) bg.color = hexColor(encounter === "final" ? "#f0b4a8" : mood.tint);
        const pHome = new Vec3(-styleRhythm(me.fightStyle).gap, P_HOME.y + styleRhythm(me.fightStyle).lane, 0);
        const eHome = new Vec3(styleRhythm(foe.fightStyle).gap, E_HOME.y + styleRhythm(foe.fightStyle).lane, 0);
        const pLabel = STYLE_LABEL[me.fightStyle || "brawler"];
        const eLabel = STYLE_LABEL[foe.fightStyle || "brawler"];
        const sig = SIGNATURE_LABEL[foe.signature || "none"];
        setLabel(this, "LabTitle", gameText("BattleViewComp_009"));
        setLabel(this, "LabPlayerName", `${me.name} · ${pLabel}`);
        setLabel(this, "LabEnemyName", sig ? `${foe.name} · ${eLabel} ${sig}` : `${foe.name} · ${eLabel}`);
        setLabel(this, "LabLog", `${eLabel} vs ${pLabel}`);
        const layer = this.getNode("DanmakuLayer");
        if (layer) this.danmaku = new BattleDanmaku(layer,
            new DanmakuPool(encounter === "warmup" ? "warmup" : run.phase === "boss" ? "boss" : "official", foe.danmakuGroup || "common"));

        const playerPortrait = await spawnChicken(this, "PlayerPortrait", run.appearance, 0.76, true);
        playerPortrait?.setPosition(33.6, -128.6, 0);
        const enemyPortrait = await spawnChicken(this, "EnemyPortrait", foe.appearance, 1, true);
        const art = enemyPortrait?.getChildByName("Illustration")?.getComponent(UITransform);
        if (enemyPortrait && art) {
            // Head framing is proportional to each illustration, independent of whole-body height.
            const id = foe.appearance.illustration || "";
            const heads: Record<string, [number, number, number, number]> = {
                warmup_1: [0.34, 0.17, 0.4, 0.28],
                warmup_2: [0.33, 0.18, 0.38, 0.3],
                warmup_3: [0.29, 0.16, 0.38, 0.28],
                warmup_4: [0.3, 0.19, 0.4, 0.33],
                warmup_5: [0.31, 0.17, 0.4, 0.3],
                warmup_6: [0.3, 0.18, 0.4, 0.3],
                warmup_7: [0.29, 0.15, 0.38, 0.26],
                warmup_8: [0.32, 0.16, 0.36, 0.28],
                warmup_9: [0.3, 0.14, 0.36, 0.26],
                warmup_10: [0.32, 0.18, 0.42, 0.3],
                warmup_11: [0.32, 0.18, 0.4, 0.3],
                warmup_12: [0.3, 0.19, 0.4, 0.32],
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
            this.playerNode.setPosition(pHome);
        }
        if (arena && this.enemyNode) {
            this.enemyNode.parent = arena;
            this.enemyNode.setPosition(eHome);
        }
        // 必须等 spawnChicken 建完再造 Actor：它会记下各部位此刻的位置当复位基准，
        // 而强化撑大部位时连带把位置挪过，倒过来建的话复位就会把强化的体型抹平。
        if (this.playerNode) this.playerActor = new ChickenActor(this.playerNode, pHome, me.fightStyle || "brawler", mood);
        if (this.enemyNode) this.enemyActor = new ChickenActor(this.enemyNode, eHome, foe.fightStyle || "brawler", mood);
        await Promise.all([this.playerActor?.warmupSheets(), this.enemyActor?.warmupSheets()].filter(Boolean));

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
        if (this.closed) return;
        const frames = await Promise.all(["cartoon_feather", "cartoon_blood_drop", "cartoon_blood_splash"].map(name =>
            this.load("bundle", `game/texture/fx/${name}/spriteFrame`, SpriteFrame)));
        if (this.closed) return;
        const fxLayer = this.getNode("FxLayer");
        if (fxLayer && arena && frames.every(Boolean)) {
            const shadowY = this.playerNode?.getChildByName("Shadow")?.position.y ?? -205.5;
            const floorY = P_HOME.y + shadowY * Math.abs(this.playerNode?.scale.y ?? 0.9);
            this.impact = new BattleImpact(fxLayer, frames as SpriteFrame[], arena, floorY);
        }
        this.screenEffects = new BattleScreenEffects(this.node, oops.gui.camera);
        const fxKeys = ["comic_slash", "comic_star", "shock_ring", "speed_line", "focus_burst", "ground_crack", "ink_burst", "charge_ring"] as const;
        const skillKeys = ["peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"] as const;
        const fxFrames = await Promise.all(fxKeys.map(async name => {
            try {
                return await this.load("bundle", `game/texture/fx/${name}/spriteFrame`, SpriteFrame);
            }
            catch {
                return null;
            }
        }));
        const skillPrefabs = await Promise.all(skillKeys.map(async name => {
            try {
                return await this.load("bundle", PREFAB_PATH.skillFull(name), Prefab);
            }
            catch {
                return null;
            }
        }));
        const skillMiniPrefabs = await Promise.all(skillKeys.map(async name => {
            try {
                return await this.load("bundle", PREFAB_PATH.skillHalf(name), Prefab);
            }
            catch {
                return null;
            }
        }));
        if (this.closed) return;
        if (arena) {
            const fulls: Partial<Record<StrikeStyle, Prefab>> = {};
            const halves: Partial<Record<StrikeStyle, Prefab>> = {};
            skillKeys.forEach((key, i) => {
                if (skillPrefabs[i]) fulls[key] = skillPrefabs[i]!;
                if (skillMiniPrefabs[i]) halves[key] = skillMiniPrefabs[i]!;
            });
            this.fx = new BattleFx(this.node, arena, {
                slash: fxFrames[0] || undefined,
                star: fxFrames[1] || undefined,
                ring: fxFrames[2] || undefined,
                streak: fxFrames[3] || undefined,
                focus: fxFrames[4] || undefined,
                crack: fxFrames[5] || undefined,
                ink: fxFrames[6] || undefined,
                charge: fxFrames[7] || undefined,
                skillPrefabs: fulls,
                skillMiniPrefabs: halves
            });
            this.fx.paint(mood.dust);
            this.fx.wash(mood.veil, encounter === "final" || run.phase === "boss");
        }
        await this.playIntro();
        if (this.closed) return;
        this.playerActor?.stance();
        this.enemyActor?.stance();
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
        await this.spawnFx(PREFAB_PATH.fxStart, "player", gameText("BattleViewComp_010"), 0.55);
        this.trig("toCombat");
    }

    private onTick = (dt: number) => {
        if (this.closed || !this.running) return;
        for (const ev of this.session.tick(dt)) this.dispatch(ev);
        this.easeBars(dt);
        if (this.playerActor && this.enemyActor && this.playerNode && this.enemyNode) {
            const front = this.playerActor.home.y < this.enemyActor.home.y ? this.playerNode : this.enemyNode;
            const back = front === this.playerNode ? this.enemyNode : this.playerNode;
            if (front.getSiblingIndex() < back.getSiblingIndex()) front.setSiblingIndex(back.getSiblingIndex());
        }
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
            this.log(ev.side, gameText("BattleViewComp_011"));
        }
        else if (ev.type === "revive") {
            void this.spawnFx(PREFAB_PATH.fxHeal, ev.side, gameText("BattleViewComp_012"), 0.7);
            this.actor(ev.side)?.hop();
            this.screenEffects?.play(14, true);
            this.log(ev.side, gameText("BattleViewComp_013"));
        }
        else if (ev.type === "lock") {
            void this.spawnFx(PREFAB_PATH.fxSkill, ev.side, gameText("BattleViewComp_014"), 0.6);
            this.log(ev.side, gameText("BattleViewComp_015"));
        }
        else if (ev.type === "miss") {
            void this.spawnFx(PREFAB_PATH.fxHit, ev.side, gameText("BattleViewComp_016"), 0.4);
        }
        else if (ev.type === "dodge") {
            playGameEffect("wing");
            const who = this.actor(ev.side);
            const dir = ev.side === "player" ? -1 : 1;
            this.fx?.dodge(who, dir);
            who?.hop();
            void this.spawnFx(PREFAB_PATH.fxHit, ev.side, gameTextOr("BattleViewComp_025", "躲开了"), 0.45, 1.2);
            this.log(ev.side, gameTextOr("BattleViewComp_025", "躲开了"));
        }
        else if (ev.type === "clash") {
            playGameEffect("skill");
            this.playerActor?.bounce();
            this.enemyActor?.bounce();
            const a = this.playerNode?.worldPosition;
            const b = this.enemyNode?.worldPosition;
            if (a && b) {
                this.impact?.playClash((a.x + b.x) / 2, (a.y + b.y) / 2);
                this.fx?.clash((a.x + b.x) / 2, (a.y + b.y) / 2);
            }
            this.screenEffects?.play(18, true, false, ev.winner === "player" ? 1 : -1);
            this.log(ev.winner, gameTextOr("BattleViewComp_024", "对撞！"));
        }
        else if (ev.type === "rage") {
            playGameEffect("critical");
            const who = this.actor(ev.side);
            who?.pulse();
            this.fx?.rage(who);
            this.screenEffects?.play(12, true, false, ev.side === "player" ? 1 : -1);
            this.log(ev.side, gameTextOr("BattleViewComp_026", "红眼了！"));
        }
        else if (ev.type === "enrage") {
            playGameEffect("skill");
            const who = this.actor(ev.side);
            who?.pulse();
            this.fx?.enrage(who);
            this.screenEffects?.play(14, true, false, -1);
            this.log(ev.side, gameTextOr("BattleViewComp_027", "暴走！"));
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
        this.skillOf[side] = skill;
        this.log(side, skill ? gameText("BattleViewComp_017", STYLE_TEXT[style]) : BASIC_TEXT[style]);
        if (skill) {
            const title = gameText("BattleViewComp_017", STYLE_TEXT[style]);
            const mode = side === "enemy" ? "half" : "full";
            this.fx?.skillWindup(self, style, title, side === "enemy", mode);
            void this.spawnFx(PREFAB_PATH.fxSkill, side, title, 0.45, 1.15);
        }
        else {
            this.fx?.basicWindup(self, style, side === "enemy");
        }
        await self.strike(foe, style, (hit) => {
            this.applyResult(this.session.resolveStrike(side, hit));
        });
    }

    private applyResult(evs: BattleEvent[]) {
        for (const ev of evs) this.dispatch(ev);
    }

    private onHit(from: BattleSide, to: BattleSide, dmg: number, crit: boolean) {
        const style = this.styleOf[from];
        const heavy = this.skillOf[from] || style === "leap" || style === "charge" || style === "dive";
        const source = this.chicken(from);
        const target = this.chicken(to);
        const direction = source && target && source.worldPosition.x !== target.worldPosition.x
            ? Math.sign(target.worldPosition.x - source.worldPosition.x) : from === "player" ? 1 : -1;
        playGameEffect(crit ? "critical" : style === "peck" || style === "combo" ? "peck"
            : style === "dive" || style === "charge" ? "wing" : style === "leap" ? "skill" : "hit");
        this.actor(to)?.flinch(crit ? 1.65 : heavy ? 1.3 : 1, direction);
        if (target) {
            this.impact?.play(target, direction, heavy, crit, this.featherColors[to], this.actor(to)?.home.y);
            const p = target.worldPosition;
            this.fx?.hit(p.x, p.y, direction, style, heavy, crit);
        }
        void this.spawnFx(
            crit ? PREFAB_PATH.fxSkill : PREFAB_PATH.fxHit, to,
            crit ? gameText("BattleViewComp_018", dmg) : `-${dmg}`,
            crit ? 0.8 : 0.6, crit ? 1.65 : heavy ? 1.25 : 1.1
        );
        // 整只砸下来和啄一口不该抖得一样重，按招式给个底，暴击再往上加。
        this.screenEffects?.play(HIT_QUAKE[style] + (crit ? 11 : heavy ? 4 : 2), heavy, crit, direction);
        if (crit) this.log(to === "player" ? "enemy" : "player", gameText("BattleViewComp_019"));
        this.refreshHp(false);
    }

    private async finish(win: boolean) {
        if (!this.running) return;
        this.running = false;
        this.danmaku?.clear();
        playGameEffect(win ? "win" : "lose");
        this.stopTick();
        this.fx?.finish(win);
        this.trig(win ? "toWin" : "toLose");
        this.ent.run.settle(win);
        if (win) preloadResultSuitGif(this, this.ent.run.playerFighter().appearance);
        setLabel(this, "LabLog", win ? gameText("BattleViewComp_020") : gameText("BattleViewComp_021"));
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
        this.screenEffects?.clear();
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

    private log(side: BattleSide, word: string) {
        setLabel(this, "LabLog", `${side === "player" ? gameText("BattleViewComp_022") : gameText("BattleViewComp_023")} ${word}`);
        this.logLeft = LOG_HOLD;
    }

    /**
     * 飘字挂在 FxLayer 而不是鸡身上：鸡一直在跑，挂它身上字会跟着满场飞。
     */
    private async spawnFx(path: string, side: BattleSide, text: string, life: number, scale = 1) {
        const layer = this.getNode("FxLayer") || this.node;
        const src = this.chicken(side);
        const box = layer.getComponent(UITransform);
        const origin = src && box ? box.convertToNodeSpaceAR(src.worldPosition) : null;
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
        // 出手很密，飘字全落同一点会糊成一坨，左右撒开一些。
        const jitter = (Math.random() - 0.5) * 56;
        if (origin) {
            node.setPosition(origin.x + jitter, origin.y + 96, 0);
        }
        else {
            node.setPosition(jitter, side === "player" ? -160 : 160, 0);
        }
        if (scale !== 1) node.setScale(scale, scale, 1);
        if (path === PREFAB_PATH.fxHit || path === PREFAB_PATH.fxSkill) {
            node.setScale(scale * 0.55, scale * 0.55, 1);
            tween(node).to(0.055, { scale: v3(scale * 1.25, scale * 1.25, 1) }, { easing: "quadOut" })
                .to(0.1, { scale: v3(scale, scale, 1) }).start();
        }
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
        this.fx?.clear();
        this.screenEffects?.clear();
        this.impact?.clear();
        this.danmaku?.clear();
        this.running = false;
        this.stopTick();
        this.playerActor?.stopRoam();
        this.enemyActor?.stopRoam();
        this.node.destroy();
    }
}

registerScreen("battle", BattleViewComp);
