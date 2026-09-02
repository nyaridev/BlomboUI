from __future__ import annotations

import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from features.gallery.scripts import cache as gallery_cache
from features.gallery.scripts import relink, search
from features.generate.scripts import save_meta
from features.models.scripts import hashes
from infrastructure.storage import cache as cache_db
from infrastructure.storage import cache_gallery as gallery_db
from infrastructure.storage import user as user_db
from infrastructure.storage.repositories import hashes as hashes_repo
from shared import pnginfo

DIGEST = "abcdef0123"
SHA = "ab" * 32


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _write(path: Path, values: dict, created_at: str = "2026-01-01T00:00:00.000Z") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    params = {
        "prompt": str(values.get("prompt") or ""),
        "negative_prompt": str(values.get("negative_prompt") or ""),
        "prompt_raw": str(values.get("prompt_raw") if "prompt_raw" in values else values.get("prompt") or ""),
        "negative_prompt_raw": str(
            values.get("negative_prompt_raw") if "negative_prompt_raw" in values else values.get("negative_prompt") or ""
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
    meta = {"version": 2, "asset_kind": "image", "created_at": created_at, "params": params}
    path.write_bytes(pnginfo.embed(_png(), meta["params"], metadata=meta))
    return path


class GalleryRelinkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "gallery"
        self.root.mkdir()
        self.models = self.tmp / "models"
        self.patches = [
            patch.object(cache_db, "_CONN", None),
            patch.object(cache_db, "db_path", return_value=self.tmp / "cache.sqlite"),
            patch.object(gallery_db, "_CONN", None),
            patch.object(gallery_db, "db_path", return_value=self.tmp / "cache_gallery.sqlite"),
            patch.object(user_db, "_CONN", None),
            patch.object(user_db, "db_path", return_value=self.tmp / "user.sqlite"),
            patch.object(gallery_cache.dirs, "gallery_roots", return_value=[self.root]),
            patch("features.settings.service.load", return_value={"galleryHideInterrupted": True}),
            patch("config.models_root", return_value=self.models),
            patch("features.models.scripts.models.models_root", return_value=self.models),
            patch("features.models.scripts.hashes.models_root", return_value=self.models),
        ]
        for item in self.patches:
            item.start()
        cache_db.connect()
        gallery_db.connect()
        user_db.connect()

    def tearDown(self) -> None:
        for conn in (cache_db._CONN, gallery_db._CONN, user_db._CONN):
            if conn is not None:
                conn.close()
        cache_db._CONN = None
        gallery_db._CONN = None
        user_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _lora(self, rel: str = "style/foo.safetensors") -> Path:
        path = self.models / "loras" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"lora-bytes")
        return path

    def _store_hash(self, path: Path) -> dict[str, str]:
        stat = path.stat()
        fields = {"sha256": SHA, "autov1": "abcd1234", "autov2": DIGEST, "autov3": "abcdef012345"}
        hashes_repo.replace_all(
            {
                str(path.resolve()): {
                    "mtime": stat.st_mtime_ns,
                    "size": stat.st_size,
                    **fields,
                }
            }
        )
        return fields

    def test_ingest_stores_digest_when_model_missing(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {
                    "prompt": "cat",
                    "models": [{"kind": "loras", "hashes": {"autov2": DIGEST, "sha256": SHA}}],
                },
            )
        )
        rows = gallery_db.query("SELECT name FROM gallery_item_loras")
        self.assertEqual([str(row["name"]) for row in rows], [DIGEST])
        self.assertEqual(len(search.search(loras=["style/foo.safetensors"])["items"]), 0)

    def test_relink_renames_hash_to_path_without_duplicate_items(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {
                    "prompt": "cat",
                    "models": [{"kind": "loras", "hashes": {"autov2": DIGEST, "sha256": SHA}}],
                },
            )
        )
        path = self._lora()
        fields = self._store_hash(path)
        relink.apply(fields, path)
        rows = gallery_db.query("SELECT name FROM gallery_item_loras")
        self.assertEqual([str(row["name"]) for row in rows], ["style/foo.safetensors"])
        self.assertEqual(len(gallery_cache.list_rows()), 1)
        names = [item["name"] for item in search.browse("loras")["items"]]
        self.assertEqual(names, ["style/foo.safetensors"])
        self.assertNotIn(DIGEST, names)
        self.assertEqual(len(search.search(loras=["style/foo.safetensors"])["items"]), 1)

    def test_search_matches_lora_path_via_hashes_before_relink(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {
                    "prompt": "cat",
                    "models": [{"kind": "loras", "hashes": {"autov2": DIGEST, "sha256": SHA}}],
                },
            )
        )
        self._store_hash(self._lora())
        found = search.search(loras=["style/foo.safetensors"])
        self.assertEqual(len(found["items"]), 1)

    def test_path_hint_used_when_hashes_empty(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {"prompt": "cat", "models": [{"kind": "loras", "path": "style/foo.safetensors"}]},
            )
        )
        rows = gallery_db.query("SELECT name FROM gallery_item_loras")
        self.assertEqual([str(row["name"]) for row in rows], ["style/foo.safetensors"])
        self.assertEqual(len(search.search(loras=["style/foo.safetensors"])["items"]), 1)

    def test_relink_digests_rewrites_checkpoint_name(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {
                    "prompt": "cat",
                    "models": [{"kind": "checkpoints", "hashes": {"autov2": DIGEST, "sha256": SHA}}],
                },
            )
        )
        ckpt = self.models / "checkpoints" / "noobai.safetensors"
        ckpt.parent.mkdir(parents=True)
        ckpt.write_bytes(b"ckpt")
        self._store_hash(ckpt)
        relink.relink_digests()
        row = gallery_db.query_one("SELECT checkpoint_name FROM gallery_items")
        self.assertEqual(str(row["checkpoint_name"]), "noobai.safetensors")
        self.assertEqual(len(search.search(models=["noobai.safetensors"])["items"]), 1)

    def test_find_path_skips_missing_file(self) -> None:
        live = self._lora()
        ghost = self.tmp / "gone" / "loras" / "old.safetensors"
        ghost.parent.mkdir(parents=True)
        ghost.write_bytes(b"old")
        stat = live.stat()
        fields = {"sha256": SHA, "autov1": "", "autov2": DIGEST, "autov3": ""}
        hashes_repo.replace_all(
            {
                str(ghost.resolve()): {"mtime": 1, "size": 1, **fields},
                str(live.resolve()): {"mtime": stat.st_mtime_ns, "size": stat.st_size, **fields},
            }
        )
        ghost.unlink()
        found = hashes.find_path({DIGEST, SHA})
        self.assertEqual(found, live.resolve())
        self.assertEqual(save_meta.rel_for_hashes("loras", {"autov2": DIGEST, "sha256": SHA}), "style/foo.safetensors")

    def test_relink_does_not_keep_hash_row_when_path_already_linked(self) -> None:
        gallery_cache.ingest(
            _write(
                self.root / "a.png",
                {
                    "prompt": "cat",
                    "models": [
                        {"kind": "loras", "hashes": {"autov2": DIGEST, "sha256": SHA}},
                        {"kind": "loras", "path": "style/foo.safetensors"},
                    ],
                },
            )
        )
        path = self._lora()
        fields = self._store_hash(path)
        relink.apply(fields, path)
        names = [str(row["name"]) for row in gallery_db.query("SELECT name FROM gallery_item_loras ORDER BY name")]
        self.assertEqual(names, ["style/foo.safetensors"])


if __name__ == "__main__":
    unittest.main()
