import os
import sys
from pathlib import Path

# Settings are read once at import time, so configure the test environment
# before any app module is imported.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
