#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
VERSION = MANIFEST["version"]
OUT = DIST / f"zotero-onedrive-organizer-{VERSION}.xpi"
SHA_OUT = DIST / f"zotero-onedrive-organizer-{VERSION}.xpi.sha256"

# Runtime and bundled documentation. Keep the XPI small; GitHub-only community
# files remain in the source repository.
INCLUDE = [
    "manifest.json",
    "bootstrap.js",
    "prefs.js",
    "organizer.js",
    "content/preferences.xhtml",
    "content/preferences.js",
    "README.md",
    "README.ko.md",
    "TESTING.md",
    "CHANGELOG.md",
    "LICENSE",
]

# Fixed timestamp/mode makes the XPI reproducible across machines and GitHub CI.
ZIP_TIME = (2026, 1, 1, 0, 0, 0)

DIST.mkdir(exist_ok=True)
for path in (OUT, SHA_OUT):
    if path.exists():
        path.unlink()

with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for rel in INCLUDE:
        src = ROOT / rel
        if not src.exists():
            raise SystemExit(f"Missing required file: {rel}")
        info = zipfile.ZipInfo(rel, date_time=ZIP_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        info.create_system = 3
        zf.writestr(info, src.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
SHA_OUT.write_text(f"{digest}  {OUT.name}\n", encoding="utf-8")

print(OUT)
print(SHA_OUT)
print(f"sha256:{digest}")
