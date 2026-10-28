"""Write the API's OpenAPI schema to the frontend so TypeScript types can be generated.

Usage (from backend/):
    python scripts/export_openapi.py            # write ../frontend/src/lib/api/openapi.json
    python scripts/export_openapi.py --check    # exit 1 if the committed file is stale
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

DEFAULT_OUTPUT = BACKEND_DIR.parent / "frontend" / "src" / "lib" / "api" / "openapi.json"


def build_schema() -> str:
    from main import app

    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="Fail if the output file is out of date.")
    args = parser.parse_args()

    schema = build_schema()
    if args.check:
        current = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if current != schema:
            print(f"{args.output} is stale. Run: python scripts/export_openapi.py && npm run gen:api")
            return 1
        print("OpenAPI schema is up to date.")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(schema, encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
