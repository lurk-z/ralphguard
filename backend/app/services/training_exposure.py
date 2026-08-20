"""Read compact model identity indexes for endpoint-specific seen/unseen status."""
from __future__ import annotations

import csv
import gzip
from functools import lru_cache
import hashlib
from pathlib import Path

from app.core.endpoints import ENDPOINT_META
from app.core.config import settings


@lru_cache(maxsize=64)
def _read_index(path_text: str, modified_ns: int) -> tuple[frozenset[str], str]:
    path = Path(path_text)
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        identities = frozenset(
            str(row.get("identity_key") or "")
            for row in csv.DictReader(handle)
            if str(row.get("identity_key") or "")
        )
    return identities, hashlib.sha256(path.read_bytes()).hexdigest()


def _selected_index(endpoint: str) -> tuple[Path | None, str, str]:
    root = Path(settings.MODELS_DIR) / "training_identity_indexes"
    candidates = (
        (("candidate_v3", "candidate"), ("production", "production"), ("candidate_v2", "candidate"))
        if endpoint == "skin_dryness"
        else (("production", "production"), ("candidate_v3", "candidate"), ("candidate_v2", "candidate"))
    )
    for version, status in candidates:
        path = root / version / f"{endpoint}.csv.gz"
        if path.exists():
            return path, version, status
    return None, "unknown", "not_available"


def endpoint_training_exposure(identity_key: str) -> dict[str, dict]:
    key = str(identity_key or "").strip()
    result: dict[str, dict] = {}
    for endpoint in ENDPOINT_META:
        path, version, status = _selected_index(endpoint)
        if path is None:
            result[endpoint] = {
                "seen": False,
                "role": "none",
                "model_version": version,
                "model_status": status,
                "identity_index_hash": None,
            }
            continue
        identities, digest = _read_index(str(path), path.stat().st_mtime_ns)
        seen = bool(key and key in identities)
        result[endpoint] = {
            "seen": seen,
            "role": "training" if seen else "none",
            "model_version": version,
            "model_status": status,
            "identity_index_hash": digest,
        }
    return result

