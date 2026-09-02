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

    def test_gallery_local_scopes_keep_template_and_search_keys(self) -> None:
        result = settings._clean(
            {
                "galleryScopeMode": {
                    "template-loras": "global",
                    "gallery-search-loras": "global",
                    "gallery-create-loras": "local",
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
                    "gallery-create": {
                        "ids": ["dddddddddddd"],
                        "optionalIds": [],
                        "auto": False,
                        "mode": "likely",
                        "fallback": True,
                    },
                    "template-loras": {
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
                },
            }
        )
        self.assertEqual(result["galleryScopeMode"]["template-loras"], "global")
        self.assertEqual(result["galleryScopeMode"]["gallery-search-loras"], "global")
        self.assertEqual(result["galleryLocalScopes"]["template"]["ids"], ["aaaaaaaaaaaa"])
        self.assertEqual(result["galleryLocalScopes"]["gallery-search"]["ids"], ["bbbbbbbbbbbb"])
        self.assertEqual(result["galleryLocalScopes"]["gallery-search"]["fallback"], False)
        self.assertEqual(result["galleryLocalScopes"]["gallery-create"]["ids"], ["dddddddddddd"])
        self.assertEqual(result["galleryLocalScopes"]["template-loras"]["ids"], ["cccccccccccc"])
        self.assertEqual(result["galleryLocalScopes"]["loras"]["fallback"], True)

    def test_gallery_auto_types_keeps_true_drops_false(self) -> None:
        result = settings._clean({"galleryAutoTypes": {"loras": True, "checkpoints": False, "nope": True}})
        self.assertEqual(result["galleryAutoTypes"], {"loras": True})


if __name__ == "__main__":
    unittest.main()
