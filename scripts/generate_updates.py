#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
plugin_id = manifest["applications"]["zotero"]["id"]
compat = manifest["applications"]["zotero"]
xpi = ROOT / "dist" / f"zotero-onedrive-organizer-{version}.xpi"
if not xpi.exists():
    raise SystemExit("Build the XPI first: python scripts/build.py")

digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
updates = {
    "addons": {
        plugin_id: {
            "updates": [
                {
                    "version": version,
                    "update_link": f"https://github.com/CloselyFarAway/zotero-plugin/releases/download/v{version}/{xpi.name}",
                    "update_hash": f"sha256:{digest}",
                    "applications": {
                        "zotero": {
                            "strict_min_version": compat["strict_min_version"],
                            "strict_max_version": compat["strict_max_version"],
                        }
                    },
                }
            ]
        }
    }
}
(ROOT / "updates.json").write_text(json.dumps(updates, indent=2) + "\n", encoding="utf-8")
print(ROOT / "updates.json")
