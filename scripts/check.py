#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
errors = []

def fail(msg):
    errors.append(msg)

try:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
except Exception as e:
    raise SystemExit(f"Invalid manifest.json: {e}")

version = manifest.get("version")
zotero = manifest.get("applications", {}).get("zotero", {})
plugin_id = zotero.get("id")
if plugin_id != "zotero-onedrive-organizer@closelyfaraway.github.io":
    fail(f"Unexpected permanent plugin ID: {plugin_id}")
if zotero.get("strict_min_version") != "10.0":
    fail("strict_min_version must be 10.0")
if zotero.get("strict_max_version") != "10.0.*":
    fail("strict_max_version must be 10.0.*")
if not zotero.get("update_url", "").endswith("/updates.json"):
    fail("update_url is missing or unexpected")

required_source = [
    "bootstrap.js", "prefs.js", "organizer.js",
    "content/preferences.xhtml", "content/preferences.js",
    "README.md", "README.ko.md", "CHANGELOG.md", "TESTING.md", "LICENSE",
    "tests/organizer.test.js",
]
for rel in required_source:
    if not (ROOT / rel).exists():
        fail(f"Missing source file: {rel}")

xpi = ROOT / "dist" / f"zotero-onedrive-organizer-{version}.xpi"
if not xpi.exists():
    fail(f"Missing build artifact: {xpi.name} (run python scripts/build.py)")
else:
    with zipfile.ZipFile(xpi) as zf:
        names = set(zf.namelist())
        for rel in ["manifest.json", "bootstrap.js", "prefs.js", "organizer.js", "content/preferences.xhtml", "content/preferences.js"]:
            if rel not in names:
                fail(f"XPI missing runtime file: {rel}")
        if any(name.startswith("dist/") for name in names):
            fail("XPI unexpectedly contains dist/")

updates_path = ROOT / "updates.json"
if not updates_path.exists():
    fail("Missing updates.json")
elif xpi.exists():
    try:
        updates = json.loads(updates_path.read_text(encoding="utf-8"))
        latest = updates["addons"][plugin_id]["updates"][0]
        if latest.get("version") != version:
            fail(f"updates.json version {latest.get('version')} != manifest {version}")
        expected_name = f"zotero-onedrive-organizer-{version}.xpi"
        if not latest.get("update_link", "").endswith(f"/v{version}/{expected_name}"):
            fail("updates.json update_link does not match current release")
        digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
        if latest.get("update_hash") != f"sha256:{digest}":
            fail("updates.json update_hash does not match built XPI")
        app = latest.get("applications", {}).get("zotero", {})
        if app.get("strict_min_version") != zotero.get("strict_min_version") or app.get("strict_max_version") != zotero.get("strict_max_version"):
            fail("updates.json Zotero compatibility differs from manifest.json")
    except Exception as e:
        fail(f"Invalid updates.json: {e}")

if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    raise SystemExit(1)

print(f"OK: Zotero OneDrive Organizer v{version}")
