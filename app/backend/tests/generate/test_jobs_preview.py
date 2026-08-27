from __future__ import annotations

import unittest
from unittest.mock import patch

from features.generate.scripts import jobs


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

    def test_hires_stage_advances_and_maps_progress(self) -> None:
        live = jobs.LiveJob(steps=20)
        live.stages = {"5": "generation", "20": "upscaling", "18": "hires"}
        jobs._live.clear()
        jobs._live["j"] = live
        jobs._on_live("j", {"node": "5", "value": 10, "max": 20})
        fields = jobs._live_fields("j")
        self.assertEqual(fields["progress"]["stage"], "generation")
        self.assertEqual(fields["progress"]["value"], 16)
        self.assertEqual(fields["progress"]["step"], 10)
        self.assertEqual(fields["progress"]["steps"], 20)
        jobs._on_live("j", {"node": "20"})
        fields = jobs._live_fields("j")
        self.assertEqual(fields["progress"]["stage"], "upscaling")
        self.assertEqual(fields["progress"]["value"], 33)
        jobs._on_live("j", {"node": "18", "value": 15, "max": 15})
        fields = jobs._live_fields("j")
        self.assertEqual(fields["progress"]["stage"], "hires")
        self.assertEqual(fields["progress"]["value"], 100)
        jobs._on_live("j", {"node": "5"})
        self.assertEqual(jobs._live_fields("j")["progress"]["stage"], "hires")

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
