# Contributing

Thanks for helping improve Zotero OneDrive Organizer.

## Before opening an issue

1. Confirm you are using a supported Zotero 10.0.x version.
2. Confirm the problem also occurs with the latest plugin release.
3. Use an empty test folder and a disposable Zotero item when reproducing file-moving bugs.
4. Run **Check folder** and **Preview selected path(s)…** before testing an actual move.

## Bug reports

Please include:

- Zotero version
- Plugin version
- Operating system
- Whether the destination is OneDrive, Dropbox, NAS, or another filesystem
- Exact reproduction steps
- Expected behavior
- Actual behavior
- Relevant Zotero Debug Output or error text

Do not post private paper contents, account credentials, OneDrive tokens, or personally sensitive paths unless they are necessary and redacted appropriately.

## Pull requests

Keep changes focused and preserve the safety ordering for stored → linked conversion:

1. Copy external file
2. Verify copy
3. Create/prepare linked attachment
4. Transfer Zotero metadata/children/index state
5. Delete the old stored attachment last

Run:

```bash
python scripts/build.py
node tests/organizer.test.js
python scripts/check.py
```

Then follow [TESTING.md](TESTING.md) for manual Zotero testing.

## Versioning

The permanent plugin ID is:

```text
zotero-onedrive-organizer@closelyfaraway.github.io
```

Do not change it. Release tags should match `manifest.json`, e.g. manifest `0.1.7` → tag `v0.1.7`.
