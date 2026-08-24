"""BlomboUI version. From app scripts: `from version import VERSION`."""

import sys
from pathlib import Path

_BACKEND_SRC = Path(__file__).resolve().parent / "backend" / "src"
if str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

from config import VERSION, get_version  # noqa: E402, F401
