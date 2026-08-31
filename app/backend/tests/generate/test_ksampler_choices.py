from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from infrastructure.comfy import client as comfy


def _ksampler_info(samplers: list[str], schedulers: list[str]) -> bytes:
    payload = {
        "KSampler": {
            "input": {
                "required": {
                    "sampler_name": [samplers, {}],
                    "scheduler": [schedulers, {}],
                }
            }
        }
    }
    return json.dumps(payload).encode("utf-8")


class KSamplerChoicesTests(unittest.TestCase):
    def test_reads_sampler_and_scheduler_combos(self) -> None:
        samplers = ["euler", "dpmpp_2m", "res_multistep"]
        schedulers = ["normal", "karras", "kl_optimal"]
        with patch.object(comfy, "_request", return_value=_ksampler_info(samplers, schedulers)):
            got = comfy.ksampler_choices()
        self.assertEqual(got["samplers"], samplers)
        self.assertEqual(got["schedulers"], schedulers)

    def test_comfy_down_returns_empty(self) -> None:
        with patch.object(comfy, "_request", side_effect=comfy.ComfyError("comfy_unreachable", "down")):
            got = comfy.ksampler_choices()
        self.assertEqual(got, {"samplers": [], "schedulers": []})
