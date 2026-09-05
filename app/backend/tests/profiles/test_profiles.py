from __future__ import annotations

import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import config
from features.profiles import service as profiles
from features.profiles.scripts.profiles import RETAIN_SECONDS, ProfileError
from infrastructure.storage import cache, cache_gallery, profiles as profiles_db, user
from infrastructure.storage.repositories import profiles as repo


class ProfileServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.user = self.tmp / "user"
        self.runtime = self.tmp / "runtime"
        self.data = self.user / "data"
        self.patches = [
            patch.object(config, "USER", self.user),
            patch.object(config, "DATA", self.data),
            patch.object(config, "RUNTIME", self.runtime),
            patch.object(config, "_ACTIVE_PROFILE_ID", "default"),
            patch.object(config, "_OUTPUT_OVERRIDE", None),
            patch.object(profiles_db, "_CONN", None),
            patch.object(user, "_CONN", None),
            patch.object(cache, "_CONN", None),
            patch.object(cache_gallery, "_CONN", None),
        ]
        for item in self.patches:
            item.start()
        profiles_db.connect()

    def tearDown(self) -> None:
        for module in (profiles_db, user, cache, cache_gallery):
            if module._CONN is not None:
                module._CONN.close()
                module._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_seeds_default_profile(self) -> None:
        data = profiles.list_profiles()
        self.assertEqual(data["activeId"], "default")
        self.assertEqual(data["profiles"][0]["id"], "default")
        self.assertEqual(data["profiles"][0]["displayName"], "Default")
        self.assertTrue(data["profiles"][0]["locked"])
        self.assertTrue((self.data / "sqlite" / "default").is_dir())
        self.assertTrue((self.runtime / "data" / "sqlite" / "default").is_dir())
        self.assertFalse((self.user / "gallery_thumbs").exists())
        self.assertFalse((self.user / "model_thumbs").exists())
        self.assertFalse((self.data / "history").exists())
        self.assertTrue((self.data / "history_thumbs" / "default" / "download").is_dir())
        self.assertTrue((self.data / "history_thumbs" / "default" / "browse").is_dir())

    def test_paths_nest_under_active_id(self) -> None:
        self.assertEqual(config.user_db_path(), self.data / "sqlite" / "default" / "blombo.sqlite")
        self.assertEqual(config.cache_db_path(), self.runtime / "data" / "sqlite" / "default" / "cache.sqlite")
        self.assertEqual(
            config.cache_gallery_db_path(),
            self.runtime / "data" / "sqlite" / "default" / "cache_gallery.sqlite",
        )
        self.assertEqual(config.outputs_root(), (self.user / "output" / "default").resolve())
        self.assertEqual(config.gallery_thumbs_root(), self.runtime / "data" / "gallery_thumbs" / "default")
        self.assertEqual(config.model_thumbs_root(), self.user / "model_thumbs" / "default")
        self.assertEqual(config.removed_root(), self.user / "removed" / "default")
        self.assertEqual(config.download_thumbs_root(), self.data / "history_thumbs" / "default" / "download")
        self.assertEqual(config.browse_thumbs_root(), self.data / "history_thumbs" / "default" / "browse")
        self.assertFalse((self.user / "gallery_thumbs").exists())
        self.assertFalse((self.user / "model_thumbs").exists())
        self.assertFalse((self.data / "history").exists())

    def test_moves_legacy_gallery_thumbs(self) -> None:
        old = self.user / "gallery_thumbs" / "default"
        old.mkdir(parents=True)
        (old / "a.jpg").write_bytes(b"jpg")
        config.ensure_profile_dirs("default")
        dest = self.runtime / "data" / "gallery_thumbs" / "default" / "a.jpg"
        self.assertTrue(dest.is_file())
        self.assertEqual(dest.read_bytes(), b"jpg")
        self.assertFalse((self.user / "gallery_thumbs").exists())

    def test_moves_legacy_history_thumbs(self) -> None:
        old = self.data / "history" / "default" / "download"
        old.mkdir(parents=True)
        (old / "a.jpg").write_bytes(b"jpg")
        config.ensure_profile_dirs("default")
        dest = self.data / "history_thumbs" / "default" / "download" / "a.jpg"
        self.assertTrue(dest.is_file())
        self.assertEqual(dest.read_bytes(), b"jpg")
        self.assertFalse((self.data / "history").exists())

    def test_create_rename_delete(self) -> None:
        created = profiles.create("Anime")
        self.assertNotEqual(created["id"], "default")
        self.assertEqual(created["displayName"], "Anime")
        self.assertTrue((self.data / "sqlite" / created["id"]).is_dir())
        renamed = profiles.rename(created["id"], "Toon")
        self.assertEqual(renamed["displayName"], "Toon")
        profiles.delete(created["id"])
        data = profiles.list_profiles()
        ids = [item["id"] for item in data["profiles"]]
        self.assertNotIn(created["id"], ids)
        self.assertEqual(data["removed"][0]["id"], created["id"])
        self.assertEqual(data["removed"][0]["displayName"], "Toon")
        self.assertEqual(data["removed"][0]["expiresAt"], data["removed"][0]["removedAt"] + RETAIN_SECONDS)
        self.assertTrue((self.data / "sqlite" / created["id"]).is_dir())

    def test_default_cannot_rename_or_delete(self) -> None:
        with self.assertRaises(ProfileError):
            profiles.rename("default", "Nope")
        with self.assertRaises(ProfileError):
            profiles.delete("default")

    def test_cannot_delete_active(self) -> None:
        created = profiles.create("Anime")
        profiles.activate(created["id"])
        with self.assertRaises(ProfileError):
            profiles.delete(created["id"])

    def test_activate_does_not_swap_live_paths(self) -> None:
        created = profiles.create("Anime")
        before = config.active_profile_id()
        before_db = config.user_db_path()
        profiles.activate(created["id"])
        self.assertEqual(config.active_profile_id(), before)
        self.assertEqual(config.user_db_path(), before_db)
        self.assertEqual(profiles.list_profiles()["activeId"], created["id"])

    def test_duplicate_display_name_rejected(self) -> None:
        profiles.create("Anime")
        with self.assertRaises(ProfileError):
            profiles.create("anime")

    def test_removed_name_can_be_reused(self) -> None:
        created = profiles.create("Anime")
        profiles.delete(created["id"])
        again = profiles.create("Anime")
        self.assertNotEqual(again["id"], created["id"])
        ids = [item["id"] for item in profiles.list_profiles()["profiles"]]
        self.assertIn(again["id"], ids)
        self.assertNotIn(created["id"], ids)

    def test_restore_returns_same_id_and_dirs(self) -> None:
        created = profiles.create("Anime")
        folder = self.data / "sqlite" / created["id"]
        profiles.delete(created["id"])
        restored = profiles.restore(created["id"])
        self.assertEqual(restored["id"], created["id"])
        self.assertEqual(restored["displayName"], "Anime")
        data = profiles.list_profiles()
        self.assertEqual(data["removed"], [])
        self.assertIn(created["id"], [item["id"] for item in data["profiles"]])
        self.assertTrue(folder.is_dir())

    def test_restore_blocked_when_live_name_taken(self) -> None:
        created = profiles.create("Anime")
        profiles.delete(created["id"])
        profiles.create("Anime")
        with self.assertRaises(ProfileError):
            profiles.restore(created["id"])
        self.assertTrue((self.data / "sqlite" / created["id"]).is_dir())

    def test_purge_removes_dirs(self) -> None:
        created = profiles.create("Anime")
        ident = created["id"]
        thumbs = self.runtime / "data" / "gallery_thumbs" / ident
        thumbs.mkdir(parents=True)
        (thumbs / "a.jpg").write_bytes(b"jpg")
        leftover = self.user / "gallery_thumbs" / ident
        leftover.mkdir(parents=True)
        (leftover / "b.jpg").write_bytes(b"jpg")
        history = self.data / "history_thumbs" / ident / "download"
        history.mkdir(parents=True, exist_ok=True)
        (history / "c.jpg").write_bytes(b"jpg")
        old_history = self.data / "history" / ident
        old_history.mkdir(parents=True)
        profiles.delete(ident)
        profiles.purge(ident)
        data = profiles.list_profiles()
        self.assertEqual(data["removed"], [])
        self.assertNotIn(ident, [item["id"] for item in data["profiles"]])
        self.assertFalse((self.data / "sqlite" / ident).exists())
        self.assertFalse(thumbs.exists())
        self.assertFalse(leftover.exists())
        self.assertFalse(history.exists())
        self.assertFalse(old_history.exists())

    def test_purge_expired_deletes_old_removed(self) -> None:
        created = profiles.create("Anime")
        ident = created["id"]
        profiles.delete(ident)
        row = repo.get_removed(ident)
        assert row is not None
        repo.delete_removed(ident)
        repo.insert_removed(ident, row["display_name"], row["created_at"], int(time.time()) - RETAIN_SECONDS - 1)
        profiles.purge_expired()
        self.assertIsNone(repo.get_removed(ident))
        self.assertFalse((self.data / "sqlite" / ident).exists())


if __name__ == "__main__":
    unittest.main()
