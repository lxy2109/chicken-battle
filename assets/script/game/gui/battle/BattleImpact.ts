import { Color, Graphics, Node, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, tween, v3 } from "cc";

/** 命中喷溅、飘落羽毛与落地血迹，分别控制瞬时特效和场景残留数量。 */
export class BattleImpact {
    private active = new Set<Node>();
    private stains = new Set<Node>();
    private groundFeathers = new Set<Node>();
    private floor: Node;

    constructor(private layer: Node, private frames: SpriteFrame[], arena: Node, private floorY: number) {
        this.floor = new Node("BloodStains");
        this.floor.layer = arena.layer;
        this.floor.parent = arena;
        this.floor.setSiblingIndex(0);
        this.floor.addComponent(UITransform).setContentSize(arena.getComponent(UITransform)!.contentSize);
    }

    /** 对撞爆点画在两只鸡中间，比普通命中更亮、更散。 */
    playClash(worldX: number, worldY: number) {
        if (!this.layer.isValid || this.active.size >= 6) return;
        const root = new Node("ClashBurst");
        root.layer = this.layer.layer;
        root.parent = this.layer;
        root.addComponent(UITransform);
        const p = this.layer.getComponent(UITransform)!.convertToNodeSpaceAR(v3(worldX, worldY, 0));
        root.setPosition(p.x, p.y + 24, 0);
        this.active.add(root);
        const burst = new Node("ClashStar");
        burst.layer = root.layer;
        burst.parent = root;
        burst.addComponent(UITransform);
        const g = burst.addComponent(Graphics);
        g.fillColor = new Color(18, 8, 6);
        const radius = 108;
        for (let i = 0; i < 20; i++) {
            const angle = i * Math.PI / 10;
            const r = i % 2 === 0 ? radius : radius * 0.3;
            const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.close();
        g.fill();
        g.fillColor = new Color(255, 248, 230);
        g.circle(0, 0, radius * 0.18);
        g.fill();
        burst.setScale(0.35, 0.35, 1);
        tween(burst).to(0.05, { scale: v3(1.15, 1.15, 1) }, { easing: "quadOut" })
            .to(0.16, { scale: v3(1.45, 1.45, 1) }).start();
        tween(burst.addComponent(UIOpacity)).delay(0.05).to(0.16, { opacity: 0 }).start();
        tween(root).delay(0.4).call(() => { this.active.delete(root); root.destroy(); }).start();
    }

    play(target: Node, direction: number, heavy: boolean, critical: boolean, featherColor: string, laneY?: number) {
        if (!this.layer.isValid || !target.isValid || this.active.size >= 6) return;
        const root = new Node("BloodAndFeathers");
        root.layer = this.layer.layer;
        root.parent = this.layer;
        root.addComponent(UITransform);
        const p = this.layer.getComponent(UITransform)!.convertToNodeSpaceAR(target.worldPosition);
        root.setPosition(p.x, p.y + 40, 0);
        this.active.add(root);
        const floorUI = this.floor.getComponent(UITransform)!;
        const chest = floorUI.convertToNodeSpaceAR(target.worldPosition);
        const groundY = this.feetY(target, chest.y, laneY);
        const landingX = chest.x + direction * (35 + Math.random() * 70);
        tween(root).delay(0.3).call(() => this.addStain(landingX, groundY, heavy, critical)).start();
        // 短促的亮色爆点先交代碰撞，再让血滴和羽毛散开。
        const burst = new Node("HitBurst");
        burst.layer = root.layer;
        burst.parent = root;
        burst.addComponent(UITransform);
        const radius = critical ? 100 : heavy ? 78 : 56;
        const flash = burst.addComponent(Graphics);
        flash.fillColor = critical ? new Color(255, 192, 48) : new Color(255, 232, 156);
        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8;
            const r = i % 2 === 0 ? radius : radius * 0.28;
            const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
            if (i === 0) flash.moveTo(x, y);
            else flash.lineTo(x, y);
        }
        flash.close();
        flash.fill();
        flash.fillColor = new Color(255, 255, 240);
        flash.circle(0, 0, radius * 0.22);
        flash.fill();
        burst.setScale(0.45, 0.45, 1);
        tween(burst).to(0.035, { scale: v3(1, 1, 1) }, { easing: "quadOut" })
            .to(0.12, { scale: v3(1.3, 1.3, 1) }).start();
        tween(burst.addComponent(UIOpacity)).delay(0.035).to(0.12, { opacity: 0 }).start();
        const splash = new Node("BloodSplash");
        splash.layer = root.layer;
        splash.parent = root;
        const size = critical ? 240 : heavy ? 190 : 145;
        splash.addComponent(UITransform).setContentSize(size, size);
        const sprite = splash.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.frames[2];
        splash.setPosition(direction * 20, 0, 0);
        splash.setScale(direction * 0.4, 0.4, 1);
        tween(splash).to(0.045, { scale: v3(direction, 1, 1) }, { easing: "quadOut" })
            .by(0.3, { position: v3(direction * 45, -28, 0) }).start();
        tween(splash.addComponent(UIOpacity)).delay(0.12).to(0.24, { opacity: 0 }).start();
        const bloodCount = critical ? 20 : heavy ? 14 : 9;
        const featherCount = critical ? 8 : heavy ? 6 : 3;
        const force = critical ? 1.45 : heavy ? 1.2 : 1;
        for (let i = 0; i < bloodCount + featherCount; i++) {
            const feather = i >= bloodCount;
            const node = new Node(feather ? "FlyingFeather" : "BloodDrop");
            node.layer = root.layer;
            node.parent = root;
            const size = feather ? 48 : critical ? 56 : heavy ? 48 : 40;
            node.addComponent(UITransform).setContentSize(size, size);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.frames[feather ? 0 : 1];
            if (feather) sprite.color = Color.fromHEX(new Color(), featherColor);
            const scale = (feather ? 0.7 : 0.8) + Math.random() * 0.5;
            node.setScale(scale, scale, 1);
            node.angle = (Math.random() - 0.5) * (feather ? 360 : 180);
            const dx = direction * (25 + Math.random() * 100) * force * (feather ? 1 : 1.7);
            const rise = (20 + Math.random() * 85) * force * (feather ? 1 : 1.3);
            const drift = feather ? (Math.random() - 0.5) * 70 : direction * 25;
            const up = feather ? 0.22 : 0.12;
            const down = feather ? 0.65 + Math.random() * 0.2 : 0.32 + Math.random() * 0.12;
            const end = v3(dx + drift, -50 - Math.random() * 65, 0);
            if (feather) {
                const limit = Math.max(0, floorUI.width / 2 - 30);
                const floorPoint = v3(Math.max(-limit, Math.min(limit, chest.x + dx + drift)),
                    groundY + (Math.random() - 0.5) * 90, 0);
                const world = floorUI.convertToWorldSpaceAR(floorPoint);
                root.getComponent(UITransform)!.convertToNodeSpaceAR(world, end);
            }
            const opacity = node.addComponent(UIOpacity);
            tween(node)
                .to(up, { position: v3(dx * 0.6, rise, 0), angle: node.angle + direction * 80 }, { easing: "quadOut" })
                .to(down, { position: end, angle: node.angle + direction * (feather ? 280 : 110) }, { easing: feather ? "sineInOut" : "quadIn" })
                .call(() => {
                    if (!feather || !node.isValid || !this.floor.isValid) return;
                    // 落地后移出短命喷溅节点，保留同一根羽毛的位置与配色。
                    node.setParent(this.floor, true);
                    if (this.groundFeathers.size >= 72) {
                        const oldest = this.groundFeathers.values().next().value!;
                        Tween.stopAllByTarget(oldest);
                        Tween.stopAllByTarget(oldest.getComponent(UIOpacity)!);
                        this.groundFeathers.delete(oldest);
                        oldest.destroy();
                    }
                    this.groundFeathers.add(node);
                    tween(node).to(0.18, {
                        scale: v3(scale, scale * 0.65, 1),
                        angle: node.angle + (Math.random() - 0.5) * 48
                    }, { easing: "quadOut" }).start();
                    tween(opacity).delay(10).to(2, { opacity: 0 })
                        .call(() => { this.groundFeathers.delete(node); node.destroy(); }).start();
                })
                .start();
            if (!feather) tween(opacity).delay(up + down * 0.45).to(down * 0.55, { opacity: 0 }).start();
        }
        tween(root).delay(1.15).call(() => { this.active.delete(root); root.destroy(); }).start();
    }

