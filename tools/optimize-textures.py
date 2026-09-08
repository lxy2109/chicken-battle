"""Resize oversized PNGs without renaming assets or changing UUIDs. Requires Pillow.

Run after importing new art: python tools/optimize-textures.py
Original files and a size report are kept in ignored outputs/texture-optimization/.
"""
import io
import json
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BACKUP = ROOT / "outputs/texture-optimization"
LIMITS = {"bg": (720, 1280), "chicken": (384, 576), "icon": (160, 160),
          "map": (256, 256), "ui": (768, 1024), "equip": (256, 256)}


def update_meta(meta, image, old_size):
    w, h = image.size
    sx, sy = w / old_size[0], h / old_size[1]
    for sub in meta["subMetas"].values():
        if sub["importer"] != "sprite-frame":
            continue
        u = sub["userData"]
        box = image.getchannel("A").getbbox() if u["trimType"] == "auto" else None
        x, y, right, bottom = box or (0, 0, w, h)
        fw, fh = right - x, bottom - y
        u.update(trimX=x, trimY=y, width=fw, height=fh, rawWidth=w, rawHeight=h,
                 offsetX=x + fw / 2 - w / 2, offsetY=h / 2 - y - fh / 2)
        for key, scale in [("borderLeft", sx), ("borderRight", sx),
                           ("borderTop", sy), ("borderBottom", sy)]:
            u[key] = round(u[key] * scale)
        u["vertices"] = {
            "rawPosition": [-fw/2, -fh/2, 0, fw/2, -fh/2, 0, -fw/2, fh/2, 0, fw/2, fh/2, 0],
            "indexes": [0, 1, 2, 2, 1, 3],
            "uv": [x, h-y, right, h-y, x, h-bottom, right, h-bottom],
            "nuv": [x/w, y/h, right/w, y/h, x/w, bottom/h, right/w, bottom/h],
            "minPos": [-fw/2, -fh/2, 0], "maxPos": [fw/2, fh/2, 0]
        }


def main():
    report = []
    files = sorted((ROOT / "assets/bundle/game/texture").rglob("*.png"))
    files += sorted((ROOT / "assets/bundle/gui/loading/texture").glob("*.png"))
    for file in files:
        source = file.read_bytes()
        image = Image.open(io.BytesIO(source)).convert("RGBA")
        old_size = image.size
        limit = LIMITS.get(file.parent.name, (720, 1280))
        image.thumbnail(limit, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        opaque = image.getchannel("A").getextrema() == (255, 255)
        (image.convert("RGB") if opaque else image).save(output, "PNG", optimize=True, compress_level=9)
        data = output.getvalue()
        if image.size == old_size and len(data) >= len(source):
            continue
        rel = file.relative_to(ROOT)
        backup = BACKUP / rel
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(file, backup)
            shutil.copy2(str(file) + ".meta", str(backup) + ".meta")
        meta_file = Path(str(file) + ".meta")
        meta = json.loads(meta_file.read_text(encoding="utf8"))
        if image.size != old_size:
            update_meta(meta, image, old_size)
        meta["userData"]["hasAlpha"] = not opaque
        meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        file.write_bytes(data)
        report.append(dict(path=rel.as_posix(), before=len(source), after=len(data),
                           old_size=old_size, new_size=image.size))
    BACKUP.mkdir(parents=True, exist_ok=True)
    (BACKUP / "report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print(f"Optimized {len(report)} textures: {sum(r['before'] for r in report):,} -> {sum(r['after'] for r in report):,} bytes")


if __name__ == "__main__":
    main()
