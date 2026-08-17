import numpy as np

import data_prep as training


def test_effective_weights_balance_evidence_weight_totals() -> None:
    y = np.asarray([0, 0, 1, 1, 1, 1])
    evidence = np.asarray([1.0, 0.7, 1.0, 0.25, 0.25, 0.25])

    effective = training.effective_sample_weights(y, evidence)

    assert np.isclose(effective[y == 0].sum(), effective[y == 1].sum())
    assert np.isclose(effective.mean(), 1.0)
    assert effective[2] / effective[3] == 4.0


def test_effective_weights_reject_one_class() -> None:
    try:
        training.effective_sample_weights(np.asarray([1, 1]), np.ones(2))
    except ValueError as exc:
        assert "both labels" in str(exc)
    else:
        raise AssertionError("one-class input must be rejected")
