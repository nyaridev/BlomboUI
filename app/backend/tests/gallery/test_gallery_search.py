from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.storage import cache_gallery as gallery_db
from infrastructure.storage import user as user_db
from features.gallery.scripts import cache as gallery_cache
from features.gallery.scripts import libraries, search
from features.models.scripts import thumbnail_scopes
from shared import pnginfo


def _png(size: tuple[int, int] = (16, 16)) -> bytes:
    image = Image.new("RGB", size, (20, 80, 160))
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


def _write(
    path: Path,
    values: dict,
    created_at: str = "2026-01-01T00:00:00.000Z",
    size: tuple[int, int] = (16, 16),
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = _v2(created_at, **values)
    packed = pnginfo.embed(_png(size), meta["params"], metadata=meta)
    path.write_bytes(packed)
    return path


class GallerySearchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "gallery"
        self.root.mkdir()
        self.patches = [
            patch.object(gallery_db, "_CONN", None),
            patch.object(gallery_db, "db_path", return_value=self.tmp / "cache_gallery.sqlite"),
            patch.object(user_db, "_CONN", None),
            patch.object(user_db, "db_path", return_value=self.tmp / "user.sqlite"),
            patch.object(gallery_cache.dirs, "gallery_roots", return_value=[self.root]),
            patch("features.settings.service.load", return_value={"galleryHideInterrupted": True}),
        ]
        for item in self.patches:
            item.start()
        gallery_db.connect()
        user_db.connect()

    def tearDown(self) -> None:
        if gallery_db._CONN is not None:
            gallery_db._CONN.close()
            gallery_db._CONN = None
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
        self.assertEqual(found["items"][0]["width"], 16)
        self.assertEqual(found["items"][0]["height"], 16)

    def test_search_respects_page_limit(self) -> None:
        gallery_cache.ingest(_write(self.root / "a.png", {"prompt": "one"}, "2026-01-01T00:00:00.000Z"))
        gallery_cache.ingest(_write(self.root / "b.png", {"prompt": "two"}, "2026-01-02T00:00:00.000Z"))
        gallery_cache.ingest(_write(self.root / "c.png", {"prompt": "three"}, "2026-01-03T00:00:00.000Z"))
        found = search.search(limit=2)
        self.assertEqual(len(found["items"]), 2)
        self.assertTrue(found["cursor"])

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

    def test_orientation_filters_by_aspect(self) -> None:
        gallery_cache.ingest(_write(self.root / "portrait.png", {"prompt": "tall"}, size=(8, 16)))
        gallery_cache.ingest(_write(self.root / "square.png", {"prompt": "even"}, size=(16, 16)))
        gallery_cache.ingest(_write(self.root / "land.png", {"prompt": "wide"}, size=(16, 8)))
        self.assertEqual(len(search.search(orientation="vertical")["items"]), 1)
        self.assertEqual(len(search.search(orientation="square")["items"]), 1)
        self.assertEqual(len(search.search(orientation="horizontal")["items"]), 1)
        self.assertEqual(len(search.search(orientation="all")["items"]), 3)
        self.assertEqual(search.search(orientation="vertical")["items"][0]["height"], 16)
        self.assertEqual(search.search(orientation="horizontal")["items"][0]["width"], 16)

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
        self.assertEqual(created["kind"], "library")
        self.assertEqual(created["loras"], [])
        self.assertEqual(created["wildcards"], [])
        self.assertIsNone(created["parent_id"])
        self.assertEqual(created["previews"][0]["id"], gallery_cache.item_id(path))
        listed = libraries.list_libraries()
        self.assertEqual(len(listed), 1)
        updated = libraries.update_library(created["id"], {"name": "Kittens", "query": "kitten", "models": []})
        self.assertEqual(updated["name"], "Kittens")
        self.assertTrue(libraries.delete_library(created["id"]))
        self.assertEqual(libraries.list_libraries(), [])

    def test_library_stores_loras_and_wildcards(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {
                    "prompt": "cat, sitting, dress",
                    "prompt_raw": "cat, sitting, __outfit__",
                    "models": [{"kind": "loras", "hashes": {"autov2": "detail.safetensors"}, "strength": 0.8}],
                },
            )
        )
        created = libraries.create_library({"name": "Detail", "loras": ["detail.safetensors"], "wildcards": ["outfit"]})
        self.assertEqual(created["loras"], ["detail.safetensors"])
        self.assertEqual(created["wildcards"], ["outfit"])
        self.assertEqual(len(created["previews"]), 1)

    def test_library_folders_nest_order_and_delete(self) -> None:
        folder = libraries.create_library({"name": "Animals", "kind": "folder"})
        inner = libraries.create_library({"name": "Nested", "kind": "folder", "parent_id": folder["id"]})
        cats = libraries.create_library({"name": "Cats", "query": "cat", "parent_id": inner["id"]})
        dogs = libraries.create_library({"name": "Dogs", "query": "dog", "parent_id": folder["id"]})
        with self.assertRaises(ValueError):
            libraries.order_libraries(inner["id"], [folder["id"], cats["id"]])
        libraries.order_libraries(folder["id"], [dogs["id"], inner["id"]])
        by_id = {item["id"]: item for item in libraries.list_libraries()}
        self.assertEqual(by_id[dogs["id"]]["position"], 0)
        self.assertEqual(by_id[inner["id"]]["position"], 1)
        self.assertEqual(by_id[inner["id"]]["parent_id"], folder["id"])
        self.assertTrue(libraries.delete_library(folder["id"]))
        self.assertEqual(libraries.list_libraries(), [])

    def test_folder_search_ors_descendant_libraries(self) -> None:
        gallery_cache.ingest(_write(self.root / "cat.png", {"prompt": "cat"}))
        gallery_cache.ingest(_write(self.root / "dog.png", {"prompt": "dog"}))
        gallery_cache.ingest(_write(self.root / "bird.png", {"prompt": "bird"}))
        folder = libraries.create_library({"name": "Pets", "kind": "folder"})
        libraries.create_library({"name": "Cats", "query": "cat", "parent_id": folder["id"]})
        libraries.create_library({"name": "Dogs", "query": "dog", "parent_id": folder["id"]})
        unions = libraries.folder_unions(folder["id"])
        found = search.search(unions=unions)
        prompts = {item["id"] for item in found["items"]}
        self.assertEqual(len(prompts), 2)
        self.assertEqual(len(search.search(q="bird", unions=unions)["items"]), 0)

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

    def test_cover_previews_sample_not_newest(self) -> None:
        ids: list[str] = []
        for i in range(8):
            path = _write(
                self.root / f"{i}.png",
                {"prompt": "cat"},
                f"2026-01-{i + 1:02d}T00:00:00.000Z",
            )
            gallery_cache.ingest(path)
            ids.append(gallery_cache.item_id(path))
        newest = list(reversed(ids[-6:]))

        def oldest(items: list, k: int) -> list:
            return items[-k:]

        with patch("features.gallery.scripts.search.random.sample", side_effect=oldest):
            data = search.home()
        cat = next(item for item in data["tags"] if item["tag"] == "cat")
        preview_ids = [item["id"] for item in cat["previews"]]
        self.assertEqual(len(preview_ids), 6)
        self.assertNotEqual(preview_ids, newest)
        self.assertEqual(preview_ids, list(reversed(ids[:6])))


if __name__ == "__main__":
    unittest.main()
