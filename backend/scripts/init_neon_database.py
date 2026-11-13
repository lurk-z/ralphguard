"""Run migrations and seed a Neon database using the direct connection."""

import argparse
import os
from pathlib import Path
import subprocess
import sys

from dotenv import dotenv_values
from sqlalchemy.engine import make_url


def main() -> int:
    backend_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=backend_dir.parent / ".env.local")
    args = parser.parse_args()
    direct_url = os.environ.get("DATABASE_URL_UNPOOLED")
    if not direct_url and args.env_file.is_file():
        direct_url = dotenv_values(args.env_file, interpolate=False).get("DATABASE_URL_UNPOOLED")
    if not direct_url:
        parser.error("Set DATABASE_URL_UNPOOLED or pull it into the selected env file.")
    try:
        url = make_url(direct_url)
        host = url.host or ""
        valid = (
            url.get_backend_name() == "postgresql"
            and host.endswith(".neon.tech")
            and "-pooler." not in host
            and url.query.get("sslmode") in {"require", "verify-ca", "verify-full"}
        )
    except (ValueError, TypeError):
        valid = False
    except Exception:
        valid = False  # Never print a parser error that may contain credentials.
    if not valid:
        parser.error("DATABASE_URL_UNPOOLED must be a direct Neon PostgreSQL URL with SSL enabled.")

    env = {**os.environ, "DATABASE_URL": direct_url}
    steps = (
        ("Alembic migrations", [sys.executable, "-m", "alembic", "upgrade", "head"]),
        ("Herbal catalogue seed", [sys.executable, "scripts/seed_thai_herbs.py"]),
    )
    for label, command in steps:
        result = subprocess.run(command, cwd=backend_dir, env=env, capture_output=True, text=True, errors="replace")
        if result.returncode:
            from urllib.parse import quote

            diagnostic = (result.stderr or result.stdout).replace(direct_url, "[redacted database URL]")
            if url.password:
                diagnostic = diagnostic.replace(url.password, "[redacted]")
                diagnostic = diagnostic.replace(quote(url.password, safe=""), "[redacted]")
            print(f"{label} failed:\n{diagnostic}", file=sys.stderr)
            return result.returncode
        print(f"{label}: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
