# Changelog

## 0.1.5 - 2026-09-08

- Add metadata-aware automatic organization: stored PDFs without a usable bibliographic parent are left in Zotero storage and retried instead of being committed with publisher/server filenames.
- Add a conservative machine-filename heuristic for names such as `cm5c00977_1.9`, numeric IDs, and generic `download.pdf` / `article.pdf` names.
- Reschedule stored child PDFs when their parent bibliographic item is added or modified, so late-arriving metadata can trigger organization.
- Add **Rename selected linked PDF(s)…** to repair existing filenames from Zotero metadata without moving collection folders.
- Rename linked files with filesystem-size verification and rollback if the Zotero path update fails.
- Add optional **Delete external PDF when it is permanently deleted from Zotero** behavior.
- Keep permanent-delete cleanup **OFF by default** and never delete external files when items are merely moved to Zotero Trash.
- Restrict external deletion to linked PDFs inside the currently configured root folder.
- Build an in-memory index of existing linked PDFs under the configured root, including items already in Zotero Trash, so v0.1.3/v0.1.4-organized files can participate after the user explicitly enables cleanup.
- Preserve upgrade compatibility: updating to v0.1.5 does not automatically move, rename, or delete existing linked PDFs.
- Update English/Korean documentation and manual test coverage for metadata naming, rename repair, and permanent deletion.

## 0.1.4 - 2026-09-08

- Add **Preview selected path(s)…** so users can inspect planned destinations without moving files.
- Make **Check folder** verify actual write/delete permission with a temporary test file.
- Make automatic-processing fallback explicitly **off** if the preference cannot be read.
- Add current plugin version, project-page link, and issue-report link to Settings.
- Rewrite the public README with download, quick-start, FAQ, privacy, troubleshooting, roadmap, and uninstall behavior.
- Add Korean documentation (`README.ko.md`) and clearer first-run guidance.
- Add `CONTRIBUTING.md`, bug/feature issue forms, and a pull-request safety checklist.
- Make XPI builds reproducible and generate SHA-256 checksum files.
- Add `scripts/check.py` and update GitHub Actions to validate manifests, update metadata, package structure, and JavaScript syntax.

## 0.1.3

- Fix Zotero 10 preference-pane initialization.
- Replace inline `onload`/`oncommand` handlers with explicit event listeners.
- Add native `preference=` bindings for all settings.
- Fix Browse folder picker parent window/path handling.
- Ensure typed base directory is saved before validation or organization.

## 0.1.2

- Fix installation rejection on Zotero 10 stable by adding `applications.zotero.update_url` to `manifest.json`.
- Add `updates.json` for GitHub-hosted update metadata.
- Keep Zotero 10 compatibility at `10.0.*`.

## 0.1.1 - 2026-09-08

- Set permanent plugin ID: `zotero-onedrive-organizer@closelyfaraway.github.io`.
- Add GitHub homepage and author metadata.
- Change fresh-install automatic organization default to **off**.
- Add **Check folder** validation.
- Add **Organize selected item(s)**.
- Add bulk-migration confirmation with eligible PDF count.

## 0.1.0

- Initial experimental Zotero 10 implementation.
