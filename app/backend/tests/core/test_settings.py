import unittest

from features.settings import service as settings


class SettingsTests(unittest.TestCase):
    def test_civitai_auto_retry_cleans_enabled_and_count(self) -> None:
        result = settings._clean({"civitaiAutoRetry": False, "civitaiAutoRetryCount": 999})

        self.assertFalse(result["civitaiAutoRetry"])
        self.assertEqual(result["civitaiAutoRetryCount"], 100)

    def test_civitai_download_cleans_aliases_and_defaults(self) -> None:
        result = settings._clean(
            {
                "civitaiDownload": {
                    "modelDirId": "missing",
                    "wildcardDirId": "local",
                    "modelNaming": "custom",
                    "wildcardUnpack": False,
                    "updateModelInfo": False,
                    "refreshModelsAfterDownload": False,
                    "authorAliases": {
                        "THEANTLERS": "ta",
                        "Other": "ta",
                        "Bad": "not/a-name",
                    },
                }
            }
        )

        self.assertEqual(result["civitaiDownload"]["modelDirId"], "missing")
        self.assertEqual(result["civitaiDownload"]["modelNaming"], "custom")
        self.assertFalse(result["civitaiDownload"]["wildcardUnpack"])
        self.assertFalse(result["civitaiDownload"]["updateModelInfo"])
        self.assertEqual(result["civitaiDownload"]["authorAliases"], {"THEANTLERS": "ta"})

    def test_model_dirs_drop_comfyui(self) -> None:
        result = settings._clean(
            {
                "modelDirs": [
                    {"id": "local", "name": "Local", "path": ""},
                    {"id": "comfyui", "name": "ComfyUI", "path": ""},
                    {"id": "extra", "name": "Extra", "path": "D:/models"},
                ],
                "managerDownloadDirId": "comfyui",
                "civitaiDownload": {"modelDirId": "comfyui", "wildcardDirId": "local"},
            }
        )

        self.assertEqual([item["id"] for item in result["modelDirs"]], ["local", "extra"])
        self.assertNotIn("managerDownloadDirId", result)
        self.assertEqual(result["civitaiDownload"]["wildcardDirId"], "local")
        self.assertNotIn("modelDirId", result["civitaiDownload"])

    def test_civitai_marks_keeps_text_and_forces_ink(self) -> None:
        result = settings._clean(
            {
                "civitaiMarks": {
                    "Illustrious": {"text": "ILL", "icon": {"kind": "icon", "id": "star", "color": "red"}},
                    " ": {"text": "x"},
                    "Nope": "bad",
                }
            }
        )
        self.assertEqual(
            result["civitaiMarks"],
            {"Illustrious": {"text": "ILL", "icon": {"kind": "icon", "id": "star", "color": "ink"}}},
        )

    def test_lookup_kinds_maps_library_types_to_groups(self) -> None:
        result = settings._clean(
            {"lookupKinds": ["vae", "text_encoders", "diffusion_models", "controlnet", "bogus", "vae"]}
        )
        self.assertEqual(result["lookupKinds"], ["other", "checkpoints"])

    def test_lookup_kinds_keeps_group_ids(self) -> None:
        result = settings._clean({"lookupKinds": ["loras", "other", "checkpoints"]})
        self.assertEqual(result["lookupKinds"], ["loras", "other", "checkpoints"])

    def test_gallery_packs_keep_type_keys_drop_surface_keys(self) -> None:
        result = settings._clean(
            {
                "galleryScopeMode": {
                    "template-loras": "global",
                    "gallery-search-loras": "global",
                },
                "galleryLocalScopes": {
                    "template": {
                        "ids": ["aaaaaaaaaaaa"],
                        "optionalIds": [],
                        "auto": False,
                        "mode": "likely",
                        "fallback": True,
                    },
                    "gallery-search": {
                        "ids": ["bbbbbbbbbbbb"],
                        "optionalIds": [],
                        "auto": False,
                        "mode": "exact",
                        "fallback": False,
                    },
                    "models-loras": {
                        "ids": ["cccccccccccc"],
                        "optionalIds": [],
                        "auto": False,
                        "mode": "likely",
                        "fallback": True,
                    },
                    "loras": {
                        "ids": ["eeeeeeeeeeee"],
                        "optionalIds": [],
                        "auto": False,
                        "mode": "likely",
                    },
                    "vae": {
                        "ids": ["ffffffffffff"],
                        "optionalIds": [],
                        "auto": True,
                        "mode": "exact",
                        "fallback": False,
                    },
                    "models-all": {
                        "ids": ["111111111111"],
                        "optionalIds": [],
                        "auto": False,
                        "mode": "likely",
                        "fallback": True,
                    },
                },
                "galleryQuery": {"loras": "cat", "models-loras": "old", "template": "nope"},
                "galleryTypes": {"loras": ["Pony"], "models-loras": ["SDXL"]},
            }
        )
        self.assertNotIn("galleryScopeMode", result)
        self.assertNotIn("template", result["galleryLocalScopes"])
        self.assertNotIn("gallery-search", result["galleryLocalScopes"])
        self.assertNotIn("models-loras", result["galleryLocalScopes"])
        self.assertEqual(result["galleryLocalScopes"]["loras"]["ids"], ["eeeeeeeeeeee"])
        self.assertEqual(result["galleryLocalScopes"]["loras"]["fallback"], True)
        self.assertEqual(result["galleryLocalScopes"]["vae"]["ids"], ["ffffffffffff"])
        self.assertEqual(result["galleryLocalScopes"]["vae"]["auto"], True)
        self.assertEqual(result["galleryLocalScopes"]["models-all"]["ids"], ["111111111111"])
        self.assertEqual(result["galleryQuery"], {"loras": "cat"})
        self.assertEqual(result["galleryTypes"], {"loras": ["Pony"]})

    def test_gallery_auto_types_keeps_true_drops_false(self) -> None:
        result = settings._clean({"galleryAutoTypes": {"loras": True, "checkpoints": False, "nope": True}})
        self.assertEqual(result["galleryAutoTypes"], {"loras": True})

    def test_gallery_page_sizes_clamp(self) -> None:
        result = settings._clean({"galleryPageSize": 9999, "galleryCardPageSize": 5})
        self.assertEqual(result["galleryPageSize"], 500)
        self.assertEqual(result["galleryCardPageSize"], 20)
        result = settings._clean({"galleryPageSize": 200, "galleryCardPageSize": 80})
        self.assertEqual(result["galleryPageSize"], 200)
        self.assertEqual(result["galleryCardPageSize"], 80)


if __name__ == "__main__":
    unittest.main()
