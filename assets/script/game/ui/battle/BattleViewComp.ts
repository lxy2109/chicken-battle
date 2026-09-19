import { gameText, gameTextOr } from "../../domain/GameConfig";
import { Color, JsonAsset, Label, Node, ParticleSystem2D, Prefab, Sprite, SpriteFrame, UIOpacity, UITransform, Vec2, Vec3, _decorator, tween, v3 } from "cc";
import { oops } from "db://oops-framework/core/Oops";
import { gui } from "db://oops-framework/core/gui/Gui";
import { LayerType } from "db://oops-framework/core/gui/layer/LayerEnum";
import { ecs } from "db://oops-framework/libs/ecs/ECS";
import { GameUIBase } from "../../shared/GameUIBase";
import { BattleAnimPlayer } from "../../battle/BattleAnimPlayer";
import { BattleAnimator } from "../../battle/BattleAnimator";
import { BattleBrain } from "../../battle/BattleBrain";
import { ChickenActor } from "../../battle/ChickenActor";
import { ChickenRun } from "../../run/ChickenRun";
import { FX_TEX, PREFAB_PATH } from "../../domain/Catalog";
import { BattleSession } from "../../domain/BattleSession";
import { DanmakuPool } from "../../domain/Danmaku";
import { BattleDanmaku } from "./BattleDanmaku";
import { AmbientKind, BattleFx, strikeFxColor } from "./BattleFx";
import { BattleImpact } from "./BattleImpact";
import { BattleScreenEffects } from "./BattleScreenEffects";
import { BattleSkillBar } from "./BattleSkillBar";
import { BattleTapBoost } from "./BattleTapBoost";
import { SIGNATURE_LABEL, STYLE_LABEL, stageMood, styleRhythm } from "../../domain/BattleStyle";
import { resetBattlePace } from "../../domain/BattlePace";
import { BattleEvent, BattleSide, StrikeStyle } from "../../domain/Types";
import { spawnChicken } from "../shared/ChickenBinder";
import { goScreen, registerScreen } from "../shared/Nav";
import { preloadResultSuitGif } from "../shared/SlotVideo";
import { bindNodeClick, hexColor, setLabel } from "../shared/UiUtil";
import { playGameEffect, playSkillAnnounce } from "../shared/GameAudio";

const { ccclass, executionOrder } = _decorator;

/** 手动发弹幕冷却（秒）。 */
const DANMAKU_FIRE_CD = 1;

/** 与 battle.prefab 里 PlayerSlot / EnemySlot 的落点保持一致。 */
const P_HOME = new Vec3(-160, -76, 0);
const E_HOME = new Vec3(160, -76, 0);
/** 血条追赶实际血量的速度，越大越跟手。 */
const BAR_EASE = 8;
const LOG_HOLD = 1.6;
/** 血条：正常蓝 → 偏低橙 → 极低红。 */
const BAR_BLUE = new Color(62, 168, 255, 255);
const BAR_ORANGE = new Color(255, 156, 42, 255);
const BAR_RED = new Color(255, 64, 48, 255);
const BAR_ORANGE_HP = 0.5;
const BAR_RED_HP = 0.22;

/**
 * 局内飘字颜色：不同效果一眼能分清。
 * 普攻红 / 重击橙 / 绝招跟招式色 / 暴击金 / 治疗绿 / 闪避青 / 落空灰。
 */
const FLOAT_TINT = {
    hit: new Color(255, 88, 68, 255),
    heavy: new Color(255, 148, 48, 255),
    skill: new Color(120, 168, 255, 255),
    crit: new Color(255, 214, 48, 255),
    heal: new Color(64, 236, 128, 255),
    revive: new Color(90, 255, 196, 255),
    miss: new Color(168, 172, 180, 255),
    dodge: new Color(80, 210, 255, 255),
    lock: new Color(255, 186, 72, 255),
    cast: new Color(255, 228, 120, 255),
    start: new Color(255, 242, 170, 255),
    taunt: new Color(255, 245, 220, 255)
} as const;

type FloatKind = keyof typeof FLOAT_TINT;

