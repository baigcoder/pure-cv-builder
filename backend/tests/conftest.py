import os
import sys
import tempfile
from pathlib import Path

import pytest

# Settings are read once at import time, so configure the test environment
# before any app module is imported.
_TEST_DB = Path(tempfile.mkdtemp(prefix="applyforge-tests-")) / "test.db"
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"
os.environ["SUPABASE_URL"] = "http://supabase.test"
os.environ["SUPABASE_JWT_SECRET"] = "test-jwt-secret-with-at-least-32-bytes!"
# Never call a real AI provider from tests, even when backend/.env has a key.
# An empty value also stops load_dotenv from filling it in.
os.environ["GROQ_API_KEY"] = ""

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(scope="session", autouse=True)
def _migrated_database():
    from db.migrate import upgrade_to_head
    from db.session import engine

    upgrade_to_head(engine)
    yield
    engine.dispose()
