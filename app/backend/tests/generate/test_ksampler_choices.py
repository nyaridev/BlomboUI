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


def _qwen_info(node: str, models: list[str]) -> bytes:
    payload = {node: {"input": {"required": {"model_name": [models, {}]}}}}
    return json.dumps(payload).encode("utf-8")


class QwenVlChoicesTests(unittest.TestCase):
    def test_merges_gguf_and_advanced_combos(self) -> None:
        responses = {
            "/object_info/AILab_QwenVL": _qwen_info("AILab_QwenVL", ["Qwen3-VL-4B-Instruct", "NodeNative"]),
            "/object_info/AILab_QwenVL_Advanced": _qwen_info("AILab_QwenVL_Advanced", ["Qwen3-VL-4B-Instruct"]),
            "/object_info/AILab_QwenVL_GGUF": _qwen_info(
                "AILab_QwenVL_GGUF", ["Qwen3VL-4B-Instruct-Q8_0.gguf", "Qwen3VL-32B-Instruct-Q4_K_M.gguf"]
            ),
            "/object_info/AILab_QwenVL_GGUF_Advanced": _qwen_info(
                "AILab_QwenVL_GGUF_Advanced",
                ["Qwen3VL-4B-Instruct-Q8_0.gguf", "Extra-Q6.gguf", "(edit gguf_models.json)"],
            ),
        }

        def fake_request(_method: str, path: str, *_args: object, **_kwargs: object) -> bytes:
            return responses[path]

        with patch.object(comfy, "_request", side_effect=fake_request):
            got = comfy.qwen_vl_choices()
        self.assertEqual(got["native"], ["Qwen3-VL-4B-Instruct", "NodeNative"])
        self.assertEqual(
            got["gguf"],
            ["Qwen3VL-4B-Instruct-Q8_0.gguf", "Qwen3VL-32B-Instruct-Q4_K_M.gguf", "Extra-Q6.gguf"],
        )

    def test_comfy_down_returns_empty(self) -> None:
        with patch.object(comfy, "_request", side_effect=comfy.ComfyError("comfy_unreachable", "down")):
            got = comfy.qwen_vl_choices()
        self.assertEqual(got, {"native": [], "gguf": []})
