# Zotero 10 Manual Test Checklist

Target release: **v0.1.5**  
Primary confirmed baseline: **Zotero 10.0.4 / Windows**

Use disposable Zotero items and a separate empty OneDrive test directory for destructive tests.

## Installation / regression

- [ ] Zotero accepts `zotero-onedrive-organizer-0.1.5.xpi` as an update from v0.1.4.
- [ ] Existing v0.1.3/v0.1.4 linked PDFs still open after update.
- [ ] Existing linked PDF paths and filenames do not change merely because v0.1.5 was installed.
- [ ] Settings shows `v0.1.5`.
- [ ] Existing baseDir / collection / filename-template preferences remain unchanged.
- [ ] Permanent-delete cleanup is OFF unless the user explicitly enables it.

## Folder configuration

- [ ] Browse selects the intended root.
- [ ] Base path remains saved after reopening Settings.
- [ ] Check folder succeeds for a writable root and leaves no test file behind.
- [ ] Check folder fails safely for invalid/non-writable paths.

## Existing stored → linked workflow regression

- [ ] Preview selected path(s) does not modify files.
- [ ] Organize selected item(s) still performs stored → linked conversion.
- [ ] Collection/subcollection folder mirroring is unchanged.
- [ ] Filename template behavior is unchanged for normal bibliographic parent items.
- [ ] PDF annotations and linked Zotero notes still work.
- [ ] Duplicate destination filenames receive a numbered suffix.
- [ ] Group Library attachments are skipped.
- [ ] Bulk migration still shows eligible count and confirmation.

## v0.1.5 metadata-aware automatic naming

With **Wait for bibliographic metadata before automatic organization** enabled:

- [ ] Add/import a stored PDF before a normal parent bibliographic item is ready.
- [ ] The plugin does not move it immediately with a numeric/server filename.
- [ ] Generic names such as `download.pdf`, `article.pdf`, numeric-only names, and `cm5c00977_1.9.pdf` are treated as machine-like names when no proper parent title exists.
- [ ] Once Zotero attaches the PDF to a parent item with a real title, automatic organization is retried.
- [ ] Final filename follows `{firstCreator}_{year}_{title}` (or the configured template).
- [ ] A legitimate compact title such as `TiO2` or `BaTiO3` is not rejected solely for containing a digit.

## v0.1.5 rename repair

Prepare one disposable linked PDF under the configured root with a deliberately bad filename.

- [ ] Select its parent item and click **Rename selected linked PDF(s)…**.
- [ ] Preview shows old path → new path before confirmation.
- [ ] Cancel leaves the filesystem and Zotero path unchanged.
- [ ] Confirm renames the PDF in the same folder.
- [ ] Zotero opens the renamed linked PDF normally.
- [ ] The file byte size is unchanged.
- [ ] Already-correct filenames are skipped.
- [ ] Linked PDFs outside the configured root are refused.
- [ ] A linked PDF without usable parent metadata is refused.

## v0.1.5 permanent-delete cleanup

Use a disposable linked PDF under the configured root.

- [ ] With cleanup OFF, moving to Trash and permanently deleting does not delete the external PDF.
- [ ] Enabling cleanup shows a warning/confirmation.
- [ ] Moving an item to Zotero Trash does **not** delete the PDF.
- [ ] Restoring the item from Trash still opens the PDF.
- [ ] With cleanup ON, Delete Permanently removes the external PDF.
- [ ] Empty Trash also removes indexed linked PDFs under the configured root.
- [ ] A linked PDF outside the configured root is never deleted.
- [ ] Restart Zotero with a test item already in Trash, then permanently delete it; the external PDF is removed only when cleanup is ON.
- [ ] Disabling cleanup again stops external deletion.

## Failure-path checks

- [ ] Missing base directory never deletes a stored Zotero PDF.
- [ ] Rename failure does not intentionally delete the only PDF copy.
- [ ] Permanent-delete filesystem failure is logged and does not trigger unrelated file deletion.
- [ ] Plugin's own stored-attachment erase during conversion does not delete the newly created linked external PDF.

## Build validation

```bash
python scripts/build.py
python scripts/generate_updates.py
python scripts/check.py
node --check bootstrap.js
node --check organizer.js
node --check content/preferences.js
```

- [ ] Build succeeds.
- [ ] SHA-256 file is generated.
- [ ] Rebuilding unchanged source produces the same SHA-256.
- [ ] `scripts/check.py` passes.

If a destructive test fails, disable automatic organization and permanent-delete cleanup before further debugging.
