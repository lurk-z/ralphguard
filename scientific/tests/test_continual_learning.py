import numpy as np

from continual_learning import (
    continual_update_experiment,
    evidence_gate,
    scaffold_stream_split,
    select_replay_indices,
)


def test_unseen_prediction_without_verified_evidence_is_not_trainable():
    decision = evidence_gate(
        {
            "identity_key": "ABC",
            "label": 1,
            "source": "model_prediction",
            "label_source": "ralphguard_prediction",
            "review_status": "pending",
        },
        observed_as_unseen=True,
    )
    assert not decision.eligible


def test_verified_independent_evidence_enters_queue():
    decision = evidence_gate(
        {
            "identity_key": "ABC",
            "label": 1,
            "source": "doi:10.example/test",
            "label_source": "experimental",
            "review_status": "verified",
            "identity_conflict": False,
        },
        observed_as_unseen=True,
    )
    assert decision.eligible


def test_holdout_identity_is_always_blocked():
    decision = evidence_gate(
        {
            "identity_key": "HOLDOUT",
            "label": 0,
            "source": "doi:10.example/test",
            "review_status": "verified",
        },
        observed_as_unseen=True,
        holdout_identity_keys={"HOLDOUT"},
    )
    assert decision.reason == "reserved_holdout_identity"


def test_scaffold_partitions_have_no_group_overlap():
    smiles = ["c1ccccc1", "Cc1ccccc1", "C1CCCCC1", "CC1CCCCC1", "CCO", "CCCO", "CCN", "CCCC"]
    split = scaffold_stream_split(smiles, base_fraction=0.5, stream_fraction=0.25)
    buckets = [{smiles[index] for index in values} for values in split.values()]
    assert sum(len(bucket) for bucket in buckets) == len(smiles)


def test_replay_selection_preserves_both_classes_when_available():
    y = np.asarray([0, 0, 1, 1])
    indices = select_replay_indices(y, ["CC", "CCC", "CO", "CCO"], max_samples=2)
    assert set(y[indices]) == {0, 1}


def test_continual_report_measures_stream_gain_and_holdout_forgetting():
    rng = np.random.default_rng(42)
    X_base = rng.normal(size=(40, 6))
    y_base = np.asarray([0, 1] * 20)
    X_stream = rng.normal(size=(10, 6))
    y_stream = np.asarray([0, 1] * 5)
    X_final = rng.normal(size=(10, 6))
    y_final = np.asarray([0, 1] * 5)
    _model, report = continual_update_experiment(
        X_base,
        y_base,
        X_stream,
        y_stream,
        X_final,
        y_final,
        replay_indices=np.arange(12),
    )
    assert report["final_holdout_used_for_fit"] is False
    assert "forgetting_score" in report["delta"]
    assert set(report["before"]) == {"new_stream", "final_holdout"}
