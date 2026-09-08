# Zotero 10.0.4 Manual Test Checklist

Use a disposable test item and an empty OneDrive test directory first.

## Installation

- [ ] Zotero 10.0.4 accepts `zotero-onedrive-organizer-0.1.1.xpi`.
- [ ] The plugin appears enabled under Tools → Plugins.
- [ ] Settings → OneDrive Organizer opens without an error.

## Folder configuration

- [ ] Browse can select the intended OneDrive directory.
- [ ] Check folder reports that the directory is accessible.
- [ ] Automatic organization is off after a fresh installation.

## Single-PDF functional test

Create a temporary collection such as `Plugin Test/Subcollection`, then add one article with one stored PDF.

- [ ] With automatic organization off, the PDF remains stored by Zotero.
- [ ] `Organize selected item(s)` processes only the selected disposable test item/attachment.
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
- [ ] Add a second disposable article + PDF.
- [ ] After the processing delay, the PDF appears in OneDrive automatically.
- [ ] The Zotero attachment opens normally.

## Negative/safety tests

- [ ] An invalid/missing base directory does not delete the stored Zotero PDF.
- [ ] A non-PDF attachment is skipped.
- [ ] A linked PDF is skipped rather than duplicated.
- [ ] Group Library attachments are skipped.
- [ ] A duplicate destination filename gets a numbered suffix instead of overwriting a file.

If any test fails, disable automatic organization and preserve the original Zotero data directory before debugging.
