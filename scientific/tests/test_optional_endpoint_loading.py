import joblib

from qsar.predictor import Predictor


def test_four_endpoint_bundle_remains_ready_when_dryness_candidate_is_missing():
    predictor = Predictor.__new__(Predictor)
    predictor._models = {endpoint: object() for endpoint in ("skin", "eye", "sens", "acute")}

    assert predictor.is_ready()
    assert predictor.missing_endpoints == ["skin_dryness"]


def test_fifth_endpoint_is_reported_loaded_when_candidate_artifact_exists():
    predictor = Predictor.__new__(Predictor)
    predictor._models = {
        endpoint: object()
        for endpoint in ("skin", "eye", "sens", "acute", "skin_dryness")
    }

    assert predictor.is_ready()
    assert predictor.missing_endpoints == []


def test_research_candidate_is_hot_loaded_without_copying_to_production(tmp_path):
    candidate = tmp_path / "candidate_v3" / "skin_dryness_model.pkl"
    candidate.parent.mkdir()
    joblib.dump(
        {
            "format": "ensemble_v2_candidate",
            "candidate_version": "candidate_v3",
            "research_preview": True,
            "members": [],
            "feature_mode": "morgan",
            "threshold": 0.5,
        },
        candidate,
    )
    predictor = Predictor.__new__(Predictor)
    predictor.models_dir = tmp_path
    predictor._models = {}

    predictor._maybe_load_optional_candidates()

    assert predictor.loaded_endpoints == ["skin_dryness"]
    assert not (tmp_path / "skin_dryness_model.pkl").exists()


def test_updated_research_candidate_is_reloaded(tmp_path):
    candidate = tmp_path / "candidate_v3" / "skin_dryness_model.pkl"
    candidate.parent.mkdir()

    def write(version, threshold):
        joblib.dump(
            {
                "format": "ensemble_v2_candidate",
                "candidate_version": version,
                "research_preview": True,
                "members": [],
                "feature_mode": "descr",
                "threshold": threshold,
            },
            candidate,
        )

    write("candidate_v3-a", 0.3)
    predictor = Predictor.__new__(Predictor)
    predictor.models_dir = tmp_path
    predictor._models = {}
    predictor._optional_candidate_signatures = {}
    predictor._maybe_load_optional_candidates()
    assert predictor._models["skin_dryness"].model_version == "candidate_v3-a"

    write("candidate_v3-b-retrained", 0.6)
    predictor._maybe_load_optional_candidates()
    assert predictor._models["skin_dryness"].model_version == "candidate_v3-b-retrained"
    assert predictor._models["skin_dryness"].threshold == 0.6


def test_optional_candidate_never_replaces_production_model(tmp_path):
    candidate = tmp_path / "candidate_v3" / "skin_dryness_model.pkl"
    candidate.parent.mkdir()
    joblib.dump(
        {
            "format": "ensemble_v2_candidate",
            "candidate_version": "candidate_v3",
            "research_preview": True,
            "members": [],
            "feature_mode": "descr",
            "threshold": 0.3,
        },
        candidate,
    )
    production = object()
    predictor = Predictor.__new__(Predictor)
    predictor.models_dir = tmp_path
    predictor._models = {"skin_dryness": production}
    predictor._optional_candidate_signatures = {}

    predictor._maybe_load_optional_candidates()

    assert predictor._models["skin_dryness"] is production
