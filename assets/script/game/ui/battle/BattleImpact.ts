import { Color, Node, ParticleSystem2D, Prefab, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, instantiate, tween, v3 } from "cc";

/**
 * 命中喷溅 / 对撞：主效果走 ParticleSystem2D 预制体；
 * 落地血迹与落地羽毛仍为场景残留 Sprite（长寿命，不适合纯粒子）。
 */
export class BattleImpact {
    private active = new Set<Node>();
    private stains = new Set<Node>();
    private groundFeathers = new Set<Node>();
    private floor: Node;
    private splashFrame: SpriteFrame | null;
    private featherFrame: SpriteFrame | null;

    constructor(
        private layer: Node,
        private hitPrefab: Prefab | null,
        private clashPrefab: Prefab | null,
        arena: Node,
        private floorY: number,
        frames: { splash?: SpriteFrame | null; feather?: SpriteFrame | null } = {}
    ) {
        this.splashFrame = frames.splash || null;
        this.featherFrame = frames.feather || null;
        this.floor = new Node("BloodStains");
        this.floor.layer = arena.layer;
        this.floor.parent = arena;
        this.floor.setSiblingIndex(0);
        this.floor.addComponent(UITransform).setContentSize(arena.getComponent(UITransform)!.contentSize);
    }

    /** 对撞爆点画在两只鸡中间。 */
    playClash(worldX: number, worldY: number) {
        if (!this.layer.isValid || this.active.size >= 6) return;
        this.spawnPrefab(this.clashPrefab, worldX, worldY + 24, 1, null, 0.55);
    }

    play(target: Node, direction: number, heavy: boolean, critical: boolean, featherColor: string, laneY?: number, skill = false) {
        if (!this.layer.isValid || !target.isValid || this.active.size >= 6) return;
        const scale = critical ? 1.35 : skill ? 1.22 : heavy ? 1.15 : 1;
        const p = target.worldPosition;
        this.spawnPrefab(this.hitPrefab, p.x, p.y + 40, scale, featherColor, 1.1, direction, critical, skill);

        const floorUI = this.floor.getComponent(UITransform)!;
        const chest = floorUI.convertToNodeSpaceAR(target.worldPosition);
        const groundY = this.feetY(target, chest.y, laneY);
        const landingX = chest.x + direction * (35 + Math.random() * 70);
        // 血迹延迟出现，对齐血滴下落节奏
        const delay = critical ? 0.22 : 0.3;
        const root = new Node("StainCue");
        root.layer = this.layer.layer;
        root.parent = this.layer;
        this.active.add(root);
        tween(root).delay(delay).call(() => {
            this.addStain(landingX, groundY, heavy, critical);
            // 落地羽毛残留（按鸡翅膀色染色）
            const n = critical ? 3 : heavy || skill ? 2 : 1;
            for (let i = 0; i < n; i++) {
                this.addGroundFeather(
                    landingX + (Math.random() - 0.5) * 50,
                    groundY + (Math.random() - 0.5) * 40,
                    featherColor
                );
            }
        }).delay(0.05).call(() => {
            this.active.delete(root);
            if (root.isValid) root.destroy();
        }).start();
    }

