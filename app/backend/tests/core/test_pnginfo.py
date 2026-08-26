from __future__ import annotations

import asyncio
import unittest
from io import BytesIO

from PIL import Image

from shared import pnginfo

try:
    from api.routes import system
except ModuleNotFoundError as exc:
    if exc.name != "fastapi":
        raise
    system = None  # type: ignore[assignment]


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class _Request:
    def __init__(self, data: bytes, filename: str) -> None:
        self._data = data
        self.headers = {"x-filename": filename}

    async def body(self) -> bytes:
        return self._data


class PngInfoRouteTests(unittest.TestCase):
    @unittest.skipIf(system is None, "FastAPI is not installed in this test environment")
    def test_post_pnginfo_returns_embedded_parameters(self) -> None:
        packed_params = {
            "prompt": "a cat",
            "negative_prompt": "",
            "prompt_raw": "a cat",
            "negative_prompt_raw": "",
            "steps": 20,
            "seed": 7,
            "width": 16,
            "height": 16,
            "models": [],
        }
        metadata = {
            "version": 2,
            "asset_kind": "image",
            "params": packed_params,
        }
        packed = pnginfo.embed(_png(), packed_params, metadata=metadata)
        data = asyncio.run(system.post_pnginfo(_Request(packed, "cat.png")))
        self.assertIn("a cat", data["text"])
        self.assertIn("parameters", data["raw"])
        self.assertEqual(data["metadata"]["version"], 2)
        self.assertEqual(data["metadata"]["params"]["prompt"], "a cat")
