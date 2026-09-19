import { gameNumber } from "../../domain/GameConfig";
import { Color, Label, Node, UITransform } from "cc";
import { DanmakuPool } from "../../domain/Danmaku";

/** 弹幕轨道数；与 DanmakuLayer 高度匹配，行距 ≥ 行高以免竖向叠字。 */
const ROWS = 3;
const ROW_STEP = 52;
/** 同轨两条弹幕之间至少留的空隙（逻辑像素）。 */
const MIN_GAP = 48;

/** Scrolling labels paced by interval only; kept below names/HP and above the arena. */
export class BattleDanmaku {
    private lines: Array<{ node: Node; text: string; width: number; speed: number; row: number }> = [];
    private low = false;
    private elapsed = 0;
    private nextAt = gameNumber("danmaku_firstDelay");
    private width: number;
    /** 全场统一速度，同轨只要出生时留空就不会追尾。 */
    private speed: number;
    constructor(private layer: Node, private pool: DanmakuPool) {
        this.width = layer.getComponent(UITransform)!.width;
        // 按中等文案宽度估速，保证各条同速横穿。
        this.speed = (this.width + 280) / gameNumber("danmaku_travelSeconds");
    }

    tick(dt: number, lowHp: boolean) {
        this.low = lowHp;
        this.elapsed += dt;
        this.advance(dt);
        if (this.elapsed < this.nextAt) return;
        if (!this.spawn()) return;
        this.nextAt = this.elapsed + (this.low ? gameNumber("danmaku_lowHpInterval") : gameNumber("danmaku_interval"));
    }

    /** 从当前场合适的弹幕池立刻发一条；无空位时失败且不占冷却。 */
    fire(): boolean {
        return this.spawn();
    }

    clear() {
        for (const line of this.lines) line.node.destroy();
        this.lines = [];
    }

    private advance(dt: number) {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const line = this.lines[i];
            line.node.setPosition(line.node.position.x - line.speed * dt, line.node.position.y);
            if (line.node.position.x + line.width / 2 < -this.width / 2) {
                line.node.destroy();
                this.lines.splice(i, 1);
            }
        }
    }

    private spawn(): boolean {
        const text = this.pool.next(this.lines.map(line => line.text));
        if (!text) return false;

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

        const row = this.pickRow();
        if (row < 0) {
            node.destroy();
            return false;
        }

        // 轨道在层内垂直居中：最上 row0，往下递减。
        const y0 = ((ROWS - 1) * ROW_STEP) / 2;
        node.setPosition((this.width + width) / 2, y0 - row * ROW_STEP);
        this.lines.push({ node, text, width, speed: this.speed, row });
        return true;
    }

    /**
     * 选一条出生后不会与同轨已有弹幕追尾的轨道。
     * 新弹左缘固定在屏右 width/2；同速下只需最右缘 + 空隙 ≤ 该左缘。
     * 多轨都空闲时优先更空的一条。
     */
    private pickRow(): number {
        const spawnLeft = this.width / 2;
        let best = -1;
        let bestRight = Infinity;
        for (let row = 0; row < ROWS; row++) {
            let rightmost = -Infinity;
            for (const line of this.lines) {
                if (line.row !== row) continue;
                rightmost = Math.max(rightmost, line.node.position.x + line.width / 2);
            }
            if (rightmost > -Infinity && rightmost + MIN_GAP > spawnLeft) continue;
            const score = rightmost === -Infinity ? -1e9 : rightmost;
            if (score < bestRight) {
                bestRight = score;
                best = row;
            }
        }
        return best;
    }
}