    /**
     * 脚底在场地里的 Y。影子节点在新预制体里偏得太远，整段落差会把残留甩到前场；
     * 所以跟当前胸口走，偏移钳在脚的位置，跳跃时再压回本条巷的地面。
     */
    private feetY(target: Node, chestY: number, laneY?: number) {
        const scaleY = Math.abs(target.scale.y) || 1;
        const shadow = target.getChildByName("Shadow");
        const leg = target.getChildByName("LegL") || target.getChildByName("LegR");
        let off = -90;
        if (leg) off = leg.position.y * scaleY - 16;
        else if (shadow) off = shadow.position.y * scaleY;
        off = Math.max(-120, Math.min(-70, off));
        const live = chestY + off;
        if (laneY == null) return live;
        const laneGround = laneY + off;
        return live > laneGround + 24 ? laneGround : live;
    }

    private addStain(x: number, groundY: number, heavy: boolean, critical: boolean) {
        if (!this.floor.isValid) return;
        if (this.stains.size >= 24) {
            const oldest = this.stains.values().next().value!;
            Tween.stopAllByTarget(oldest);
            Tween.stopAllByTarget(oldest.getComponent(UIOpacity)!);
            this.stains.delete(oldest);
            oldest.destroy();
        }
        const stain = new Node("BloodStain");
        stain.layer = this.floor.layer;
        stain.parent = this.floor;
        this.stains.add(stain);
        const size = critical ? 310 : heavy ? 240 : 180;
        stain.addComponent(UITransform).setContentSize(size, size * 0.48);
        const sprite = stain.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.frames[2];
        sprite.color = new Color(175, 100, 100);
        const limit = Math.max(0, this.floor.getComponent(UITransform)!.width / 2 - size / 2);
        stain.setPosition(Math.max(-limit, Math.min(limit, x)), groundY + (Math.random() - 0.5) * 90, 0);
        stain.angle = (Math.random() - 0.5) * 360;
        const flip = Math.random() < 0.5 ? -1 : 1;
        stain.setScale(flip * 0.5, 0.5, 1);
        tween(stain).to(0.12, { scale: v3(flip, 1, 1) }, { easing: "quadOut" }).start();
        const opacity = stain.addComponent(UIOpacity);
        opacity.opacity = critical ? 210 : 180;
        tween(opacity).delay(12).to(3, { opacity: 0 })
            .call(() => { this.stains.delete(stain); stain.destroy(); }).start();
    }

    clear() {
        for (const root of [...this.active, ...this.stains, ...this.groundFeathers]) {
            for (const node of [root, ...root.children]) {
                Tween.stopAllByTarget(node);
                const opacity = node.getComponent(UIOpacity);
                if (opacity) Tween.stopAllByTarget(opacity);
            }
            root.destroy();
        }
        this.active.clear();
        this.stains.clear();
        this.groundFeathers.clear();
        if (this.floor.isValid) this.floor.destroy();
    }
}
