# Zotero OneDrive Organizer

[![Zotero](https://img.shields.io/badge/Zotero-10.0.x-CC2936)](https://www.zotero.org/)
[![Release](https://img.shields.io/github/v/release/CloselyFarAway/zotero-plugin?display_name=tag)](https://github.com/CloselyFarAway/zotero-plugin/releases/latest)
[![Build](https://github.com/CloselyFarAway/zotero-plugin/actions/workflows/build.yml/badge.svg)](https://github.com/CloselyFarAway/zotero-plugin/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [한국어](README.ko.md)

A Zotero 10 plugin that moves **stored PDF attachments** from **My Library** to OneDrive (or another normal local/synced folder), mirrors Zotero collection paths, and keeps the PDFs usable in Zotero as **linked-file attachments**.

> Current version: **v0.1.5**. The core stored-PDF → linked-file workflow has been confirmed on Zotero 10.0.4 / Windows. v0.1.5 adds metadata-aware naming, manual repair of existing linked filenames, and optional permanent-delete cleanup without changing existing files during upgrade.

## Download

Download the latest `.xpi` from **[GitHub Releases](https://github.com/CloselyFarAway/zotero-plugin/releases/latest)**.

Install in Zotero via **Tools → Plugins → gear/menu → Install Plugin From File…**.

## Why this exists

Zotero metadata sync and attachment-file storage are separate. Linked files let Zotero keep your bibliographic database while the physical PDFs live in OneDrive, Dropbox, a NAS, an external SSD, or another synced/local folder.

The plugin automates the risky and repetitive part: copy the PDF, verify it, create a linked attachment, preserve Zotero metadata/annotations, and only then remove the old stored attachment.

## Quick start

1. Install the `.xpi`.
2. Open **Settings → OneDrive Organizer**.
3. **Browse…** to a dedicated folder such as `D:\OneDrive\Zotero_PDF`.
4. Click **Check folder** to verify read/write access.
5. Keep automatic organization **off** for the first test.
6. Select one test paper and click **Preview selected path(s)…**.
7. If the path is correct, click **Organize selected item(s)**.
8. Confirm the PDF still opens in Zotero and exists in the expected external folder.
9. Enable automatic organization only after the test succeeds.

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
         └─ Jung_2025_Design Principles and Identification of Birefringent Materials.pdf
```

## Main features

- Zotero **10.0.x** support
- OneDrive or any normal local/synced filesystem folder
- Collection/subcollection hierarchy mirroring
- Safe selected-item and bulk migration
- Destination preview before moving files
- Writable-folder validation
- Custom filename template
- Windows-safe filenames and collision handling (` (2)`, ` (3)`, …)
- Optional publication-year folder
- Optional relative linked-file paths for multi-computer setups
- **Metadata-aware automatic naming** (v0.1.5)
- **Rename selected linked PDFs from Zotero metadata** (v0.1.5)
- **Optional external-file deletion on Zotero permanent deletion** (v0.1.5, default OFF)
- Group Library protection

## Metadata-aware naming in v0.1.5

Publisher PDF URLs often expose filenames such as:

```text
cm5c00977_1.9.pdf
1234567.pdf
download.pdf
```

When **Wait for bibliographic metadata before automatic organization** is enabled (default), automatic organization waits for Zotero to attach the PDF to a regular bibliographic parent item with a usable title. The plugin then names the file from Zotero metadata instead of the publisher/server filename.

If metadata is not ready, the PDF is left safely in Zotero storage and retried later. The plugin does **not** fall back to moving it immediately with a machine-generated filename.

Default filename template:

```text
{firstCreator}_{year}_{title}
```

Available tokens:

- `{firstCreator}`
- `{year}`
- `{title}`
- `{itemKey}`
- `{attachmentKey}`

## Repairing filenames that were already organized

v0.1.5 adds **Rename selected linked PDF(s)…**.

This is intentionally manual. It:

1. Requires the linked PDF to be inside the configured root.
2. Requires usable parent-item metadata.
3. Shows old → new paths before asking for confirmation.
4. Renames the file **in the same folder**.
5. Updates Zotero's linked path.
6. Rolls the filesystem rename back if the Zotero database update fails.

It does **not** automatically rename or relocate existing files just because the plugin was upgraded.

## Optional Zotero deletion → external PDF deletion

By default, Zotero linked files are not deleted from disk when their Zotero attachment is removed. v0.1.5 adds an opt-in setting:

**Delete external PDF when it is permanently deleted from Zotero**

Safety rules:

- Default: **OFF**
- Moving an item to Zotero Trash does **not** delete the external PDF.
- The external PDF is considered only on **Delete Permanently / Empty Trash**.
- Only PDFs inside the currently configured external root are eligible.
- The plugin keeps an in-memory index of linked PDFs under that root, including items already in Zotero Trash.
- A filesystem deletion failure is logged and does not trigger unrelated cleanup.

This means upgrading from v0.1.3/v0.1.4 does not suddenly delete existing files.

## Multiple collections

A Zotero item can belong to multiple collections without being duplicated. To avoid duplicating the physical PDF:

1. The deepest collection path wins.
2. Equal-depth paths are resolved alphabetically.

The Zotero item remains visible in all collections.

## Stored → linked safety model

For each eligible PDF:

```text
stored Zotero PDF
      ↓
copy to external folder
      ↓
verify copied byte size
      ↓
create linked attachment
      ↓
transfer annotations / relations / full-text index
      ↓
erase old stored attachment as the final database operation
```

If copying or Zotero conversion fails, the original stored attachment is retained and the new external copy is removed when possible.

## Upgrade behavior

Updating the plugin does **not** reorganize existing linked files.

- Existing v0.1.3/v0.1.4 files stay where they are.
- Existing filenames stay unchanged unless you explicitly use **Rename selected linked PDF(s)…**.
- Permanent-delete cleanup remains OFF until you explicitly enable it.
- Automatic metadata waiting affects future automatic organization only.

## Important limitations

- **My Library only:** Zotero does not support linked-file attachments in Group Libraries.
- **Desktop workflow:** linked PDFs are outside Zotero File Storage, so Zotero mobile/web cannot retrieve them through Zotero Storage.
- **PDFs only:** EPUBs, snapshots, images, and other attachment types are skipped.
- **Collection moves after organization:** moving an already-organized Zotero item to another collection does not yet relocate the existing linked PDF.
- **Local filesystem required:** OneDrive must be mounted as a normal path. The plugin does not use Microsoft Graph.
- **Do not put `zotero.sqlite` in OneDrive.** Use OneDrive only for linked attachment files.

## Multiple computers

Enable **Use Zotero relative linked-file paths when safe** if the same synced root has different absolute paths on different computers, for example:

```text
PC 1: D:\OneDrive\Zotero_PDF
PC 2: C:\Users\name\OneDrive\Zotero_PDF
```

The plugin will not silently replace a conflicting existing Zotero linked-attachment base directory.

## Privacy and network behavior

- No telemetry or analytics
- No Microsoft Graph / OneDrive API
- PDF operations are local filesystem operations
- Zotero may fetch this repository's `updates.json` for extension updates

This project is not affiliated with Zotero, the Corporation for Digital Scholarship, or Microsoft.

## Troubleshooting

**A new PDF keeps its publisher filename or stays in Zotero Storage**  
Leave **Wait for bibliographic metadata…** enabled and confirm the PDF has a normal parent bibliographic item. Automatic mode intentionally waits instead of committing a machine-generated name.

**An old linked PDF has a bad filename**  
Select the parent item (or attachment) and use **Rename selected linked PDF(s)…**.

**I deleted an item but the OneDrive PDF remains**  
Moving to Zotero Trash is intentionally non-destructive. External deletion happens only after permanent deletion and only if the advanced deletion option is enabled.

**Browse works but organization fails**  
Run **Check folder** to verify actual write access.

**I found a bug**  
Use **Report a bug / request a feature** in Settings or open a GitHub issue. Include Zotero version, plugin version, OS, reproduction steps, and relevant Debug Output.

## Development

No Node/npm build is required.

```bash
python scripts/build.py
python scripts/generate_updates.py
python scripts/check.py
```

Output:

```text
dist/zotero-onedrive-organizer-0.1.5.xpi
dist/zotero-onedrive-organizer-0.1.5.xpi.sha256
```

Permanent extension ID:

```text
zotero-onedrive-organizer@closelyfaraway.github.io
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [TESTING.md](TESTING.md).

## Roadmap

- [x] Zotero 10 support
- [x] OneDrive / external folder support
- [x] Collection hierarchy mirroring
- [x] Safe stored → linked conversion
- [x] Destination preview
- [x] Metadata-aware automatic naming
- [x] Manual linked-PDF filename repair
- [x] Optional permanent-delete cleanup
- [ ] Audit library for broken/missing linked files
- [ ] Relocate linked PDFs when collection paths change
- [ ] Restore linked PDFs to Zotero-managed storage
- [ ] Support additional attachment types
- [ ] Broader Windows/macOS/Linux testing

## License

MIT — see [LICENSE](LICENSE).
