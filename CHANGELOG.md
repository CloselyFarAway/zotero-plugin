# Changelog

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
