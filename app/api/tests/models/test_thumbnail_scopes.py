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

from blombo import db, issues
from blombo.gallery import removed
from blombo.models import model_thumbs, thumbnail_embed, thumbnail_scopes


def _png(color=(12, 80, 160)) -> bytes:
    image = Image.new("RGB", (16, 16), color)
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class ScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        thumbs = self.tmp / "model_thumbs"
        trash = self.tmp / "removed"
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(model_thumbs, "THUMBS", thumbs),
            patch.object(removed, "REMOVED", trash),
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
        self.assertEqual(thumbnail_scopes.ordered_ids([b, a, b, "global"]), [b, a])

    def test_match_and_auto_ids(self) -> None:
        ruby = thumbnail_scopes.create_scope(
            {"name": "Ruby Rose", "group": "Character", "anyGroups": [["ruby rose"]]}
        )
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "group": "Clothing", "anyGroups": [["skirt"]]})
        knees = thumbnail_scopes.create_scope({"name": "On Knees", "anyGroups": [["on knees", "kneeling"]]})
        ids = thumbnail_scopes.auto_ids("ruby rose, skirt, kneeling, outdoors")
        self.assertIn(ruby["id"], ids)
        self.assertIn(skirt["id"], ids)
        self.assertIn(knees["id"], ids)
        marin = thumbnail_scopes.create_scope(
            {"name": "Marin", "group": "Character", "anyGroups": [["marin kitagawa"]], "priority": 2}
        )
        ids = thumbnail_scopes.auto_ids("marin kitagawa, ruby rose, skirt")
        self.assertIn(marin["id"], ids)
        self.assertNotIn(ruby["id"], ids)
        self.assertIn(skirt["id"], ids)

    def test_scopes_use_one_sqlite_table(self) -> None:
        thumbnail_scopes.create_scope(
            {
                "name": "Ruby",
                "anyGroups": [["ruby rose"], ["smile", "happy"]],
            }
        )

        tables = {
            str(row["name"])
            for row in db.query("SELECT name FROM sqlite_master WHERE type = 'table'")
        }

        self.assertIn("thumb_scopes", tables)
        self.assertNotIn("scopes", tables)
        self.assertNotIn("scope_tags", tables)
        self.assertNotIn("scope_any_tags", tables)
        self.assertNotIn("jobs", tables)
        self.assertNotIn("gallery_items", tables)

    def test_rank_thumb_optional_chips(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby rose"]]})
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "anyGroups": [["skirt"]]})
        ruby_key = thumbnail_scopes.context_key([ruby["id"]])
        skirt_key = thumbnail_scopes.context_key([skirt["id"]])
        pair = thumbnail_scopes.context_key([ruby["id"], skirt["id"]])
        ids = thumbnail_scopes.parse_context(pair)
        full = thumbnail_scopes.rank_thumb(ids, pair, ["ruby rose", "skirt"], [skirt["id"]])
        only_ruby = thumbnail_scopes.rank_thumb(ids, ruby_key, ["ruby rose"], [skirt["id"]])
        only_skirt = thumbnail_scopes.rank_thumb(ids, skirt_key, ["skirt"], [skirt["id"]])
        both_required = thumbnail_scopes.rank_thumb(ids, ruby_key, ["ruby rose"], [])
        self.assertTrue(full and only_ruby and full > only_ruby)
        self.assertIsNone(only_skirt)
        self.assertIsNone(both_required)

    def test_likely_optional_scope_falls_back_to_required(self) -> None:
        fern = thumbnail_scopes.create_scope({"name": "Fern", "anyGroups": [["fern"]]})
        skirt = thumbnail_scopes.create_scope({"name": "Pleated Skirt", "anyGroups": [["pleated skirt"]]})
        mini = thumbnail_scopes.create_scope({"name": "Miniskirt", "anyGroups": [["miniskirt"]]})
        fern_key = thumbnail_scopes.context_key([fern["id"]])
        mixed = thumbnail_scopes.context_key([fern["id"], mini["id"]])
        skirt_key = thumbnail_scopes.context_key([skirt["id"]])
        query = thumbnail_scopes.context_key([fern["id"], skirt["id"]])
        model_thumbs.save_thumb(
            "loras", "char.safetensors", _png((10, 200, 10)), mixed, {"tags": ["miniskirt"]}
        )
        model_thumbs.save_thumb(
            "loras",
            "char.safetensors",
            _png((200, 10, 10)),
            fern_key,
            {"tags": ["fern (sousou no frieren)"]},
        )
        model_thumbs.save_thumb("loras", "char.safetensors", _png((10, 10, 200)), "global", {"tags": []})
        model_thumbs.save_thumb(
            "loras", "char.safetensors", _png((9, 9, 9)), skirt_key, {"tags": ["pleated skirt"]}
        )
        self.assertIsNone(model_thumbs.resolved_file("loras", "char.safetensors", query, "likely", False))
        likely = model_thumbs.resolved_file("loras", "char.safetensors", query, "likely", False, [skirt["id"]])
        self.assertTrue(likely and likely.stem == fern_key)
        model_thumbs.delete_thumb("loras", "char.safetensors", fern_key)
        model_thumbs.delete_thumb("loras", "char.safetensors", mixed)
        self.assertIsNone(model_thumbs.resolved_file("loras", "char.safetensors", query, "likely", False, [skirt["id"]]))
        fallback = model_thumbs.resolved_file("loras", "char.safetensors", query, "likely", True, [skirt["id"]])
        self.assertTrue(fallback and fallback.stem == "global")

    def test_global_protected(self) -> None:
        with self.assertRaisesRegex(ValueError, "cannot edit"):
            thumbnail_scopes.update_scope("global", {"name": "Nope"})
        with self.assertRaisesRegex(ValueError, "cannot delete"):
            thumbnail_scopes.delete_scope("global")

    def test_scoped_save_delete_and_exact_vs_likely(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby rose"]]})
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "anyGroups": [["skirt"]]})
        outdoor = thumbnail_scopes.create_scope({"name": "Outdoors", "anyGroups": [["outdoors"]]})
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
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby rose"]]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        model_thumbs.save_thumb("loras", "x.safetensors", _png(), key, {"tags": [], "origin": "fileinfo"})
        path = model_thumbs.thumb_at("loras", "x.safetensors", key)
        payload = thumbnail_embed.read_file(path)
        self.assertEqual(payload.get("context"), key)
        self.assertEqual(payload.get("origin"), "fileinfo")
        self.assertEqual(payload.get("tags"), [])

    def test_wildcard_tag_move_and_drop_scope(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby rose"]]})
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
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby rose"]]})
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
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby rose"]]})
        skirt = thumbnail_scopes.create_scope({"name": "Skirt", "anyGroups": [["skirt"]]})
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

    def test_duplicate_scope_names_are_issues(self) -> None:
        thumbnail_scopes.create_scope({"name": "Fern", "anyGroups": [["fern"]]})
        thumbnail_scopes.create_scope({"name": "fern", "anyGroups": [["plant"]]})
        rows = issues._duplicate_scope_names()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "duplicate_name")
        self.assertEqual(rows[0]["kind"], "scopes")
        self.assertEqual(len(rows[0]["paths"]), 2)

    def test_list_saved_thumbs(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby"]]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        model_thumbs.save_thumb("loras", "char.safetensors", _png((20, 80, 20)), key, {"tags": ["ruby"]})
        model_thumbs.save_thumb("loras", "char.safetensors", _png((20, 20, 80)), "global", {"tags": []})
        rows = model_thumbs.list_saved()
        self.assertTrue(any(item["context"] == key and item["kind"] == "loras" for item in rows))
        self.assertTrue(any(item["context"] == "global" and item["scopes"] == [] for item in rows))

    def test_gif_and_mp4_thumbnails(self) -> None:
        gif = BytesIO()
        Image.new("P", (8, 8), 2).save(gif, format="GIF")
        model_thumbs.save_thumb("loras", "animated.safetensors", gif.getvalue(), media="image/gif")
        mp4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2"
        model_thumbs.save_thumb("loras", "video.safetensors", mp4, media="video/mp4")

        gif_path = model_thumbs.thumb_at("loras", "animated.safetensors")
        mp4_path = model_thumbs.thumb_at("loras", "video.safetensors")
        self.assertTrue(gif_path and gif_path.suffix == ".gif")
        self.assertTrue(mp4_path and mp4_path.suffix == ".mp4")
        self.assertEqual(model_thumbs.thumb_media(gif_path), "image/gif")
        self.assertEqual(model_thumbs.thumb_media(mp4_path), "video/mp4")

    def test_delete_thumb_when_model_missing(self) -> None:
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "anyGroups": [["ruby"]]})
        key = thumbnail_scopes.context_key([ruby["id"]])
        model_thumbs.save_thumb("loras", "gone.safetensors", _png((20, 80, 20)), key, {"tags": ["ruby"]})
        shutil.rmtree(model_thumbs.thumb_dir("loras", "gone.safetensors"))
        self.assertTrue(any(item["path"] == "gone.safetensors" for item in model_thumbs.list_saved()))
        model_thumbs.delete_thumb("loras", "gone.safetensors", key)
        self.assertFalse(any(item["path"] == "gone.safetensors" for item in model_thumbs.list_saved()))


if __name__ == "__main__":
    unittest.main()
