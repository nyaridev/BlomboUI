from __future__ import annotations

import json
import shutil
import tempfile
import unittest
import uuid
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from blombo import db, model_meta_db, model_thumbs, removed, thumbnail_embed, thumbnail_scopes


def _png(color=(12, 80, 160)) -> bytes:
    image = Image.new("RGB", (16, 16), color)
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class ScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        meta = self.tmp / "model_meta"
        thumbs = meta / "thumbnails"
        trash = self.tmp / "removed"
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(model_meta_db, "_CONN", None),
            patch.object(model_meta_db, "db_path", return_value=self.tmp / "model_meta.sqlite"),
            patch.object(thumbnail_scopes, "FILE", meta / "scopes.json"),
            patch.object(model_thumbs, "ROOT", meta),
            patch.object(model_thumbs, "THUMBS", thumbs),
            patch.object(model_thumbs, "INDEX", meta / "data" / "thumbs.json"),
            patch.object(removed, "REMOVED", trash),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        if model_meta_db._CONN is not None:
            model_meta_db._CONN.close()
            model_meta_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_normalize_and_parse_tags(self) -> None:
        self.assertEqual(thumbnail_scopes.normalize_tag("Ruby_Rose"), "ruby rose")
        self.assertEqual(thumbnail_scopes.normalize_tag("(skirt:1.2)"), "skirt")
        self.assertEqual(thumbnail_scopes.parse_tags("1girl, ruby rose, skirt"), ["1girl", "ruby rose", "skirt"])

    def test_context_key_sorted_opaque_ids(self) -> None:
        self.assertEqual(thumbnail_scopes.context_key([]), "global")
        self.assertEqual(thumbnail_scopes.context_key(["global"]), "global")
        a = "aaaaaaaaaaaa"
        b = "bbbbbbbbbbbb"
        self.assertEqual(thumbnail_scopes.context_key([b, a]), f"{a}+{b}")
        self.assertEqual(thumbnail_scopes.parse_context(f"{a}+{b}"), [a, b])

    def test_match_and_auto_ids(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby Rose", "group": "Character", "required": ["ruby rose"]})
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "group": "Clothing", "required": ["skirt"]})
        knees = thumbnail_scopes.create_scope({"name": "On Knees", "anyGroups": [["on knees", "kneeling"]]})
        ids = thumbnail_scopes.auto_ids("ruby rose, skirt, kneeling, outdoors")
        self.assertIn(ruby["id"], ids)
        self.assertIn(skirt["id"], ids)
        self.assertIn(knees["id"], ids)
        marin = thumbnail_scopes.create_scope(
            {"name": "Marin", "group": "Character", "required": ["marin kitagawa"], "priority": 2}
        )
        ids = thumbnail_scopes.auto_ids("marin kitagawa, ruby rose, skirt")
        self.assertIn(marin["id"], ids)
        self.assertNotIn(ruby["id"], ids)
        self.assertIn(skirt["id"], ids)

    def test_migrate_json_to_sqlite(self) -> None:
        source = thumbnail_scopes.FILE
        source.parent.mkdir(parents=True)
        source.write_text(
            json.dumps(
                {
                    "scopes": [
                        {
                            "id": "aaaaaaaaaaaa",
                            "name": "Ruby",
                            "group": "Character",
                            "required": ["ruby rose"],
                            "optional": [],
                            "anyGroups": [["smile", "happy"]],
                            "exclude": ["outdoors"],
                            "priority": 2,
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        self.assertEqual(thumbnail_scopes.list_scopes()[1]["id"], "aaaaaaaaaaaa")
        self.assertFalse(source.exists())
        self.assertTrue((self.tmp / "blombo.sqlite").is_file())
        self.assertEqual(thumbnail_scopes.get_scope("aaaaaaaaaaaa")["priority"], 2)

    def test_scopes_use_one_sqlite_table(self) -> None:
        thumbnail_scopes.create_scope(
            {
                "name": "Ruby",
                "required": ["ruby rose"],
                "anyGroups": [["smile", "happy"]],
            }
        )

        tables = {
            str(row["name"])
            for row in model_meta_db.query("SELECT name FROM sqlite_master WHERE type = 'table'")
        }

        self.assertIn("thumb_scopes", tables)
        self.assertNotIn("scopes", tables)
        self.assertNotIn("scope_tags", tables)
        self.assertNotIn("scope_any_tags", tables)

    def test_rank_tags_optional_then_required(self) -> None:
        query = {"required": ["ruby rose"], "optional": ["skirt"], "anyGroups": [], "exclude": []}
        full = thumbnail_scopes.rank_tags(query, ["ruby rose", "skirt"])
        required = thumbnail_scopes.rank_tags(query, ["ruby rose"])
        missing = thumbnail_scopes.rank_tags(query, ["skirt"])
        excluded = thumbnail_scopes.rank_tags({**query, "exclude": ["outdoors"]}, ["ruby rose", "skirt", "outdoors"])
        self.assertTrue(full and required and full > required)
        self.assertIsNone(missing)
        self.assertIsNone(excluded)

    def test_global_protected(self) -> None:
        with self.assertRaisesRegex(ValueError, "cannot edit"):
            thumbnail_scopes.update_scope("global", {"name": "Nope"})
        with self.assertRaisesRegex(ValueError, "cannot delete"):
            thumbnail_scopes.delete_scope("global")

    def test_migrate_unscoped_to_global(self) -> None:
        dest = model_thumbs.THUMBS / "loras"
        dest.mkdir(parents=True)
        (dest / "foo.png").write_bytes(_png())
        model_thumbs.migrate()
        self.assertFalse((dest / "foo.png").exists())
        self.assertTrue((dest / "foo" / "global.png").is_file())
        self.assertGreater(model_thumbs.thumb_mtime("loras", "foo"), 0)

    def test_scoped_save_delete_and_exact_vs_likely(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "required": ["ruby rose"]})
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "required": ["skirt"]})
        outdoor = thumbnail_scopes.create_scope({"name": "Outdoors", "required": ["outdoors"]})
        pair = thumbnail_scopes.context_key([ruby["id"], skirt["id"]])
        triple = thumbnail_scopes.context_key([ruby["id"], skirt["id"], outdoor["id"]])
        model_thumbs.save_thumb("loras", "char.safetensors", _png((200, 10, 10)), pair, {"tags": ["ruby rose", "skirt"]})
        model_thumbs.save_thumb(
            "loras",
            "char.safetensors",
            _png((10, 200, 10)),
            triple,
            {"tags": ["ruby rose", "skirt", "outdoors"]},
        )
        model_thumbs.save_thumb("loras", "char.safetensors", _png((10, 10, 200)), "global", {"tags": []})
        exact = model_thumbs.resolved_file("loras", "char.safetensors", pair, "exact", False)
        self.assertTrue(exact and exact.stem == pair)
        none = model_thumbs.resolved_file("loras", "char.safetensors", triple, "exact", False)
        self.assertTrue(none and none.stem == triple)
        missing = thumbnail_scopes.context_key([ruby["id"], skirt["id"], outdoor["id"], "cccccccccccc"])
        self.assertIsNone(model_thumbs.resolved_file("loras", "char.safetensors", missing, "exact", False))
        likely = model_thumbs.resolved_file("loras", "char.safetensors", pair, "likely", False)
        self.assertTrue(likely and likely.stem == pair)
        model_thumbs.delete_thumb("loras", "char.safetensors", pair)
        likely = model_thumbs.resolved_file("loras", "char.safetensors", pair, "likely", False)
        self.assertTrue(likely and likely.stem == triple)
        self.assertIsNone(model_thumbs.resolved_file("loras", "char.safetensors", pair, "exact", False))
        fallback = model_thumbs.resolved_file("loras", "char.safetensors", pair, "exact", True)
        self.assertTrue(fallback and fallback.stem == "global")
        payload = thumbnail_embed.read_file(likely)
        self.assertEqual(payload.get("tags"), ["ruby rose", "skirt", "outdoors"])
        self.assertEqual(payload.get("context"), triple)

    def test_manual_save_keeps_selected_context(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "required": ["ruby rose"]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        model_thumbs.save_thumb("loras", "x.safetensors", _png(), key, {"tags": [], "origin": "fileinfo"})
        path = model_thumbs.thumb_at("loras", "x.safetensors", key)
        payload = thumbnail_embed.read_file(path)
        self.assertEqual(payload.get("context"), key)
        self.assertEqual(payload.get("origin"), "fileinfo")
        self.assertEqual(payload.get("tags"), [])

    def test_wildcard_tag_move_and_drop_scope(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "required": ["ruby rose"]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        ident = "chars.yaml#ruby rose"
        model_thumbs.save_thumb("wildcards", ident, _png(), key, {"tags": ["ruby rose"]})
        model_thumbs.save_thumb("wildcards", ident, _png((9, 9, 9)), "global", {"tags": []})
        model_thumbs.move_thumbs("wildcards", ident, "people.yaml#ruby rose")
        self.assertIsNone(model_thumbs.thumb_at("wildcards", ident, key))
        self.assertTrue(model_thumbs.thumb_at("wildcards", "people.yaml#ruby rose", key))
        self.assertTrue(model_thumbs.thumb_at("wildcards", "people.yaml#ruby rose", "global"))
        model_thumbs.drop_scope(ruby["id"])
        self.assertIsNone(model_thumbs.thumb_at("wildcards", "people.yaml#ruby rose", key))
        self.assertTrue(model_thumbs.thumb_at("wildcards", "people.yaml#ruby rose", "global"))

    def test_take_put_roundtrip(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "required": ["ruby rose"]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        model_thumbs.save_thumb("loras", "held.safetensors", _png(), key, {"tags": ["ruby rose"]})
        model_thumbs.save_thumb("loras", "held.safetensors", _png((1, 2, 3)), "global", {"tags": []})
        bundle = self.tmp / "bundle"
        model_thumbs.take("loras", "held.safetensors", bundle)
        self.assertIsNone(model_thumbs.thumb_at("loras", "held.safetensors", key))
        model_thumbs.put("loras", bundle)
        self.assertTrue(model_thumbs.thumb_at("loras", "held.safetensors", key))
        self.assertTrue(model_thumbs.thumb_at("loras", "held.safetensors", "global"))

    def test_trash_preview_modes(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "required": ["ruby rose"]})
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "required": ["skirt"]})
        pair = thumbnail_scopes.context_key([ruby["id"], skirt["id"]])
        uid = str(uuid.uuid4())
        folder = removed.REMOVED / uid
        thumbs = folder / "thumbs" / "model.safetensors"
        thumbs.mkdir(parents=True)
        scoped = thumbs / f"{pair}.png"
        glob = thumbs / "global.png"
        Image.new("RGB", (8, 8), (9, 9, 9)).save(scoped)
        Image.new("RGB", (8, 8), (1, 1, 1)).save(glob)
        thumbnail_embed.write_image(
            Image.open(scoped), "PNG", thumbnail_embed.pack(pair, {"tags": ["ruby rose", "skirt"]}), scoped
        )
        thumbnail_embed.write_image(Image.open(glob), "PNG", thumbnail_embed.pack("global", {"tags": []}), glob)
        (folder / "manifest.json").write_text(
            json.dumps(
                {"kind": "loras", "ident": "model.safetensors", "name": "model.safetensors", "removed_at": 1, "size": 1}
            ),
            encoding="utf-8",
        )
        exact = removed.thumb_file(uid, pair, "exact", False)
        self.assertTrue(exact and exact.name.startswith(pair))
        self.assertIsNone(removed.thumb_file(uid, "cccccccccccc", "exact", False))
        fallback = removed.thumb_file(uid, "cccccccccccc", "exact", True)
        self.assertTrue(fallback and fallback.name.startswith("global"))
        likely = removed.thumb_file(uid, pair, "likely", False)
        self.assertTrue(likely and likely.name.startswith(pair))


if __name__ == "__main__":
    unittest.main()
