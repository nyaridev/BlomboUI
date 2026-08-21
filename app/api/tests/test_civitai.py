from __future__ import annotations

import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from blombo import civitai

try:
    from blombo import main
except ModuleNotFoundError as exc:
    if exc.name != "fastapi":
        raise
    main = None  # type: ignore[assignment]


class CivitaiRequestTests(unittest.TestCase):
    def test_list_models_encodes_filters_and_cursor(self) -> None:
        captured: dict[str, object] = {}

        def fake_get_json(url: str, headers: dict[str, str]) -> dict:
            captured["url"] = url
            captured["headers"] = headers
            return {"items": [], "metadata": {}}

        with (
            patch.object(civitai.settings, "load", return_value={"civitaiApiKey": "secret"}),
            patch.object(civitai, "_get_json", side_effect=fake_get_json),
        ):
            civitai.list_models(
                query="pony",
                types=["LORA", "LoCon"],
                base_models=["Pony", "Illustrious"],
                sort="Most Liked",
                period="Month",
                page=4,
                cursor="next-token",
                early_access=True,
                supports_generation=False,
                nsfw=False,
                tag="character",
            )

        query = parse_qs(urlsplit(str(captured["url"])).query)
        self.assertEqual(query["query"], ["pony"])
        self.assertEqual(query["types"], ["LORA", "LoCon"])
        self.assertEqual(query["baseModels"], ["Pony", "Illustrious"])
        self.assertEqual(query["sort"], ["Most Liked"])
        self.assertEqual(query["period"], ["Month"])
        self.assertEqual(query["cursor"], ["next-token"])
        self.assertNotIn("page", query)
        self.assertEqual(query["earlyAccess"], ["true"])
        self.assertEqual(query["supportsGeneration"], ["false"])
        self.assertEqual(query["nsfw"], ["false"])
        self.assertEqual(query["tag"], ["character"])
        self.assertNotIn("fromPlatform", query)
        self.assertEqual(captured["headers"], {"Authorization": "Bearer secret"})

    def test_download_cost_from_early_access(self) -> None:
        paid, buzz = civitai.download_cost(
            [
                {
                    "availability": "EarlyAccess",
                    "earlyAccessConfig": {"chargeForDownload": True, "downloadPrice": 500},
                }
            ]
        )
        self.assertTrue(paid)
        self.assertEqual(buzz, 500)
        self.assertEqual(civitai.download_cost([{"availability": "EarlyAccess"}]), (False, 0))
        self.assertEqual(civitai.download_cost([{"availability": "Public"}]), (False, 0))

    @unittest.skipIf(main is None, "FastAPI is not installed in this test environment")
    def test_route_forwards_expanded_filters(self) -> None:
        with patch.object(main.civitai, "list_models", return_value={"items": [], "metadata": {}}) as request:
            result = main.civitai_models(
                query="flux",
                types=["Checkpoint"],
                base_models=["Flux.1 D"],
                sort="Oldest",
                period="Year",
                page=2,
                cursor="cursor",
                early_access=None,
                supports_generation=True,
                from_platform=False,
                nsfw=False,
                tag="style",
            )

        self.assertEqual(result["items"], [])
        self.assertEqual(
            request.call_args.kwargs,
            {
                "query": "flux",
                "types": ["Checkpoint"],
                "base_models": ["Flux.1 D"],
                "sort": "Oldest",
                "period": "Year",
                "page": 2,
                "limit": 20,
                "cursor": "cursor",
                "early_access": None,
                "supports_generation": True,
                "from_platform": False,
                "nsfw": False,
                "tag": "style",
            },
        )

    @unittest.skipIf(main is None, "FastAPI is not installed in this test environment")
    def test_route_exposes_download_names_and_hashes(self) -> None:
        payload = {
            "items": [
                {
                    "id": 12,
                    "name": "Example Model",
                    "creator": {"username": "creator"},
                    "modelVersions": [
                        {
                            "id": 44,
                            "name": "v1",
                            "baseModel": "SDXL",
                            "files": [
                                {
                                    "name": "example_model.safetensors",
                                    "hashes": {"AutoV3": "ABC123"},
                                }
                            ],
                            "images": [],
                        }
                    ],
                }
            ],
            "metadata": {},
        }
        with patch.object(main.civitai, "list_models", return_value=payload):
            item = main.civitai_models()["items"][0]

        self.assertEqual(item["downloadNames"], ["Example Model", "v1", "example_model.safetensors"])
        self.assertEqual(item["downloadHashes"], ["abc123"])
        self.assertEqual(item["versions"], [{"id": 44, "baseModel": "SDXL"}])

    def test_get_model_trims_payload_and_auth(self) -> None:
        captured: dict[str, object] = {}

        def fake_get_json(url: str, headers: dict[str, str]) -> dict:
            captured["url"] = url
            captured["headers"] = headers
            return {
                "id": 99,
                "name": "Example",
                "type": "LORA",
                "nsfw": True,
                "description": "<p>Hello</p>",
                "creator": {"username": "maker"},
                "stats": {"downloadCount": 10, "favoriteCount": 2, "rating": 4.5, "thumbsUpCount": 8},
                "modelVersions": [
                    {
                        "id": 7,
                        "name": "v2",
                        "baseModel": "Pony",
                        "description": "newer",
                        "trainedWords": ["foo", ""],
                        "images": [
                            {"url": "https://image.civitai.com/a.jpg", "nsfwLevel": 1},
                            {"url": "https://image.civitai.com/b.jpg", "type": "video"},
                            {"url": "https://image.civitai.com/c.jpg", "nsfwLevel": 8},
                        ],
                    },
                    {
                        "id": 3,
                        "name": "illust",
                        "baseModel": "Illustrious",
                        "trainedWords": ["bar"],
                        "earlyAccessConfig": {"chargeForDownload": True, "downloadPrice": 200},
                        "images": [{"url": "https://image.civitai.com/d.jpg"}],
                    },
                ],
            }

        with (
            patch.object(civitai.settings, "load", return_value={"civitaiApiKey": "secret"}),
            patch.object(civitai, "_get_json", side_effect=fake_get_json),
        ):
            model = civitai.get_model(99)

        self.assertEqual(captured["url"], "https://civitai.com/api/v1/models/99")
        self.assertEqual(captured["headers"], {"Authorization": "Bearer secret"})
        self.assertEqual(model["id"], 99)
        self.assertEqual(model["creator"], "maker")
        self.assertEqual(model["stats"]["downloadCount"], 10)
        self.assertEqual(model["versions"][0]["trainedWords"], ["foo"])
        self.assertEqual(
            model["versions"][0]["images"],
            [
                {"url": "https://image.civitai.com/a.jpg", "nsfw": False},
                {"url": "https://image.civitai.com/c.jpg", "nsfw": True},
            ],
        )
        self.assertEqual(model["versions"][1]["baseModel"], "Illustrious")
        self.assertTrue(model["versions"][1]["paid"])
        self.assertEqual(model["versions"][1]["buzz"], 200)

    @unittest.skipIf(main is None, "FastAPI is not installed in this test environment")
    def test_model_route_returns_trimmed_payload(self) -> None:
        payload = {
            "id": 5,
            "name": "Trimmed",
            "type": "Checkpoint",
            "creator": "user",
            "nsfw": False,
            "description": "",
            "stats": {},
            "versions": [],
        }
        with patch.object(main.civitai, "get_model", return_value=payload) as request:
            result = main.civitai_model(5)

        self.assertEqual(result, payload)
        request.assert_called_once_with(5)


if __name__ == "__main__":
    unittest.main()
