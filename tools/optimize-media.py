"""Compress suit-win GIFs and the ending video without renaming assets or changing UUIDs.

Run after importing new media: python tools/optimize-media.py
Originals and a size report are kept in ignored outputs/media-optimization/.

GIFs stay GIF (the runtime decoder only reads .gif). They are scaled to the ChickenSlot
display box 360x490 with gifsicle mix resize, keeping per-frame local palettes, then
packed with -O3. This avoids a second 128-color quantize pass.
The ending MP4 is scaled to 432x768 H.264, matching the 406x720 Cover playback size.

Need gifsicle: npm install gifsicle --prefix tools
Need ffmpeg:   pip install imageio-ffmpeg
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BACKUP = ROOT / "outputs/media-optimization"
GIF_DIR = ROOT / "assets/bundle/game/equip_win_gif"
VIDEO = ROOT / "assets/bundle/game/video/ending.mp4"
GIF_BOX = (360, 490)
VIDEO_SIZE = (432, 768)
VIDEO_CRF = "28"


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
    except ImportError as err:
        raise SystemExit("Need imageio-ffmpeg: pip install imageio-ffmpeg") from err
    return imageio_ffmpeg.get_ffmpeg_exe()


def gifsicle_exe() -> Path:
    for candidate in (
        ROOT / "tools/node_modules/gifsicle/vendor/gifsicle.exe",
        ROOT / "tools/node_modules/gifsicle/vendor/gifsicle",
        shutil.which("gifsicle"),
    ):
        if candidate and Path(candidate).exists():
            return Path(candidate)
    raise SystemExit("Need gifsicle: npm install gifsicle --prefix tools")


def run_cmd(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "command failed").strip()
        raise RuntimeError(detail)


def gif_info(path: Path) -> tuple[tuple[int, int], int]:
    image = Image.open(path)
    return image.size, getattr(image, "n_frames", 1)


def original_file(path: Path) -> Path:
    backup = BACKUP / path.relative_to(ROOT)
    return backup if backup.exists() else path


def backup_file(path: Path) -> None:
    rel = path.relative_to(ROOT)
    dest = BACKUP / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        shutil.copy2(path, dest)
    meta = Path(str(path) + ".meta")
    if meta.exists():
        meta_dest = Path(str(dest) + ".meta")
        if not meta_dest.exists():
            shutil.copy2(meta, meta_dest)


def compress_gif(gifsicle: Path, src: Path, dest: Path) -> None:
    # mix resize keeps 1-bit transparency cleaner than lanczos. Local palettes stay
    # intact; -O3 only packs dirty-rects / LZW. Do not pass --lossy or --colors.
    run_cmd([
        str(gifsicle),
        "--resize-fit", f"{GIF_BOX[0]}x{GIF_BOX[1]}",
        "--resize-method", "mix",
        "--resize-colors", "256",
        "-O3",
        "--no-comments",
        "--no-names",
        "-o", str(dest),
        str(src),
    ])
    size, frames = gif_info(dest)
    if frames < 2:
        raise RuntimeError(f"{src.name} compressed to {frames} frame(s)")
    if size[0] > GIF_BOX[0] + 2 or size[1] > GIF_BOX[1] + 2:
        raise RuntimeError(f"{src.name} still oversized: {size}")


def compress_video(ff: str, src: Path, dest: Path) -> None:
    vf = (
        f"scale='min({VIDEO_SIZE[0]},iw)':-2:flags=lanczos,"
        "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    )
    run_cmd([
        ff, "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-vf", vf,
        "-c:v", "libx264",
        "-profile:v", "main",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-crf", VIDEO_CRF,
        "-preset", "slow",
        "-c:a", "aac",
        "-b:a", "96k",
        "-ac", "2",
        "-movflags", "+faststart",
        str(dest),
    ])
    if dest.stat().st_size < 1024:
        raise RuntimeError("compressed video is empty")


def write_if_smaller(asset: Path, compressed: Path, original_size: int, kind: str) -> dict:
    after = compressed.stat().st_size
    row = {
        "path": asset.relative_to(ROOT).as_posix(),
        "kind": kind,
        "before": original_size,
        "after": after,
        "replaced": False,
    }
    if after >= original_size:
        return row
    backup_file(asset)
    shutil.copy2(compressed, asset)
    row["replaced"] = True
    return row


def main() -> None:
    kinds = set(sys.argv[1:] or ["gif", "mp4"])
    work = BACKUP / "_work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)
    report = []

    if "gif" in kinds:
        gifsicle = gifsicle_exe()
        gifs = sorted(GIF_DIR.glob("*.gif"))
        if not gifs:
            print("No GIFs in", GIF_DIR)
        for asset in gifs:
            src = original_file(asset)
            dest = work / asset.name
            print(f"GIF {asset.name} ...", flush=True)
            try:
                _, src_frames = gif_info(src)
                compress_gif(gifsicle, src, dest)
                _, out_frames = gif_info(dest)
                row = write_if_smaller(asset, dest, src.stat().st_size, "gif")
                row["src_frames"] = src_frames
                row["out_frames"] = out_frames
                row["out_size"] = list(gif_info(asset if row["replaced"] else dest)[0])
                report.append(row)
                status = "ok" if row["replaced"] else "kept original (not smaller)"
                print(f"  {row['before']:,} -> {row['after']:,}  {status}")
            except Exception as err:
                report.append({"path": asset.relative_to(ROOT).as_posix(), "kind": "gif", "error": str(err)})
                print(f"  failed: {err}", file=sys.stderr)

    if "mp4" in kinds and VIDEO.exists():
        src = original_file(VIDEO)
        dest = work / VIDEO.name
        print(f"MP4 {VIDEO.name} ...", flush=True)
        try:
            compress_video(ffmpeg_exe(), src, dest)
            row = write_if_smaller(VIDEO, dest, src.stat().st_size, "mp4")
            report.append(row)
            status = "ok" if row["replaced"] else "kept original (not smaller)"
            print(f"  {row['before']:,} -> {row['after']:,}  {status}")
        except Exception as err:
            report.append({"path": VIDEO.relative_to(ROOT).as_posix(), "kind": "mp4", "error": str(err)})
            print(f"  failed: {err}", file=sys.stderr)

    BACKUP.mkdir(parents=True, exist_ok=True)
    (BACKUP / "report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    ok = [r for r in report if r.get("replaced")]
    before = sum(r["before"] for r in ok)
    after = sum(r["after"] for r in ok)
    print(f"Optimized {len(ok)} files: {before:,} -> {after:,} bytes")
    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
