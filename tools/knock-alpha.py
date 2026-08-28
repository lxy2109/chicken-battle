"""把假透明棋盘格抠成真正的 Alpha。只从画面边缘洪水填充，避免挖掉白眼珠。"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image

DIRS = (
    (1, 0), (-1, 0), (0, 1), (0, -1),
    (1, 1), (1, -1), (-1, 1), (-1, -1),
)


def is_checker(r: int, g: int, b: int, avg_min: int) -> bool:
    sat = max(r, g, b) - min(r, g, b)
    avg = (r + g + b) / 3
    return sat <= 14 and abs(r - b) <= 12 and avg >= avg_min


def knock(path: Path) -> tuple[int, int]:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    pix = im.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def idx(x: int, y: int) -> int:
        return y * w + x

    def push(x: int, y: int, avg_min: int) -> None:
        if x < 0 or y < 0 or x >= w or y >= h:
            return
        i = idx(x, y)
        if seen[i]:
            return
        r, g, b, _ = pix[x, y]
        if not is_checker(r, g, b, avg_min):
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0, 232)
        push(x, h - 1, 232)
    for y in range(h):
        push(0, y, 232)
        push(w - 1, y, 232)

    cleared = 0
    while q:
        x, y = q.popleft()
        pix[x, y] = (0, 0, 0, 0)
        cleared += 1
        for dx, dy in DIRS:
            push(x + dx, y + dy, 232)

    for _ in range(3):
        halo: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                if pix[x, y][3] == 0:
                    continue
                r, g, b, _ = pix[x, y]
                if not is_checker(r, g, b, 220):
                    continue
                edge = False
                for dx, dy in DIRS:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and pix[nx, ny][3] == 0:
                        edge = True
                        break
                if edge:
                    halo.append((x, y))
        if not halo:
            break
        for x, y in halo:
            pix[x, y] = (0, 0, 0, 0)
            cleared += 1

    im.save(path, "PNG")
    return cleared, w * h


def main() -> None:
    files = [Path(a) for a in sys.argv[1:]]
    if not files:
        root = Path(__file__).resolve().parents[1]
        tex = root / "assets" / "bundle" / "game" / "texture"
        files = sorted(tex.glob("chicken/*.png")) + sorted(tex.glob("ui/*.png"))
    if not files:
        print("no files")
        sys.exit(1)
    for f in files:
        n, total = knock(f)
        print(f"{f.name}\tcleared {n}/{total} ({100 * n / total:.1f}%)")


if __name__ == "__main__":
    main()
