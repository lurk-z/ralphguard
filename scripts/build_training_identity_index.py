"""Build compact exact-identity indexes without serving pickle files per request."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import pickle

import pandas as pd
from rdkit import Chem

BASE = Path(__file__).resolve().parents[1]
MODELS = BASE / "scientific" / "models"


def identity(smiles: str) -> tuple[str, str] | None:
    molecule = Chem.MolFromSmiles(str(smiles or ""))
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    try:
        inchi = Chem.MolToInchi(molecule)
        inchikey = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        inchikey = ""
    return inchikey or f"SMILES:{canonical}", canonical


def build(source_dir: Path, version: str, output_root: Path) -> dict:
    version_dir = output_root / version
    version_dir.mkdir(parents=True, exist_ok=True)
    report = {"model_version": version, "source": str(source_dir.relative_to(BASE)), "endpoints": {}}
    for model_path in sorted(source_dir.glob("*_model.pkl")):
        endpoint = model_path.name.removesuffix("_model.pkl")
        with model_path.open("rb") as handle:
            bundle = pickle.load(handle)
        if not isinstance(bundle, dict):
            continue
        canonical = [str(value) for value in bundle.get("train_smiles", [])]
        keys = [str(value) for value in bundle.get("train_identity_keys", [])]
        if len(keys) != len(canonical):
            resolved = [identity(value) for value in canonical]
            keys = [value[0] if value else "" for value in resolved]
        rows = pd.DataFrame({
            "endpoint": endpoint,
            "identity_key": keys,
            "canonical_smiles": canonical,
            "exposure_role": "training",
        })
        rows = rows[rows["identity_key"].astype(str).str.len() > 0].drop_duplicates("identity_key")
        path = version_dir / f"{endpoint}.csv.gz"
        rows.to_csv(path, index=False, compression="gzip")
        report["endpoints"][endpoint] = {
            "count": len(rows),
            "file": str(path.relative_to(MODELS)),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    (version_dir / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=("production", "candidate_v2", "candidate_v3"), default="production")
    args = parser.parse_args()
    source_dir = MODELS if args.source == "production" else MODELS / args.source
    if not source_dir.exists():
        raise FileNotFoundError(source_dir)
    report = build(source_dir, args.source, MODELS / "training_identity_indexes")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

