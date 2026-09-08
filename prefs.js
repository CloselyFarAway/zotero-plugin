pref("extensions.zotero-onedrive-organizer.autoEnabled", false);
pref("extensions.zotero-onedrive-organizer.baseDir", "");
pref("extensions.zotero-onedrive-organizer.includeLibraryFolder", true);
pref("extensions.zotero-onedrive-organizer.includeCollectionPath", true);
pref("extensions.zotero-onedrive-organizer.includeYearFolder", false);
pref("extensions.zotero-onedrive-organizer.unfiledFolder", "_Unfiled");
pref("extensions.zotero-onedrive-organizer.filenameTemplate", "{firstCreator}_{year}_{title}");
pref("extensions.zotero-onedrive-organizer.useRelativePaths", false);
pref("extensions.zotero-onedrive-organizer.processDelayMs", 2500);

// v0.1.5: keep newly imported PDFs in Zotero storage until a regular parent
// item with a usable title is available. This avoids server/manuscript IDs as
// permanent external filenames.
pref("extensions.zotero-onedrive-organizer.waitForMetadata", true);
pref("extensions.zotero-onedrive-organizer.metadataRetryMs", 5000);
pref("extensions.zotero-onedrive-organizer.metadataMaxRetries", 12);

// Dangerous by design and therefore opt-in. This runs only for Zotero's
// permanent `delete` event, never when an item is merely moved to Trash.
pref("extensions.zotero-onedrive-organizer.deleteExternalOnPermanentDelete", false);
