from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError, URLError
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from features.civitai.scripts import client as civitai
from features.civitai.scripts import downloads as civitai_downloads

try:
    from api.routes import civitai as main
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

    def test_list_models_explains_common_request_failures(self) -> None:
        failures = (
            (HTTPError("url", 500, "Server Error", {}, None), "HTTP 500: Server Error"),
            (HTTPError("url", 429, "Too Many Requests", {}, None), "rate limit"),
            (TimeoutError(), "timed out"),
            (URLError("DNS lookup failed"), "DNS lookup failed"),
        )
        for failure, expected in failures:
            with self.subTest(expected=expected):
                with (
                    patch.object(civitai.settings, "load", return_value={"civitaiApiKey": "secret"}),
                    patch.object(civitai, "_get_json", side_effect=failure),
                ):
                    with self.assertRaisesRegex(civitai.CivitaiRequestError, expected):
                        civitai.list_models()

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

    def test_trim_model_retains_tags_and_primary_file(self) -> None:
        model = civitai.trim_model(
            {
                "id": 99,
                "name": "Example",
                "type": "LORA",
                "tags": ["style", "anime"],
                "modelVersions": [
                    {
                        "id": 7,
                        "name": "fp8",
                        "baseModel": "Anima",
                        "downloadUrl": "https://civitai.com/api/download/models/7",
                        "files": [
                            {
                                "id": 8,
                                "name": "example.safetensors",
                                "primary": True,
                                "sizeKB": 2,
                                "downloadUrl": "https://download/example",
                                "hashes": {"SHA256": "abc"},
                                "metadata": {"fp": "fp8"},
                            }
                        ],
                    }
                ],
            }
        )
        assert model is not None
        self.assertEqual(model["tags"], ["style", "anime"])
        self.assertEqual(model["versions"][0]["files"][0]["metadata"], {"fp": "fp8"})
        self.assertEqual(model["versions"][0]["files"][0]["sizeBytes"], 2048)

    def test_primary_file_uses_requested_variant_and_falls_back(self) -> None:
        version = {
            "files": [
                {"id": 10, "name": "primary.safetensors", "primary": True, "downloadUrl": "primary"},
                {"id": 11, "name": "fp8.safetensors", "primary": False, "downloadUrl": "fp8"},
            ]
        }

        self.assertEqual(civitai_downloads._primary_file(version, 11)["name"], "fp8.safetensors")
        self.assertEqual(civitai_downloads._primary_file(version, 999)["name"], "primary.safetensors")

    def test_download_uses_intelligent_model_path_and_alias(self) -> None:
        model = {
            "id": 99,
            "name": "Model Name",
            "type": "LORA",
            "creator": "THEANTLERS",
            "tags": ["style"],
            "versions": [
                {
                    "id": 7,
                    "baseModel": "Anima",
                    "paid": False,
                    "files": [
                        {
                            "name": "source.safetensors",
                            "primary": True,
                            "downloadUrl": "https://download/example",
                            "hashes": {},
                        }
                    ],
                }
            ],
        }

        def fake_write(_url: str, target: Path) -> None:
            target.write_bytes(b"model")

        with TemporaryDirectory() as root:
            with (
            patch.object(civitai_downloads.civitai, "get_model", return_value=model),
            patch.object(
                civitai_downloads.dirs,
                "listed_dirs",
                return_value=[{"id": "local", "name": "Local", "path": root}],
            ),
            patch.object(
                civitai_downloads.settings,
                "load",
                return_value={
                    "civitaiApiKey": "secret",
                    "civitaiDownload": {
                        "modelDirId": "local",
                        "modelIntelligent": True,
                        "modelSortBaseModel": True,
                        "modelSortCategory": True,
                        "modelSortCreator": True,
                        "updateModelInfo": False,
                        "authorAliases": {},
                    },
                },
            ),
            patch.object(civitai_downloads, "_write_download", side_effect=fake_write),
            ):
                result = civitai_downloads.download(
                    {
                        "modelId": 99,
                        "versionId": 7,
                        "customNaming": True,
                        "modelName": "Model Name",
                        "creatorAlias": "ta",
                    }
                )
            path = Path(result["paths"][0])
            self.assertEqual(path.relative_to(root).as_posix(), "loras/Anima/Style/THEANTLERS/ta_Model_Name.safetensors")
            self.assertEqual(path.read_bytes(), b"model")

    def test_download_updates_civitai_model_info_when_enabled(self) -> None:
        model = {
            "id": 99,
            "name": "Model Name",
            "type": "LORA",
            "creator": "maker",
            "versions": [
                {
                    "id": 7,
                    "baseModel": "Pony",
                    "trainedWords": ["trigger", "second"],
                    "images": [{"url": "https://image.civitai.com/preview.jpg"}],
                    "paid": False,
                    "files": [
                        {
                            "id": 10,
                            "name": "source.safetensors",
                            "primary": True,
                            "downloadUrl": "https://download/example",
                            "hashes": {},
                        }
                    ],
                }
            ],
        }

        def fake_write(_url: str, target: Path) -> None:
            target.write_bytes(b"model")

        with TemporaryDirectory() as root:
            with (
                patch.object(civitai_downloads.civitai, "get_model", return_value=model),
                patch.object(
                    civitai_downloads.dirs,
                    "listed_dirs",
                    return_value=[{"id": "local", "name": "Local", "path": root}],
                ),
                patch.object(
                    civitai_downloads.settings,
                    "load",
                    return_value={
                        "civitaiApiKey": "secret",
                        "civitaiDownload": {
                            "modelDirId": "local",
                            "modelIntelligent": False,
                            "updateModelInfo": True,
                        },
                    },
                ),
                patch.object(civitai_downloads, "_write_download", side_effect=fake_write),
                patch.object(
                    civitai_downloads.civitai,
                    "fetch_image",
                    return_value=(b"thumb", "image/jpeg"),
                ),
                patch.object(
                    civitai_downloads.model_meta,
                    "get_info",
                    return_value={"types": [], "prompt": ""},
                ),
                patch.object(civitai_downloads.model_meta, "set_info") as set_info,
                patch.object(civitai_downloads.model_meta, "save_thumb") as save_thumb,
            ):
                result = civitai_downloads.download(
                    {
                        "modelId": 99,
                        "versionId": 7,
                        "fileId": 10,
                        "modelName": "Model Name",
                    }
                )
                downloaded = Path(result["paths"][0]).read_bytes()

        self.assertEqual(downloaded, b"model")
        set_info.assert_called_once_with(
            "loras",
            "Model_Name.safetensors",
            ["Pony"],
            prompt="trigger, second",
        )
        save_thumb.assert_called_once()
        thumb_args = save_thumb.call_args.args
        self.assertEqual(thumb_args[:4], ("loras", "Model_Name.safetensors", b"thumb", "global"))
        self.assertEqual(thumb_args[5], "image/jpeg")
        self.assertEqual(thumb_args[4]["origin"], "civitai")
        self.assertEqual(thumb_args[4]["civitai"]["trainedWords"], ["trigger", "second"])

    def test_archive_extraction_skips_unsafe_and_unsupported_members(self) -> None:
        import zipfile

        with TemporaryDirectory() as root:
            root_path = Path(root)
            archive = root_path / "wildcards.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("../escape.txt", "bad")
                output.writestr("nested/good.txt", "ok")
                output.writestr("image.png", "skip")

            extracted = civitai_downloads._extract_archive(archive, root_path / "out")

            self.assertEqual([item.name for item in extracted], ["good.txt"])
            self.assertEqual(extracted[0].read_text(), "ok")
            self.assertFalse((root_path / "escape.txt").exists())

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
