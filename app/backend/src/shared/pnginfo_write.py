from __future__ import annotations

import json
from io import BytesIO
from typing import Any, Callable


BLOMBOUI_KEY = "blomboui"


def embed(
    data: bytes,
    values: dict[str, Any],
    graph: dict[str, Any] | None = None,
    fmt: str = "png",
    quality: int = 100,
    metadata: dict[str, Any] | None = None,
    parameters_text: Callable[..., str] | None = None,
    texts: dict[str, str] | None = None,
) -> bytes:
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception:
        return data
    fmt = "jpg" if fmt in {"jpg", "jpeg"} else fmt
    copied = {key for key, value in (texts or {}).items() if isinstance(key, str) and isinstance(value, str) and value.strip()}
    if fmt == "png":
        info = PngInfo()
        skip = {"parameters", "prompt", BLOMBOUI_KEY}
        for key, value in (getattr(image, "text", None) or {}).items():
            if isinstance(key, str) and isinstance(value, str) and key not in skip:
                info.add_text(key, value, zip=True)
        if texts:
            for key, value in texts.items():
                if isinstance(key, str) and isinstance(value, str) and value.strip():
                    info.add_text(key, value, zip=True)
        if "parameters" not in copied:
            text = parameters_text(values) if parameters_text else ""
            info.add_text("parameters", text)
        if graph and "prompt" not in copied:
            info.add_text("prompt", json.dumps(graph), zip=True)
        if metadata and BLOMBOUI_KEY not in copied:
            info.add_text(BLOMBOUI_KEY, json.dumps(metadata, ensure_ascii=False), zip=True)
        out = BytesIO()
        image.save(out, format="PNG", pnginfo=info)
        return out.getvalue()
    if fmt == "jpg":
        image = rgb(image)
    q = max(1, min(100, int(quality)))
    text = parameters_text(values) if parameters_text else ""
    exif = jpeg_exif(text, metadata)
    out = BytesIO()
    opts: dict[str, Any] = {"quality": q}
    if exif is not None:
        opts["exif"] = exif
    try:
        if fmt == "webp":
            image.save(out, format="WEBP", **opts)
        else:
            image.save(out, format="JPEG", optimize=True, **opts)
    except OSError:
        if fmt == "webp":
            image.save(out, format="WEBP", quality=q)
        else:
            image.save(out, format="JPEG", quality=q, optimize=True)
    return out.getvalue()


def rgb(image: Any) -> Any:
    from PIL import Image

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        bg = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return image.convert("RGB")


def jpeg_exif(text: str, metadata: dict[str, Any] | None = None) -> Any:
    from PIL import Image

    comment = str(text or "").strip()
    if not comment:
        return None
    if metadata:
        comment = json.dumps(
            {"blomboui": metadata, "parameters": comment},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    exif = Image.Exif()
    payload = b"UNICODE\x00" + comment.encode("utf-16")
    if len(payload) > 60000:
        payload = payload[:60000]
    exif[0x9286] = payload
    try:
        exif[270] = comment[:4096]
    except Exception:
        pass
    return exif
