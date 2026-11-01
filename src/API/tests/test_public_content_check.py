from pathlib import Path
import runpy


CHECK = runpy.run_path(str(Path(__file__).resolve().parents[3] / "scripts" / "check-public-content.py"))


def test_private_file_paths_are_blocked_and_examples_allowed():
    forbidden = CHECK["forbidden_path"]
    for path in (".env.local", "src/API/.env", ".local-data/finance.json", ".aws/credentials", "private.key", ".local-dev-processes.json"):
        assert forbidden(path)
    for path in (".env.local.example", "src/API/.env.example", "src/API/app/main.py"):
        assert not forbidden(path)


def test_recognizable_secrets_and_personal_emails_are_reported_without_values():
    cases = [
        (b"ghp_" + b"A" * 40, "github-token"),
        (b"AccountKey=" + b"A" * 64, "azure-account-key"),
        (b"sk-proj-" + b"A" * 48, "openai-key"),
        (b"-----BEGIN " + b"PRIVATE KEY-----", "private-key"),
        (b"sample@" + b"gmail.com", "personal-email"),
    ]
    for content, rule in cases:
        assert CHECK["matches"](content, personal_email=True) == [(1, rule)]
    assert CHECK["matches"](b"user@example.test", personal_email=True) == []
