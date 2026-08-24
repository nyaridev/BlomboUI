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


if __name__ == "__main__":
    unittest.main()
