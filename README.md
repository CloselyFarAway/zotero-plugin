# Zotero OneDrive Organizer

[![Zotero](https://img.shields.io/badge/Zotero-10.0.x-CC2936)](https://www.zotero.org/)
[![Release](https://img.shields.io/github/v/release/CloselyFarAway/zotero-plugin?display_name=tag)](https://github.com/CloselyFarAway/zotero-plugin/releases/latest)
[![Build](https://github.com/CloselyFarAway/zotero-plugin/actions/workflows/build.yml/badge.svg)](https://github.com/CloselyFarAway/zotero-plugin/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [한국어](README.ko.md)

A Zotero 10 plugin that moves **stored PDF attachments** from **My Library** to OneDrive (or any normal local/synced folder), mirrors your Zotero collection hierarchy, and keeps the PDFs in Zotero as **linked-file attachments**.

> Current version: **v0.1.7**. **v0.1.5 remains withdrawn**; its experimental metadata/rename/delete-sync features are not present. v0.1.7 keeps the stable v0.1.6 collection-assignment retry and hardens the destructive file-move path with no-overwrite copying, SHA-256 verification, whole-path length checks, fatal note-link rollback, and runtime capability checks. Back up important Zotero data before a large first-time migration.

## Download

Download the latest `.xpi` from **[GitHub Releases](https://github.com/CloselyFarAway/zotero-plugin/releases/latest)**.

Zotero installation: **Tools → Plugins → gear/menu → Install Plugin From File…**, then select the `.xpi` file.

## Why this exists

Zotero's metadata sync and file storage are separate. If PDF storage quota is the problem, linked files let Zotero keep the bibliographic database while the physical PDFs live in OneDrive, Dropbox, a NAS, an external SSD, or another local/synced folder.

This plugin automates the tedious part: moving PDFs out of Zotero-managed storage and reconnecting them safely as linked files.

## Quick start

1. Install the `.xpi` and restart Zotero if requested.
2. Open **Settings → OneDrive Organizer**.
3. Click **Browse…** and choose a dedicated folder such as `D:\OneDrive\Zotero_PDF`.
4. Click **Check folder**. v0.1.7 verifies both access **and write permission**.
5. Keep automatic organization **off** for the first test.
6. Select one test paper in Zotero and click **Preview selected path(s)…**. Nothing is moved during preview.
7. If the destination looks correct, click **Organize selected item(s)**.
8. Confirm the PDF still opens normally in Zotero and exists in the expected OneDrive folder.
9. Only after that, enable automatic organization or use **Organize ALL existing PDFs…**.


## Example

Zotero:

```text
My Library
└─ Ferroelectric
   └─ BaTiO3
      └─ Paper item
         └─ Full Text PDF
```

Configured root:

```text
D:\OneDrive\Zotero_PDF
```

Default result:

```text
D:\OneDrive\Zotero_PDF\
└─ My Library\
   └─ Ferroelectric\
      └─ BaTiO3\
         └─ Yeo_2026_Diffusion–Model–Driven Discovery.pdf
```

## Main features

- Zotero **10.0.x** support
- OneDrive or any normal local/synced filesystem folder
- Automatic organization of newly added stored PDFs (opt-in)
- Safe organization of only the currently selected item(s)
- **Destination preview** before moving anything
- Bulk migration with an explicit eligible-file count and confirmation
- Zotero collection/subcollection hierarchy mirroring
- Optional publication-year folder
- Custom filename template
- Windows-safe filenames and collision handling (` (2)`, ` (3)`, …) with no-overwrite copy semantics
- Optional Zotero relative linked-file paths for multi-computer setups
- Folder check that verifies the destination is writable
- SHA-256 source/destination verification before the stored Zotero attachment can be erased
- Conservative whole-path length guard on Windows
- Runtime capability check that blocks file-moving operations if required Zotero/Firefox APIs are unavailable
- Group Library protection: unsupported linked-file attachments are skipped

## Filename template

Default:

```text
{firstCreator}_{year}_{title}
```

Available tokens:

- `{firstCreator}`
- `{year}`
- `{title}`
- `{itemKey}`
- `{attachmentKey}`

The `.pdf` extension is added automatically.

## Automatic collection timing

During a Zotero Connector import, the PDF attachment can appear a moment before Zotero finishes assigning the parent item to the currently selected collection. v0.1.7 retains the v0.1.6 conservative behavior:

1. Automatic organization checks the parent item's collection membership.
2. If no collection is visible yet, the PDF remains in Zotero storage temporarily.
3. The plugin retries collection detection for about 12 seconds and also reacts when the parent item is modified.
4. Only after the retry window expires does a genuinely unfiled item go to the configured `_Unfiled` folder.

Manual **Organize selected item(s)** keeps the immediate behavior and uses the collection membership visible at the time you click the button. Existing OneDrive folders are never used to guess a Zotero collection.

## Multiple collections

A Zotero item can belong to several collections without being duplicated. To avoid duplicating the physical PDF, the plugin stores one copy only:

1. The deepest collection path wins.
2. If several paths have equal depth, the alphabetically first full path wins.

The Zotero item itself remains visible in all of its collections.

## Safety model

For each eligible PDF:

```text
stored Zotero PDF
      ↓
copy to a unique external path with no-overwrite protection
      ↓
verify copied byte size + SHA-256
      ↓
create linked attachment
      ↓
transfer annotations / relations / full-text index / note attachment keys
      ↓
erase old stored attachment as the final database operation
```

If copying, SHA-256 verification, note-link migration, or Zotero database conversion fails, the original stored attachment is retained and the newly copied external file is removed when possible.

Automatic organization is **off by default**. v0.1.7 also performs a startup capability check; if required file/database APIs are missing, automatic organization is not registered for that runtime session and file-moving operations are blocked.

## Important limitations

- **My Library only:** Zotero does not support linked-file attachments in Group Libraries, so Group Library attachments are skipped.
- **Desktop workflow:** linked PDFs are not uploaded by Zotero file sync, so Zotero mobile/web cannot rely on Zotero Storage to retrieve these files.
- **PDFs only:** EPUBs, snapshots, images, and other attachment types are currently skipped.
- **Collection moves after organization:** moving an already-organized item to another Zotero collection does not yet relocate its existing linked PDF automatically.
- **Local filesystem required:** OneDrive must be available as a normal local path. The plugin does not use Microsoft Graph.
- **Do not put `zotero.sqlite` in OneDrive.** Only use the external folder for linked attachment files.

## Multiple computers

Enable **Use Zotero relative linked-file paths when safe** if the same synced folder is mounted at different absolute paths on different computers, for example:

```text
PC 1: D:\OneDrive\Zotero_PDF
PC 2: C:\Users\name\OneDrive\Zotero_PDF
```

The plugin will only set Zotero's linked-attachment base directory when doing so will not overwrite a conflicting existing base directory.

## What happens if I uninstall the plugin?

Already-converted attachments remain normal Zotero linked-file attachments. Uninstalling the plugin stops future automatic organization; it does not move the linked PDFs back into Zotero Storage.

## Privacy and network behavior

- No telemetry or analytics.
- No Microsoft Graph or OneDrive API access.
- PDF movement is performed through the local filesystem.
- Zotero may fetch this repository's `updates.json` to check for plugin updates.

This project is not affiliated with Zotero, the Corporation for Digital Scholarship, or Microsoft.

## Troubleshooting

**Browse works but organization fails**  
Run **Check folder** first. v0.1.7 creates and deletes a tiny temporary file to verify actual write access.

**Nothing happens to a selected attachment**  
The plugin only processes stored PDF attachments in My Library. Already-linked files, non-PDFs, and Group Library attachments are skipped.

**I want to see what will happen before moving files**  
Use **Preview selected path(s)…**. It calculates the planned paths without modifying Zotero or the filesystem.

**I found a bug**  
Use the **Report a bug / request a feature** button in the plugin settings or open a GitHub issue. Include your Zotero version, plugin version, operating system, and reproduction steps.

## Development

No Node/npm build is required.

```bash
python scripts/build.py
python scripts/generate_updates.py
node tests/organizer.test.js
python scripts/check.py
```

Output:

```text
dist/zotero-onedrive-organizer-0.1.7.xpi
dist/zotero-onedrive-organizer-0.1.7.xpi.sha256
```

The public extension ID is permanent:

```text
zotero-onedrive-organizer@closelyfaraway.github.io
```

Do not change it after public distribution.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [TESTING.md](TESTING.md) for development and manual test guidance.

## Roadmap

- [x] Zotero 10 support
- [x] OneDrive / external folder support
- [x] Collection hierarchy mirroring
- [x] Safe stored → linked conversion
- [x] Selected-item migration
- [x] Destination preview
- [x] Writable-folder validation
- [x] No-overwrite collision protection
- [x] SHA-256 copy verification
- [x] Windows whole-path length guard
- [x] Regression-test harness
- [ ] Relocate existing linked files when collection paths change
- [ ] Restore linked PDFs back into Zotero-managed storage
- [ ] Support additional attachment types
- [ ] More filename-template fields
- [ ] Broader Windows/macOS/Linux testing

## License

MIT — see [LICENSE](LICENSE).
