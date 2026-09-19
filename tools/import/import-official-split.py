"""Prepare the official Chinese-named chicken splits for the puppet prefab.

Keeps the UUIDs Creator assigned on import. Converts palette PNG to RGBA,
trims empty canvas, scales into the chicken size budget, and writes sprite-frame metas.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
TEX = ROOT / "assets/bundle/game/image/actor"
TEX_SCALE = 0.40
PAD = 4

# dest stem is the imported filename. UUIDs come from Creator import.
PARTS = [
    ("澶?png", "053bdeac-a06d-4742-80dc-1c69ecf31724"),
    ("鑴栧瓙.png", "23521cf7-2230-4f38-8dfb-dc36b815d251"),
    ("韬綋.png", "60762255-9104-48d8-b09d-e24d880f4b36"),
    ("鍓嶇繀鑶€.png", "3d993b9c-a701-48c0-b39d-cb094fd16de5"),
    ("鍚庣繀鑶€.png", "7dff6a90-be97-4381-ad62-cc80f0bc3f46"),
    ("鍓嶈吙.png", "5d2f5ab7-b020-44c6-bc28-cf658aa65957"),
    ("鍚庤吙.png", "b8b845fe-b15e-400a-87de-03f889c487cc"),
]


def prepare(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
    box = im.getchannel("A").getbbox()
    if box:
        x0, y0, x1, y1 = box
        im = im.crop((max(0, x0 - PAD), max(0, y0 - PAD), min(w, x1 + PAD), min(h, y1 + PAD)))
    nw = max(1, round(im.width * TEX_SCALE))
    nh = max(1, round(im.height * TEX_SCALE))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def sprite_meta(name: str, uuid: str, w: int, h: int) -> dict:
    hw, hh = w / 2, h / 2
    return {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": uuid,
        "files": [".json", ".png"],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": uuid + "@6c48a",
                "displayName": name,
                "id": "6c48a",
                "name": "texture",
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "premultiplyAlpha": False,
                    "anisotropy": 1,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": uuid,
                    "visible": False,
                },
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": uuid + "@f9941",
                "displayName": name,
                "id": "f9941",
                "name": "spriteFrame",
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
                "userData": {
                    "trimType": "none",
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0.0,
                    "offsetY": 0.0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": uuid + "@6c48a",
                    "atlasUuid": "",
                    "packable": False,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
                },
            },
        },
        "userData": {
            "type": "sprite-frame",
            "redirect": uuid + "@6c48a",
            "hasAlpha": True,
            "fixAlphaTransparencyArtifacts": False,
            "compressSettings": {
                "useCompressTexture": True,
                "presetId": "chicken-web",
            },
        },
    }


def main() -> None:
    print("role          tex          display")
    for filename, uuid in PARTS:
        path = TEX / filename
        im = prepare(Image.open(path))
        im.save(path, "PNG", optimize=True, compress_level=9)
        stem = path.stem
        meta = sprite_meta(stem, uuid, im.width, im.height)
        path.with_suffix(".png.meta").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
        )
        print(f"{stem:12} {im.width:3}x{im.height:<3}   {im.width/2:6.1f}x{im.height/2:.1f}")


if __name__ == "__main__":
    main()
