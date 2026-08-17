from scripts.training_visualization import export_predictions


def test_export_predictions_removes_stale_csv_when_stage_is_not_run(tmp_path):
    output = tmp_path / "nested_predictions.csv"
    output.write_text("stale,data\n", encoding="utf-8")

    export_predictions(None, output)

    assert not output.exists()
