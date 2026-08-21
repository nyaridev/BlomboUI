from __future__ import annotations

import unittest
from unittest.mock import patch

from blombo import jobs


class PreviewTests(unittest.TestCase):
    def test_first_aligns_to_interval(self) -> None:
        self.assertEqual(jobs._preview_first(4, 8), 8)
        self.assertEqual(jobs._preview_first(4, 10), 12)
        self.assertEqual(jobs._preview_first(4, 4), 4)
        self.assertEqual(jobs._preview_first(1, 8), 8)

    def test_every_four_after_eight(self) -> None:
        live = self._live(every=4, after=8, last=True, steps=20)
        shown = [step for step in range(0, 21) if jobs._keep_snapshot(live, step)]
        self.assertEqual(shown, [8, 12, 16, 20])

    def test_every_four_after_ten_includes_last(self) -> None:
        live = self._live(every=4, after=10, last=True, steps=22)
        shown = [step for step in range(0, 23) if jobs._keep_snapshot(live, step)]
        self.assertEqual(shown, [12, 16, 20, 22])

    def test_disabled_preview_never_keeps(self) -> None:
        live = self._live(enabled=False, every=4, after=4, last=True, steps=20)
        shown = [step for step in range(0, 21) if jobs._keep_snapshot(live, step)]
        self.assertEqual(shown, [])

    def test_skip_last_step_when_unchecked(self) -> None:
        live = self._live(every=4, after=10, last=False, steps=22)
        shown = [step for step in range(0, 23) if jobs._keep_snapshot(live, step)]
        self.assertEqual(shown, [12, 16, 20])

    def test_later_batch_skips_first_wait(self) -> None:
        live = self._live(every=4, after=8, last=True, steps=20)
        live.batch_i = 1
        shown = [step for step in range(0, 21) if jobs._keep_snapshot(live, step)]
        self.assertEqual(shown, [4, 8, 12, 16, 20])

    def test_later_batch_keeps_wait_when_unchecked(self) -> None:
        live = self._live(every=4, after=8, last=True, steps=20, after_first=False)
        live.batch_i = 1
        shown = [step for step in range(0, 21) if jobs._keep_snapshot(live, step)]
        self.assertEqual(shown, [8, 12, 16, 20])

    def _live(
        self,
        *,
        every: int,
        after: int,
        last: bool,
        steps: int,
        enabled: bool = True,
        after_first: bool = True,
    ) -> jobs.LiveJob:
        with patch.object(
            jobs.settings,
            "load",
            return_value={
                "genPreview": enabled,
                "genPreviewEvery": every,
                "genPreviewAfter": after,
                "genPreviewAfterFirst": after_first,
                "genPreviewLast": last,
            },
        ):
            return jobs.LiveJob(steps=steps)
