import { Color, Node, Sprite, Tween, UITransform, tween, v3, Vec3 } from "cc";
import { StrikeStyle } from "../core/Types";

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
     * 各部位在预制体里的摆放位置。
     * 头在 (27,193)、身子在 (0,-52)、脖子在 (2,82)，各有各的位置，
     * 所以动完必须还原到这里，拿 (0,0,0) 当原点会把整只鸡拼到中心去。
     */
    private nests = new Map<Node, Vec3>();

    constructor(readonly node: Node, home: Vec3) {
        this.home = home.clone();
        this.sx = node.scale.x;
        this.sy = node.scale.y;
        for (const sp of node.getComponentsInChildren(Sprite)) {
            this.tints.push({ sp, base: sp.color.clone() });
        }
        for (const c of node.children) {
            this.nests.set(c, c.position.clone());
        }
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
        let told = false;
        const contact = (hit: boolean) => {
            if (told) return;
            told = true;
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

    /** 贴身啄：走过去啄一口，最朴素的一招。 */
    private async peckMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.walkLegs(true, tk);
        const hit = await this.advance(target, tk, 130, 0.09);
        this.walkLegs(false, tk);
        if (!hit) return false;
        contact(true);
        await this.peck(tk);
        return true;
    }

    /**
     * 跳踢：一路小跳着逼过去，落点上补一脚。
     * 每一步都走抛物线，连起来就是蹦过去的观感——以前是先抬一下再直线平移，
     * 那点抬升立刻被插值拉平，所以怎么看都不像跳。
     */
    private async jumpMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(3);
        // 每跳压到 0.18 秒是有讲究的：出招期间逻辑层挂着 busy 不出新招，
        // 接触前的耗时一旦超过最快出手间隔 0.55 秒，演出就会反过来拖慢节奏，
        // 把速度堆上去的收益白白吃掉。下面几招的时长都是按这条线卡的。
        const hit = await this.advance(target, tk, 168, 0.18, 62);
        if (!hit) return false;
        contact(true);
        this.kick(tk);
        await this.delay(0.12, tk);
        return true;
    }

    /** 飞扑：先窜到高处，再压着身子一头扎下来。 */
    private async diveMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(6);
        const up = this.node.position.clone();
        up.y += 96;
        await this.ease(up, 0.14, "quadOut", tk);
        this.tilt(26);
        const hit = await this.advance(target, tk, 220, 0.12);
        this.node.angle = 0;
        if (!hit) return false;
        contact(true);
        this.kick(tk);
        await this.delay(0.1, tk);
        return true;
    }

    /**
     * 腾空下砸：原地窜起一大截，在最高点停一拍，再整只砸到对手头上。
     * 那一拍停顿是留给观众反应的，没有它就只是个高一点的飞扑。
     */
    private async leapMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(5);
        const sky = this.node.position.clone();
        sky.y += 186;
        await this.ease(sky, 0.2, "quadOut", tk);
        await this.delay(0.13, tk);
        if (!this.alive(tk) || !target.isValid) return false;
        const onto = target.position.clone();
        onto.y += 44;
        await this.ease(onto, 0.15, "quadIn", tk);
        if (!this.hits(target)) return false;
        contact(true);
        this.squash(tk);
        await this.delay(0.16, tk);
        return true;
    }

    /** 扑翅冲撞：压低身子贴地加速撞过去，撞实了自己也被弹开。 */
    private async chargeMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.flap(8);
        this.squat(true, tk);
        const hit = await this.advance(target, tk, 250, 0.08);
        if (!hit) {
            this.squat(false, tk);
            return false;
        }
        contact(true);
        this.squash(tk);
        await this.knockBack(tk, 58);
        this.squat(false, tk);
        return true;
    }

    /** 转身扫尾：凑到跟前反身用尾巴抽，近身时最省事的一招。 */
    private async tailMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.walkLegs(true, tk);
        const hit = await this.advance(target, tk, 150, 0.09);
        this.walkLegs(false, tk);
        if (!hit) return false;
        contact(true);
        await this.sweep(tk);
        return true;
    }

    /** 连啄：贴上去快啄三下，伤害仍然只结算一次，热闹归演出。 */
    private async comboMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        this.walkLegs(true, tk);
        const hit = await this.advance(target, tk, 160, 0.08);
        this.walkLegs(false, tk);
        if (!hit) return false;
        contact(true);
        for (let i = 0; i < 3 && this.alive(tk); i++) {
            await this.peck(tk, 0.11);
        }
        return true;
    }

    /** 假动作：先虚晃一下把对手骗住，再绕到它另一侧偷一口。 */
    private async feintMove(target: Node, tk: number, contact: (hit: boolean) => void) {
        const bait = this.approach(target, 96);
        await this.ease(bait, 0.09, "quadOut", tk);
        await this.delay(0.06, tk);
        if (!this.alive(tk) || !target.isValid) return false;
        await this.arcTo(this.behind(target), 0.24, 104, tk);
        const hit = await this.advance(target, tk, 150, 0.08);
        if (!hit) return false;
        contact(true);
        await this.peck(tk);
        return true;
    }

    //#endregion

    /**
     * 一步步逼近目标，撞上就停。arc 大于零时每一步走抛物线，看着就是蹦过去。
     * 对手自己也在动，所以每步都重新朝它当下的位置修一次方向。
     */
    private async advance(target: Node, tk: number, step: number, dur: number, arc = 0): Promise<boolean> {
        for (let i = 0; i < 10 && this.alive(tk); i++) {
            if (!target.isValid) return false;
            if (this.hits(target)) return true;
            const next = this.approach(target, step);
            if (arc > 0) await this.arcTo(next, dur, arc, tk);
            else await this.moveTo(next, dur, tk);
        }
        return this.alive(tk) && target.isValid && this.hits(target);
    }

    /** 收招后换到下一片场地，双方继续追击，避免每次都退回前排。 */
    async retreat(tk = this.begin()) {
        if (!this.alive(tk)) return;
        const lanes = [60, 185, 65, -65];
        const lane = this.patrolStep++ % lanes.length;
        const centerX = lane % 2 === 0 ? -30 : 30;
        this.home.set(centerX - this.sign() * (105 + Math.random() * 35),
            lanes[lane] + (Math.random() - 0.5) * 24, 0);
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
        const tk = this.begin();
        this.resetPose();
        this.flinch(1.25 * force, -this.sign());
        return this.knockBack(tk, 56 * force).then(() => {
            if (!this.alive(tk)) return;
            this.roaming = true;
            this.roamStep(tk);
        });
    }

    /** 残血红眼或 Boss 暴走时的一抖，让观众看见节奏变了。 */
    pulse() {
        const body = this.child("Body") || this.child("Illustration");
        if (!body) return;
        Tween.stopAllByTarget(body);
        tween(body)
            .to(0.08, { scale: v3(1.18, 1.18, 1) })
            .to(0.18, { scale: v3(1, 1, 1) }, { easing: "backOut" })
            .start();
    }

    /**
     * 受击反馈。挨打很频繁，这里刻意不抢占正在进行的位移，
     * 只让躯干抖一下并闪红，免得把自己的冲刺打断成一团乱麻。
     */
    flinch(force = 1, direction = -this.sign()) {
        // 位移发生在角色局部空间，镜像角色也要沿来击方向后仰。
        const localDirection = direction * (this.node.scale.x >= 0 ? 1 : -1);
        const back = 38 * force * localDirection;
        this.recoil(this.child("Illustration"), back, -10 * force, -12 * force * localDirection);
        // 躯干往后坐、脑袋甩得更远，两段错开幅度才像被顶了一下。
        this.recoil(this.child("Body"), back, -8 * force, 0);
        this.recoil(this.child("Head"), back * 1.4, -4 * force, -14 * force * localDirection);
        this.recoil(this.child("Neck"), back * 1.2, -2 * force, -10 * force * localDirection);
        this.blink();
    }

    private recoil(n: Node | null, dx: number, dy: number, deg: number) {
        if (!n) return;
        const nest = this.nestOf(n);
        Tween.stopAllByTarget(n);
        n.setPosition(nest);
        n.angle = 0;
        tween(n)
            .to(0.035, { position: v3(nest.x + dx, nest.y + dy, nest.z), angle: deg }, { easing: "quadOut" })
            .delay(0.045)
            .to(0.18, { position: nest.clone(), angle: 0 }, { easing: "backOut" })
            .start();
    }

    private nestOf(n: Node): Vec3 {
        return this.nests.get(n) || Vec3.ZERO;
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
        this.walkLegs(true, tk);
        const p = this.node.position.clone();
        await this.moveTo(v3(p.x + this.sign() * 34, p.y + 58, 0), 0.13, tk);
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
        this.flap(6);
        const p = this.home.clone();
        p.y += 50;
        await this.moveTo(p, 0.18, tk);
        this.scaleTo(this.sx * 1.12, this.sy * 1.12, 0.16);
        await this.delay(0.35, tk);
    }

    async lose() {
        this.roaming = false;
        const tk = this.begin();
        this.tilt(-55);
        const p = this.home.clone();
        p.y -= 30;
        await this.moveTo(p, 0.25, tk);
        this.scaleTo(this.sx * 0.92, this.sy * 0.72, 0.2);
        await this.delay(0.2, tk);
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
        const x = this.home.x + (Math.random() - 0.5) * 26;
        const y = this.home.y + (Math.random() - 0.5) * 16;
        this.walkLegs(true, tk);
        this.moveTo(v3(x, y, 0), 0.22 + Math.random() * 0.12, tk).then(() => {
            if (!this.roaming || !this.alive(tk)) return;
            this.walkLegs(false, tk);
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

    private resetPose() {
        this.node.setScale(this.sx, this.sy, 1);
        this.node.angle = 0;
        // Beak 也要收：啄击是甩喙的，动画被抢占时它会歪着回不来。
        for (const name of ["Wing", "WingBack", "LegL", "LegR", "Neck", "Head", "Body", "Tail", "Beak", "Illustration"]) {
            const n = this.child(name);
            if (!n) continue;
            n.angle = 0;
            n.setPosition(this.nestOf(n));
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
    private squash(tk: number) {
        if (!this.alive(tk)) return;
        tween(this.node)
            .to(0.05, { scale: v3(this.sx * 1.2, this.sy * 0.74, 1) })
            .to(0.12, { scale: v3(this.sx, this.sy, 1) }, { easing: "backOut" })
            .start();
    }

    /**
     * 冲撞前压低身子，冲完再站起来。
     * 被抢占后就别再站起来了：那会儿新动作已经摆好自己的姿态，这一下会把它盖掉。
     */
    private squat(on: boolean, tk: number) {
        if (!this.alive(tk)) return;
        const x = on ? this.sx * 1.12 : this.sx;
        const y = on ? this.sy * 0.86 : this.sy;
        tween(this.node).to(0.08, { scale: v3(x, y, 1) }).start();
    }

    /** 撞完被反作用力弹开一截。 */
    private knockBack(tk: number, dist: number) {
        const p = this.node.position.clone();
        p.x -= dist * this.sign();
        return this.ease(p, 0.14, "quadOut", tk);
    }

    /** 转身扫尾：背过身去把尾巴甩出去，抽完再转回来。 */
    private async sweep(tk: number) {
        const tail = this.child("Tail");
        this.node.setScale(-this.sx, this.sy, 1);
        if (tail) {
            tween(tail).stop();
            tween(tail)
                .to(0.08, { angle: -52 })
                .to(0.12, { angle: 18 })
                .to(0.08, { angle: 0 })
                .start();
        }
        await this.delay(0.3, tk);
        // 转回来这一下同样不能抢新动作的姿态，被抢占就交给它开头的归位去收。
        if (!this.alive(tk)) return;
        this.node.setScale(this.sx, this.sy, 1);
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
        if (l) tween(l).stop();
        if (r) tween(r).stop();
        if (!on) {
            if (l) l.angle = 0;
            if (r) r.angle = 0;
            return;
        }
        const step = (n: Node, first: number) => {
            tween(n)
                .repeatForever(
                    tween().to(0.11, { angle: first }).to(0.11, { angle: -first })
                )
                .start();
        };
        if (l) step(l, 22);
        if (r) step(r, -22);
    }

    private flap(times: number) {
        const flapOne = (name: string, sign: number) => {
            const w = this.child(name);
            if (!w) return;
            tween(w).stop();
            tween(w)
                .repeat(times, tween().to(0.07, { angle: 48 * sign }).to(0.07, { angle: -28 * sign }))
                .call(() => { w.angle = 0; })
                .start();
        };
        flapOne("Wing", 1);
        flapOne("WingBack", -1);
    }

    /** 啄一口。dur 收得更短是给连啄用的，三下得比一下快才叫连。 */
    private peck(tk: number, dur = 0.16) {
        const neck = this.child("Neck");
        const head = this.child("Head");
        const beak = this.child("Beak");
        const dip = 28 * this.sign();
        const out = dur * 0.44;
        const back = dur * 0.56;
        if (neck) tween(neck).to(out, { angle: dip }).to(back, { angle: 0 }).start();
        if (head) tween(head).to(out, { angle: dip }).to(back, { angle: 0 }).start();
        if (beak) tween(beak).to(out * 0.85, { angle: 12 }).to(back, { angle: 0 }).start();
        return this.delay(dur, tk);
    }

    private kick(tk: number) {
        if (!this.alive(tk)) return;
        const r = this.child("LegR");
        if (r) tween(r).to(0.06, { angle: -40 }).to(0.1, { angle: 0 }).start();
    }

    private bob(tk: number) {
        return this.hold(tk, (fin) => {
            tween(this.node)
                .to(0.16, { scale: v3(this.sx * 1.04, this.sy * 0.94, 1) })
                .to(0.16, { scale: v3(this.sx, this.sy, 1) })
                .call(fin)
                .start();
        });
    }
}
