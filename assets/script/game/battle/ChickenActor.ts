import { Color, Node, Sprite, Tween, UIOpacity, UITransform, tween, v3, Vec3 } from "cc";
import { ArenaMood, StyleRhythm, styleRhythm } from "../core/BattleStyle";
import { FightStyle, StrikeStyle } from "../core/Types";

/** 冲刺残影同时最多留几张，多了就像拖影糊成一片。 */
let ghosts = 0;

/** 位移用到的 easing 名。写成字面量是为了不依赖引擎导出的类型。 */
type Ease = "quadIn" | "quadOut";

/**
 * 一只鸡的演出控制器：踱步、冲刺、出招、受击、胜负姿态。
 *
 * 即时战斗下双方各跑各的，同一只鸡身上随时可能有新动作抢占旧动作。tween 被 stop 之后
 * 尾部的 call 不会执行，await 就会永远挂着，所以每个动作都领一个令牌：新动作开始时
 * 令牌递增并把旧动作挂起的 Promise 全部放行，旧动作发现令牌过期就自己退出。
 */
export class ChickenActor {
    readonly home: Vec3;
    private roaming = false;
    private patrolStep = 0;
    private sx: number;
    private sy: number;
    private token = 0;
    private waiters: Array<() => void> = [];
    /** 各部位的原始配色，受击闪红后要还原成它，不能拿当前色当基准。 */
    private tints: Array<{ sp: Sprite; base: Color }> = [];
    /**
     * 预制体里手调的休息姿态。动画只绕关节转、整只鸡位移，
     * 动完必须回到这里，不能把部件从身上甩出去。
     */
    private pose = new Map<Node, { pos: Vec3; scale: Vec3; angle: number; pivot: Vec3 }>();

    private rhythm: StyleRhythm;
    readonly style: FightStyle;
    /** 敌人是整图立绘时部位节点是关掉的，动作必须改整只/改 Illustration。 */
    private painted = false;

    constructor(readonly node: Node, home: Vec3, style: FightStyle = "brawler", private mood?: ArenaMood) {
        this.style = style;
        this.rhythm = styleRhythm(style);
        this.home = home.clone();
        this.sx = node.scale.x;
        this.sy = node.scale.y;
        this.painted = !!node.getChildByName("Illustration")?.active;
        for (const sp of node.getComponentsInChildren(Sprite)) {
            this.tints.push({ sp, base: sp.color.clone() });
        }
        const joints: Record<string, "top" | "bottom" | "shoulder"> = {
            Head: "bottom", Neck: "bottom",
            LegL: "top", LegR: "top",
            Wing: "shoulder", WingBack: "shoulder",
            Illustration: "bottom"
        };
        for (const c of node.children) this.remember(c, joints[c.name]);
    }

    /** 原地小幅踱步，等冷却时用。 */
    startRoam() {
        if (this.roaming) return;
        this.roaming = true;
        this.roamStep(this.begin());
    }

    stopRoam() {
        this.roaming = false;
        this.begin();
        this.resetPose();
    }

    /**
     * 冲向目标出一招，返回是否够着了。
     * 目标同时也在移动，所以每一步都重新朝它当前位置修正。
     *
     * onContact 在喙/脚真正碰到的那一帧回调，伤害要在这时结算才有打击感，
     * 收招和回位是之后的事，不该让对手多挨那半秒。所以它由各招式在接触瞬间自己叫，
     * 这里只负责兜底：一整套演完都没碰到，才补一个没打中。
     */
    async strike(target: Node, style: StrikeStyle, onContact?: (hit: boolean) => void): Promise<boolean> {
        this.roaming = false;
        const tk = this.begin();
        // begin 只是把旧动作的 tween 掐断，掐在哪一帧就停在哪一帧。上一招要是被抢占在
        // 半路，身子可能还压着、还反着，或者某个部位歪在偏移位上，得先收回原姿态再出手。
        this.resetPose();
        this.windup(style);
        let told = false;
        const contact = (hit: boolean) => {
            if (told) return;
            told = true;
            if (hit) this.contactJuice();
            if (onContact) onContact(hit);
        };

        const hit = await this.perform(target, style, tk, contact);
        contact(false);
        this.walkLegs(false, tk);
        if (this.alive(tk)) await this.retreat(tk);
        return hit;
    }

    private perform(target: Node, style: StrikeStyle, tk: number, contact: (hit: boolean) => void): Promise<boolean> {
        switch (style) {
            case "jump": return this.jumpMove(target, tk, contact);
            case "dive": return this.diveMove(target, tk, contact);
            case "leap": return this.leapMove(target, tk, contact);
            case "charge": return this.chargeMove(target, tk, contact);
            case "tail": return this.tailMove(target, tk, contact);
            case "combo": return this.comboMove(target, tk, contact);
            case "feint": return this.feintMove(target, tk, contact);
            default: return this.peckMove(target, tk, contact);
        }
    }

    //#region 招式

