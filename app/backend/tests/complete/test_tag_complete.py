from __future__ import annotations

import unittest

from features.complete.scripts import tag_complete


class TagCompleteTests(unittest.TestCase):
    def test_frombe_matches_from_below(self) -> None:
        index = tag_complete._FileIndex("t.csv", 0, 0)
        index.posts = {"from_below": 100, "from_behind": 80, "front": 10}
        index.buckets = {
            "f": [
                ("from_below", "from_below", None),
                ("from_behind", "from_behind", None),
                ("front", "front", None),
            ]
        }
        hits = tag_complete._catalog_hits([index], "frombe")
        self.assertIn("from_below", hits)
        self.assertIn("from_behind", hits)
        self.assertNotIn("front", hits)

    def test_literal_prefix_still_matches(self) -> None:
        index = tag_complete._FileIndex("t.csv", 0, 0)
        index.posts = {"from_below": 100}
        index.buckets = {"f": [("from_below", "from_below", None)]}
        hits = tag_complete._catalog_hits([index], "from_b")
        self.assertIn("from_below", hits)

    def test_contains_when_prefix_is_sparse(self) -> None:
        index = tag_complete._FileIndex("t.csv", 0, 0)
        index.posts = {"light_blue": 50, "sunlight": 200, "other": 10}
        index.buckets = {
            "l": [("light_blue", "light_blue", None)],
            "s": [("sunlight", "sunlight", None)],
            "o": [("other", "other", None)],
        }
        hits = tag_complete._catalog_hits([index], "light")
        self.assertIn("light_blue", hits)
        self.assertIn("sunlight", hits)
        self.assertNotIn("other", hits)

    def test_prefix_ranks_before_contains(self) -> None:
        prefix, compact = "light", "light"
        rows = [
            {"tag": "sunlight", "posts": 999, "count": 0, "favorite": False},
            {"tag": "light_blue", "posts": 1, "count": 0, "favorite": False},
        ]
        rows.sort(key=lambda item: tag_complete._suggest_key(item, prefix, compact))
        self.assertEqual([row["tag"] for row in rows], ["light_blue", "sunlight"])

    def test_starred_contains_ranks_first(self) -> None:
        prefix, compact = "light", "light"
        rows = [
            {"tag": "light_blue", "posts": 500, "count": 0, "favorite": False},
            {"tag": "sunlight", "posts": 1, "count": 20, "favorite": True},
        ]
        rows.sort(key=lambda item: tag_complete._suggest_key(item, prefix, compact))
        self.assertEqual([row["tag"] for row in rows], ["sunlight", "light_blue"])

    def test_skips_contains_when_prefix_fills_limit(self) -> None:
        rows = [(f"light_{i:03d}", f"light_{i:03d}", None) for i in range(tag_complete.LIMIT)]
        index = tag_complete._FileIndex("t.csv", 0, 0)
        index.posts = {tag: 1 for tag, _, _ in rows}
        index.posts["sunlight"] = 999
        index.buckets = {"l": rows, "s": [("sunlight", "sunlight", None)]}
        hits = tag_complete._catalog_hits([index], "light")
        self.assertEqual(len(hits), tag_complete.LIMIT)
        self.assertNotIn("sunlight", hits)
