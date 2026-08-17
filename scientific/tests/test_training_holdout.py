"""Regression tests for exact-identity external holdout quarantine."""
import pandas as pd

import data_prep as training
from scripts import check_training_integrity as audit
from scripts import train_candidate_v2 as trainer


def test_external_holdout_identity_policy_matches_auditor_and_trainer(tmp_path, monkeypatch):
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    (external_dir / "skin.csv").write_text(
        "smiles,label\nCCO,0\ninvalid,1\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(audit, "EXTERNAL_DIR", external_dir)
    monkeypatch.setattr(trainer, "EXTERNAL_DIR", external_dir)

    expected = {"LFQSCWFLJHTTHZ-UHFFFAOYSA-N"}
    assert audit.external_holdout_identity_keys("skin") == expected
    assert trainer.external_holdout_identity_keys("skin") == expected


def test_missing_external_holdout_returns_empty_identity_set(tmp_path, monkeypatch):
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    monkeypatch.setattr(audit, "EXTERNAL_DIR", external_dir)
    monkeypatch.setattr(audit, "BASE", tmp_path)
    monkeypatch.setattr(trainer, "EXTERNAL_DIR", external_dir)
    monkeypatch.setattr(trainer, "BASE", tmp_path)

    assert audit.external_holdout_identity_keys("eye") == set()
    assert trainer.external_holdout_identity_keys("eye") == set()


def test_successful_training_cleanup_removes_stale_blocker_markers(tmp_path):
    for filename in trainer.BLOCKER_FILENAMES:
        (tmp_path / filename).write_text("stale", encoding="utf-8")

    trainer.clear_stale_blocker_markers(tmp_path)

    assert all(not (tmp_path / filename).exists() for filename in trainer.BLOCKER_FILENAMES)


def test_higher_quality_base_label_overrides_pubchem_weak_conflict(tmp_path, monkeypatch):
    raw_dir = tmp_path / "data" / "raw"
    curated_dir = tmp_path / "data" / "curated"
    external_dir = tmp_path / "data" / "external"
    raw_dir.mkdir(parents=True)
    curated_dir.mkdir(parents=True)
    external_dir.mkdir(parents=True)
    base_path = raw_dir / "skin_irritation.csv"
    pubchem_path = curated_dir / "pubchem_verified_skin.csv"
    pd.DataFrame(
        [{"smiles": "CCO", "label": 0, "sample_weight": 1.0}]
    ).to_csv(base_path, index=False)
    pd.DataFrame(
        [{
            "smiles": "CCO",
            "label": 1,
            "source": "PubChem PUG-View",
            "evidence_ids": "[1]",
            "sample_weight": 0.25,
        }]
    ).to_csv(pubchem_path, index=False)

    monkeypatch.setattr(trainer, "BASE", tmp_path)
    monkeypatch.setattr(trainer, "CURATED_DIR", curated_dir)
    monkeypatch.setattr(trainer, "EXTERNAL_DIR", external_dir)
    monkeypatch.setitem(training.DATASETS, "skin", base_path)
    monkeypatch.setitem(training.CURATED_PUBCHEM_DATASETS, "skin", pubchem_path)

    _X, _fps, y, _smiles, _weights, _keys, origins, stats = (
        trainer.load_candidate_endpoint("skin", training.FEATURE_MODE["skin"])
    )

    assert y.tolist() == [0]
    assert origins == ["base"]
    assert stats["conflicting_identity_count"] == 0
    assert stats["lower_tier_conflicts_resolved_by_evidence_priority"] == 1
