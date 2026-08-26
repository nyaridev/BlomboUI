from __future__ import annotations

import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any

ANIM_FORMATS = ("gif", "webp", "video")
VIDEO_EXTS = (".mp4", ".webm")


def detect_ext(data: bytes, media: str) -> str:
    mime = str(media or "").split(";", 1)[0].strip().lower()
    if mime == "image/gif" or data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if mime in {"video/webm", "video/x-matroska"} or data[:4] == b"\x1a\x45\xdf\xa3":
        return ".webm"
    if mime in {"video/mp4", "video/quicktime"} or _is_mp4(data):
        return ".mp4"
    return ""


def is_mp4(data: bytes) -> bool:
    return _is_mp4(data)


def is_video_ext(ext: str) -> bool:
    return ext in VIDEO_EXTS


def is_animated_image(image: Any) -> bool:
    return bool(getattr(image, "is_animated", False) and int(getattr(image, "n_frames", 1) or 1) > 1)


def ffmpeg_bin() -> str | None:
    return shutil.which("ffmpeg")


def fit_size(width: int, height: int, megapixels: float) -> tuple[int, int]:
    if width <= 0 or height <= 0:
        return 1, 1
    cap = max(0.05, megapixels) * 1_000_000
    pixels = width * height
    if pixels <= cap:
        return width, height
    ratio = (cap / pixels) ** 0.5
    return max(1, round(width * ratio)), max(1, round(height * ratio))


def fit_image(image: Any, megapixels: float) -> None:
    width, height = image.size
    target = fit_size(width, height, megapixels)
    if target != (width, height):
        image.thumbnail(target)


def encode_animated(
    data: bytes,
    src_ext: str,
    dest_stem: Path,
    fmt: str,
    megapixels: float,
    quality: int,
) -> Path | None:
    kind = fmt if fmt in ANIM_FORMATS else "webp"
    dest_ext = { "gif": ".gif", "webp": ".webp", "video": ".mp4" }[kind]
    if is_video_ext(src_ext) or kind == "video":
        path = _ffmpeg_encode(data, dest_stem, dest_ext, megapixels, quality)
        if path:
            return path
        if is_video_ext(src_ext):
            return _write_bytes(dest_stem, src_ext, data)
        if src_ext == ".gif":
            return _pillow_encode(data, dest_stem, ".webp" if dest_ext == ".mp4" else dest_ext, megapixels, quality)
        return None
    return _pillow_encode(data, dest_stem, dest_ext, megapixels, quality)


def first_frame_path(path: Path) -> Any | None:
    ffmpeg = ffmpeg_bin()
    if not ffmpeg:
        return None
    try:
        from PIL import Image
    except Exception:
        return None
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / "frame.png"
        if not _run([ffmpeg, "-y", "-i", str(path), "-frames:v", "1", str(out)]) or not out.is_file():
            return None
        try:
            image = Image.open(out)
            image.load()
            return image.convert("RGBA")
        except Exception:
            return None


def first_frame(data: bytes, src_ext: str) -> Any | None:
    if is_video_ext(src_ext):
        return _ffmpeg_frame(data)
    try:
        from PIL import Image

        image = Image.open(BytesIO(data))
        image.load()
        image.seek(0)
        return image.convert("RGBA")
    except Exception:
        return None


def write_original(dest_stem: Path, ext: str, data: bytes) -> Path:
    return _write_bytes(dest_stem, ext or ".bin", data)


def _is_mp4(data: bytes) -> bool:
    return len(data) >= 12 and data[4:8] == b"ftyp"


def _write_bytes(dest_stem: Path, ext: str, data: bytes) -> Path:
    dest = Path(str(dest_stem) + ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def _pillow_encode(data: bytes, dest_stem: Path, dest_ext: str, megapixels: float, quality: int) -> Path | None:
    try:
        from PIL import Image, ImageSequence
    except Exception:
        return None
    try:
        source = Image.open(BytesIO(data))
        source.load()
    except Exception:
        return None
    frames: list[Any] = []
    durations: list[int] = []
    for frame in ImageSequence.Iterator(source):
        durations.append(max(20, int(frame.info.get("duration") or 100)))
        converted = frame.convert("RGBA").copy()
        fit_image(converted, megapixels)
        frames.append(converted)
    if not frames:
        return None
    dest = Path(str(dest_stem) + dest_ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    loop = int(source.info.get("loop") or 0)
    if dest_ext == ".gif":
        palettes = [frame.convert("P") for frame in frames]
        palettes[0].save(
            dest,
            format="GIF",
            save_all=True,
            append_images=palettes[1:],
            duration=durations,
            loop=loop,
            disposal=2,
        )
        return dest
    frames[0].save(
        dest,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=loop,
        quality=max(1, min(100, quality)),
        method=4,
    )
    return dest


def _ffmpeg_encode(data: bytes, dest_stem: Path, dest_ext: str, megapixels: float, quality: int) -> Path | None:
    ffmpeg = ffmpeg_bin()
    if not ffmpeg:
        return None
    with tempfile.TemporaryDirectory() as folder:
        src = Path(folder) / "in.bin"
        out = Path(folder) / f"out{dest_ext}"
        src.write_bytes(data)
        width, height = _probe_size(ffmpeg, src)
        tw, th = fit_size(width, height, megapixels)
        if dest_ext == ".mp4":
            tw -= tw % 2
            th -= th % 2
            tw, th = max(2, tw), max(2, th)
        vf = f"scale={tw}:{th}:force_original_aspect_ratio=decrease"
        cmd = [ffmpeg, "-y", "-i", str(src)]
        if dest_ext == ".gif":
            cmd += ["-vf", f"{vf},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", str(out)]
        elif dest_ext == ".webp":
            q = max(1, min(100, quality))
            cmd += ["-vf", vf, "-loop", "0", "-quality", str(q), str(out)]
        else:
            cmd += ["-vf", vf, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
        if not _run(cmd) or not out.is_file() or not out.stat().st_size:
            return None
        dest = Path(str(dest_stem) + dest_ext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(out.read_bytes())
        return dest


def _ffmpeg_frame(data: bytes) -> Any | None:
    ffmpeg = ffmpeg_bin()
    if not ffmpeg:
        return None
    try:
        from PIL import Image
    except Exception:
        return None
    with tempfile.TemporaryDirectory() as folder:
        src = Path(folder) / "in.bin"
        out = Path(folder) / "frame.png"
        src.write_bytes(data)
        if not _run([ffmpeg, "-y", "-i", str(src), "-frames:v", "1", str(out)]) or not out.is_file():
            return None
        try:
            image = Image.open(out)
            image.load()
            return image.convert("RGBA")
        except Exception:
            return None


def _probe_size(ffmpeg: str, src: Path) -> tuple[int, int]:
    probe = shutil.which("ffprobe")
    if probe:
        done = subprocess.run(
            [
                probe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                str(src),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        text = (done.stdout or "").strip()
        if "x" in text:
            left, right = text.split("x", 1)
            try:
                return max(1, int(left)), max(1, int(right))
            except ValueError:
                pass
    done = subprocess.run([ffmpeg, "-i", str(src)], capture_output=True, text=True, check=False)
    blob = f"{done.stdout or ''}{done.stderr or ''}"
    for token in blob.replace(",", " ").split():
        if "x" in token and token[0].isdigit():
            left, _, right = token.partition("x")
            if left.isdigit() and right.isdigit():
                return max(1, int(left)), max(1, int(right))
    return 512, 512


def _run(cmd: list[str]) -> bool:
    try:
        done = subprocess.run(cmd, capture_output=True, check=False)
    except OSError:
        return False
    return done.returncode == 0
