# Zotero OneDrive Organizer

A small Zotero 10 plugin that moves **stored PDF attachments** from **My Library** to a local OneDrive (or other externally synced) folder and replaces the stored attachment with a **linked-file attachment** that points to the external copy.

> Status: **v0.1.1 / experimental**. Back up your Zotero data and PDFs before bulk migration.

## Why

Zotero metadata syncing and file syncing are separate. Linked files let Zotero keep the bibliographic database while the actual PDFs live in OneDrive, Dropbox, a NAS, or another local/synced folder.

## Requirements

- Zotero **10.0.x**
- A locally accessible OneDrive/external folder
- **My Library** only for linked PDFs

Zotero itself does not support linked-file attachments in Group Libraries, so this plugin deliberately skips them.

## What v0.1.1 does

- Watches for newly added/modified **stored PDFs**
- Copies each PDF to your configured external root
- Verifies the destination file size before changing Zotero
- Creates a linked attachment clone, transfers Zotero annotations/relations/full-text state, then removes the old stored attachment
- Erases the old stored attachment only as the final database operation, allowing Zotero to clean up its managed storage normally
- Can organize only the currently selected Zotero item(s) for safe testing
- Can bulk-organize existing stored PDFs after an explicit confirmation
- Mirrors Zotero collection/subcollection hierarchy
- Handles items in multiple collections by choosing the **deepest collection path**; alphabetical path breaks ties
- Generates safe Windows filenames and resolves filename collisions with ` (2)`, ` (3)`, ...
- Optionally uses Zotero's relative linked-file paths for multi-computer setups

## Example

Zotero:

```text
My Library
└─ Ferroelectric
   └─ BaTiO3
      └─ Paper item
         └─ Full Text PDF
```

External root configured as:

```text
D:\OneDrive\Zotero_PDF
```

Result:

```text
D:\OneDrive\Zotero_PDF\
└─ My Library\
   └─ Ferroelectric\
      └─ BaTiO3\
         └─ Yeo_2026_Diffusion–Model–Driven Discovery.pdf
```

## Install

1. Download `zotero-onedrive-organizer-0.1.1.xpi` from the release/artifact.
2. In Zotero: **Tools → Plugins**.
3. Use the gear/menu → **Install Plugin From File…** (or drag the `.xpi` into the Plugins window).
4. Open **Settings → OneDrive Organizer**.
5. Choose your local OneDrive folder, for example `D:\OneDrive\Zotero_PDF`.
6. Test with one newly added PDF before using **Organize existing PDFs now**.

## First test (recommended)

1. Back up Zotero before testing an experimental build.
2. Install the XPI and open **Settings → OneDrive Organizer**.
3. Choose a new empty test folder inside OneDrive.
4. Click **Check folder** and confirm Zotero can access it.
5. Leave automatic organization **off** initially.
6. Add one test article with one PDF to a test collection.
7. Select only that test article (or its PDF) in Zotero and click **Organize selected item(s)**.
8. Confirm the PDF opens from Zotero and exists under the expected OneDrive collection path.
9. Only then enable automatic organization or consider **Organize ALL existing PDFs…**.

> Do not run a bulk migration on an irreplaceable library until the single-PDF test succeeds.

## Settings

Default folder rule:

```text
{baseDir}/{library}/{collection/subcollection}/
```

Default filename rule:

```text
{firstCreator}_{year}_{title}.pdf
```

Available filename tokens:

- `{firstCreator}`
- `{year}`
- `{title}`
- `{itemKey}`
- `{attachmentKey}`

Optional year folder can produce:

```text
{baseDir}/{library}/{collectionPath}/{year}/{filename}
```

## Multiple collections

A Zotero item can appear in several collections without being duplicated. A physical PDF cannot naturally mirror that without duplication, so v0.1.1 stores only one copy:

1. Prefer the deepest collection path.
2. If several paths have equal depth, choose the alphabetically first full path.

The Zotero item remains visible in all of its Zotero collections.

## Safety model

For every PDF the plugin performs:

```text
stored Zotero PDF
      ↓
copy to external folder
      ↓
verify copied byte size
      ↓
create linked attachment clone
      ↓
transfer annotations / relations / full-text index
      ↓
erase old stored attachment as final DB operation
```

If copying or Zotero DB conversion fails, the old stored attachment is retained and the new external copy is removed.

The attachment record is replaced with a linked attachment, so its attachment key/ID changes. The plugin transfers child annotations, relations, full-text index state, and Zotero note links to the new attachment. After syncing Zotero, the deleted stored attachment is no longer a Zotero-file-storage attachment.

## Important limitations

- **Group Libraries:** unsupported. Zotero itself prohibits linked file attachments in group libraries.
- **Mobile:** Zotero's linked-file workflow has platform limitations; this plugin does not upload PDFs to Zotero file storage.
- **Collection moves after organization:** v0.1.1 does **not** automatically relocate an already-linked PDF when you later move the parent item to another collection. This is a good candidate for v0.2 because automatic mass relocation needs careful safeguards.
- **Only PDFs:** EPUBs, snapshots, images, and other attachments are skipped.
- After a bulk conversion, run Zotero sync so remote metadata/storage deletion state is propagated. Linked PDFs themselves are not uploaded by Zotero file sync.
- OneDrive must present the destination as a normal local filesystem path. The plugin does not call the Microsoft Graph API.
- Do **not** put the Zotero data directory or `zotero.sqlite` itself inside OneDrive. Only use OneDrive for linked attachment files.

## Relative paths across computers

If `Use Zotero relative linked-file paths when safe` is enabled, the plugin will use the configured external root as Zotero's linked attachment base directory **only when no conflicting base directory is already configured**.

This lets two PCs use different absolute locations, for example:

```text
PC 1: D:\OneDrive\Zotero_PDF
PC 2: C:\Users\name\OneDrive\Zotero_PDF
```

while Zotero stores paths relative to the configured base directory on each computer.

## Build

No Node/npm build is required.

```bash
python scripts/build.py
```

Output:

```text
dist/zotero-onedrive-organizer-0.1.1.xpi
```

## GitHub publishing

The public plugin ID is fixed as:

```json
"id": "zotero-onedrive-organizer@closelyfaraway.github.io"
```

Do not change this ID after distributing releases; Zotero would treat a different ID as a separate plugin. The manifest homepage points to this repository. An `update_url` can be added later when an automatic-update manifest is published.

## License

MIT
