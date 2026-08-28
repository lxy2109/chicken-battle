import { Node, UITransform, tween, v3, Vec3 } from "cc";

/** 用部位缓动演出走、打、飞、跳，不再站桩对波。 */
export class ChickenActor {
    readonly home: Vec3;
    private roaming = false;
    private sx: number;
    private sy: number;

    constructor(readonly node: Node, home: Vec3) {
        this.home = home.clone();
        this.sx = node.scale.x;
        this.sy = node.scale.y;
    }

    startRoam() {
        if (this.roaming) return;
        this.roaming = true;
        this.roamStep();
    }

    stopRoam() {
        this.roaming = false;
        this.stopAll();
        this.resetPose();
    }

    async connect(target: Node, style: "peck" | "jump" | "dive"): Promise<boolean> {
        this.stopRoam();
        if (style === "jump") {
            this.scaleTo(this.sx, this.sy * 0.82, 0.08);
            await this.delay(0.08);
            this.flap(3);
            const mid = this.node.position.clone();
            mid.y += 70;
            await this.moveTo(mid, 0.12);
        }
        else if (style === "dive") {
            this.flap(8);
            const up = this.node.position.clone();
            up.y += 120;
            await this.moveTo(up, 0.16);
        }
        else {
            this.walkLegs(true);
        }

        let hit = false;
        for (let i = 0; i < 14; i++) {
            if (!this.node.isValid || !target.isValid) break;
            if (this.hits(target)) {
                hit = true;
                if (style === "peck") await this.peck();
                else this.kick();
                await this.delay(0.08);
                break;
            }
            await this.moveTo(this.approach(target, 120), 0.1);
        }
        this.walkLegs(false);
        if (!hit) await this.retreat();
        return hit;
    }

    async retreat() {
        await this.moveTo(this.home, 0.22);
        this.resetPose();
        this.startRoam();
    }

    hits(target: Node): boolean {
        const a = this.bodyBox(this.node);
        const b = this.bodyBox(target);
        if (a && b) return a.intersects(b);
        return false;
    }

    async hop() {
        this.stopRoam();
        this.walkLegs(true);
        const p = this.node.position.clone();
        await this.moveTo(v3(p.x + this.sign() * 40, p.y + 70, 0), 0.14);
        await this.moveTo(v3(p.x - this.sign() * 30, p.y + 20, 0), 0.12);
        await this.moveTo(this.home, 0.16);
        this.walkLegs(false);
        this.resetPose();
        this.startRoam();
    }

    async hit() {
        this.stopRoam();
        const back = this.node.position.clone();
        back.x -= this.sign() * 36;
        back.y -= 24;
        await this.moveTo(back, 0.08);
        this.tilt(-18);
        await this.delay(0.1);
        await this.moveTo(this.home, 0.16);
        this.resetPose();
        this.startRoam();
    }

    async win() {
        this.stopRoam();
        this.flap(6);
        const p = this.home.clone();
        p.y += 50;
        await this.moveTo(p, 0.18);
        this.scaleTo(this.sx * 1.12, this.sy * 1.12, 0.16);
        await this.delay(0.35);
    }

    async lose() {
        this.stopRoam();
        this.tilt(-55);
        const p = this.home.clone();
        p.y -= 30;
        await this.moveTo(p, 0.25);
        this.scaleTo(this.sx * 0.92, this.sy * 0.72, 0.2);
        await this.delay(0.2);
    }

    private roamStep() {
        if (!this.roaming || !this.node.isValid) return;
        this.walkLegs(true);
        const x = this.home.x + (Math.random() - 0.5) * 220;
        const y = this.home.y + (Math.random() - 0.5) * 120;
        this.moveTo(v3(x, y, 0), 0.45 + Math.random() * 0.25).then(() => {
            if (!this.roaming || !this.node.isValid) return;
            this.walkLegs(false);
            this.bob().then(() => this.roamStep());
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
            if (n) n.angle = 0;
        }
    }

    private moveTo(pos: Vec3, dur: number) {
        return new Promise<void>((resolve) => {
            tween(this.node).to(dur, { position: pos }).call(() => resolve()).start();
        });
    }

    private delay(sec: number) {
        return new Promise<void>((resolve) => {
            tween(this.node).delay(sec).call(() => resolve()).start();
        });
    }

    private scaleTo(x: number, y: number, dur: number) {
        tween(this.node).to(dur, { scale: v3(x, y, 1) }).start();
    }

    private tilt(deg: number) {
        this.node.angle = deg * this.sign();
    }

    private walkLegs(on: boolean) {
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

    private peck() {
        const neck = this.child("Neck");
        const head = this.child("Head");
        const beak = this.child("Beak");
        const dip = 28 * this.sign();
        if (neck) tween(neck).to(0.07, { angle: dip }).to(0.09, { angle: 0 }).start();
        if (head) tween(head).to(0.07, { angle: dip }).to(0.09, { angle: 0 }).start();
        if (beak) tween(beak).to(0.06, { angle: 12 }).to(0.08, { angle: 0 }).start();
        return this.delay(0.18);
    }

    private kick() {
        const r = this.child("LegR");
        if (r) tween(r).to(0.06, { angle: -40 }).to(0.1, { angle: 0 }).start();
    }

    private bob() {
        return new Promise<void>((resolve) => {
            tween(this.node)
                .to(0.16, { scale: v3(this.sx * 1.04, this.sy * 0.94, 1) })
                .to(0.16, { scale: v3(this.sx, this.sy, 1) })
                .call(() => resolve())
                .start();
        });
    }
}
