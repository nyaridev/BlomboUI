from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import ExitStack, contextmanager
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from features.generate.scripts import save_meta
from features.generate.scripts.grid.grid import save_contact_sheet
from features.models.scripts import hashes
from features.models.scripts import models
from shared import pnginfo


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _packed() -> dict:
    return {
        "prompt": "cat, dress",
        "negative_prompt": "blurry",
        "prompt_raw": "cat, __outfit__",
        "negative_prompt_raw": "blurry",
        "steps": 20,
        "cfg": 4.5,
        "seed": 7,
        "sampler": "euler",
        "scheduler": "normal",
        "width": 16,
        "height": 16,
        "models": [
            {
                "kind": "checkpoints",
                "hashes": {"autov1": "v1", "autov2": "v2ckpt", "autov3": "v3", "sha256": "aa" * 32},
            },
            {"kind": "loras", "hashes": {"autov2": "v2lora"}, "strength": 0.8},
        ],
    }


class SaveMetaTests(unittest.TestCase):
    def test_pack_params_hashes_models_and_keeps_both_prompts(self) -> None:
        def fake_file(kind: str, name: str) -> Path:
            return Path(f"/models/{kind}/{name}")

        def fake_entry(path: Path) -> dict[str, str]:
            stem = path.stem
            return {"autov1": f"{stem}1", "autov2": f"{stem}2", "autov3": f"{stem}3", "sha256": f"{stem}s"}

        with (
            patch.object(models, "model_file", side_effect=fake_file),
            patch.object(hashes, "wait") as wait,
            patch.object(hashes, "request") as request,
            patch.object(hashes, "entry", side_effect=fake_entry),
        ):
            packed = save_meta.pack_params(
                {
                    "prompt": "cat, dress",
                    "prompt_raw": "cat, __outfit__",
                    "negative_prompt": "blurry",
                    "negative_prompt_raw": "blurry",
                    "steps": 20,
                    "cfg": 4,
                    "seed": 1,
                    "sampler": "euler",
                    "scheduler": "normal",
                    "width": 16,
                    "height": 16,
                    "checkpoint": "foo.safetensors",
                    "loras": [{"lora": "detail.safetensors", "strength": 0.8}],
                    "wildcards_used": ["outfit"],
                },
                {
                    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "foo.safetensors"}},
                    "2": {"class_type": "LoraLoader", "inputs": {"lora_name": "detail.safetensors"}},
                },
            )
        blob = json.dumps(packed)
        self.assertEqual(packed["prompt"], "cat, dress")
        self.assertEqual(packed["prompt_raw"], "cat, __outfit__")
        self.assertIn("foo.safetensors", blob)
        self.assertNotIn("/models", blob)
        self.assertNotIn(".yaml", blob)
        self.assertFalse(any(item.get("kind") == "wildcards" for item in packed["models"]))
        kinds = {item["kind"] for item in packed["models"]}
        self.assertEqual(kinds, {"checkpoints", "loras"})
        by_kind = {item["kind"]: item for item in packed["models"]}
        self.assertEqual(by_kind["checkpoints"]["path"], "foo.safetensors")
        self.assertEqual(by_kind["loras"]["path"], "detail.safetensors")
        for item in packed["models"]:
            self.assertTrue(item["hashes"])
            self.assertNotIn("name", item)
        wait.assert_not_called()
        request.assert_not_called()

    @contextmanager
    def _hash_patches(self):
        def fake_file(kind: str, name: str) -> Path:
            return Path(f"/models/{kind}/{name}")

        def fake_entry(path: Path) -> dict[str, str]:
            stem = path.stem
            return {"autov1": f"{stem}1", "autov2": f"{stem}2", "autov3": f"{stem}3", "sha256": f"{stem}s"}

        with ExitStack() as stack:
            stack.enter_context(patch.object(models, "model_file", side_effect=fake_file))
            stack.enter_context(patch.object(hashes, "wait"))
            stack.enter_context(patch.object(hashes, "request"))
            stack.enter_context(patch.object(hashes, "entry", side_effect=fake_entry))
            yield

    def test_pack_hires_snapshot_and_skips_hires_graph_models(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 512,
            "height": 512,
            "checkpoint": "first.safetensors",
            "loras": [{"lora": "base.safetensors", "strength": 0.5}],
            "hires": {
                "enabled": True,
                "scale": 1.5,
                "size_mode": "scale",
                "upscale_model": "4x.pth",
                "steps": 12,
                "cfg": 4,
                "cfg_override": True,
                "sampler": "dpmpp_2m",
                "sampler_override": True,
                "scheduler": "karras",
                "scheduler_override": True,
                "denoise": 0.4,
                "upscale_method": "lanczos",
                "crop": "center",
                "model_override": True,
                "checkpoint": "hires.safetensors",
                "lora_override": True,
                "loras": [{"path": "detail.safetensors", "strength": 0.8}],
            },
        }
        graph = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "_meta": {"title": "Load Checkpoint"},
                "inputs": {"ckpt_name": "first.safetensors"},
            },
            "2": {
                "class_type": "CheckpointLoaderSimple",
                "_meta": {"title": "Hires Checkpoint"},
                "inputs": {"ckpt_name": "hires.safetensors"},
            },
            "3": {
                "class_type": "UpscaleModelLoader",
                "_meta": {"title": "Hires Upscale"},
                "inputs": {"model_name": "4x.pth"},
            },
        }
        with self._hash_patches():
            first = save_meta.pack_params(values, graph, kind="images")
            hires = save_meta.pack_params(values, graph, kind="hires")
        self.assertNotIn("hires", first)
        kinds = {item["kind"] for item in first["models"]}
        self.assertEqual(kinds, {"checkpoints", "loras"})
        self.assertEqual(first["models"][0]["hashes"]["autov2"], "first2")
        blob = hires["hires"]
        self.assertEqual(blob["cfg"], 4)
        self.assertEqual(blob["sampler"], "dpmpp_2m")
        self.assertEqual(blob["scheduler"], "karras")
        self.assertEqual(blob["denoise"], 0.4)
        self.assertEqual(blob["steps"], 12)
        self.assertEqual(blob["width"], 768)
        self.assertEqual(blob["height"], 768)
        self.assertEqual(blob["scale"], 1.5)
        self.assertEqual(blob["upscale_method"], "lanczos")
        self.assertEqual(blob["crop"], "center")
        self.assertNotIn("seed", blob)
        self.assertNotIn("prompt", blob)
        hires_kinds = {item["kind"] for item in blob["models"]}
        self.assertEqual(hires_kinds, {"upscale_models", "checkpoints", "loras"})
        top_kinds = {item["kind"] for item in hires["models"]}
        self.assertEqual(top_kinds, {"checkpoints", "loras"})
        self.assertEqual(hires["models"][0]["hashes"]["autov2"], "first2")
        self.assertTrue(any(item["kind"] == "upscale_models" for item in blob["models"]))
        self.assertFalse(any(item["kind"] == "upscale_models" for item in hires["models"]))
        taken = save_meta.take_params(hires)
        self.assertIsNotNone(taken)
        self.assertEqual(taken["hires"]["cfg"], 4)

    def test_pack_params_keeps_adetailer(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 16,
            "height": 16,
            "checkpoint": "first.safetensors",
            "adetailer": {
                "enabled": True,
                "units": [
                    {
                        "detector": "bbox/face.pt",
                        "sam_model": "sam.pt",
                        "steps": 20,
                        "cfg": 4,
                        "cfg_override": True,
                        "denoise": 0.5,
                        "sampler_override": True,
                        "sampler": "dpmpp_2m",
                        "scheduler_override": True,
                        "scheduler": "karras",
                    }
                ],
            },
        }
        with self._hash_patches():
            packed = save_meta.pack_params(values, None, kind="images")
        blob = packed["adetailer"]
        unit = blob["units"][0]
        self.assertNotIn("enabled", blob)
        self.assertNotIn("detector", unit)
        self.assertEqual(unit["steps"], 20)
        self.assertEqual(unit["cfg"], 4)
        self.assertEqual(unit["sampler"], "dpmpp_2m")
        self.assertEqual(unit["scheduler"], "karras")
        self.assertEqual(unit["denoise"], 0.5)
        self.assertNotIn("seed", unit)
        self.assertNotIn("prompt", unit)
        kinds = {item["kind"] for item in unit["models"]}
        self.assertEqual(kinds, {"ultralytics", "sams"})
        taken = save_meta.take_params(packed)
        self.assertIsNotNone(taken)
        self.assertEqual(taken["adetailer"]["units"][0]["sampler"], "dpmpp_2m")

    def test_pack_hires_off_and_first_pass_have_no_hires_key(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 16,
            "height": 16,
            "checkpoint": "first.safetensors",
            "hires": {"enabled": False, "upscale_model": "4x.pth", "cfg_override": True, "cfg": 4},
        }
        with self._hash_patches():
            packed = save_meta.pack_params(values, None, kind="hires")
            first = save_meta.pack_params(values, None, kind="images")
        self.assertNotIn("hires", packed)
        self.assertNotIn("hires", first)

    def test_pack_adetailer_skips_first_pass_when_hires_on(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 16,
            "height": 16,
            "checkpoint": "first.safetensors",
            "hires": {"enabled": True, "upscale_model": "4x.pth"},
            "adetailer": {"enabled": True, "units": [{"detector": "face.pt"}]},
        }
        with self._hash_patches():
            first = save_meta.pack_params(values, None, kind="images")
            final = save_meta.pack_params(values, None, kind="hires")
        self.assertNotIn("adetailer", first)
        self.assertIn("adetailer", final)
        self.assertIn("hires", final)

    def test_pack_adetailer_skips_graph_models(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 16,
            "height": 16,
            "checkpoint": "first.safetensors",
            "adetailer": {"enabled": True, "units": [{"detector": "face.pt"}]},
        }
        graph = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "_meta": {"title": "Load Checkpoint"},
                "inputs": {"ckpt_name": "first.safetensors"},
            },
            "adetailer/0/2": {
                "class_type": "UltralyticsDetectorProvider",
                "_meta": {"title": "ADetailer Detector"},
                "inputs": {"model_name": "face.pt"},
            },
        }
        with self._hash_patches():
            packed = save_meta.pack_params(values, graph, kind="images")
        kinds = {item["kind"] for item in packed["models"]}
        self.assertEqual(kinds, {"checkpoints"})
        unit_kinds = {item["kind"] for item in packed["adetailer"]["units"][0]["models"]}
        self.assertIn("ultralytics", unit_kinds)

    def test_pack_adetailer_sampler_follows_first_pass_when_override_off(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7.5,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "width": 64,
            "height": 64,
            "checkpoint": "first.safetensors",
            "adetailer": {
                "enabled": True,
                "units": [
                    {
                        "detector": "face.pt",
                        "steps": 8,
                        "cfg": 2,
                        "denoise": 0.3,
                        "sampler": "dpmpp_2m",
                        "sampler_override": False,
                        "scheduler": "karras",
                        "scheduler_override": False,
                    }
                ],
            },
        }
        with self._hash_patches():
            packed = save_meta.pack_params(values, None, kind="images")
        unit = packed["adetailer"]["units"][0]
        self.assertEqual(unit["cfg"], 7.5)
        self.assertEqual(unit["sampler"], "euler")
        self.assertEqual(unit["scheduler"], "sgm_uniform")
        self.assertEqual(unit["denoise"], 0.3)

    def test_pack_adetailer_from_hires_uses_hires_overrides(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 16,
            "height": 16,
            "checkpoint": "first.safetensors",
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "sampler_override": True,
                "sampler": "dpmpp_2m",
                "cfg_override": True,
                "cfg": 3.5,
            },
            "adetailer": {
                "enabled": True,
                "units": [{"detector": "face.pt", "from_hires": True, "sampler": "heun", "cfg": 2}],
            },
        }
        with self._hash_patches():
            packed = save_meta.pack_params(values, None, kind="hires")
        unit = packed["adetailer"]["units"][0]
        self.assertEqual(unit["sampler"], "dpmpp_2m")
        self.assertEqual(unit["cfg"], 3.5)

    def test_pack_hires_sampler_follows_first_pass_when_override_off(self) -> None:
        values = {
            "prompt": "cat",
            "prompt_raw": "cat",
            "negative_prompt": "",
            "negative_prompt_raw": "",
            "steps": 20,
            "cfg": 7.5,
            "seed": 1,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "width": 64,
            "height": 64,
            "checkpoint": "first.safetensors",
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "steps": 8,
                "cfg": 2,
                "cfg_override": False,
                "sampler": "dpmpp_2m",
                "sampler_override": False,
                "scheduler": "karras",
                "scheduler_override": False,
                "denoise": 0.3,
            },
        }
        with self._hash_patches():
            packed = save_meta.pack_params(values, None, kind="hires")
        blob = packed["hires"]
        self.assertEqual(blob["cfg"], 7.5)
        self.assertEqual(blob["sampler"], "euler")
        self.assertEqual(blob["scheduler"], "sgm_uniform")
        self.assertEqual({item["kind"] for item in blob["models"]}, {"upscale_models"})

    def test_pack_params_keeps_path_when_hashes_missing(self) -> None:
        with (
            patch.object(models, "model_file", side_effect=lambda kind, name: Path(f"/tmp/{kind}/{name}")),
            patch.object(hashes, "entry", return_value=None),
            patch.object(hashes, "wait", return_value="") as wait,
            patch.object(hashes, "request"),
        ):
            packed = save_meta.pack_params(
                {
                    "prompt": "cat",
                    "prompt_raw": "cat",
                    "negative_prompt": "",
                    "negative_prompt_raw": "",
                    "checkpoint": "foo.safetensors",
                    "loras": [{"lora": "style/detail.safetensors", "strength": 0.8}],
                }
            )
        by_kind = {item["kind"]: item for item in packed["models"]}
        self.assertEqual(by_kind["checkpoints"]["path"], "foo.safetensors")
        self.assertNotIn("hashes", by_kind["checkpoints"])
        self.assertEqual(by_kind["loras"]["path"], "style/detail.safetensors")
        self.assertNotIn("hashes", by_kind["loras"])
        wait.assert_called()

    def test_pack_params_skips_graph_lora_when_values_list_present(self) -> None:
        def fake_file(kind: str, name: str):
            if kind == "loras" and name == "foo.safetensors":
                return None
            return Path(f"/models/{kind}/{name}")

        def fake_entry(path: Path) -> dict[str, str]:
            stem = path.stem
            return {"autov1": f"{stem}1", "autov2": f"{stem}2", "autov3": f"{stem}3", "sha256": f"{stem}s"}

        with (
            patch.object(models, "model_file", side_effect=fake_file),
            patch.object(hashes, "wait"),
            patch.object(hashes, "request"),
            patch.object(hashes, "entry", side_effect=fake_entry),
        ):
            packed = save_meta.pack_params(
                {
                    "prompt": "cat",
                    "prompt_raw": "cat",
                    "negative_prompt": "",
                    "negative_prompt_raw": "",
                    "checkpoint": "base.safetensors",
                    "loras": [{"lora": "NSFW/foo.safetensors", "strength": 0.8}],
                },
                {
                    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "base.safetensors"}},
                    "2": {
                        "class_type": "Power Lora Loader (rgthree)",
                        "inputs": {"lora_1": {"on": True, "lora": "foo.safetensors", "strength": 0.8}},
                    },
                    "3": {"class_type": "LoraLoader", "inputs": {"lora_name": "foo.safetensors"}},
                },
            )
        loras = [item for item in packed["models"] if item["kind"] == "loras"]
        self.assertEqual(len(loras), 1)
        self.assertEqual(loras[0]["path"], "NSFW/foo.safetensors")
        self.assertEqual(loras[0]["hashes"]["autov2"], "foo2")
        self.assertEqual(loras[0]["strength"], 0.8)

    def test_lora_models_collapses_prefixed_and_bare_paths(self) -> None:
        rows = save_meta.lora_models(
            {
                "models": [
                    {
                        "kind": "loras",
                        "hashes": {"autov2": "v2lora", "sha256": "aa" * 32},
                        "path": "NSFW/foo.safetensors",
                        "strength": 0.8,
                    },
                    {"kind": "loras", "path": "foo.safetensors", "strength": 0.8},
                ]
            }
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["path"], "NSFW/foo.safetensors")
        self.assertEqual(rows[0]["hashes"]["autov2"], "v2lora")

    def test_embed_round_trip_and_grid_matches_first_image(self) -> None:
        packed = _packed()
        meta = save_meta.envelope("job-1", {"template_id": "portrait"}, packed, "image", "2026-01-01T00:00:00Z")
        image = pnginfo.embed(_png(), packed, {"9": {"class_type": "KSampler", "inputs": {}}}, metadata=meta)
        read = pnginfo.read(image)
        self.assertEqual(read["metadata"]["version"], 2)
        self.assertEqual(read["metadata"]["params"]["prompt_raw"], "cat, __outfit__")
        self.assertEqual(read["metadata"]["params"]["models"], packed["models"])
        self.assertIn("prompt", read["raw"])
        self.assertIn("Model hash: v2ckpt", read["text"])
        self.assertNotIn("Model: ", read["text"])
        self.assertIn("Lora hashes: v2lora", read["text"])
        self.assertNotIn(".safetensors", json.dumps(read["metadata"]))
        self.assertNotIn("wildcard", json.dumps(read["metadata"]).lower())

        tmp = Path(tempfile.mkdtemp(prefix="save-meta-"))
        first = tmp / "a.png"
        second = tmp / "b.png"
        first.write_bytes(image)
        second.write_bytes(_png())
        dest = tmp / "grid.png"
        save_contact_sheet(
            [first, second],
            dest,
            fmt="png",
            values=packed,
            metadata=save_meta.envelope("job-1", {}, packed, "grid", "2026-01-01T00:00:00Z"),
        )
        grid = pnginfo.read(dest.read_bytes())
        self.assertEqual(grid["metadata"]["asset_kind"], "grid")
        self.assertEqual(grid["metadata"]["params"], packed)
        self.assertNotIn("prompt", grid["raw"])


if __name__ == "__main__":
    unittest.main()
