"""Lazy, process-local QSAR runtime for the free single-service deployment."""
from __future__ import annotations

import sys
import threading
from pathlib import Path
from typing import Any

from app.core.config import settings


_lock = threading.RLock()
_predictor: Any = None
_run_pipeline: Any = None


def _load_runtime() -> tuple[Any, Any]:
    global _predictor, _run_pipeline
    if _predictor is not None and _run_pipeline is not None:
        return _predictor, _run_pipeline

    runtime_dir = Path(settings.SCIENTIFIC_RUNTIME_DIR)
    if not runtime_dir.is_dir():
        raise RuntimeError(f"scientific runtime not found: {runtime_dir}")
    runtime_path = str(runtime_dir)
    if runtime_path not in sys.path:
        sys.path.insert(0, runtime_path)

    from pipeline import run_pipeline
    from qsar.predictor import Predictor

    predictor = Predictor(settings.MODELS_DIR)
    required = {"skin", "eye", "sens", "acute", "skin_dryness"}
    missing = sorted(required.difference(predictor.loaded_endpoints))
    if missing:
        raise RuntimeError(f"QSAR models are incomplete: missing={missing}")

    _predictor = predictor
    _run_pipeline = run_pipeline
    return _predictor, _run_pipeline


def run_assessment(formula: list[dict], region: str) -> dict:
    """Serialize prediction calls because the free service has one small instance."""
    with _lock:
        predictor, run_pipeline = _load_runtime()
        return run_pipeline(predictor, formula, region)
