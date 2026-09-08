#!/usr/bin/env python3
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
out = DIST / f"zotero-onedrive-organizer-{version}.xpi"

INCLUDE = [
    "manifest.json",
    "bootstrap.js",
    "prefs.js",
    "organizer.js",
    "content/preferences.xhtml",
    "content/preferences.js",
    "README.md",
    "TESTING.md",
    "CHANGELOG.md",
    "LICENSE",
]

DIST.mkdir(exist_ok=True)
if out.exists():
    out.unlink()

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for rel in INCLUDE:
        src = ROOT / rel
        if not src.exists():
            raise SystemExit(f"Missing required file: {rel}")
        zf.write(src, rel)

print(out)
