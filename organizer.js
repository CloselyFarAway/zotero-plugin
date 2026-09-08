/*
 * Zotero OneDrive Organizer
 * v0.1.5
 *
 * Safety model:
 *   1. Copy the stored PDF to the external folder.
 *   2. Verify the copied file size.
 *   3. Create a linked attachment clone and transfer annotations/relations/full-text.
 *   4. Erase the old stored attachment only as the final DB operation.
 *
 * If conversion fails, the external copy is removed and the original stored item remains.
 */

var ZoteroOneDriveOrganizer = {
  PREF: "extensions.zotero-onedrive-organizer.",
  _observerID: null,
  _pending: new Map(),
  _busy: new Set(),
  _metadataRetries: new Map(),
  _metadataRetryCounts: new Map(),
  _managedPathCache: new Map(),
  _cacheReadyPromise: null,
  _shuttingDown: false,

  async init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this._shuttingDown = false;

    this._observerID = Zotero.Notifier.registerObserver(
      {
        notify: (event, type, ids, extraData) => this._onNotify(event, type, ids, extraData)
      },
      ["item"],
      "zotero-onedrive-organizer"
    );

    this.log("Notifier registered");

    // Build an in-memory index of existing linked PDFs under the configured
    // root. This is deliberately non-blocking at startup. A permanent-delete
    // event awaits the same promise before touching any external file.
    this._cacheReadyPromise = this.rebuildManagedPathCache().catch(e => {
      this.error(e, "Initial linked-file cache build");
      return 0;
    });
  },

  shutdown() {
    this._shuttingDown = true;
    if (this._observerID) {
      Zotero.Notifier.unregisterObserver(this._observerID);
      this._observerID = null;
    }
    this._pending.clear();
    this._busy.clear();
    this._metadataRetries.clear();
    this._metadataRetryCounts.clear();
    this._managedPathCache.clear();
    this._cacheReadyPromise = null;
  },

  log(message) {
    Zotero.debug("Zotero OneDrive Organizer: " + message);
  },

  error(error, context = "") {
    const message = context ? `${context}: ${error}` : String(error);
    Zotero.debug("Zotero OneDrive Organizer ERROR: " + message, 1);
    Zotero.logError(error instanceof Error ? error : new Error(message));
  },

  getPref(name, fallback = null) {
    const value = Zotero.Prefs.get(this.PREF + name);
    return value === undefined || value === null ? fallback : value;
  },

  setPref(name, value) {
    Zotero.Prefs.set(this.PREF + name, value);
  },

  _onNotify(event, type, ids, extraData = {}) {
    if (this._shuttingDown || type !== "item" || !Array.isArray(ids)) return;

    // Zotero's `delete` notifier fires for permanent deletion, while moving an
    // item to Trash is a separate `trash` event. External-file deletion is
    // therefore intentionally limited to permanent deletion only.
    if (event === "delete") {
      if (this.getPref("deleteExternalOnPermanentDelete", false)) {
        this._handlePermanentDelete(ids, extraData).catch(e =>
          this.error(e, "Permanent-delete external cleanup")
        );
      }
      for (const id of ids) {
        if (typeof id === "number") this._clearMetadataRetry(id);
      }
      return;
    }

    if (event !== "add" && event !== "modify" && event !== "trash") return;

    // Keep the deletion cache current even when automatic organization is off.
    this._refreshManagedCacheForIDs(ids).catch(e =>
      this.error(e, `Refreshing linked-file cache after ${event}`)
    );

    if (!this.getPref("autoEnabled", false)) return;
    if (event === "trash") return;

    for (const id of ids) {
      if (typeof id !== "number") continue;
      this.schedule(id);
      // Parent metadata may arrive after the attachment. When a bibliographic
      // item changes, reschedule its stored PDF children as well.
      this._scheduleChildAttachments(id).catch(e =>
        this.error(e, `Scheduling child attachments for ${id}`)
      );
    }
  },

  schedule(itemID) {
    if (this._pending.has(itemID) || this._busy.has(itemID)) return;

    const delay = Math.max(500, Number(this.getPref("processDelayMs", 2500)) || 2500);
    const promise = Zotero.Promise.delay(delay)
      .then(async () => {
        this._pending.delete(itemID);
        if (this._shuttingDown) return;
        await this.processAttachment(itemID, { quietSkip: true, autoTriggered: true });
      })
      .catch(e => {
        this._pending.delete(itemID);
        this.error(e, `Auto-processing item ${itemID}`);
      });

    this._pending.set(itemID, promise);
  },

  async _scheduleChildAttachments(itemID) {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item || !item.isRegularItem?.() || item.deleted) return;
    let attachmentIDs = [];
    try { attachmentIDs = item.getAttachments?.() || []; } catch (_) {}
    for (const attachmentID of attachmentIDs) {
      if (typeof attachmentID === "number") this.schedule(attachmentID);
    }
  },

  async _getBibliographicParent(attachment) {
    if (!attachment?.parentID) return { ready: false, parent: null };
    const parent = await Zotero.Items.getAsync(attachment.parentID);
    if (!parent || !parent.isRegularItem?.() || parent.deleted) {
      return { ready: false, parent: null };
    }
    const title = this._getTitle(parent);
    if (!title || title === "Untitled" || this._looksLikeMachineFilename(title)) {
      return { ready: false, parent };
    }
    return { ready: true, parent };
  },

  _scheduleMetadataRetry(itemID) {
    if (this._shuttingDown || this._metadataRetries.has(itemID)) return;

    const maxRetries = Math.max(1, Number(this.getPref("metadataMaxRetries", 12)) || 12);
    const retryDelay = Math.max(1000, Number(this.getPref("metadataRetryMs", 5000)) || 5000);
    const attempt = Number(this._metadataRetryCounts.get(itemID) || 0);
    if (attempt >= maxRetries) {
      this.log(`Metadata still unavailable for item ${itemID} after ${attempt} retries; leaving it stored.`);
      return;
    }
    this._metadataRetryCounts.set(itemID, attempt + 1);

    const promise = Zotero.Promise.delay(retryDelay)
      .then(() => {
        // If metadata became ready and _clearMetadataRetry() removed this entry,
        // do not schedule a stale no-op retry.
        if (!this._metadataRetries.has(itemID)) return;
        this._metadataRetries.delete(itemID);
        if (!this._shuttingDown) this.schedule(itemID);
      })
      .catch(e => {
        this._metadataRetries.delete(itemID);
        this.error(e, `Metadata retry for item ${itemID}`);
      });
    this._metadataRetries.set(itemID, promise);
  },

  _clearMetadataRetry(itemID) {
    this._metadataRetries.delete(itemID);
    this._metadataRetryCounts.delete(itemID);
  },

  async validateBaseDirectory(baseDir = null, { testWrite = false } = {}) {
    baseDir = (baseDir ?? this.getPref("baseDir", "")).trim();
    if (!baseDir) {
      throw new Error("No OneDrive/external base folder is configured.");
    }
    const normalized = PathUtils.normalize(baseDir);
    if (!(await IOUtils.exists(normalized))) {
      throw new Error(`Base folder does not exist: ${normalized}`);
    }
    const stat = await IOUtils.stat(normalized);
    if (stat.type !== "directory") {
      throw new Error(`Base path is not a folder: ${normalized}`);
    }

    if (testWrite) {
      const marker = PathUtils.join(
        normalized,
        `.zotero-onedrive-organizer-write-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.tmp`
      );
      try {
        await IOUtils.writeUTF8(marker, "Zotero OneDrive Organizer write test\n");
        const markerStat = await IOUtils.stat(marker);
        if (!markerStat.size) {
          throw new Error("The write test created an empty/unreadable file.");
        }
      }
      catch (e) {
        try { await IOUtils.remove(marker, { ignoreAbsent: true }); } catch (_) {}
        throw new Error(`Folder is not writable: ${normalized} (${e})`);
      }
      try {
        await IOUtils.remove(marker, { ignoreAbsent: true });
      }
      catch (e) {
        throw new Error(`Write test succeeded, but the temporary file could not be removed: ${e}`);
      }
    }

    return normalized;
  },

  async previewAttachment(itemOrID) {
    const item = typeof itemOrID === "number"
      ? await Zotero.Items.getAsync(itemOrID)
      : itemOrID;

    if (!item) return { status: "skipped", reason: "missing-item" };
    const eligibility = await this._checkEligibility(item);
    if (!eligibility.ok) {
      return { status: "skipped", reason: eligibility.reason, itemID: item.id };
    }

    const baseDir = await this.validateBaseDirectory();
    let sourcePath = "";
    try { sourcePath = await item.getFilePathAsync() || ""; } catch (_) {}
    if (!sourcePath) {
      try { sourcePath = item.attachmentFilename || "attachment.pdf"; } catch (_) { sourcePath = "attachment.pdf"; }
    }

    const parent = item.parentID ? await Zotero.Items.getAsync(item.parentID) : item;
    const destinationDir = await this._buildDestinationDirectory(baseDir, item, parent);
    const destinationName = await this._buildFilename(item, parent, sourcePath);
    const destinationPath = await this._uniquePath(destinationDir, destinationName);

    return {
      status: "preview",
      itemID: item.id,
      title: this._getTitle(parent),
      destinationPath
    };
  },

  async processAttachment(itemOrID, { quietSkip = false, autoTriggered = false } = {}) {
    let item = typeof itemOrID === "number"
      ? await Zotero.Items.getAsync(itemOrID)
      : itemOrID;

    if (!item) return { status: "skipped", reason: "missing-item" };
    const originalID = item.id;
    if (this._busy.has(originalID)) return { status: "skipped", reason: "busy" };

    this._busy.add(originalID);
    try {
      const eligibility = await this._checkEligibility(item);
      if (!eligibility.ok) {
        if (!quietSkip && eligibility.reason !== "not-stored-pdf") {
          this.log(`Skipped ${originalID}: ${eligibility.reason}`);
        }
        return { status: "skipped", reason: eligibility.reason };
      }

      const baseDir = await this.validateBaseDirectory();

      // Automatic organization is conservative in v0.1.5: if Zotero has not
      // attached the PDF to a regular bibliographic item yet, leave it stored
      // and retry later. This prevents publisher/server filenames such as
      // `cm5c00977_1.9.pdf` from becoming the permanent external filename.
      let parent = item.parentID ? await Zotero.Items.getAsync(item.parentID) : item;
      if (autoTriggered && this.getPref("waitForMetadata", true)) {
        const metadata = await this._getBibliographicParent(item);
        if (!metadata.ready) {
          this._scheduleMetadataRetry(originalID);
          return { status: "skipped", reason: "metadata-not-ready" };
        }
        parent = metadata.parent;
        this._clearMetadataRetry(originalID);
      }

      const sourcePath = await this._waitForFile(item);
      if (!sourcePath) {
        return { status: "skipped", reason: "file-not-local" };
      }

      // Don't touch a file that is somehow already inside the external root.
      if (this._pathIsInside(baseDir, sourcePath)) {
        return { status: "skipped", reason: "already-under-base" };
      }

      // Re-read the parent for manual processing, or if metadata changed while
      // we were waiting for the file to become available.
      if (!autoTriggered || !this.getPref("waitForMetadata", true)) {
        parent = item.parentID ? await Zotero.Items.getAsync(item.parentID) : item;
      }
      const destinationDir = await this._buildDestinationDirectory(baseDir, item, parent);
      await IOUtils.makeDirectory(destinationDir, {
        createAncestors: true,
        ignoreExisting: true
      });

      const destinationName = await this._buildFilename(item, parent, sourcePath);
      const destinationPath = await this._uniquePath(destinationDir, destinationName);

      this.log(`Copying ${sourcePath} -> ${destinationPath}`);
      await IOUtils.copy(sourcePath, destinationPath);

      const [srcStat, dstStat] = await Promise.all([
        IOUtils.stat(sourcePath),
        IOUtils.stat(destinationPath)
      ]);
      if (srcStat.size !== dstStat.size) {
        await IOUtils.remove(destinationPath, { ignoreAbsent: true });
        throw new Error(
          `Copy verification failed for ${destinationName} ` +
          `(source ${srcStat.size} bytes, destination ${dstStat.size} bytes)`
        );
      }

      // Preserve the original file timestamp when possible.
      try {
        if (srcStat.lastModified) {
          await IOUtils.setModificationTime(destinationPath, srcStat.lastModified);
        }
      }
      catch (e) {
        this.error(e, `Could not preserve timestamp for ${destinationPath}`);
      }

      let linkedItem = null;
      try {
        // Clone the Zotero attachment metadata, but point the clone to the external file.
        // Using a new attachment item lets Zotero erase/sync-delete the old stored item cleanly.
        linkedItem = item.clone(null, { includeCollections: true });
        linkedItem.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_FILE;
        linkedItem.attachmentPath = this._prepareLinkedPath(destinationPath, baseDir);
        linkedItem.dateAdded = item.dateAdded;

        await Zotero.DB.executeTransaction(async () => {
          await linkedItem.save();

          // PDF annotations and embedded child items belong to the attachment item.
          await Zotero.Items.moveChildItems(item, linkedItem);
          await Zotero.Relations.copyObjectSubjectRelations(item, linkedItem);

          try {
            await Zotero.Fulltext.transferItemIndex(item, linkedItem);
          }
          catch (e) {
            this.error(e, `Could not transfer full-text index from ${originalID}`);
          }

          // Notes can contain zotero:// links that encode the attachment key.
          const parentItem = item.parentItem;
          if (parentItem) {
            try {
              const notes = Zotero.Items.get(parentItem.getNotes());
              for (const note of notes) {
                Zotero.Notes.replaceItemKey(note, item.key, linkedItem.key);
                await note.save();
              }
            }
            catch (e) {
              this.error(e, `Could not update note links for attachment ${originalID}`);
            }
          }

          // Erasing the old stored attachment is deliberately last. Zotero handles
          // its storage directory and remote storage state as a real item deletion.
          await item.erase();
        });
      }
      catch (e) {
        // The database transaction failed or did not complete. Remove the external
        // copy so the original stored attachment remains the only authoritative file.
        try {
          await IOUtils.remove(destinationPath, { ignoreAbsent: true });
        }
        catch (cleanupError) {
          this.error(cleanupError, "Failed removing copied file after conversion failure");
        }
        throw e;
      }

      this._clearMetadataRetry(originalID);
      await this._cacheLinkedAttachment(linkedItem, destinationPath);
      this.log(`Organized item ${originalID} -> ${linkedItem.id}: ${destinationPath}`);
      return {
        status: "processed",
        oldItemID: originalID,
        itemID: linkedItem.id,
        destinationPath
      };
    }
    finally {
      this._busy.delete(originalID);
    }
  },

  async _checkEligibility(item) {
    if (!item.isAttachment || !item.isAttachment()) {
      return { ok: false, reason: "not-attachment" };
    }
    if (item.deleted) {
      return { ok: false, reason: "deleted" };
    }
    if (!item.isPDFAttachment || !item.isPDFAttachment()) {
      return { ok: false, reason: "not-pdf" };
    }
    if (!item.isStoredFileAttachment || !item.isStoredFileAttachment()) {
      return { ok: false, reason: "not-stored-pdf" };
    }

    const library = Zotero.Libraries.get(item.libraryID);
    if (!library || library.libraryType !== "user") {
      return { ok: false, reason: "group-library-linked-files-unsupported" };
    }

    return { ok: true };
  },

  async _waitForFile(item) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const path = await item.getFilePathAsync();
      if (path && await IOUtils.exists(path)) return path;
      await Zotero.Promise.delay(700 * (attempt + 1));
    }
    return false;
  },

  async _buildDestinationDirectory(baseDir, attachment, parent) {
    const segments = [baseDir];

    if (this.getPref("includeLibraryFolder", true)) {
      const library = Zotero.Libraries.get(attachment.libraryID);
      segments.push(this._sanitizeSegment(library?.name || "My Library"));
    }

    if (this.getPref("includeCollectionPath", true)) {
      const collectionPath = await this._chooseCollectionPath(parent);
      if (collectionPath.length) {
        for (const segment of collectionPath) {
          segments.push(this._sanitizeSegment(segment));
        }
      }
      else {
        const unfiled = String(this.getPref("unfiledFolder", "_Unfiled") || "_Unfiled").trim();
        if (unfiled) segments.push(this._sanitizeSegment(unfiled));
      }
    }

    if (this.getPref("includeYearFolder", false)) {
      segments.push(this._sanitizeSegment(this._getYear(parent)));
    }

    return PathUtils.join(...segments);
  },

  async _chooseCollectionPath(item) {
    if (!item) return [];

    try {
      await item.loadDataType("collections");
    }
    catch (e) {}

    let ids = [];
    try {
      ids = item.getCollections() || [];
    }
    catch (e) {
      this.error(e, `Could not read collections for item ${item.id}`);
      return [];
    }
    if (!ids.length) return [];

    const paths = [];
    for (const collectionID of ids) {
      const names = [];
      const seen = new Set();
      let currentID = collectionID;
      while (currentID && !seen.has(currentID)) {
        seen.add(currentID);
        const collection = await Zotero.Collections.getAsync(currentID);
        if (!collection) break;
        names.unshift(collection.name || "Untitled Collection");
        currentID = collection.parentID || null;
      }
      if (names.length) paths.push(names);
    }

    // A Zotero item may belong to multiple collections. Store only one physical
    // file: deepest collection wins; alphabetical path breaks ties deterministically.
    paths.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return a.join("/").localeCompare(b.join("/"));
    });
    return paths[0] || [];
  },

  async _buildFilename(attachment, parent, sourcePath) {
    const template = String(
      this.getPref("filenameTemplate", "{firstCreator}_{year}_{title}") ||
      "{firstCreator}_{year}_{title}"
    );

    const firstCreator = this._getFirstCreator(parent);
    const year = this._getYear(parent);
    const title = this._getTitle(parent);
    const originalName = PathUtils.filename(sourcePath);
    const extension = this._extension(originalName) || "pdf";

    const values = {
      firstCreator,
      year,
      title,
      itemKey: parent?.key || attachment.key || "item",
      attachmentKey: attachment.key || "attachment"
    };

    let baseName = template.replace(/\{(firstCreator|year|title|itemKey|attachmentKey)\}/g, (_, key) => {
      return values[key] ?? "";
    });

    baseName = baseName
      .replace(/\s+/g, " ")
      .replace(/[._ -]{2,}/g, "_")
      .trim();

    if (!baseName) {
      baseName = originalName.replace(/\.[^.]+$/, "") || attachment.key || "attachment";
    }

    baseName = this._sanitizeSegment(baseName, 170);
    let filename = Zotero.File.getValidFileName(`${baseName}.${extension}`);
    if (filename.length > 190) {
      filename = `${this._truncate(baseName, 180)}.${extension}`;
    }
    return filename;
  },

  _getFirstCreator(item) {
    if (!item || !item.isRegularItem || !item.isRegularItem()) return "Unknown";
    try {
      const creators = item.getCreators();
      if (!creators?.length) return "Unknown";
      const creator = creators[0];
      return String(creator.lastName || creator.name || creator.firstName || "Unknown").trim() || "Unknown";
    }
    catch (e) {
      return "Unknown";
    }
  },

  _getYear(item) {
    if (!item) return "n.d.";
    try {
      const directYear = String(item.getField?.("year") || "").trim();
      if (/^\d{4}$/.test(directYear)) return directYear;
      const date = String(item.getField?.("date") || "");
      const match = date.match(/(?:^|\D)(\d{4})(?:\D|$)/);
      if (match) return match[1];
    }
    catch (e) {}
    return "n.d.";
  },

  _getTitle(item) {
    if (!item) return "Untitled";
    try {
      return String(item.getField?.("title") || item.getDisplayTitle?.() || "Untitled").trim() || "Untitled";
    }
    catch (e) {
      return "Untitled";
    }
  },

  _sanitizeSegment(value, maxLength = 100) {
    let text = String(value ?? "")
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();

    if (!text) text = "_";
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(text)) {
      text = "_" + text;
    }
    return this._truncate(text, maxLength);
  },

  _truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).replace(/[. ]+$/g, "");
  },

  _extension(filename) {
    const match = String(filename).match(/\.([A-Za-z0-9]{1,10})$/);
    return match ? match[1].toLowerCase() : "";
  },

  async _uniquePath(directory, filename) {
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : "";

    let candidate = PathUtils.join(directory, filename);
    if (!(await IOUtils.exists(candidate))) return candidate;

    for (let index = 2; index < 10000; index++) {
      candidate = PathUtils.join(directory, `${stem} (${index})${extension}`);
      if (!(await IOUtils.exists(candidate))) return candidate;
    }
    throw new Error(`Could not allocate a unique filename for ${filename}`);
  },

  _prepareLinkedPath(destinationPath, baseDir) {
    if (!this.getPref("useRelativePaths", false)) {
      return destinationPath;
    }

    const currentBase = Zotero.Prefs.get("baseAttachmentPath");
    const normalizedCurrent = currentBase ? PathUtils.normalize(currentBase) : "";
    const normalizedRequested = PathUtils.normalize(baseDir);

    // Never silently replace an existing base directory because that could break
    // the user's pre-existing linked attachments. Fall back to an absolute path.
    if (normalizedCurrent && normalizedCurrent !== normalizedRequested) {
      this.log(
        `Relative-path mode requested, but Zotero baseAttachmentPath is already ` +
        `set to ${normalizedCurrent}. Using absolute path for safety.`
      );
      return destinationPath;
    }

    if (!normalizedCurrent) {
      Zotero.Prefs.set("baseAttachmentPath", normalizedRequested);
    }
    Zotero.Prefs.set("saveRelativeAttachmentPath", true);
    return Zotero.Attachments.getBaseDirectoryRelativePath(destinationPath);
  },

  _pathIsInside(parent, child) {
    const p = PathUtils.normalize(parent).replace(/\\/g, "/").replace(/\/$/, "");
    const c = PathUtils.normalize(child).replace(/\\/g, "/");
    const fold = value => Zotero.isWin ? value.toLowerCase() : value;
    return fold(c) === fold(p) || fold(c).startsWith(fold(p) + "/");
  },

  _looksLikeMachineFilename(value) {
    let text = String(value || "").trim();
    if (!text) return true;
    text = text.replace(/\.pdf$/i, "");
    if (/^(?:article|download|full[-_ ]?text|main|document|attachment|paper|untitled|pdf)(?:[._ -]*\d+)?$/i.test(text)) {
      return true;
    }
    if (/^\d+(?:[._-]\d+)*$/.test(text)) return true;
    // Publisher/manuscript identifiers such as cm5c00977_1.9 or S1234-5678...
    // are usually compact code-like strings rather than bibliographic titles.
    if (!/\s/.test(text) && text.length <= 48 && /^[A-Za-z0-9_.-]+$/.test(text)) {
      const digits = (text.match(/\d/g) || []).length;
      const letters = (text.match(/[A-Za-z]/g) || []).length;
      if (digits >= 4 && letters <= 12) return true;
    }
    return false;
  },

  _isLinkedPDFAttachment(item) {
    if (!item?.isAttachment?.() || !item.isPDFAttachment?.()) return false;
    return item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE;
  },

  async _cacheLinkedAttachment(item, knownPath = null) {
    if (!item || !this._isLinkedPDFAttachment(item)) return false;
    const library = Zotero.Libraries.get(item.libraryID);
    if (!library || library.libraryType !== "user") return false;

    let baseDir = String(this.getPref("baseDir", "") || "").trim();
    if (!baseDir) return false;
    baseDir = PathUtils.normalize(baseDir);

    let path = knownPath;
    if (!path) {
      try { path = await item.getFilePathAsync(); } catch (_) { path = null; }
    }
    if (!path) return false;
    path = PathUtils.normalize(path);
    if (!this._pathIsInside(baseDir, path)) return false;

    this._managedPathCache.set(item.id, {
      itemID: item.id,
      parentID: item.parentID || null,
      path
    });
    return true;
  },

  async _refreshManagedCacheForIDs(ids) {
    for (const id of ids) {
      if (typeof id !== "number") continue;
      let item = null;
      try { item = await Zotero.Items.getAsync(id); } catch (_) {}
      if (!item) continue;

      if (item.isAttachment?.()) {
        // Drop stale paths first. If the attachment is still a managed linked
        // PDF, _cacheLinkedAttachment() immediately repopulates the entry.
        this._managedPathCache.delete(item.id);
      }

      if (this._isLinkedPDFAttachment(item)) {
        await this._cacheLinkedAttachment(item);
      }
      else if (item.isRegularItem?.()) {
        let attachmentIDs = [];
        try { attachmentIDs = item.getAttachments?.() || []; } catch (_) {}
        for (const attachmentID of attachmentIDs) {
          const attachment = await Zotero.Items.getAsync(attachmentID);
          if (attachment && this._isLinkedPDFAttachment(attachment)) {
            await this._cacheLinkedAttachment(attachment);
          }
        }
      }
    }
  },

  async rebuildManagedPathCache() {
    this._managedPathCache.clear();
    const baseDir = String(this.getPref("baseDir", "") || "").trim();
    if (!baseDir || !(await IOUtils.exists(baseDir))) return 0;

    // includeDeleted=true is intentional: an item may already be in Zotero
    // Trash when Zotero restarts, and we still need its path if the user later
    // chooses Delete Permanently / Empty Trash.
    const items = await Zotero.Items.getAll(
      Zotero.Libraries.userLibraryID,
      false,
      true,
      false
    );
    let count = 0;
    for (const item of items) {
      if (await this._cacheLinkedAttachment(item)) count++;
    }
    this.log(`Indexed ${count} linked PDF(s) under the configured root`);
    return count;
  },

  async _handlePermanentDelete(ids, _extraData = {}) {
    if (this._cacheReadyPromise) {
      try { await this._cacheReadyPromise; } catch (_) {}
    }

    const baseDirRaw = String(this.getPref("baseDir", "") || "").trim();
    if (!baseDirRaw) return;
    const baseDir = PathUtils.normalize(baseDirRaw);

    const deletedIDs = new Set(ids.filter(id => typeof id === "number"));
    const targets = [];
    for (const entry of this._managedPathCache.values()) {
      if (deletedIDs.has(entry.itemID) || (entry.parentID && deletedIDs.has(entry.parentID))) {
        targets.push(entry);
      }
    }

    for (const entry of targets) {
      // Defense in depth: never delete a file outside the *current* configured
      // root, even if it was present in an older in-memory cache.
      if (!this._pathIsInside(baseDir, entry.path)) {
        this.log(`Refused external delete outside configured root: ${entry.path}`);
        this._managedPathCache.delete(entry.itemID);
        continue;
      }
      try {
        if (await IOUtils.exists(entry.path)) {
          await IOUtils.remove(entry.path, { ignoreAbsent: true });
          this.log(`Deleted external PDF after permanent Zotero deletion: ${entry.path}`);
        }
        this._managedPathCache.delete(entry.itemID);
      }
      catch (e) {
        // Zotero deletion has already happened, so a filesystem failure must not
        // cascade into any unrelated cleanup. Leave the file in place and log it.
        this.error(e, `Could not delete external PDF ${entry.path}`);
      }
    }
  },

  async _checkLinkedRenameEligibility(item) {
    if (!item?.isAttachment?.()) return { ok: false, reason: "not-attachment" };
    if (item.deleted) return { ok: false, reason: "deleted" };
    if (!item.isPDFAttachment?.()) return { ok: false, reason: "not-pdf" };
    if (!this._isLinkedPDFAttachment(item)) return { ok: false, reason: "not-linked-pdf" };

    const library = Zotero.Libraries.get(item.libraryID);
    if (!library || library.libraryType !== "user") {
      return { ok: false, reason: "group-library-linked-files-unsupported" };
    }

    const baseDir = await this.validateBaseDirectory();
    let path = null;
    try { path = await item.getFilePathAsync(); } catch (_) {}
    if (!path || !(await IOUtils.exists(path))) return { ok: false, reason: "file-not-local" };
    if (!this._pathIsInside(baseDir, path)) return { ok: false, reason: "outside-configured-root" };

    const metadata = await this._getBibliographicParent(item);
    if (!metadata.ready) return { ok: false, reason: "metadata-not-ready" };
    return { ok: true, baseDir, path: PathUtils.normalize(path), parent: metadata.parent };
  },

  async previewRenameLinkedAttachment(itemOrID) {
    const item = typeof itemOrID === "number"
      ? await Zotero.Items.getAsync(itemOrID)
      : itemOrID;
    if (!item) return { status: "skipped", reason: "missing-item" };

    const eligibility = await this._checkLinkedRenameEligibility(item);
    if (!eligibility.ok) {
      return { status: "skipped", reason: eligibility.reason, itemID: item.id };
    }

    const currentPath = eligibility.path;
    const directory = PathUtils.parent(currentPath);
    const desiredName = await this._buildFilename(item, eligibility.parent, currentPath);
    let desiredPath = PathUtils.join(directory, desiredName);
    if (this._samePath(currentPath, desiredPath)) {
      return { status: "skipped", reason: "already-named", itemID: item.id };
    }
    if (await IOUtils.exists(desiredPath)) {
      desiredPath = await this._uniquePath(directory, desiredName);
    }

    return {
      status: "preview",
      itemID: item.id,
      title: this._getTitle(eligibility.parent),
      currentPath,
      destinationPath: desiredPath
    };
  },

  async renameLinkedAttachment(itemOrID) {
    const item = typeof itemOrID === "number"
      ? await Zotero.Items.getAsync(itemOrID)
      : itemOrID;
    if (!item) return { status: "skipped", reason: "missing-item" };

    const eligibility = await this._checkLinkedRenameEligibility(item);
    if (!eligibility.ok) return { status: "skipped", reason: eligibility.reason };

    const currentPath = eligibility.path;
    const directory = PathUtils.parent(currentPath);
    const desiredName = await this._buildFilename(item, eligibility.parent, currentPath);
    let destinationPath = PathUtils.join(directory, desiredName);
    if (this._samePath(currentPath, destinationPath)) {
      return { status: "skipped", reason: "already-named" };
    }
    if (await IOUtils.exists(destinationPath)) {
      destinationPath = await this._uniquePath(directory, desiredName);
    }

    const oldAttachmentPath = item.attachmentPath;
    const before = await IOUtils.stat(currentPath);
    await IOUtils.move(currentPath, destinationPath);

    try {
      const after = await IOUtils.stat(destinationPath);
      if (before.size !== after.size) {
        throw new Error(`Rename verification failed (${before.size} != ${after.size} bytes)`);
      }
      await Zotero.DB.executeTransaction(async () => {
        item.attachmentPath = this._prepareLinkedPath(destinationPath, eligibility.baseDir);
        await item.save();
      });
    }
    catch (e) {
      try {
        if (await IOUtils.exists(destinationPath) && !(await IOUtils.exists(currentPath))) {
          await IOUtils.move(destinationPath, currentPath);
        }
      }
      catch (rollbackError) {
        this.error(rollbackError, `Could not roll back filename change for item ${item.id}`);
      }
      try { item.attachmentPath = oldAttachmentPath; } catch (_) {}
      throw e;
    }

    await this._cacheLinkedAttachment(item, destinationPath);
    this.log(`Renamed linked PDF ${currentPath} -> ${destinationPath}`);
    return { status: "renamed", itemID: item.id, currentPath, destinationPath };
  },

  _samePath(a, b) {
    const normalize = value => PathUtils.normalize(value).replace(/\\/g, "/");
    const left = normalize(a);
    const right = normalize(b);
    return Zotero.isWin ? left.toLowerCase() === right.toLowerCase() : left === right;
  },

  async countEligible() {
    const items = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, false, false, false);
    let count = 0;
    for (const item of items) {
      const result = await this._checkEligibility(item);
      if (result.ok) count++;
    }
    return count;
  },

  async organizeExisting({ progress = null } = {}) {
    await this.validateBaseDirectory();
    const items = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, false, false, false);
    const candidates = [];

    for (const item of items) {
      const result = await this._checkEligibility(item);
      if (result.ok) candidates.push(item);
    }

    const stats = { total: candidates.length, processed: 0, skipped: 0, failed: 0, failures: [] };
    for (let index = 0; index < candidates.length; index++) {
      const item = candidates[index];
      try {
        const result = await this.processAttachment(item, { quietSkip: true });
        if (result.status === "processed") stats.processed++;
        else stats.skipped++;
      }
      catch (e) {
        stats.failed++;
        stats.failures.push({ itemID: item.id, message: String(e) });
        this.error(e, `Bulk organize item ${item.id}`);
      }

      if (progress) {
        try {
          progress({ current: index + 1, total: candidates.length, stats });
        }
        catch (e) {}
      }

      // Sequential I/O is intentional: safer for OneDrive sync clients and large libraries.
      await Zotero.Promise.delay(20);
    }

    return stats;
  }
};
