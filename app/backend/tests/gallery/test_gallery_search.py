from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.storage import cache as cache_db
from infrastructure.storage import user as user_db
from features.gallery.scripts import cache as gallery_cache
from features.gallery.scripts import libraries, search
from features.models.scripts import thumbnail_scopes
from shared import pnginfo


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _v2(created_at: str = "2026-01-01T00:00:00.000Z", **values) -> dict:
    params = {
        "prompt": str(values.get("prompt") or ""),
        "negative_prompt": str(values.get("negative_prompt") or ""),
        "prompt_raw": str(values["prompt_raw"] if "prompt_raw" in values else values.get("prompt") or ""),
        "negative_prompt_raw": str(
            values["negative_prompt_raw"] if "negative_prompt_raw" in values else values.get("negative_prompt") or ""
        ),
        "steps": values.get("steps"),
        "cfg": values.get("cfg"),
        "seed": values.get("seed"),
        "sampler": str(values.get("sampler") or ""),
        "scheduler": str(values.get("scheduler") or ""),
        "width": values.get("width"),
        "height": values.get("height"),
        "models": list(values.get("models") or []),
    }
    return {
        "version": 2,
        "asset_kind": "image",
        "created_at": created_at,
        "params": params,
    }


def _write(path: Path, values: dict, created_at: str = "2026-01-01T00:00:00.000Z") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = _v2(created_at, **values)
    packed = pnginfo.embed(_png(), meta["params"], metadata=meta)
    path.write_bytes(packed)
    return path


class GallerySearchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "gallery"
        self.root.mkdir()
        self.patches = [
            patch.object(cache_db, "_CONN", None),
            patch.object(cache_db, "db_path", return_value=self.tmp / "cache.sqlite"),
            patch.object(user_db, "_CONN", None),
            patch.object(user_db, "db_path", return_value=self.tmp / "user.sqlite"),
            patch.object(gallery_cache.dirs, "gallery_roots", return_value=[self.root]),
            patch("features.settings.service.load", return_value={"galleryHideInterrupted": True}),
        ]
        for item in self.patches:
            item.start()
        cache_db.connect()
        user_db.connect()

    def tearDown(self) -> None:
        if cache_db._CONN is not None:
            cache_db._CONN.close()
            cache_db._CONN = None
        if user_db._CONN is not None:
            user_db._CONN.close()
            user_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ingest_indexes_without_full_sync(self) -> None:
        path = _write(
            self.root / "a.png",
            {
                "prompt": "cat, sitting, dress",
                "prompt_raw": "cat, sitting, __outfit__",
                "models": [
                    {"kind": "checkpoints", "hashes": {"autov2": "noobai.safetensors"}},
                    {"kind": "loras", "hashes": {"autov2": "detail.safetensors"}, "strength": 0.8},
                ],
            },
        )
        gallery_cache.ingest(path)
        listed = gallery_cache.list_rows()
        self.assertEqual(len(listed), 1)
        found = search.search(q="cat")
        self.assertEqual(len(found["items"]), 1)
        by_model = search.search(models=["noobai.safetensors"])
        self.assertEqual(len(by_model["items"]), 1)
        by_lora = search.search(loras=["detail.safetensors"])
        self.assertEqual(len(by_lora["items"]), 1)
        by_wild = search.search(wildcards=["outfit"])
        self.assertEqual(len(by_wild["items"]), 1)

    def test_index_uses_raw_prompt_and_model_hashes_only(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "tagged.png",
                {
                    "prompt": "cat, <lora:sneaky:1>",
                    "prompt_raw": "cat, sitting, __outfit__",
                    "models": [{"kind": "checkpoints", "hashes": {"autov2": "noobai.safetensors"}}],
                },
            )
        )
        self.assertEqual(len(search.search(wildcards=["outfit"])["items"]), 1)
        self.assertEqual(len(search.search(loras=["sneaky"])["items"]), 0)
        self.assertEqual(len(search.search(loras=["detail.safetensors"])["items"]), 0)
        self.assertEqual(len(search.search(q="dress")["items"]), 0)
        self.assertEqual(len(search.search(q="cat")["items"]), 1)

    def test_search_matches_prompt_words_any_order(self) -> None:
        gallery_cache.ingest(_write(self.root / "a.png", {"prompt": "cat, sitting, dress"}))
        self.assertEqual(len(search.search(q="dress cat")["items"]), 1)
        self.assertEqual(len(search.search(q="sitting, cat")["items"]), 1)
        self.assertEqual(len(search.search(q="dress dog")["items"]), 0)

    def test_list_rows_does_not_scan_disk(self) -> None:
        _write(self.root / "late.png", {"prompt": "later"})
        self.assertEqual(len(gallery_cache.list_rows()), 0)
        gallery_cache.sync()
        self.assertEqual(len(gallery_cache.list_rows()), 1)

    def test_media_kind_filters_video(self) -> None:
        image = _write(self.root / "still.png", {"prompt": "still"})
        video = self.root / "clip.mp4"
        video.write_bytes(b"not-a-real-video")
        gallery_cache.ingest(image)
        gallery_cache.ingest(video)
        images = search.search(media="image")
        videos = search.search(media="video")
        self.assertEqual([item["media_kind"] for item in images["items"]], ["image"])
        self.assertEqual([item["media_kind"] for item in videos["items"]], ["video"])

    def test_browse_recent_and_works(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "one.png",
                {"prompt": "a", "models": [{"kind": "checkpoints", "hashes": {"autov2": "alpha.safetensors"}}]},
                "2026-01-01T00:00:00.000Z",
            )
        )
        gallery_cache.ingest(
            _write(
                self.root / "two.png",
                {"prompt": "b", "models": [{"kind": "checkpoints", "hashes": {"autov2": "beta.safetensors"}}]},
                "2026-01-02T00:00:00.000Z",
            )
        )
        gallery_cache.ingest(
            _write(
                self.root / "three.png",
                {"prompt": "c", "models": [{"kind": "checkpoints", "hashes": {"autov2": "alpha.safetensors"}}]},
                "2026-01-03T00:00:00.000Z",
            )
        )
        recent = search.browse("checkpoints", "recent", "desc")["items"]
        works = search.browse("checkpoints", "works", "desc")["items"]
        self.assertEqual([item["name"] for item in recent], ["alpha.safetensors", "beta.safetensors"])
        self.assertEqual(works[0]["name"], "alpha.safetensors")
        self.assertEqual(works[0]["works"], 2)
        self.assertTrue(recent[0]["previews"])

    def test_scope_filter_uses_prompt_tags(self) -> None:
        gallery_cache.ingest(_write(self.root / "cat.png", {"prompt": "cat, portrait"}))
        gallery_cache.ingest(_write(self.root / "dog.png", {"prompt": "dog, portrait"}))
        scope = thumbnail_scopes.create_scope(
            {"name": "Cats", "anyGroups": [["cat"]], "exclude": [], "priority": 1}
        )
        hits = search.search(scopes=[scope["id"]])
        self.assertEqual([item["id"] for item in hits["items"]], [gallery_cache.item_id(self.root / "cat.png")])

    def test_library_crud(self) -> None:
        path = _write(self.root / "cat.png", {"prompt": "cat, sitting"})
        gallery_cache.ingest(path)
        created = libraries.create_library({"name": "Cats", "query": "cat", "models": []})
        self.assertEqual(created["name"], "Cats")
        self.assertEqual(created["previews"][0]["id"], gallery_cache.item_id(path))
        listed = libraries.list_libraries()
        self.assertEqual(len(listed), 1)
        updated = libraries.update_library(created["id"], {"name": "Kittens", "query": "kitten", "models": []})
        self.assertEqual(updated["name"], "Kittens")
        self.assertTrue(libraries.delete_library(created["id"]))
        self.assertEqual(libraries.list_libraries(), [])

    def test_home_popular_tags(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {"prompt": "cat, cute", "models": [{"kind": "checkpoints", "hashes": {"autov2": "alpha.safetensors"}}]},
            )
        )
        gallery_cache.ingest(_write(self.root / "b.png", {"prompt": "cat, sitting"}))
        data = search.home()
        self.assertEqual(len(data["recent"]), 2)
        tags = [item["tag"] for item in data["tags"]]
        self.assertEqual(tags[0], "cat")
        self.assertTrue(data["tags"][0]["previews"])
        self.assertEqual(data["checkpoints"][0]["name"], "alpha.safetensors")
        self.assertIsInstance(data["loras"], list)
        self.assertIsInstance(data["wildcards"], list)


if __name__ == "__main__":
    unittest.main()
