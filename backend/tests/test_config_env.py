from importlib import reload
from pathlib import Path


def test_settings_loads_repo_root_env_when_run_from_backend_dir(monkeypatch):
    repo_root = Path(__file__).resolve().parents[2]
    backend_dir = repo_root / "backend"
    monkeypatch.chdir(backend_dir)

    import app.core.config as config

    reload(config)

    assert config.settings.GROQ_API_KEY
    assert config.settings.GROQ_MODEL == "llama-3.3-70b-versatile"
