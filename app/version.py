"""BlomboUI version. From app scripts: `from version import VERSION`."""

import sys
from pathlib import Path

_API = Path(__file__).resolve().parent / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from blombo.paths import VERSION, get_version  # noqa: E402, F401
