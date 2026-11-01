"""Check publishable files for recognizable credentials and personal email.

Uses only Git and the standard library. Diagnostics never include matched values.
This is a focused guard, not a guarantee that arbitrary secrets can be recognized.
Ignored configuration/data is not read. --history checks reachable Git blobs for
credential signatures; it never rewrites history or contacts external services.
"""
from pathlib import Path
import argparse
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
CREDENTIAL_RULES = {
    "private-key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github-token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,})"),
    "azure-account-key": re.compile(rb"AccountKey=[A-Za-z0-9+/]{40,}={0,2}"),
    "openai-key": re.compile(rb"\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}"),
}
PERSONAL_EMAIL = re.compile(rb"[A-Za-z0-9._%+-]+@(?:gmail\.com|outlook\.com|hotmail\.com|yahoo\.com)", re.I)


def git(*args, input=None):
    return subprocess.run(["git", *args], cwd=ROOT, input=input, capture_output=True, check=True).stdout


def forbidden_path(path: str) -> bool:
    parts = Path(path).parts
    name = Path(path).name
    example = name.endswith(".example")
    return (any(part in {".local-data", ".aws", ".venv", "node_modules"} for part in parts)
            or name == ".local-dev-processes.json"
            or (name.startswith(".env") and not example)
            or Path(path).suffix.lower() in {".key", ".pfx", ".p12"})


def matches(content: bytes, *, personal_email: bool):
    rules = {**CREDENTIAL_RULES, **({"personal-email": PERSONAL_EMAIL} if personal_email else {})}
    return [(number, name) for number, line in enumerate(content.splitlines(), 1)
            for name, rule in rules.items() if rule.search(line)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    findings = []
    paths = {entry.decode("utf-8") for entry in git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split(b"\0") if entry}
    for path in sorted(paths):
        if forbidden_path(path):
            findings.append(f"{path}: sensitive local file must not be published")
            continue
        absolute = ROOT / path
        if absolute.is_symlink():
            continue
        if absolute.is_file():
            for number, rule in matches(absolute.read_bytes(), personal_email=True):
                findings.append(f"{path}:{number}: {rule} (value redacted)")
    history_count = 0
    if args.history:
        entries = git("rev-list", "--objects", "--all").splitlines()
        ids = [entry.split(b" ", 1)[0] for entry in entries]
        types = git("cat-file", "--batch-check=%(objecttype)", input=b"\n".join(ids) + b"\n").splitlines()
        for entry, kind in zip(entries, types):
            if kind != b"blob":
                continue
            oid, _, raw_path = entry.partition(b" ")
            history_count += 1
            content = git("cat-file", "blob", oid.decode("ascii"))
            for number, rule in matches(content, personal_email=False):
                findings.append(f"history {oid[:8].decode('ascii')} {raw_path.decode('utf-8', errors='replace')}:{number}: {rule} (value redacted)")
    for finding in findings:
        print(finding)
    print(f"Checked {len(paths)} publishable paths and {history_count} history blobs; {len(findings)} findings.")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
