from __future__ import annotations
from collections import deque
from pathlib import Path
import hashlib, json, sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/bundle/game/image/anim"
SHEET, CELL, PAD, COLS = 1024, 256, 12, 4

def uuid_for(seed: str) -> str:
    h = hashlib.md5(("chicken-strike:" + seed).encode("utf-8")).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

def sprite_meta(uuid: str, name: str, w: int = SHEET, h: int = SHEET) -> dict:
    hw, hh = w / 2, h / 2
    return {
        "ver": "1.0.27", "importer": "image", "imported": True, "uuid": uuid,
        "files": [".json", ".png"],
        "subMetas": {
            "6c48a": {
                "importer": "texture", "uuid": uuid + "@6c48a", "displayName": name,
                "id": "6c48a", "name": "texture", "ver": "1.0.22", "imported": True,
                "files": [".json"], "subMetas": {},
                "userData": {
                    "wrapModeS": "clamp-to-edge", "wrapModeT": "clamp-to-edge",
                    "minfilter": "linear", "magfilter": "linear", "mipfilter": "none",
                    "premultiplyAlpha": False, "anisotropy": 1, "isUuid": True,
                    "imageUuidOrDatabaseUri": uuid, "visible": False
                }
            },
            "f9941": {
                "importer": "sprite-frame", "uuid": uuid + "@f9941", "displayName": name,
                "id": "f9941", "name": "spriteFrame", "ver": "1.0.12", "imported": True,
                "files": [".json"], "subMetas": {},
                "userData": {
                    "trimType": "none", "trimThreshold": 1, "rotated": False,
                    "offsetX": 0, "offsetY": 0, "trimX": 0, "trimY": 0,
                    "width": w, "height": h, "rawWidth": w, "rawHeight": h,
                    "borderTop": 0, "borderBottom": 0, "borderLeft": 0, "borderRight": 0,
                    "isUuid": True, "imageUuidOrDatabaseUri": uuid + "@6c48a",
                    "atlasUuid": "", "packable": False, "pixelsToUnit": 100,
                    "pivotX": 0.5, "pivotY": 0.5, "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0], "maxPos": [hw, hh, 0]
                    }
                }
            }
        },
        "userData": {
            "type": "sprite-frame", "redirect": uuid + "@6c48a", "hasAlpha": True,
            "fixAlphaTransparencyArtifacts": False,
            "compressSettings": {"useCompressTexture": True, "presetId": "chicken-web"}
        }
    }

def strict_mag(r,g,b):
    return r >= 210 and b >= 200 and g <= 40 and abs(r-b) <= 40

def loose_mag(r,g,b):
    score = (r + b) * 0.5 - g
    return r >= 170 and b >= 160 and g <= 80 and score >= 80 and abs(r-b) <= 70

def key_magenta(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r,g,b,a = px[x,y]
            if a and strict_mag(r,g,b):
                px[x,y] = (0,0,0,0)
    seen = [[False]*w for _ in range(h)]
    q = deque()
    def push(x,y):
        if x<0 or y<0 or x>=w or y>=h or seen[y][x]:
            return
        r,g,b,a = px[x,y]
        if a==0 or loose_mag(r,g,b):
            seen[y][x] = True
            q.append((x,y))
    for x in range(w):
        push(x,0); push(x,h-1)
    for y in range(h):
        push(0,y); push(w-1,y)
    for y in range(h):
        for x in range(w):
            if px[x,y][3]==0:
                push(x,y)
    while q:
        x,y = q.popleft()
        r,g,b,a = px[x,y]
        if a != 0:
            px[x,y] = (0,0,0,0)
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            nx,ny = x+dx, y+dy
            if nx<0 or ny<0 or nx>=w or ny>=h or seen[ny][nx]:
                continue
            rr,gg,bb,aa = px[nx,ny]
            if aa==0 or loose_mag(rr,gg,bb):
                seen[ny][nx] = True
                q.append((nx,ny))
    for y in range(h):
        for x in range(w):
            r,g,b,a = px[x,y]
            if a==0:
                continue
            near = False
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny = x+dx, y+dy
                if 0<=nx<w and 0<=ny<h and px[nx,ny][3]==0:
                    near = True
                    break
            if near and r>g+20 and b>g+20:
                px[x,y] = (min(r,g+12), g, min(b,g+12), a)
    return im

def compose(im: Image.Image) -> Image.Image:
    sheet = Image.new("RGBA", (SHEET, SHEET), (0,0,0,0))
    for i in range(16):
        col, row = i % 4, i // 4
        cell = im.crop((col*CELL, row*CELL, (col+1)*CELL, (row+1)*CELL))
        box = cell.getchannel("A").getbbox()
        if not box:
            continue
        trimmed = cell.crop(box)
        inner = CELL - PAD*2
        tw, th = trimmed.size
        scale = min(inner/tw, inner/th, 1)
        nw, nh = max(1, round(tw*scale)), max(1, round(th*scale))
        if (nw, nh) != (tw, th):
            trimmed = trimmed.resize((nw, nh), Image.Resampling.LANCZOS)
        fitted = Image.new("RGBA", (CELL, CELL), (0,0,0,0))
        ox = (CELL-nw)//2
        oy = CELL-PAD-nh
        fitted.paste(trimmed, (ox, max(0, oy)), trimmed)
        sheet.paste(fitted, (col*CELL, row*CELL), fitted)
    return sheet

def import_one(src: Path, key: str, style: str):
    keyed = key_magenta(Image.open(src))
    sheet = compose(keyed)
    dest_dir = OUT / key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{style}.png"
    sheet.save(dest, format="PNG")
    meta = dest.with_suffix(".png.meta")
    if not meta.exists():
        meta.write_text(json.dumps(sprite_meta(uuid_for(f"{key}/{style}"), style), indent=4) + "\n", encoding="utf-8")
    print(f"{key}/{style} -> {dest}")

def main(argv):
    if len(argv) >= 2 and argv[0] == "--dir":
        for f in sorted(Path(argv[1]).glob("*.png")):
            parts = f.name[:-4].split(".")
            if len(parts) != 2:
                print("skip", f.name); continue
            import_one(f, parts[0], parts[1])
        return
    if len(argv) < 3:
        print("usage: key-import-magenta.py <src.png> <charKey> <style>"); sys.exit(1)
    import_one(Path(argv[0]), argv[1], argv[2])

if __name__ == "__main__":
    main(sys.argv[1:])
