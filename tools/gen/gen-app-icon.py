"""Generate tracked Android launcher icons and web favicons from the app-icon source.

Source of truth lives in build-templates/ (git-tracked). native/ is gitignored, so
Android builds copy from build-templates via extensions/web-publish/hooks.js.
"""
from __future__ import annotations

import os
import shutil
from collections import deque

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MASTER = os.path.join(ROOT, "build-templates", "icon", "app-icon.png")
ICON_DIR = os.path.join(ROOT, "build-templates", "icon")
ANDROID_TEMPLATE_RES = os.path.join(ROOT, "build-templates", "android", "proj", "res")
NATIVE_ANDROID_RES = os.path.join(ROOT, "native", "engine", "android", "res")

MIPMAPS = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

ICON_TAGS = """  <link rel="icon" type="image/png" href="favicon.png"/>
  <link rel="apple-touch-icon" href="apple-touch-icon.png"/>
  <link rel="apple-touch-icon-precomposed" href="apple-touch-icon.png"/>"""

OLD_TAGS = """  <!--<link rel="apple-touch-icon" href=".png" />-->
  <!--<link rel="apple-touch-icon-precomposed" href=".png" />-->"""


def is_dark(c: tuple[int, int, int, int]) -> bool:
    return c[0] < 28 and c[1] < 28 and c[2] < 28


def punch_corners(im: Image.Image) -> Image.Image:
    """Turn the black rounded-rect padding into transparency."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        q.append((x, y))
        seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        c = px[x, y]
        if not is_dark(c):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or not is_dark((r, g, b, a)):
                continue
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    px[x, y] = (r, g, b, 0)
                    break
    return im


def save_resized(im: Image.Image, path: str, size: int, fmt: str = "PNG") -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = im.resize((size, size), Image.Resampling.LANCZOS)
    if fmt == "ICO":
        out.save(path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    else:
        out.save(path, "PNG", optimize=True)
    print(os.path.relpath(path, ROOT), size, os.path.getsize(path))


def patch_html(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        html = f.read()
    if "favicon.png" in html:
        print("already has favicon", path)
        return
    if OLD_TAGS in html:
        html = html.replace(OLD_TAGS, ICON_TAGS)
    else:
        html = html.replace("</head>", ICON_TAGS + "\n</head>")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("patched", path)


def copy_mipmaps(im: Image.Image, dest_res: str) -> None:
    for folder, size in MIPMAPS.items():
        save_resized(im, os.path.join(dest_res, folder, "ic_launcher.png"), size)


def main() -> None:
    if not os.path.isfile(MASTER):
        raise SystemExit(f"missing source icon: {MASTER}")
    im = punch_corners(Image.open(MASTER))
    os.makedirs(ICON_DIR, exist_ok=True)
    im.save(MASTER, "PNG", optimize=True)
    print("master", os.path.relpath(MASTER, ROOT), im.size, os.path.getsize(MASTER))

    copy_mipmaps(im, ANDROID_TEMPLATE_RES)
    if os.path.isdir(os.path.join(ROOT, "native", "engine", "android")):
        copy_mipmaps(im, NATIVE_ANDROID_RES)

    save_resized(im, os.path.join(ICON_DIR, "favicon.png"), 32)
    save_resized(im, os.path.join(ICON_DIR, "apple-touch-icon.png"), 180)
    save_resized(im, os.path.join(ICON_DIR, "icon-192.png"), 192)
    save_resized(im, os.path.join(ICON_DIR, "playstore-512.png"), 512)
    save_resized(im, os.path.join(ICON_DIR, "favicon.ico"), 48, "ICO")

    web_mobile = os.path.join(ROOT, "build-templates", "web-mobile")
    web_desktop = os.path.join(ROOT, "build-templates", "web-desktop")
    os.makedirs(web_mobile, exist_ok=True)
    os.makedirs(web_desktop, exist_ok=True)
    for name in ("favicon.png", "apple-touch-icon.png", "icon-192.png", "favicon.ico"):
        shutil.copy2(os.path.join(ICON_DIR, name), os.path.join(web_mobile, name))
    shutil.copy2(os.path.join(ICON_DIR, "favicon.ico"), os.path.join(web_desktop, "favicon.ico"))
    shutil.copy2(os.path.join(ICON_DIR, "favicon.png"), os.path.join(web_desktop, "favicon.png"))

    for dest in (
        os.path.join(ROOT, "build", "web-mobile"),
        os.path.join(ROOT, "build", "web-mobile-001"),
        os.path.join(ROOT, "build", "web-mobile-optimized"),
    ):
        if not os.path.isdir(dest):
            continue
        for name in ("favicon.png", "apple-touch-icon.png", "icon-192.png", "favicon.ico"):
            shutil.copy2(os.path.join(ICON_DIR, name), os.path.join(dest, name))
        patch_html(os.path.join(dest, "index.html"))


if __name__ == "__main__":
    main()