/** 绝招战报 / 场上飘字用的招式名。 */
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
 * 普攻演出各跑各的，场上可以两只鸡同时扑上去；绝招在场上蓄力→冲刺→命中，逻辑层仍错开绝招以免叠音。
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
    /** 手动弹幕可再次点击的时间戳（ms）。 */
    private danmakuReadyAt = 0;
    private danmakuBtn?: Node;
    private danmakuBtnLab?: Label;
    private impact?: BattleImpact;
    private screenEffects?: BattleScreenEffects;
    private fx?: BattleFx;
    private skillBar?: BattleSkillBar;
    private tapBoost?: BattleTapBoost;
    private skillOf: Record<BattleSide, boolean> = { player: false, enemy: false };
    private featherColors: Record<BattleSide, string> = { player: "#fff0c0", enemy: "#fff0c0" };

    async start() {
        // 与 openRunView 的进战转圈衔接：场上鸡/特效/氛围预热完再关，避免空场顿一下。
        oops.gui.waitOpen();
        try {
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
            this.mountDanmakuBtn();

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
            const unlocked = run.unlockedSkills();
            this.session = new BattleSession(
                me, foe, run.rng().int(1, 999999), run.phase === "boss",
                (self, opponent) => brain.think(self, opponent),
                { playerManualSkills: true, playerSkills: unlocked }
            );
            this.anim = this.node.getComponent(BattleAnimator) || this.node.addComponent(BattleAnimator);
            const json = await this.load("bundle", "game/animator/chicken_battle", JsonAsset);
            if (this.playerNode) this.playerAnim.attach(this.anim, this.playerNode);
            if (json) this.anim.initWithJson(json.json, this.playerAnim);

            this.refreshHp(true);
            if (this.closed) return;
            const stampFrame = async (name: string) => {
                try {
                    return await this.load("bundle", `game/image/texture/stamp/${name}/spriteFrame`, SpriteFrame);
                }
                catch {
                    return null;
                }
            };
            const featherSf = await stampFrame("cartoon_feather");
            const splashSf = await stampFrame("cartoon_blood_splash");
            if (this.closed) return;
            this.screenEffects = new BattleScreenEffects(this.node, oops.gui.camera);
            const fxKeys = ["comic_slash", "comic_star", "shock_ring", "speed_line", "focus_burst", "ground_crack", "ink_burst", "charge_ring"] as const;
            const fxFrames = await Promise.all(fxKeys.map(name => stampFrame(name)));
            const impactPrefab = await this.load("bundle", PREFAB_PATH.fxImpact, Prefab).catch(() => null);
            const clashPrefab = await this.load("bundle", PREFAB_PATH.fxClash, Prefab).catch(() => null);
            const fxLayer = this.getNode("FxLayer");
            if (fxLayer && arena) {
                const shadowY = this.playerNode?.getChildByName("Shadow")?.position.y ?? -205.5;
                const floorY = P_HOME.y + shadowY * Math.abs(this.playerNode?.scale.y ?? 0.9);
                this.impact = new BattleImpact(fxLayer, impactPrefab, clashPrefab, arena, floorY, {
                    splash: splashSf,
                    feather: featherSf
                });
            }
            const ambientKinds: AmbientKind[] = ["rain", "leaf", "dust", "grain", "incense", "ember", "ash", "mist"];
            const ambientPrefabList = await Promise.all(ambientKinds.map(async kind => {
                try {
                    return await this.load("bundle", PREFAB_PATH.fxAmbient(kind), Prefab);
                }
                catch {
                    return null;
                }
            }));
            if (this.closed) return;
            if (arena) {
                // 绝招：场上粒子 + 小印记图；招名靠飘字 + 喊招音效。
                const ambientPrefabs: Partial<Record<AmbientKind, Prefab>> = {};
                ambientKinds.forEach((kind, i) => {
                    if (ambientPrefabList[i]) ambientPrefabs[kind] = ambientPrefabList[i]!;
                });
                const skillStyles: StrikeStyle[] = ["peck", "jump", "dive", "leap", "charge", "tail", "combo", "feint"];
                const skillMarkList = await Promise.all(skillStyles.map(async style => {
                    try {
                        return await this.load("bundle", FX_TEX.skill(`skill_mini_${style}`), SpriteFrame);
                    }
                    catch {
                        return null;
                    }
                }));
                const skillMarks: Partial<Record<StrikeStyle, SpriteFrame>> = {};
                skillStyles.forEach((style, i) => {
                    if (skillMarkList[i]) skillMarks[style] = skillMarkList[i]!;
                });
                const loadCommon = async (name: string) => {
                    try {
                        return await this.load("bundle", FX_TEX.common(name), SpriteFrame);
                    }
                    catch {
                        return null;
                    }
                };
                const skillSpark = await loadCommon("particle_skill_spark");
                const skillPuff = await loadCommon("particle_skill_puff");
                if (this.closed) return;
                this.fx = new BattleFx(this.node, arena, {
                    slash: fxFrames[0] || undefined,
                    star: fxFrames[1] || undefined,
                    ring: fxFrames[2] || undefined,
                    streak: fxFrames[3] || undefined,
                    focus: fxFrames[4] || undefined,
                    crack: fxFrames[5] || undefined,
                    ink: fxFrames[6] || undefined,
                    charge: fxFrames[7] || undefined,
                    ambientPrefabs,
                    skillMarks,
                    skillSpark: skillSpark || undefined,
                    skillPuff: skillPuff || undefined
                });
                this.fx.paint(mood.dust);
                // 地图底味 + BOSS/决战叠加全屏氛围（雨/灰烬），不再铺贴边黄框。
                const layers: Array<{ kind: AmbientKind; weight: number }> = [
                    { kind: mood.flourish, weight: run.phase === "boss" || encounter === "final" ? 0.55 : 1 }
                ];
                if (run.phase === "boss") layers.push({ kind: "rain", weight: 1 });
                if (encounter === "final") layers.push({ kind: "ash", weight: 0.85 }, { kind: "ember", weight: 0.5 });
                if (mapId === 2 && run.phase !== "boss") layers.push({ kind: "mist", weight: 0.35 });
                this.fx.ambience(layers);
            }
            this.skillBar = new BattleSkillBar(this, this.node);
            await this.skillBar.mount(unlocked, style => this.onCastSkill(style));
            if (this.closed) return;
            this.skillBar.tick(this.session);
            this.skillBar.raise();
            this.tapBoost = new BattleTapBoost(this.node);
        } finally {
            oops.gui.waitClose();
        }
        if (this.closed) return;
        await this.playIntro();
        if (this.closed) return;
        this.playerActor?.stance();
        this.enemyActor?.stance();
        this.playerActor?.startRoam();
        this.enemyActor?.startRoam();
        this.session.beginCombat();
        this.tapBoost?.mount();
        this.skillBar?.raise();
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
            void this.spawnFx(PREFAB_PATH.taunt, ev.side, ev.text, 1.1, 1, "taunt");
            if (i < taunts.length - 1) await this.wait(0.3);
        }
        await this.wait(0.95);
        if (this.closed) return;
        this.trig("toStart");
        playGameEffect("start");
        // 开战提示：场中央大字，比普通飘字更醒目、停留更久。
        await this.spawnFx(PREFAB_PATH.fxStart, "player", gameText("BattleViewComp_010"), 0.9, 1.35, "start");
        this.trig("toCombat");
    }

    private onTick = (dt: number) => {
        if (this.closed || !this.running) return;
        // 圆圈用真实时间生成/收缩；战斗逻辑与血条追赶跟加速倍率走。
        this.tapBoost?.tick(dt);
        const pace = this.tapBoost?.speedMul() ?? 1;
        const step = dt * pace;
        for (const ev of this.session.tick(step)) this.dispatch(ev);
        this.skillBar?.tick(this.session);
        this.easeBars(step);
        if (this.playerActor && this.enemyActor && this.playerNode && this.enemyNode) {
            const front = this.playerActor.home.y < this.enemyActor.home.y ? this.playerNode : this.enemyNode;
            const back = front === this.playerNode ? this.enemyNode : this.playerNode;
            if (front.getSiblingIndex() < back.getSiblingIndex()) front.setSiblingIndex(back.getSiblingIndex());
        }
        this.danmaku?.tick(dt, this.session.hp("player") <= this.session.maxHp("player") / 2
            || this.session.hp("enemy") <= this.session.maxHp("enemy") / 2);
        if (this.danmakuReadyAt > 0) this.refreshDanmakuBtn();
        this.fx?.tickAmbient(dt);
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
            void this.spawnFx(PREFAB_PATH.fxHeal, ev.side, `+${ev.amount}`, 0.5, 1, "heal");
            this.log(ev.side, gameText("BattleViewComp_011"));
        }
        else if (ev.type === "revive") {
            void this.spawnFx(PREFAB_PATH.fxHeal, ev.side, gameText("BattleViewComp_012"), 0.7, 1.15, "revive");
            this.actor(ev.side)?.hop();
            this.screenEffects?.play(14, true);
            this.log(ev.side, gameText("BattleViewComp_013"));
        }
        else if (ev.type === "lock") {
            void this.spawnFx(PREFAB_PATH.fxSkill, ev.side, gameText("BattleViewComp_014"), 0.6, 1, "lock");
            this.log(ev.side, gameText("BattleViewComp_015"));
        }
        else if (ev.type === "miss") {
            void this.spawnFx(PREFAB_PATH.fxHit, ev.side, gameText("BattleViewComp_016"), 0.4, 1, "miss");
        }
        else if (ev.type === "dodge") {
            playGameEffect("wing");
            const who = this.actor(ev.side);
            const dir = ev.side === "player" ? -1 : 1;
            this.fx?.dodge(who, dir);
            who?.hop();
            void this.spawnFx(PREFAB_PATH.fxHit, ev.side, gameTextOr("BattleViewComp_025", "躲开了"), 0.45, 1.2, "dodge");
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

    private onCastSkill(style: StrikeStyle) {
        if (this.closed || !this.running) return;
        for (const ev of this.session.requestSkill(style)) this.dispatch(ev);
        this.skillBar?.tick(this.session);
    }

    private mountDanmakuBtn() {
        const node = this.getNode("BtnDanmaku");
        const labNode = this.getNode("BtnDanmakuLab") || node?.getChildByName("BtnDanmakuLab");
        if (!node || !labNode) return;
        const lab = labNode.getComponent(Label);
        if (!lab) return;
        this.danmakuBtn = node;
        this.danmakuBtnLab = lab;
        this.danmakuReadyAt = 0;
        node.active = true;
        this.refreshDanmakuBtn();
        bindNodeClick(node, () => this.onFireDanmaku(), this);
    }

    private onFireDanmaku() {
        if (this.closed || !this.running || !this.danmaku || Date.now() < this.danmakuReadyAt) return;
        if (!this.danmaku.fire()) return;
        this.danmakuReadyAt = Date.now() + DANMAKU_FIRE_CD * 1000;
        this.refreshDanmakuBtn();
    }

    private refreshDanmakuBtn() {
        const btn = this.danmakuBtn;
        const lab = this.danmakuBtnLab;
        if (!btn?.isValid || !lab?.isValid) return;
        const remain = Math.max(0, (this.danmakuReadyAt - Date.now()) / 1000);
        const ready = remain <= 0;
        if (ready) this.danmakuReadyAt = 0;
        lab.string = ready
            ? gameTextOr("BattleViewComp_028", "发送弹幕")
            : `${Math.ceil(remain)}`;
        lab.color = ready ? hexColor("#FFFAEC") : hexColor("#B0A898");
        const opacity = btn.getComponent(UIOpacity) || btn.addComponent(UIOpacity);
        opacity.opacity = ready ? 255 : 170;
    }

    /**
     * 一次出招的完整演出。命中判定交给碰撞，结果回给逻辑层结算。
     *
     * 绝招全在场上走完，不再全屏/半屏立绘打断：
     * 1) 蓄力圈 + 镜头推近 + 鸡蹲蓄 + 招名飘字/喊招音
     * 2) 立刻冲刺出手，速度线叠在鸡身上
     * 3) 命中顿帧/震屏/斩痕接在同一条视觉线上
     */
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
            const fromRight = side === "enemy";
            playGameEffect("skill");
            playSkillAnnounce(style);
            this.fx?.skillCharge(self, style);
            this.screenEffects?.skillCast(side === "player" ? 1 : -1, true);
            self.pulse();
            // 招名贴在出手鸡上方，不挡场地中间；字色跟招式主色。
            void this.spawnFx(PREFAB_PATH.fxSkill, side, title, 0.7, 1.35, "cast", strikeFxColor(style));
            await self.prepareSkill(style);
            if (this.closed) return;
            this.fx?.skillLaunch(self, style, fromRight);
        }
        else {
            this.fx?.basicWindup(self, style, side === "enemy");
        }
        await self.strike(foe, style, (hit) => {
            this.applyResult(this.session.resolveStrike(side, hit));
        }, skill);
    }

    private applyResult(evs: BattleEvent[]) {
        for (const ev of evs) this.dispatch(ev);
    }

    private onHit(from: BattleSide, to: BattleSide, dmg: number, crit: boolean) {
        const style = this.styleOf[from];
        const skill = this.skillOf[from];
        const heavy = skill || style === "leap" || style === "charge" || style === "dive";
        const source = this.chicken(from);
        const target = this.chicken(to);
        const direction = source && target && source.worldPosition.x !== target.worldPosition.x
            ? Math.sign(target.worldPosition.x - source.worldPosition.x) : from === "player" ? 1 : -1;
        playGameEffect(crit ? "critical" : skill ? "skill" : style === "peck" || style === "combo" ? "peck"
            : style === "dive" || style === "charge" ? "wing" : style === "leap" ? "skill" : "hit");
        this.actor(to)?.flinch(crit ? 1.75 : skill ? 1.55 : heavy ? 1.3 : 1, direction);
        if (target) {
            this.impact?.play(target, direction, heavy || skill, crit, this.featherColors[to], this.actor(to)?.home.y, skill);
            const p = target.worldPosition;
            this.fx?.hit(p.x, p.y, direction, style, heavy, crit, skill);
        }
        const floatKind: FloatKind = crit ? "crit" : skill ? "skill" : heavy ? "heavy" : "hit";
        const floatTint = crit ? FLOAT_TINT.crit
            : skill ? strikeFxColor(style)
            : FLOAT_TINT[floatKind];
        void this.spawnFx(
            crit || skill ? PREFAB_PATH.fxSkill : PREFAB_PATH.fxHit, to,
            crit ? gameText("BattleViewComp_018", dmg) : `-${dmg}`,
            crit ? 0.85 : skill ? 0.78 : 0.6,
            crit ? 1.7 : skill ? 1.55 : heavy ? 1.25 : 1.1,
            floatKind,
            floatTint
        );
        // 绝招没有立绘抢戏，命中震幅再抬一档，让“打中”成为主反馈。
        const quake = HIT_QUAKE[style] + (crit ? 12 : skill ? 11 : heavy ? 4 : 2);
        this.screenEffects?.play(quake, heavy || skill, crit || skill, direction);
        if (crit) this.log(to === "player" ? "enemy" : "player", gameText("BattleViewComp_019"));
        this.refreshHp(false);
    }

    private async finish(win: boolean) {
        if (!this.running) return;
        this.running = false;
        this.tapBoost?.clear();
        this.tapBoost = undefined;
        resetBattlePace();
        this.danmaku?.clear();
        if (this.danmakuBtn?.isValid) this.danmakuBtn.active = false;
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
        if (!sp) return;
        const r = Math.max(0, Math.min(1, ratio));
        sp.fillRange = r;
        sp.color = r > BAR_ORANGE_HP ? BAR_BLUE : r > BAR_RED_HP ? BAR_ORANGE : BAR_RED;
    }

    private log(side: BattleSide, word: string) {
        setLabel(this, "LabLog", `${side === "player" ? gameText("BattleViewComp_022") : gameText("BattleViewComp_023")} ${word}`);
        this.logLeft = LOG_HOLD;
    }

    /**
     * 飘字挂在 FxLayer 而不是鸡身上：鸡一直在跑，挂它身上字会跟着满场飞。
     * tint / kind 决定字色与粒子色，区分普攻、暴击、绝招、治疗等。
     */
    private async spawnFx(
        path: string,
        side: BattleSide,
        text: string,
        life: number,
        scale = 1,
        kind: FloatKind = "hit",
        tint?: Color
    ) {
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
        const isTaunt = kind === "taunt";
        const isStart = kind === "start";
        // 出手很密，飘字全落同一点会糊成一坨，左右撒开一些。
        // 挑衅气泡：往场内偏一点，少被左右裁切；抖动也更小。
        // 开战提示：场中央，不跟某只鸡走。
        if (isStart) {
            node.setPosition(0, 48, 0);
        }
        else {
            const jitter = (Math.random() - 0.5) * (isTaunt ? 24 : 56);
            const sideBias = isTaunt ? (side === "player" ? 48 : -48) : 0;
            const lift = isTaunt ? 118 : 96;
            if (origin) {
                node.setPosition(origin.x + sideBias + jitter, origin.y + lift, 0);
            }
            else {
                node.setPosition(sideBias + jitter, side === "player" ? -160 : 160, 0);
            }
        }
        // 挑衅气泡不额外放大，避免宽气泡出屏；命中/开战仍可缩放。
        if (!isTaunt && scale !== 1) node.setScale(scale, scale, 1);
        if (path === PREFAB_PATH.fxHit || path === PREFAB_PATH.fxSkill) {
            node.setScale(scale * 0.55, scale * 0.55, 1);
            tween(node).to(0.055, { scale: v3(scale * 1.25, scale * 1.25, 1) }, { easing: "quadOut" })
                .to(0.1, { scale: v3(scale, scale, 1) }).start();
        }
        else if (isStart) {
            const punch = scale;
            node.setScale(punch * 0.45, punch * 0.45, 1);
            tween(node).to(0.1, { scale: v3(punch * 1.18, punch * 1.18, 1) }, { easing: "backOut" })
                .to(0.12, { scale: v3(punch, punch, 1) }, { easing: "quadOut" }).start();
        }
        // 白底气泡必须用深色字；奶油色飘字叠在气泡上会几乎看不见。
        const color = isTaunt ? new Color(52, 34, 18, 255) : (tint || FLOAT_TINT[kind]);
        const lab = node.getComponentInChildren(Label);
        if (lab) {
            lab.string = text;
            lab.color = color;
            if (isTaunt) {
                this.layoutTauntBubble(node, lab, text);
                lab.enableOutline = true;
                lab.outlineColor = new Color(255, 252, 245, 220);
                lab.outlineWidth = 2;
            }
            else if (isStart) {
                lab.fontSize = 84;
                lab.lineHeight = 96;
                lab.isBold = true;
                lab.overflow = Label.Overflow.SHRINK;
                lab.enableWrapText = false;
                lab.enableOutline = true;
                lab.outlineColor = new Color(48, 18, 6, 255);
                lab.outlineWidth = 8;
                lab.enableShadow = true;
                lab.shadowColor = new Color(0, 0, 0, 160);
                lab.shadowOffset = new Vec2(0, -4);
                lab.shadowBlur = 2;
                const labUt = lab.node.getComponent(UITransform);
                labUt?.setContentSize(440, 120);
                const rootUt = node.getComponent(UITransform);
                rootUt?.setContentSize(480, 200);
            }
            else if (kind === "crit" || kind === "skill" || kind === "cast") {
                lab.enableOutline = true;
                lab.outlineColor = new Color(40, 18, 8, 255);
                lab.outlineWidth = kind === "crit" ? 4 : 3;
            }
            else if (kind === "miss" || kind === "dodge") {
                lab.enableOutline = true;
                lab.outlineColor = new Color(24, 28, 36, 220);
                lab.outlineWidth = 2;
            }
        }
        // 飘字预制体粒子：跟字同色，强制播一次
        for (const ps of node.getComponentsInChildren(ParticleSystem2D)) {
            ps.playOnLoad = false;
            ps.startColor = new Color(color.r, color.g, color.b, 255);
            ps.startColorVar = new Color(24, 24, 24, 30);
            ps.endColor = new Color(color.r, color.g, color.b, 0);
            ps.endColorVar = new Color(0, 0, 0, 0);
            if (kind === "crit") {
                ps.startSize *= 1.25;
                ps.endSize *= 1.2;
                ps.speed *= 1.15;
            }
            else if (isStart) {
                ps.startSize *= 1.35;
                ps.endSize *= 1.25;
                ps.speed *= 1.2;
            }
            else if (kind === "heal" || kind === "revive") {
                ps.gravity = new Vec2(ps.gravity.x, Math.max(ps.gravity.y, 40));
            }
            else if (kind === "miss") {
                ps.startSize *= 0.75;
                ps.speed *= 0.7;
            }
            ps.resetSystem();
        }
        const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        // 挑衅气泡只轻微上浮；开战提示几乎不动，避免大字飘出视野中心。
        const rise = isStart ? 18 : isTaunt ? 28 : kind === "crit" ? 92 : kind === "heal" || kind === "revive" ? 84 : 70;
        // 夹紧时预留上浮空间，动画结束仍不裁切。
        if (isTaunt || isStart) this.clampFxInLayer(node, layer, rise);
        tween(node).by(life, { position: v3(0, rise, 0) }).start();
        tween(op).delay(life * (isStart ? 0.62 : 0.55)).to(life * (isStart ? 0.38 : 0.45), { opacity: 0 }).start();
        await this.wait(life);
        if (node.isValid) node.destroy();
    }

    /**
     * 按文案长短撑开气泡：九宫格拉伸，内边距避开描边和底部尖角，
     * 长句换行而不是 SHRINK 缩到看不清。
     */
    private layoutTauntBubble(root: Node, lab: Label, text: string) {
        const rootUt = root.getComponent(UITransform);
        const labUt = lab.node.getComponent(UITransform);
        if (!rootUt || !labUt) return;

        const PAD_X = 36;
        const PAD_TOP = 28;
        const PAD_BOTTOM = 44;
        const MAX_INNER = 300;
        const MIN_INNER = 140;
        const FONT = 24;
        const LINE = 30;

        lab.string = text;
        lab.fontSize = FONT;
        lab.lineHeight = LINE;
        lab.overflow = Label.Overflow.RESIZE_HEIGHT;
        lab.enableWrapText = true;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.isBold = true;

        // 中文约等于字号宽；短句收窄气泡，长句封顶后换行。
        const preferred = Math.ceil(text.length * FONT * 0.92);
        const innerW = Math.min(MAX_INNER, Math.max(MIN_INNER, preferred));
        labUt.setContentSize(innerW, LINE * 3);
        lab.updateRenderData(true);

        const textW = Math.max(innerW, labUt.contentSize.width);
        const textH = Math.max(LINE, labUt.contentSize.height);
        labUt.setContentSize(textW, textH);
        // 九宫格边约 50px，总高需明显大于 106，中间才有可写字的拉伸区。
        const bubbleW = Math.max(200, textW + PAD_X * 2);
        const bubbleH = Math.max(150, textH + PAD_TOP + PAD_BOTTOM);
        rootUt.setContentSize(bubbleW, bubbleH);
        // 尖角在底部，正文略偏上，落在白色主体里。
        lab.node.setPosition(0, (PAD_BOTTOM - PAD_TOP) * 0.5, 0);
    }

    /** 把特效节点夹在 FxLayer / 画布可见范围内，避免气泡被裁切。 */
    private clampFxInLayer(node: Node, layer: Node, riseReserve = 0) {
        const box = layer.getComponent(UITransform) || this.node.getComponent(UITransform);
        const ut = node.getComponent(UITransform);
        if (!box || !ut) return;
        const margin = 12;
        const hw = ut.width * Math.abs(node.scale.x) * 0.5;
        const hh = ut.height * Math.abs(node.scale.y) * 0.5;
        const halfW = box.width * 0.5;
        const halfH = box.height * 0.5;
        const maxX = Math.max(0, halfW - hw - margin);
        const maxY = Math.max(0, halfH - hh - margin - Math.max(0, riseReserve));
        const minY = -Math.max(0, halfH - hh - margin);
        const x = Math.max(-maxX, Math.min(maxX, node.position.x));
        const y = Math.max(minY, Math.min(maxY, node.position.y));
        if (x !== node.position.x || y !== node.position.y) {
            node.setPosition(x, y, node.position.z);
        }
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
        // 加速期间缩短局内等待，开场嘲讽等仍在 running 前调用，不受影响。
        const pace = this.running ? (this.tapBoost?.speedMul() ?? 1) : 1;
        return new Promise<void>((resolve) => this.scheduleOnce(() => resolve(), sec / Math.max(1, pace)));
    }

    private stopTick() {
        if (!this.ticking) return;
        this.ticking = false;
        this.unschedule(this.onTick);
    }

    reset() {
        this.closed = true;
        oops.gui.waitClose();
        this.tapBoost?.clear();
        this.tapBoost = undefined;
        resetBattlePace();
        this.skillBar?.clear();
        this.fx?.clear();
        this.screenEffects?.clear();
        this.impact?.clear();
        this.danmaku?.clear();
        this.danmakuBtn = undefined;
        this.danmakuBtnLab = undefined;
        this.danmakuReadyAt = 0;
        this.running = false;
        this.stopTick();
        this.playerActor?.stopRoam();
        this.enemyActor?.stopRoam();
        this.node.destroy();
    }
}

registerScreen("battle", BattleViewComp);