    /** 鸡啄米：先蹲再整只前扑。立绘没有头颈，身子前扑才看得出这一口。 */
    private async peckMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.walkLegs(true, tk);
        this.lean(18, 0.05);
        this.scaleTo(this.sx * 1.16, this.sy * 0.78, 0.06);
        const hit = await this.advance(target, tk, 130, this.dur(0.09));
        this.walkLegs(false, tk);
        if (!hit) return false;
        contact(true);
        await this.peck(tk, 0.22);
        return true;
    }

    /**
     * 金鸡独立：一路小跳着逼过去，落点上补一脚。
     * 每一步都走抛物线，连起来就是蹦过去的观感——以前是先抬一下再直线平移，
     * 那点抬升立刻被插值拉平，所以怎么看都不像跳。
     */
    private async jumpMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(4);
        this.tuckLegs(-30, 0.07, 0.16);
        this.scaleTo(this.sx * 0.8, this.sy * 1.24, 0.06);
        // 每跳压到 0.18 秒是有讲究的：出招期间逻辑层挂着 busy 不出新招，
        // 接触前的耗时一旦超过最快出手间隔 0.55 秒，演出就会反过来拖慢节奏，
        // 把速度堆上去的收益白白吃掉。下面几招的时长都是按这条线卡的。
        const hit = await this.advance(target, tk, 168, this.dur(0.18), this.lift(72), true);
        if (!hit) return false;
        contact(true);
        this.squash(tk, 1.38, 0.52);
        this.kick(tk);
        await this.delay(0.14, tk);
        return true;
    }

    /** 乌鸦坐飞鸡：先窜到高处，再压着身子一头扎下来。 */
    private async diveMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(7);
        this.tuckLegs(-24, 0.06, 0.2);
        const up = this.node.position.clone();
        up.y += this.lift(110);
        await this.ease(up, this.dur(0.14), "quadOut", tk);
        this.lean(48, 0.06);
        this.scaleTo(this.sx * 0.72, this.sy * 1.34, 0.08);
        const hit = await this.advance(target, tk, 220, this.dur(0.12), 0, true);
        this.node.angle = 0;
        this.scaleTo(this.sx, this.sy, 0.08);
        if (!hit) return false;
        contact(true);
        this.squash(tk, 1.42, 0.5);
        this.kick(tk);
        await this.delay(0.12, tk);
        return true;
    }

    /**
     * 天外飞鸡：原地窜起一大截，在最高点停一拍，再整只砸到对手头上。
     * 那一拍停顿是留给观众反应的，没有它就只是个高一点的乌鸦坐飞鸡。
     */
    private async leapMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(6);
        this.tuckLegs(-36, 0.08, 0.22);
        this.scaleTo(this.sx * 0.72, this.sy * 1.36, 0.12);
        const sky = this.node.position.clone();
        sky.y += this.lift(186);
        await this.ease(sky, this.dur(0.2), "quadOut", tk);
        this.lean(-16, 0.08);
        this.ghost(new Color(255, 240, 210));
        await this.delay(0.13, tk);
        if (!this.alive(tk) || !target.isValid) return false;
        this.lean(28, 0.08);
        this.scaleTo(this.sx * 0.84, this.sy * 1.22, 0.08);
        const onto = target.position.clone();
        onto.y += 44;
        await this.ease(onto, 0.15, "quadIn", tk);
        this.node.angle = 0;
        if (!this.hits(target)) return false;
        contact(true);
        this.squash(tk, 1.5, 0.46);
        this.tiltPart(this.child("LegL"), -28, 0.05, 0.18);
        this.tiltPart(this.child("LegR"), 22, 0.05, 0.18);
        this.tiltPart(this.artNode(), 18 * this.sign(), 0.05, 0.16);
        await this.delay(0.16, tk);
        return true;
    }

    /** 铁头功：压低身子贴地加速撞过去，撞实了自己也被弹开。 */
    private async chargeMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(8);
        this.squat(true, tk);
        this.lean(22, 0.06);
        this.ghost(this.ghostTint());
        this.ghost(this.ghostTint());
        const hit = await this.advance(target, tk, 250, this.dur(0.08), 0, true);
        if (!hit) {
            this.squat(false, tk);
            this.node.angle = 0;
            return false;
        }
        contact(true);
        this.squash(tk, 1.46, 0.5);
        await this.knockBack(tk, 70);
        this.squat(false, tk);
        this.node.angle = 0;
        return true;
    }

    /** 神龙摆尾：整只转一圈抽过去。立绘没有尾巴，转圈才看得出这一招。 */
    private async tailMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.walkLegs(true, tk);
        this.lean(-22, 0.06);
        this.scaleTo(this.sx * 0.88, this.sy * 1.16, 0.06);
        const hit = await this.advance(target, tk, 150, this.dur(0.09));
        this.walkLegs(false, tk);
        if (!hit) return false;
        contact(true);
        await this.sweep(tk);
        return true;
    }

    /** 连珠神啄：贴上去快啄三下，一下比一下猛，伤害仍然只结算一次。 */
    private async comboMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.walkLegs(true, tk);
        const hit = await this.advance(target, tk, 160, this.dur(0.08));
        this.walkLegs(false, tk);
        if (!hit) return false;
        contact(true);
        for (let i = 0; i < 3 && this.alive(tk); i++) {
            if (i > 0) this.ghost();
            await this.peck(tk, i === 2 ? 0.2 : 0.12, i === 2);
            if (i < 2 && this.alive(tk)) await this.nudge(tk, 22);
        }
        return true;
    }

    /** 金蝉脱壳：先虚晃一下把对手骗住，再绕到它另一侧偷一口。 */
    private async feintMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.lean(-22, 0.06);
        this.scaleTo(this.sx * 1.18, this.sy * 0.78, 0.06);
        this.tiltPart(this.child("Head"), -14 * this.sign(), 0.06, 0.1);
        this.tiltPart(this.artNode(), -16 * this.sign(), 0.06, 0.1);
        const bait = this.approach(target, 96);
        await this.ease(bait, this.dur(0.09), "quadOut", tk);
        this.ghost(this.ghostTint());
        await this.delay(0.06, tk);
        if (!this.alive(tk) || !target.isValid) return false;
        this.flap(4);
        await this.arcTo(this.behind(target), this.dur(0.24), this.lift(118), tk);
        const hit = await this.advance(target, tk, 150, this.dur(0.08));
        if (!hit) return false;
        contact(true);
        await this.peck(tk, 0.2);
        return true;
    }

    //#endregion

    /**
     * 一步步逼近目标，撞上就停。arc 大于零时每一步走抛物线，看着就是蹦过去。
     * 对手自己也在动，所以每步都重新朝它当下的位置修一次方向。
     */
    private async advance(target: Node, tk: number, step: number, dur: number, arc = 0, trail = false): Promise<boolean> {
        for (let i = 0; i < 10 && this.alive(tk); i++) {
            if (!target.isValid) return false;
            if (this.hits(target)) return true;
            if (trail) this.ghost();
            const next = this.approach(target, step);
            if (arc > 0) await this.arcTo(next, dur, arc, tk);
            else await this.moveTo(next, dur, tk);
        }
        return this.alive(tk) && target.isValid && this.hits(target);
    }

    /** 收招后换到下一片场地，双方继续追击，避免每次都退回前排。 */
    async retreat(tk = this.begin()) {
        if (!this.alive(tk)) return;
        const lanes = this.lanes();
        const lane = this.patrolStep++ % lanes.length;
        const centerX = lane % 2 === 0 ? -30 : 30;
        const spread = 90 + this.rhythm.gap * 0.18;
        this.home.set(centerX - this.sign() * (spread + Math.random() * 28),
            lanes[lane] + (Math.random() - 0.5) * 18, 0);
        this.walkLegs(true, tk);
        await this.moveTo(this.home.clone(), 0.32, tk);
        if (!this.alive(tk)) return;
        this.walkLegs(false, tk);
        this.resetPose();
        this.roaming = true;
        this.roamStep(tk);
    }

    /**
     * 对撞或被打断：掐掉当前出招，整只弹开。
     * 令牌递增后旧 strike 的 contact 兜底会发现已经告诉过结算层，不会重复扣血。
     */
    bounce(force = 1) {
        this.ghost();
        const tk = this.begin();
        this.resetPose();
        this.flinch(1.25 * force, -this.sign());
        return this.knockBack(tk, 56 * force).then(() => {
            if (!this.alive(tk)) return;
            this.roaming = true;
            this.roamStep(tk);
        });
    }

    /** 开场亮相：两秒内看出这只鸡的路数。 */
    stance() {
        const tk = this.token;
        if (this.style === "tank") {
            this.squat(true, tk);
            this.lean(8, 0.12);
        }
        else if (this.style === "swift") {
            this.ghost(this.ghostTint());
            this.ghost(this.ghostTint());
        }
        else if (this.style === "aerial") {
            this.flap(8);
            this.lean(-10, 0.1);
        }
        else if (this.style === "trickster") {
            this.lean(-18, 0.1);
            this.ghost(this.ghostTint());
        }
        else if (this.style === "berserker") {
            this.pulse();
        }
        else if (this.style === "medic") {
            this.flap(3);
        }
        else {
            this.lean(12, 0.1);
        }
    }

    /** 残血红眼或 Boss 暴走时的一抖，让观众看见节奏变了。 */
    pulse() {
        this.flap(3);
        this.tiltPart(this.child("Head"), 16 * this.sign(), 0.07, 0.16);
        this.tiltPart(this.child("Neck"), 6 * this.sign(), 0.07, 0.16);
        tween(this.node)
            .to(0.08, { scale: v3(this.sx * 1.12, this.sy * 1.12, 1) })
            .to(0.16, { scale: v3(this.sx, this.sy, 1) }, { easing: "backOut" })
            .start();
    }

    /**
     * 冲刺残影：把当前姿势印在原地，墨色剪影往后褪。
     * 不是光点，是整只鸡的剪影，看起来才像速度。
     */
    ghost(tint?: Color) {
        const parent = this.node.parent;
        if (!parent || !this.node.isValid || ghosts >= 8) return;
        const color = tint || this.ghostTint();
        const ghost = new Node("DashGhost");
        ghost.layer = this.node.layer;
        ghost.parent = parent;
        ghost.setPosition(this.node.position);
        ghost.setScale(this.node.scale);
        ghost.angle = this.node.angle;
        ghost.setSiblingIndex(Math.max(0, this.node.getSiblingIndex()));
        for (const sp of this.node.getComponentsInChildren(Sprite)) {
            if (!sp.spriteFrame || !sp.node.activeInHierarchy || sp.node.name === "Shadow") continue;
            const piece = new Node(sp.node.name);
            piece.layer = ghost.layer;
            piece.parent = ghost;
            const local = new Vec3();
            this.node.inverseTransformPoint(local, sp.node.worldPosition);
            piece.setPosition(local);
            piece.setScale(sp.node.scale);
            piece.angle = sp.node.angle;
            const box = sp.node.getComponent(UITransform);
            if (box) piece.addComponent(UITransform).setContentSize(box.contentSize);
            const copy = piece.addComponent(Sprite);
            copy.sizeMode = Sprite.SizeMode.CUSTOM;
            copy.spriteFrame = sp.spriteFrame;
            copy.color = color;
        }
        ghosts += 1;
        const op = ghost.addComponent(UIOpacity);
        op.opacity = 170;
        tween(op).to(0.16, { opacity: 0 }).call(() => {
            ghosts = Math.max(0, ghosts - 1);
            if (ghost.isValid) ghost.destroy();
        }).start();
    }

    /** 整只染成一色再褪回去，技能起手和红眼用。 */
    flash(color: Color, sec = 0.12) {
        for (const t of this.tints) {
            if (!t.sp.isValid) continue;
            Tween.stopAllByTarget(t.sp);
            t.sp.color = color;
            tween(t.sp).delay(sec * 0.35).to(sec * 0.65, { color: t.base.clone() }).start();
        }
    }

    private ghostTint() {
        const [r, g, b] = this.rhythm.ghost;
        const m = this.mood?.ghost;
        if (!m) return new Color(r, g, b);
        return new Color(
            Math.round(r * 0.4 + m[0] * 0.6),
            Math.round(g * 0.4 + m[1] * 0.6),
            Math.round(b * 0.4 + m[2] * 0.6)
        );
    }

    private artNode(): Node | null {
        if (!this.painted) return null;
        const n = this.child("Illustration");
        return n && n.isValid ? n : null;
    }

    /** 出招前的小花活，不 await，免得把接触前预算吃掉。 */
    private windup(_style: StrikeStyle) {
        const f = this.mood?.flourish;
        if (f === "leaf") this.flap(2);
        else if (f === "incense") this.lean(-(this.mood?.spin || 12) * 0.4, 0.05);
        else if (f === "ember") this.flash(new Color(255, 90, 50), 0.08);
        else if (f === "dust") this.scaleTo(this.sx * 1.14, this.sy * 0.84, 0.05);
        else if (f === "grain") this.ghost();
        this.ghost(this.ghostTint());
    }

    /** 打着那一帧按地图补一层味道，路数残影叠场地色。 */
    private contactJuice() {
        const f = this.mood?.flourish;
        if (f === "ember") this.flash(new Color(255, 70, 36), 0.12);
        else if (f === "incense") this.ghost(new Color(168, 92, 210));
        else if (f === "leaf") this.ghost(new Color(90, 180, 70));
        else if (f === "grain") this.ghost(new Color(230, 190, 60));
        else if (f === "dust") this.ghost(new Color(196, 140, 70));
        const spin = this.mood?.spin ?? 0;
        if (spin >= 16) this.tiltPart(this.artNode(), spin * this.sign() * 0.35, 0.05, 0.12);
    }

    private silhouetteColor() {
        return this.ghostTint();
    }

    private dur(sec: number) {
        return Math.max(0.05, sec * Math.min(1.05, this.rhythm.tempo));
    }

    private lift(base: number) {
        return base * this.rhythm.hop * (this.mood?.hop ?? 1);
    }

    private lanes(): number[] {
        if (this.style === "aerial") return [92, 168, 70, 128];
        if (this.style === "tank") return [8, 28, -12, 18];
        if (this.style === "swift") return [48, -36, 96, -70];
        if (this.style === "trickster") return [64, -48, 22, -88];
        if (this.style === "berserker") return [40, 120, -20, 80];
        return [60, 185, 65, -65];
    }

    /**
     * 受击反馈。挨打很频繁，这里刻意不抢占正在进行的位移，
     * 只让头颈绕关节后仰并闪红，免得把自己的冲刺打断成一团乱麻。
     */
    flinch(force = 1, direction = -this.sign()) {
        // 位移发生在角色局部空间，镜像角色也要沿来击方向后仰。
        const localDirection = direction * (this.node.scale.x >= 0 ? 1 : -1);
        const nod = -18 * force * localDirection;
        this.tiltPart(this.child("Head"), nod, 0.04, 0.22);
        this.tiltPart(this.child("Neck"), nod * 0.3, 0.04, 0.22);
        this.tiltPart(this.child("Wing"), 16 * force, 0.05, 0.2);
        this.tiltPart(this.child("WingBack"), 12 * force, 0.05, 0.2);
        this.blink();
    }

    hits(target: Node): boolean {
        const a = this.bodyBox(this.node);
        const b = this.bodyBox(target);
        if (a && b) return a.intersects(b);
        return false;
    }

    async hop() {
        this.roaming = false;
        const tk = this.begin();
        this.flap(3);
        this.tuckLegs(-26, 0.06, 0.14);
        const p = this.node.position.clone();
        await this.moveTo(v3(p.x + this.sign() * 34, p.y + this.lift(72), 0), 0.13, tk);
        this.squash(tk, 1.22, 0.7);
        await this.moveTo(this.home.clone(), 0.15, tk);
        this.walkLegs(false, tk);
        if (!this.alive(tk)) return;
        this.resetPose();
        this.roaming = true;
        this.roamStep(tk);
    }

    async win() {
        this.roaming = false;
        const tk = this.begin();
        this.flap(10);
        this.tiltPart(this.child("Head"), -12 * this.sign(), 0.1, 0.4);
        const p = this.home.clone();
        p.y += 70;
        await this.moveTo(p, 0.16, tk);
        this.squash(tk, 1.18, 0.78);
        await this.moveTo(this.home.clone(), 0.14, tk);
        this.scaleTo(this.sx * 1.16, this.sy * 1.16, 0.14);
        await this.delay(0.28, tk);
    }

    async lose() {
        this.roaming = false;
        const tk = this.begin();
        this.tiltPart(this.child("LegL"), 42, 0.12, 0.4);
        this.tiltPart(this.child("LegR"), -36, 0.12, 0.4);
        this.tiltPart(this.child("Head"), 22 * this.sign(), 0.1, 0.5);
        this.lean(-68, 0.18);
        const p = this.home.clone();
        p.y -= 38;
        await this.moveTo(p, 0.22, tk);
        this.scaleTo(this.sx * 1.18, this.sy * 0.62, 0.16);
        await this.delay(0.22, tk);
    }

    //#region 令牌

    /** 开启一个新动作：作废旧令牌、停掉残留 tween、放行所有挂起的 await。 */
    private begin(): number {
        this.token += 1;
        this.stopAll();
        const list = this.waiters;
        this.waiters = [];
        for (const fn of list) fn();
        return this.token;
    }

    private alive(tk: number): boolean {
        return tk === this.token && this.node.isValid;
    }

    /** tween 正常结束或动作被抢占，两条路都会让 await 继续往下走。 */
    private hold(tk: number, run: (fin: () => void) => void): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.alive(tk)) {
                resolve();
                return;
            }
            let done = false;
            const fin = () => {
                if (done) return;
                done = true;
                resolve();
            };
            this.waiters.push(fin);
            run(fin);
        });
    }

    //#endregion

    /**
     * 待机踱步。
     *
     * 幅度和时长都压得很小，是因为出手间隔只有一秒上下，扣掉一整套出招演出，
     * 留给待机的空当往往不到半秒。走大圈的话每次都会被下一次冲刺打断在半路，
     * 两只鸡就成了满场乱飘；在站位附近蹭几步，被打断也看不出来。
     */
    private roamStep(tk: number) {
        if (!this.roaming || !this.alive(tk)) return;
        const x = this.home.x + (Math.random() - 0.5) * 18 * this.rhythm.roam;
        const y = this.home.y + (Math.random() - 0.5) * (this.style === "aerial" ? 22 : 10) * this.rhythm.roam;
        this.idleMotion(true);
        this.moveTo(v3(x, y, 0), 0.28 + Math.random() * 0.12, tk).then(() => {
            if (!this.roaming || !this.alive(tk)) return;
            this.bob(tk).then(() => this.roamStep(tk));
        });
    }

    private approach(target: Node, step: number) {
        const a = this.node.position;
        const b = target.position;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        if (len <= step) return v3(b.x, b.y, 0);
        return v3(a.x + dx / len * step, a.y + dy / len * step, 0);
    }

    private bodyBox(root: Node) {
        const body = root.getChildByName("Body") || root;
        const ui = body.getComponent(UITransform);
        return ui ? ui.getBoundingBoxToWorld() : null;
    }

    private sign() {
        return this.sx >= 0 ? 1 : -1;
    }

    private child(name: string) {
        return this.node.getChildByName(name);
    }

    private stopAll() {
        Tween.stopAllByTarget(this.node);
        for (const c of this.node.children) Tween.stopAllByTarget(c);
    }

    private remember(n: Node, joint?: "top" | "bottom" | "shoulder") {
        const ui = n.getComponent(UITransform);
        const halfH = ((ui?.height ?? 0) * Math.abs(n.scale.y)) / 2;
        const halfW = ((ui?.width ?? 0) * Math.abs(n.scale.x)) / 2;
        let px = 0;
        let py = 0;
        if (joint === "top") py = halfH;
        else if (joint === "bottom") py = -halfH;
        else if (joint === "shoulder") {
            py = halfH * 0.72;
            px = n.position.x >= 0 ? -halfW * 0.22 : halfW * 0.22;
        }
        this.pose.set(n, {
            pos: n.position.clone(),
            scale: n.scale.clone(),
            angle: n.angle,
            pivot: v3(px, py, 0)
        });
    }

    /** 绕休息姿态里的关节转，关节钉住，脚尖/翼尖才跟着走。 */
    private plant(n: Node) {
        const nest = this.pose.get(n);
        if (!nest) return;
        const rad = (n.angle - nest.angle) * Math.PI / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const { x: px, y: py } = nest.pivot;
        n.setPosition(nest.pos.x + px - (px * c - py * s), nest.pos.y + py - (px * s + py * c), nest.pos.z);
    }

    private rest(n: Node | null) {
        if (!n) return;
        Tween.stopAllByTarget(n);
        const nest = this.pose.get(n);
        if (!nest) return;
        n.setPosition(nest.pos);
        n.setScale(nest.scale);
        n.angle = nest.angle;
    }

    private tiltPart(n: Node | null, deg: number, out: number, back: number) {
        if (!n) return;
        this.tiltSeq(n, [[deg, out], [0, back]]);
    }

    /** 连续绕关节摆到几个角度，最后一项通常是 0 回到休息姿态。 */
    private tiltSeq(n: Node | null, steps: Array<[number, number]>) {
        if (!n || !steps.length) return;
        Tween.stopAllByTarget(n);
        const rest = this.pose.get(n)?.angle ?? 0;
        let tw = tween(n);
        for (const [deg, dur] of steps) {
            tw = tw.to(Math.max(0.01, dur), { angle: rest + deg }, { onUpdate: () => this.plant(n) });
        }
        tw.start();
    }

    private lean(deg: number, dur = 0.08) {
        tween(this.node).to(dur, { angle: deg * this.sign() }, { easing: "quadOut" }).start();
    }

    private tuckLegs(deg: number, out: number, back: number) {
        this.tiltPart(this.child("LegL"), deg, out, back);
        this.tiltPart(this.child("LegR"), deg * 0.85, out, back);
    }

    private resetPose() {
        this.node.setScale(this.sx, this.sy, 1);
        this.node.angle = 0;
        for (const name of ["Wing", "WingBack", "LegL", "LegR", "Neck", "Head", "Body", "Tail", "Beak", "Illustration"]) {
            this.rest(this.child(name));
        }
    }

    private moveTo(pos: Vec3, dur: number, tk: number) {
        return this.hold(tk, (fin) => {
            tween(this.node).to(dur, { position: pos }).call(fin).start();
        });
    }

    private ease(pos: Vec3, dur: number, easing: Ease, tk: number) {
        return this.hold(tk, (fin) => {
            tween(this.node).to(dur, { position: pos }, { easing }).call(fin).start();
        });
    }

    /**
     * 沿抛物线跳到目标点。
     *
     * 位移用一段直线插值走完的话，起跳抬多高都会被立刻拉平成平移，
     * 所以拆成上升和下落两段：上升减速、下落加速，才像被重力拽下来。
     */
    private async arcTo(to: Vec3, dur: number, height: number, tk: number) {
        const from = this.node.position.clone();
        const apex = v3((from.x + to.x) / 2, Math.max(from.y, to.y) + height, 0);
        await this.ease(apex, dur * 0.45, "quadOut", tk);
        if (!this.alive(tk)) return;
        await this.ease(to, dur * 0.55, "quadIn", tk);
    }

    /** 目标身后：从自己站位那侧看过去的另一边。 */
    private behind(target: Node): Vec3 {
        const t = target.position;
        const away = t.x - this.home.x >= 0 ? 96 : -96;
        return v3(t.x + away, t.y - 12, 0);
    }

    /** 砸实了的压扁回弹，落地和撞击都用它收尾。 */
    private squash(tk: number, wide = 1.28, flat = 0.62) {
        if (!this.alive(tk)) return;
        const map = this.mood?.squash ?? 1;
        const w = 1 + (wide - 1) * this.rhythm.squash * map;
        const f = 1 - (1 - flat) * this.rhythm.squash * map;
        tween(this.node)
            .to(0.05, { scale: v3(this.sx * w, this.sy * Math.max(0.42, f), 1) })
            .to(0.14, { scale: v3(this.sx, this.sy, 1) }, { easing: "backOut" })
            .start();
    }

    /**
     * 冲撞前压低身子，冲完再站起来。
     * 被抢占后就别再站起来了：那会儿新动作已经摆好自己的姿态，这一下会把它盖掉。
     */
    private squat(on: boolean, tk: number) {
        if (!this.alive(tk)) return;
        const x = on ? this.sx * 1.22 : this.sx;
        const y = on ? this.sy * 0.74 : this.sy;
        tween(this.node).to(0.08, { scale: v3(x, y, 1) }).start();
    }

    /** 撞完被反作用力弹开一截。 */
    private knockBack(tk: number, dist: number) {
        const p = this.node.position.clone();
        p.x -= dist * this.sign();
        return this.ease(p, 0.14, "quadOut", tk);
    }

    /** 神龙摆尾：整只甩过去再转回来，立绘靠转圈认招。 */
    private async sweep(tk: number) {
        const dir = this.sign();
        const extra = this.mood?.spin ?? 0;
        this.lean(-32, 0.08);
        this.tiltSeq(this.child("WingBack"), [[-8 * dir, 0.06], [-36 * dir, 0.08], [12 * dir, 0.1], [0, 0.12]]);
        this.tiltSeq(this.child("Wing"), [[14 * dir, 0.06], [-10 * dir, 0.1], [0, 0.14]]);
        this.tiltSeq(this.child("Head"), [[12 * dir, 0.08], [-8 * dir, 0.12], [0, 0.1]]);
        this.tiltSeq(this.artNode(), [[18 * dir, 0.08], [-22 * dir, 0.14], [0, 0.12]]);
        tween(this.node)
            .to(0.12, { angle: -(170 + extra) * dir }, { easing: "quadIn" })
            .to(0.16, { angle: 18 * dir }, { easing: "quadOut" })
            .to(0.1, { angle: 0 })
            .start();
        this.squash(tk, 1.22, 0.7);
        await this.delay(0.38, tk);
        if (!this.alive(tk)) return;
        this.lean(0, 0.08);
    }

    /** 连啄之间往前拱一小步，立绘才会一顿一顿地啄。 */
    private nudge(tk: number, dist: number) {
        const p = this.node.position.clone();
        p.x += dist * this.sign();
        return this.ease(p, 0.06, "quadOut", tk);
    }

    private delay(sec: number, tk: number) {
        return this.hold(tk, (fin) => {
            tween(this.node).delay(sec).call(fin).start();
        });
    }

    private scaleTo(x: number, y: number, dur: number) {
        tween(this.node).to(dur, { scale: v3(x, y, 1) }).start();
    }

    private tilt(deg: number) {
        this.node.angle = deg * this.sign();
    }

    /** 受击闪红。作用在 Sprite 组件而非节点上，所以不会被位移的 tween 打断。 */
    private blink() {
        for (const t of this.tints) {
            if (!t.sp.isValid) continue;
            Tween.stopAllByTarget(t.sp);
            t.sp.color = new Color(255, 90, 70, t.base.a);
            tween(t.sp)
                .delay(0.07)
                .to(0.13, { color: t.base.clone() })
                .start();
        }
    }

    private walkLegs(on: boolean, tk: number) {
        if (!this.alive(tk)) return;
        const l = this.child("LegL");
        const r = this.child("LegR");
        const art = this.artNode();
        if (!on) {
            this.rest(l);
            this.rest(r);
            if (art) this.rest(art);
            return;
        }
        if (art) {
            Tween.stopAllByTarget(art);
            const rest = this.pose.get(art)?.angle ?? 0;
            tween(art)
                .repeatForever(
                    tween()
                        .to(0.11, { angle: rest + 10 }, { onUpdate: () => this.plant(art) })
                        .to(0.11, { angle: rest - 8 }, { onUpdate: () => this.plant(art) })
                )
                .start();
        }
        const step = (n: Node | null, first: number) => {
            if (!n) return;
            Tween.stopAllByTarget(n);
            const rest = this.pose.get(n)?.angle ?? 0;
            tween(n)
                .repeatForever(
                    tween()
                        .to(0.13, { angle: rest + first }, { onUpdate: () => this.plant(n) })
                        .to(0.13, { angle: rest - first }, { onUpdate: () => this.plant(n) })
                )
                .start();
        };
        if (l) step(l, 16);
        if (r) step(r, -16);
    }

    private idleMotion(on: boolean) {
        const art = this.artNode();
        const head = this.child("Head");
        const wing = this.child("Wing");
        const back = this.child("WingBack");
        if (!on) {
            this.rest(art);
            this.rest(head);
            this.rest(wing);
            this.rest(back);
            this.walkLegs(false, this.token);
            return;
        }
        const sway = (n: Node | null, deg: number, dur: number) => {
            if (!n) return;
            Tween.stopAllByTarget(n);
            const rest = this.pose.get(n)?.angle ?? 0;
            tween(n)
                .repeatForever(
                    tween()
                        .to(dur, { angle: rest + deg }, { onUpdate: () => this.plant(n) })
                        .to(dur, { angle: rest - deg }, { onUpdate: () => this.plant(n) })
                )
                .start();
        };
        const amp = this.style === "tank" ? 0.45 : this.style === "swift" ? 1.35 : this.style === "trickster" ? 1.4 : 1;
        const rate = this.style === "swift" ? 0.18 : this.style === "tank" ? 0.42 : 0.32;
        if (art) {
            sway(art, 10 * amp, rate);
            return;
        }
        this.walkLegs(true, this.token);
        sway(head, 8 * amp, rate);
        sway(wing, (this.style === "aerial" ? 20 : 12) * amp, this.style === "aerial" ? 0.16 : 0.24);
        sway(back, 10 * amp, 0.26);
    }

    private flap(times: number) {
        const flapOne = (name: string, deg: number) => {
            const w = this.child(name);
            if (!w) return;
            Tween.stopAllByTarget(w);
            const rest = this.pose.get(w)?.angle ?? 0;
            tween(w)
                .repeat(times, tween()
                    .to(0.07, { angle: rest + deg }, { onUpdate: () => this.plant(w) })
                    .to(0.07, { angle: rest - deg * 0.7 }, { onUpdate: () => this.plant(w) }))
                .call(() => this.rest(w))
                .start();
        };
        flapOne("Wing", 26);
        flapOne("WingBack", 22);
        const art = this.artNode();
        if (!art) return;
        Tween.stopAllByTarget(art);
        const rest = this.pose.get(art)?.angle ?? 0;
        tween(art)
            .repeat(times, tween()
                .to(0.07, { angle: rest - 12 }, { onUpdate: () => this.plant(art) })
                .to(0.07, { angle: rest + 8 }, { onUpdate: () => this.plant(art) }))
            .call(() => this.rest(art))
            .start();
    }

    /** 啄一口。先仰再砸，短时长的连啄省略蓄力。立绘改转 Illustration，整只跟着压扁。 */
    private peck(tk: number, dur = 0.2, heavy = false) {
        const dir = this.sign();
        const amp = heavy ? 1.25 : 1;
        const art = this.artNode();
        const head = this.child("Head");
        const neck = this.child("Neck");
        const wing = this.child("Wing");
        if (dur < 0.16) {
            if (art) this.tiltPart(art, 26 * dir * amp, dur * 0.4, dur * 0.6);
            else {
                this.tiltPart(head, 22 * dir * amp, dur * 0.4, dur * 0.6);
                this.tiltPart(neck, 8 * dir * amp, dur * 0.4, dur * 0.6);
            }
            tween(this.node)
                .to(dur * 0.4, { angle: 20 * dir * amp, scale: v3(this.sx * 1.16, this.sy * 0.82, 1) })
                .to(dur * 0.6, { angle: 0, scale: v3(this.sx, this.sy, 1) })
                .start();
            return this.delay(dur, tk);
        }
        const wind = dur * 0.32;
        const snap = dur * 0.28;
        const back = dur * 0.4;
        if (art) {
            this.tiltSeq(art, [[-24 * dir * amp, wind], [36 * dir * amp, snap], [0, back]]);
        }
        else {
            this.tiltSeq(head, [[-18 * dir * amp, wind], [28 * dir * amp, snap], [0, back]]);
            this.tiltSeq(neck, [[-7 * dir * amp, wind], [12 * dir * amp, snap], [0, back]]);
            this.tiltSeq(wing, [[16 * amp, wind], [-10 * amp, snap], [0, back]]);
        }
        tween(this.node)
            .to(wind, { angle: -18 * dir * amp, scale: v3(this.sx * 0.9, this.sy * 1.12, 1) })
            .to(snap, { angle: 26 * dir * amp, scale: v3(this.sx * 1.22, this.sy * 0.76, 1) })
            .to(back, { angle: 0, scale: v3(this.sx, this.sy, 1) }, { easing: "backOut" })
            .start();
        return this.delay(dur, tk);
    }

    private kick(tk: number) {
        if (!this.alive(tk)) return;
        const dir = this.sign();
        const art = this.artNode();
        if (art) this.tiltSeq(art, [[14 * dir, 0.05], [-32 * dir, 0.07], [0, 0.12]]);
        else {
            this.tiltSeq(this.child("LegL"), [[18, 0.05], [-42, 0.07], [0, 0.12]]);
            this.tiltPart(this.child("LegR"), 16, 0.06, 0.14);
            this.tiltPart(this.child("Head"), 10 * dir, 0.06, 0.12);
        }
        tween(this.node)
            .to(0.06, { angle: -12 * dir })
            .to(0.08, { angle: 16 * dir })
            .to(0.12, { angle: 0 })
            .start();
    }

    private bob(tk: number) {
        return this.hold(tk, (fin) => {
            tween(this.node)
                .to(0.14, { scale: v3(this.sx * 1.08, this.sy * 0.88, 1) })
                .to(0.16, { scale: v3(this.sx, this.sy, 1) }, { easing: "quadOut" })
                .call(fin)
                .start();
        });
    }
}
