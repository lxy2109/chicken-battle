import { gameNumber } from "../../core/GameConfig";
import { Color, Label, Node, UITransform } from "cc";
import { DanmakuPool } from "../../core/Danmaku";

/** A bounded set of scrolling labels, kept below names/HP and above the arena. */
export class BattleDanmaku {
    private lines: Array<{ node: Node; text: string; width: number; speed: number; row: number }> = [];
    private low = false;
    private elapsed = 0;
    private nextAt = gameNumber("danmaku_firstDelay");
    private emitted = 0;
    private readonly limit: number;
    private width: number;
    constructor(private layer: Node, private pool: DanmakuPool) {
        this.width = layer.getComponent(UITransform)!.width;
        this.limit = pool.kind === "warmup" ? gameNumber("danmaku_warmupLimit") : pool.kind === "official" ? gameNumber("danmaku_officialLimit") : gameNumber("danmaku_bossLimit");
    }

    tick(dt: number, lowHp: boolean) {
        this.low = lowHp;
        this.elapsed += dt;
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const line = this.lines[i];
            line.node.setPosition(line.node.position.x - line.speed * dt, line.node.position.y);
            if (line.node.position.x + line.width / 2 < -this.width / 2) {
                line.node.destroy();
                this.lines.splice(i, 1);
            }
        }
        if (this.elapsed < this.nextAt || this.emitted >= this.limit || this.lines.length >= 2) return;
        for (let row = 0; row < 2; row++) {
            const last = this.lines.filter(line => line.row === row).slice(-1)[0];
            if (last) continue;
            const text = this.pool.next(this.lines.map(line => line.text));
            if (!text) continue;
            const node = new Node("Comment");
            node.layer = this.layer.layer;
            node.parent = this.layer;
            const label = node.addComponent(Label);
            label.fontSize = 28;
            label.lineHeight = 40;
            label.color = new Color(255, 249, 213);
            label.enableOutline = true;
            label.outlineColor = new Color(48, 30, 25);
            label.outlineWidth = 2;
            label.string = text;
            label.updateRenderData(true);
            const width = node.getComponent(UITransform)!.width;
            node.setPosition((this.width + width) / 2, 35 - row * 64);
            const speed = (this.width + width) / gameNumber("danmaku_travelSeconds");
            this.lines.push({ node, text, width, speed, row });
            this.emitted++;
            this.nextAt = this.elapsed + (this.low ? gameNumber("danmaku_lowHpInterval") : gameNumber("danmaku_interval"));
            break;
        }
    }

    clear() {
        for (const line of this.lines) line.node.destroy();
        this.lines = [];
    }
}
