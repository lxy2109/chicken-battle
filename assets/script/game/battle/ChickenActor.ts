import { Color, Node, Sprite, UITransform, tween, v3, Vec3 } from "cc";

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
    private sx: number;
    private sy: number;
    private token = 0;
    private waiters: Array<() => void> = [];
    /** 各部位的原始配色，受击闪红后要还原成它，不能拿当前色当基准。 */
    private tints: Array<{ sp: Sprite; base: Color }> = [];

    constructor(readonly node: Node, home: Vec3) {
        this.home = home.clone();
        this.sx = node.scale.x;
        this.sy = node.scale.y;
        for (const sp of node.getComponentsInChildren(Sprite)) {
            this.tints.push({ sp, base: sp.color.clone() });
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
     * 收招和回位是之后的事，不该让对手多挨那半秒。
     */
    async strike(target: Node, style: "peck" | "jump" | "dive", onContact?: (hit: boolean) => void): Promise<boolean> {
        this.roaming = false;
        const tk = this.begin();

        if (style === "jump") {
            this.flap(3);
            const mid = this.node.position.clone();
            mid.y += 56;
            await this.moveTo(mid, 0.1, tk);
        }
        else if (style === "dive") {
            this.flap(6);
            const up = this.node.position.clone();
            up.y += 88;
            await this.moveTo(up, 0.12, tk);
        }
        else {
            this.walkLegs(true, tk);
        }

        let hit = false;
        for (let i = 0; i < 10 && this.alive(tk); i++) {
            if (!target.isValid) break;
            if (this.hits(target)) {
                hit = true;
                if (style === "peck") await this.peck(tk);
                else this.kick(tk);
                if (onContact) onContact(true);
                await this.delay(0.08, tk);
                break;
            }
            await this.moveTo(this.approach(target, 130), 0.09, tk);
        }
        if (!hit && onContact) onContact(false);
        this.walkLegs(false, tk);
        if (this.alive(tk)) await this.retreat(tk);
        return hit;
    }

    /** 回到自己的位置继续踱步。 */
    async retreat(tk = this.begin()) {
        await this.moveTo(this.home, 0.2, tk);
        if (!this.alive(tk)) return;
        this.resetPose();
        this.roaming = true;
        this.roamStep(tk);
    }

    /**
     * 受击反馈。挨打很频繁，这里刻意不抢占正在进行的位移，
     * 只让躯干抖一下并闪红，免得把自己的冲刺打断成一团乱麻。
     */
    flinch() {
        const back = -26 * this.sign();
        // 躯干往后坐、脑袋甩得更远，两段错开幅度才像被顶了一下。
        this.recoil(this.child("Body"), back, -8, 0);
        this.recoil(this.child("Head"), back * 1.4, -4, -14 * this.sign());
        this.recoil(this.child("Neck"), back * 1.2, -2, -10 * this.sign());
        this.blink();
    }

    private recoil(n: Node | null, dx: number, dy: number, deg: number) {
        if (!n) return;
        tween(n).stop();
        n.setPosition(0, 0, 0);
        n.angle = 0;
        tween(n)
            .to(0.05, { position: v3(dx, dy, 0), angle: deg })
            .to(0.14, { position: v3(0, 0, 0), angle: 0 })
            .start();
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
        await this.moveTo(this.home, 0.15, tk);
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
        tween(this.node).stop();
        for (const c of this.node.children) tween(c).stop();
    }

    private resetPose() {
        this.node.setScale(this.sx, this.sy, 1);
        this.node.angle = 0;
        for (const name of ["Wing", "LegL", "LegR", "Neck", "Head", "Body", "Tail"]) {
            const n = this.child(name);
            if (!n) continue;
            n.angle = 0;
            n.setPosition(0, 0, 0);
        }
    }

    private moveTo(pos: Vec3, dur: number, tk: number) {
        return this.hold(tk, (fin) => {
            tween(this.node).to(dur, { position: pos }).call(fin).start();
        });
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
            tween(t.sp).stop();
            t.sp.color = t.base;
            tween(t.sp)
                .to(0.06, { color: new Color(255, 130, 130, t.base.a) })
                .to(0.16, { color: t.base.clone() })
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
        const w = this.child("Wing");
        if (!w) return;
        tween(w).stop();
        tween(w)
            .repeat(times, tween().to(0.07, { angle: 48 }).to(0.07, { angle: -28 }))
            .call(() => { w.angle = 0; })
            .start();
    }

    private peck(tk: number) {
        const neck = this.child("Neck");
        const head = this.child("Head");
        const beak = this.child("Beak");
        const dip = 28 * this.sign();
        if (neck) tween(neck).to(0.07, { angle: dip }).to(0.09, { angle: 0 }).start();
        if (head) tween(head).to(0.07, { angle: dip }).to(0.09, { angle: 0 }).start();
        if (beak) tween(beak).to(0.06, { angle: 12 }).to(0.08, { angle: 0 }).start();
        return this.delay(0.16, tk);
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