    private spawnPrefab(
        prefab: Prefab | null,
        worldX: number,
        worldY: number,
        scale: number,
        featherColor: string | null,
        life: number,
        direction = 1,
        critical = false,
        skill = false
    ) {
        if (!prefab || !this.layer.isValid) return;
        const root = instantiate(prefab);
        root.layer = this.layer.layer;
        root.parent = this.layer;
        const local = this.layer.getComponent(UITransform)!.convertToNodeSpaceAR(v3(worldX, worldY, 0));
        root.setPosition(local.x, local.y, 0);
        root.setScale(scale * (direction >= 0 ? 1 : -1), scale, 1);
        this.active.add(root);

        const featherTint = featherColor ? parseFeatherColor(featherColor) : null;
        // 星芒：暴击金 / 绝招亮白蓝 / 普攻近白
        const starTint = critical
            ? new Color(255, 214, 48, 255)
            : skill
                ? new Color(180, 210, 255, 255)
                : new Color(255, 255, 255, 255);
        const sparkTint = critical
            ? new Color(255, 180, 60, 255)
            : skill
                ? new Color(140, 190, 255, 255)
                : new Color(255, 240, 210, 255);

        for (const ps of root.getComponentsInChildren(ParticleSystem2D)) {
            ps.playOnLoad = false;
            // 按命中方向偏转血滴/羽毛主发射角
            if (ps.node.name === "Blood" || ps.node.name === "Feather") {
                const base = ps.angle;
                ps.angle = direction >= 0 ? base : 180 - base;
            }
            // 空中羽毛：乘翅膀色（贴图近白 + 深描边，染色后仍是该鸡毛色）
            if (ps.node.name === "Feather" && featherTint) {
                ps.startColor = new Color(featherTint.r, featherTint.g, featherTint.b, 255);
                ps.endColor = new Color(featherTint.r, featherTint.g, featherTint.b, 0);
            }
            if (ps.node.name === "Star") {
                ps.startColor = starTint;
                ps.endColor = new Color(starTint.r, starTint.g, starTint.b, 0);
            }
            if (ps.node.name === "Spark") {
                ps.startColor = sparkTint;
                ps.endColor = new Color(sparkTint.r, sparkTint.g, sparkTint.b, 0);
            }
            if (heavyBoost(ps.node.name, scale)) {
                ps.startSize *= scale;
                ps.endSize *= scale;
                ps.speed *= 0.85 + scale * 0.15;
            }
            ps.resetSystem();
        }

        tween(root).delay(life).call(() => {
            this.active.delete(root);
            if (root.isValid) {
                for (const ps of root.getComponentsInChildren(ParticleSystem2D)) {
                    if (ps.isValid) ps.stopSystem();
                }
                root.destroy();
            }
        }).start();
    }

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
        if (!this.floor.isValid || !this.splashFrame) return;
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
        const size = critical ? 96 : heavy ? 72 : 54;
        stain.addComponent(UITransform).setContentSize(size, size * 0.55);
        const sprite = stain.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.splashFrame;
        sprite.color = new Color(160, 55, 55);
        const limit = Math.max(0, this.floor.getComponent(UITransform)!.width / 2 - size / 2);
        stain.setPosition(Math.max(-limit, Math.min(limit, x)), groundY + (Math.random() - 0.5) * 28, 0);
        stain.angle = (Math.random() - 0.5) * 50;
        const flip = Math.random() < 0.5 ? -1 : 1;
        stain.setScale(flip * 0.55, 0.55, 1);
        tween(stain).to(0.1, { scale: v3(flip, 1, 1) }, { easing: "quadOut" }).start();
        const opacity = stain.addComponent(UIOpacity);
        opacity.opacity = critical ? 160 : 130;
        tween(opacity).delay(12).to(3, { opacity: 0 })
            .call(() => { this.stains.delete(stain); stain.destroy(); }).start();
    }

    private addGroundFeather(x: number, groundY: number, featherColor: string) {
        if (!this.floor.isValid || !this.featherFrame) return;
        if (this.groundFeathers.size >= 72) {
            const oldest = this.groundFeathers.values().next().value!;
            Tween.stopAllByTarget(oldest);
            const op = oldest.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
            this.groundFeathers.delete(oldest);
            oldest.destroy();
        }
        const node = new Node("GroundFeather");
        node.layer = this.floor.layer;
        node.parent = this.floor;
        this.groundFeathers.add(node);
        // 贴图 160，显示尺寸略抬一点，羽脉才清楚
        const size = 30 + Math.random() * 14;
        node.addComponent(UITransform).setContentSize(size, size);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.featherFrame;
        sprite.color = parseFeatherColor(featherColor);
        const limit = Math.max(0, this.floor.getComponent(UITransform)!.width / 2 - 30);
        node.setPosition(Math.max(-limit, Math.min(limit, x)), groundY, 0);
        node.angle = (Math.random() - 0.5) * 360;
        const scale = 0.75 + Math.random() * 0.4;
        node.setScale(scale, scale * 0.7, 1);
        const opacity = node.addComponent(UIOpacity);
        tween(opacity).delay(10).to(2, { opacity: 0 })
            .call(() => { this.groundFeathers.delete(node); node.destroy(); }).start();
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

function heavyBoost(name: string, scale: number) {
    return scale > 1.05 && (name === "Blood" || name === "Feather" || name === "Star" || name === "Spark");
}

/** 解析鸡翅膀色；非法值回落浅米，避免染成全黑看不见。 */
function parseFeatherColor(hex: string): Color {
    const raw = (hex || "").trim();
    const withHash = raw.startsWith("#") ? raw : raw ? `#${raw}` : "#fff0c0";
    try {
        const c = new Color();
        Color.fromHEX(c, withHash.length === 4
            ? `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`
            : withHash);
        return c;
    }
    catch {
        return new Color(255, 240, 192, 255);
    }
}
