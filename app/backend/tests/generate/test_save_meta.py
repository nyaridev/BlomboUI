from __future__ import annotations

import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from features.generate.scripts import save_meta
from features.generate.scripts.grid import save_contact_sheet
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
        self.assertNotIn("foo.safetensors", blob)
        self.assertNotIn("/models", blob)
        self.assertNotIn(".yaml", blob)
        self.assertFalse(any(item.get("kind") == "wildcards" for item in packed["models"]))
        kinds = {item["kind"] for item in packed["models"]}
        self.assertEqual(kinds, {"checkpoints", "loras"})
        for item in packed["models"]:
            self.assertTrue(item["hashes"])
            self.assertNotIn("path", item)
            self.assertNotIn("name", item)
        wait.assert_not_called()
        request.assert_not_called()

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
