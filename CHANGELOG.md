# Changelog

## 0.1.7 - 2026-09-10

- Harden the stable v0.1.6 file-move pipeline without reintroducing the withdrawn v0.1.5 metadata/rename/delete-sync experiments.
- Copy with `IOUtils.copy(..., { noOverwrite: true })` and retry numbered suffixes on collisions, closing the exists-then-copy overwrite race.
- Verify both byte size and SHA-256 of source/destination before converting the Zotero attachment or erasing the stored original.
- Add a conservative whole-path length guard (240 characters on Windows) that truncates only the generated filename and never silently changes the collection hierarchy.
- Treat Zotero note attachment-key migration failure as transaction-fatal so the original stored attachment remains intact.
- Add startup capability detection for required Zotero/Firefox APIs; incompatible runtimes do not register automatic organization and destructive operations are blocked.
- Keep `strict_max_version` at Zotero's recommended `10.0.*`, keep relative linked-file paths opt-in, and retain the v0.1.6 collection-assignment retry behavior.
- Add Node regression tests for no-overwrite collision handling, path-length fitting, SHA-256 verification, capability detection, and note-link failure rollback.

## 0.1.6 - 2026-09-08

- Rebase the release on the stable v0.1.4 feature set.
- Remove the experimental v0.1.5 metadata-wait, linked-file rename, and permanent-delete synchronization features after regressions were found in real Zotero 10.0.4 use.
- Fix automatic-import collection timing: if a regular parent item temporarily has no collection, leave the stored PDF untouched and retry instead of immediately creating `_Unfiled`.
- Retry collection detection up to 8 times at 1.5-second intervals (about 12 seconds total) before treating an item as genuinely unfiled.
- Reschedule stored PDF children when a bibliographic parent item is modified, so collection assignment is detected sooner.
- Keep manual organization, preview, existing linked files, folder layout, filename template, and v0.1.4 safety model unchanged.
- Synchronize manifest, settings UI, documentation, build metadata, and release metadata at v0.1.6.

## 0.1.5 - withdrawn

- Experimental metadata waiting, linked-file renaming, and external-file deletion synchronization were tested and found to regress automatic collection handling and deletion behavior.
- Do not use this version. v0.1.6 intentionally removes these experiments.

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
- Update `updates.json` to publish a SHA-256-verified v0.1.4 update.

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
- Added GitHub homepage and author metadata.
- Changed fresh-install automatic organization default to **off** for safer testing.
- Added **Check folder** validation in the settings pane.
- Added **Organize selected item(s)** for single-item testing without bulk migration.
- Added an explicit confirmation showing the eligible PDF count before bulk migration.
- Clarified README wording to match the actual stored-attachment → linked-attachment replacement model.
- Added a Zotero 10.0.4 manual test checklist.
- Updated MIT copyright holder to `CloselyFarAway`.

## 0.1.0

- Initial experimental Zotero 10 implementation.
