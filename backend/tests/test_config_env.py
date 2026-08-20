from importlib import reload
from pathlib import Path


def test_settings_loads_environment_when_run_from_backend_dir(monkeypatch):
    backend_dir = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(backend_dir)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-120b")

    import app.core.config as config

    reload(config)

    assert config.settings.GROQ_API_KEY == "test-key"
    assert config.settings.GROQ_MODEL == "openai/gpt-oss-120b"
