/** 可种子随机，便于验证战斗结果 */
export class Rng {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed >>> 0;
        if (this.seed === 0) this.seed = 1;
    }

    next(): number {
        this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
        return this.seed / 0x100000000;
    }

    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    pick<T>(list: T[]): T {
        return list[this.int(0, list.length - 1)];
    }

    chance(p: number): boolean {
        return this.next() < p;
    }

    shuffle<T>(list: T[]): T[] {
        const arr = list.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            const t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
        }
        return arr;
    }
}
