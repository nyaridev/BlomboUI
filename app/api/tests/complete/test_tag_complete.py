from __future__ import annotations

import unittest

from blombo.complete import tag_complete


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
