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


if __name__ == "__main__":
    unittest.main()
