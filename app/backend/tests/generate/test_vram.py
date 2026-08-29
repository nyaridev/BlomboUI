from __future__ import annotations

import unittest
from unittest.mock import patch

from features.generate.scripts import vram

DEFAULT_SETTINGS = {
    "vramUnloadWorkflows": ["krea2"],
    "vramUnloadOnPrompt": True,
    "vramUnloadOnWeights": True,
}


def sample(**extra: object) -> dict:
    values: dict = {
        "workflow": "krea2",
        "prompt": "cat",
        "negative_prompt": "blur",
        "checkpoint": "krea.safetensors",
        "vae": "ae.safetensors",
        "text_encoder": "t5.safetensors",
        "loras": [],
        "seed": 1,
        "attention": {"enabled": False, "engine": "sage", "sage_attention": "auto", "allow_compile": False},
    }
    values.update(extra)
    return values


class VramFingerprintTests(unittest.TestCase):
    def setUp(self) -> None:
        vram.reset()

    def test_prompt_change_differs(self) -> None:
        a = vram.fingerprint(sample())
        b = vram.fingerprint(sample(prompt="dog"))
        self.assertNotEqual(a, b)

    def test_seed_ignored(self) -> None:
        a = vram.fingerprint(sample(seed=1))
        b = vram.fingerprint(sample(seed=99))
        self.assertEqual(a, b)

    def test_checkpoint_change_differs(self) -> None:
        a = vram.fingerprint(sample())
        b = vram.fingerprint(sample(checkpoint="other.safetensors"))
        self.assertNotEqual(a, b)

    def test_lora_list_and_strength(self) -> None:
        none = vram.fingerprint(sample())
        one = vram.fingerprint(sample(loras=[{"path": "style.safetensors", "strength": 0.8}]))
        two = vram.fingerprint(sample(loras=[{"path": "style.safetensors", "strength": 1.0}]))
        self.assertNotEqual(none, one)
        self.assertNotEqual(one, two)

    def test_attention_engine_change(self) -> None:
        off = vram.fingerprint(sample())
        sage = vram.fingerprint(sample(attention={"enabled": True, "engine": "sage", "sage_attention": "auto"}))
        flash = vram.fingerprint(sample(attention={"enabled": True, "engine": "flash"}))
        self.assertNotEqual(off, sage)
        self.assertNotEqual(sage, flash)

    def test_hires_model_override_included(self) -> None:
        shared = vram.fingerprint(sample(hires={"enabled": True, "scale": 1.5}))
        own = vram.fingerprint(
            sample(
                hires={
                    "enabled": True,
                    "scale": 1.5,
                    "model_override": True,
                    "checkpoint": "hires.safetensors",
                }
            )
        )
        self.assertNotEqual(shared, own)

    def test_adetailer_own_model_override_included(self) -> None:
        share = vram.fingerprint(
            sample(
                hires={"enabled": True, "model_override": True, "checkpoint": "hires.safetensors"},
                adetailer={"enabled": True, "units": [{"detector": "face.pt", "from_hires": True}]},
            )
        )
        own = vram.fingerprint(
            sample(
                hires={"enabled": True, "model_override": True, "checkpoint": "hires.safetensors"},
                adetailer={
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "from_hires": True,
                            "model_override": True,
                            "checkpoint": "ad.safetensors",
                        }
                    ],
                },
            )
        )
        self.assertNotEqual(share, own)


class VramUnloadGateTests(unittest.TestCase):
    def setUp(self) -> None:
        vram.reset()

    def test_maybe_unload_calls_then_skips(self) -> None:
        with patch.object(vram.settings, "load", return_value=DEFAULT_SETTINGS), patch.object(vram.comfy, "free") as free:
            self.assertTrue(vram.maybe_unload(sample()))
            free.assert_called_once_with(True, True)
            free.reset_mock()
            self.assertFalse(vram.maybe_unload(sample(seed=2)))
            free.assert_not_called()
            self.assertTrue(vram.maybe_unload(sample(prompt="dog")))
            free.assert_called_once_with(True, True)

    def test_skips_unlisted_workflow(self) -> None:
        with patch.object(vram.settings, "load", return_value=DEFAULT_SETTINGS), patch.object(vram.comfy, "free") as free:
            self.assertFalse(vram.maybe_unload(sample(workflow="illustrious")))
            self.assertFalse(vram.maybe_unload(sample(workflow="anima", prompt="dog")))
            free.assert_not_called()

    def test_prompt_gate_only(self) -> None:
        cfg = {**DEFAULT_SETTINGS, "vramUnloadOnWeights": False}
        with patch.object(vram.settings, "load", return_value=cfg), patch.object(vram.comfy, "free") as free:
            self.assertTrue(vram.maybe_unload(sample()))
            free.reset_mock()
            self.assertFalse(vram.maybe_unload(sample(loras=[{"path": "style.safetensors", "strength": 1}])))
            free.assert_not_called()
            self.assertTrue(vram.maybe_unload(sample(prompt="dog")))
            free.assert_called_once_with(True, True)

    def test_weights_gate_only(self) -> None:
        cfg = {**DEFAULT_SETTINGS, "vramUnloadOnPrompt": False}
        with patch.object(vram.settings, "load", return_value=cfg), patch.object(vram.comfy, "free") as free:
            self.assertTrue(vram.maybe_unload(sample()))
            free.reset_mock()
            self.assertFalse(vram.maybe_unload(sample(prompt="dog")))
            free.assert_not_called()
            self.assertTrue(vram.maybe_unload(sample(loras=[{"path": "style.safetensors", "strength": 1}])))
            free.assert_called_once_with(True, True)

    def test_both_off_never_unloads(self) -> None:
        cfg = {**DEFAULT_SETTINGS, "vramUnloadOnPrompt": False, "vramUnloadOnWeights": False}
        with patch.object(vram.settings, "load", return_value=cfg), patch.object(vram.comfy, "free") as free:
            self.assertFalse(vram.maybe_unload(sample()))
            self.assertFalse(vram.maybe_unload(sample(prompt="dog")))
            self.assertFalse(vram.maybe_unload(sample(checkpoint="other.safetensors")))
            free.assert_not_called()

    def test_switch_anima_to_krea2_unloads(self) -> None:
        with patch.object(vram.settings, "load", return_value=DEFAULT_SETTINGS), patch.object(vram.comfy, "free") as free:
            self.assertFalse(vram.maybe_unload(sample(workflow="anima")))
            free.assert_not_called()
            self.assertTrue(vram.maybe_unload(sample()))
            free.assert_called_once_with(True, True)

    def test_sequential_expanded_prompts_unload(self) -> None:
        with patch.object(vram.settings, "load", return_value=DEFAULT_SETTINGS), patch.object(vram.comfy, "free") as free:
            self.assertTrue(vram.maybe_unload(sample(prompt="cat, red hair")))
            free.reset_mock()
            self.assertTrue(vram.maybe_unload(sample(prompt="cat, blue hair")))
            free.assert_called_once_with(True, True)
            free.reset_mock()
            self.assertFalse(vram.maybe_unload(sample(prompt="cat, blue hair", seed=9)))
            free.assert_not_called()


if __name__ == "__main__":
    unittest.main()
