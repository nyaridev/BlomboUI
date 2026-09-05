from __future__ import annotations

import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.storage import user as db
from features.models.scripts import model_sidecar
from features.models.scripts import model_thumbs
from features.models.scripts import thumbnail_scopes
from features.settings import service as settings


def _png(size=(16, 16), color=(12, 80, 160)) -> bytes:
    image = Image.new("RGB", size, color)
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class ThumbEncodeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.files = self.tmp / "files"
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(model_sidecar, "FILES", self.files),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_saves_capped_jpg_thumb(self) -> None:
        with patch.object(
            settings,
            "load",
            return_value={"thumbMegapixels": 0.05, "thumbFormat": "jpg", "thumbQuality": 80, "saveRawThumbs": False},
        ):
            model_thumbs.save_thumb("loras", "big.safetensors", _png((1000, 1000)))
        path = model_thumbs.thumb_at("loras", "big.safetensors")
        self.assertTrue(path and path.suffix == ".jpg")
        with Image.open(path) as image:
            self.assertLessEqual(image.size[0] * image.size[1], 50_000 + 1_000)
            self.assertLess(max(image.size), 1000)

    def test_raw_sibling_uses_output_settings(self) -> None:
        with patch.object(
            settings,
            "load",
            return_value={
                "thumbMegapixels": 0.05,
                "thumbFormat": "jpg",
                "thumbQuality": 80,
                "saveRawThumbs": True,
                "imageFormat": "png",
                "imageQuality": 100,
            },
        ):
            model_thumbs.save_thumb("loras", "big.safetensors", _png((800, 600)))
        small = model_thumbs.thumb_at("loras", "big.safetensors")
        raw = model_thumbs.resolved_file("loras", "big.safetensors", raw=True)
        self.assertTrue(small and small.suffix == ".jpg")
        self.assertTrue(raw and raw.name.startswith("global_raw") and raw.suffix == ".png")
        with Image.open(raw) as image:
            self.assertEqual(image.size, (800, 600))
        with Image.open(small) as image:
            self.assertLess(image.size[0] * image.size[1], 800 * 600)

    def test_raw_fallback_and_stale_cleanup(self) -> None:
        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": True, "thumbFormat": "jpg", "imageFormat": "png"},
        ):
            model_thumbs.save_thumb("loras", "item.safetensors", _png((64, 64)))
        raw = model_thumbs.resolved_file("loras", "item.safetensors", raw=True)
        self.assertTrue(raw and "_raw" in raw.name)
        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": False, "thumbFormat": "jpg"},
        ):
            model_thumbs.save_thumb("loras", "item.safetensors", _png((32, 32), (9, 9, 9)))
        small = model_thumbs.resolved_file("loras", "item.safetensors")
        again = model_thumbs.resolved_file("loras", "item.safetensors", raw=True)
        self.assertTrue(small and small == again)
        self.assertFalse(any(path.is_file() for path in model_thumbs.raw_paths("loras", "item.safetensors")))

    def test_delete_and_drop_remove_raw(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby"]]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": True, "thumbFormat": "jpg", "imageFormat": "webp"},
        ):
            model_thumbs.save_thumb("loras", "char.safetensors", _png((40, 40)), key, {"tags": ["ruby"]})
        raw = model_thumbs.resolved_file("loras", "char.safetensors", key, raw=True)
        self.assertTrue(raw and raw.name.endswith("_raw.webp"))
        model_thumbs.delete_thumb("loras", "char.safetensors", key)
        self.assertIsNone(model_thumbs.thumb_at("loras", "char.safetensors", key))
        self.assertFalse(any(path.is_file() for path in model_thumbs.raw_paths("loras", "char.safetensors", key)))

        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": True, "thumbFormat": "jpg", "imageFormat": "png"},
        ):
            model_thumbs.save_thumb("loras", "kept.safetensors", _png((24, 24)), key, {"tags": ["ruby"]})
        model_thumbs.drop_scope(ruby["id"])
        self.assertIsNone(model_thumbs.thumb_at("loras", "kept.safetensors", key))
        self.assertFalse(any(path.is_file() for path in model_thumbs.raw_paths("loras", "kept.safetensors", key)))

    def test_index_ignores_raw_files(self) -> None:
        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": True, "thumbFormat": "jpg", "imageFormat": "png"},
        ):
            model_thumbs.save_thumb("loras", "char.safetensors", _png((20, 20)), "global", {"tags": []})
        rows = model_thumbs.list_saved()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["context"], "global")
        model_thumbs.rebuild_index()
        self.assertEqual(list(model_thumbs.contexts("loras", "char.safetensors")), ["global"])
        self.assertEqual(len(model_thumbs.list_saved()), 1)

    def test_gif_saves_raw_original(self) -> None:
        gif = BytesIO()
        Image.new("P", (8, 8), 2).save(gif, format="GIF")
        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": True, "saveAnimatedThumbs": True, "animatedThumbFormat": "gif"},
        ):
            model_thumbs.save_thumb("loras", "animated.safetensors", gif.getvalue(), media="image/gif")
        path = model_thumbs.thumb_at("loras", "animated.safetensors")
        self.assertTrue(path and path.suffix == ".gif")
        self.assertTrue(any(item.is_file() for item in model_thumbs.raw_paths("loras", "animated.safetensors")))

    def test_raw_skips_video_and_uses_thumb(self) -> None:
        mp4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2"
        with patch.object(
            settings,
            "load",
            return_value={"saveRawThumbs": True, "saveAnimatedThumbs": True, "animatedThumbFormat": "webp"},
        ):
            model_thumbs.save_thumb("loras", "video.safetensors", mp4, media="video/mp4")
        thumb = model_thumbs.thumb_at("loras", "video.safetensors")
        raw = model_thumbs.resolved_file("loras", "video.safetensors", raw=True)
        self.assertTrue(thumb)
        self.assertEqual(raw, thumb)
        self.assertTrue(
            any(item.suffix.lower() == ".mp4" and item.is_file() for item in model_thumbs.raw_paths("loras", "video.safetensors"))
        )
