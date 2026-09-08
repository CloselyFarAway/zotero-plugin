# Zotero 10 Manual Test Checklist

Target release: **v0.1.6**  
Primary confirmed environment: **Zotero 10.0.4 / Windows**

Use a disposable Zotero item and an empty OneDrive test directory first.

## Installation and settings

- [ ] Zotero accepts `zotero-onedrive-organizer-0.1.6.xpi`.
- [ ] The plugin appears enabled under Tools → Plugins.
- [ ] Settings → OneDrive Organizer opens without an error.
- [ ] The settings pane shows `v0.1.6`.
- [ ] Project page opens the GitHub repository.
- [ ] Report a bug / request a feature opens GitHub Issues.

## Folder configuration

- [ ] Browse can select the intended OneDrive/external directory.
- [ ] The selected path remains saved after closing and reopening Settings.
- [ ] Check folder reports success for a writable folder.
- [ ] Check folder fails safely for an invalid or non-writable path.
- [ ] No temporary `.zotero-onedrive-organizer-write-test-*` file remains after the check.
- [ ] Automatic organization is off after a fresh installation.

## Preview test

Create a temporary collection such as `Plugin Test/Subcollection`, then add one article with one stored PDF.

- [ ] Select the test article and click **Preview selected path(s)…**.
- [ ] The preview displays the expected root/library/collection/filename path.
- [ ] The stored PDF remains unchanged after preview.
- [ ] No destination file or folder is created solely by preview.
- [ ] Previewing an already-linked PDF reports it as skipped.

## Single-PDF functional test

- [ ] With automatic organization off, the PDF remains stored until manual organization.
- [ ] `Organize selected item(s)` processes only the selected disposable item/attachment.
- [ ] The external path mirrors the selected collection hierarchy.
- [ ] The filename follows the configured template.
- [ ] Zotero shows the resulting attachment as a linked file.
- [ ] The linked PDF opens normally in Zotero.
- [ ] The external PDF byte size matches the original test PDF.
- [ ] Existing PDF annotations still open and remain attached to the PDF.
- [ ] Notes containing Zotero attachment links still resolve.

## Bulk-migration guard

- [ ] `Organize ALL existing PDFs…` displays the number of eligible PDFs and requires confirmation.
- [ ] Canceling the confirmation leaves the library unchanged.

## Automatic test

After the manual test succeeds:

- [ ] Enable automatic organization.
- [ ] Select a disposable collection such as `Plugin Test/Catalyst` before saving from Zotero Connector.
- [ ] Add a second disposable article + PDF through the Connector.
- [ ] The PDF does **not** get committed to `_Unfiled` just because collection assignment is briefly unavailable.
- [ ] Within the bounded retry window, the PDF appears under the selected collection hierarchy.
- [ ] The Zotero attachment opens normally.
- [ ] Add one genuinely unfiled disposable article + PDF and confirm it eventually falls back to `_Unfiled` rather than retrying forever.

## Negative/safety tests

- [ ] An invalid/missing base directory does not delete the stored Zotero PDF.
- [ ] A non-PDF attachment is skipped.
- [ ] A linked PDF is skipped rather than duplicated.
- [ ] Group Library attachments are skipped.
- [ ] A duplicate destination filename gets a numbered suffix instead of overwriting a file.
- [ ] Uninstalling the plugin leaves already-linked files usable in Zotero.

## Build validation

```bash
python scripts/build.py
python scripts/generate_updates.py
python scripts/check.py
```

- [ ] The local build succeeds.
- [ ] The SHA-256 checksum file is created.
- [ ] Running `scripts/build.py` again without source changes produces the same SHA-256.
- [ ] `scripts/check.py` passes.

If any file-moving test fails, disable automatic organization and preserve the original Zotero data directory before debugging.
