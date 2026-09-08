/*
 * Zotero OneDrive Organizer
 * v0.1.4
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
  _shuttingDown: false,

  async init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this._shuttingDown = false;

    this._observerID = Zotero.Notifier.registerObserver(
      {
        notify: (event, type, ids) => this._onNotify(event, type, ids)
      },
      ["item"],
      "zotero-onedrive-organizer"
    );

    this.log("Notifier registered");
  },

  shutdown() {
    this._shuttingDown = true;
    if (this._observerID) {
      Zotero.Notifier.unregisterObserver(this._observerID);
      this._observerID = null;
    }
    this._pending.clear();
    this._busy.clear();
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

  _onNotify(event, type, ids) {
    if (this._shuttingDown || type !== "item") return;
    if (!this.getPref("autoEnabled", false)) return;
    if (event !== "add" && event !== "modify") return;

    for (const id of ids) {
      if (typeof id !== "number") continue;
      this.schedule(id);
    }
  },

  schedule(itemID) {
    if (this._pending.has(itemID) || this._busy.has(itemID)) return;

    const delay = Math.max(500, Number(this.getPref("processDelayMs", 2500)) || 2500);
    const promise = Zotero.Promise.delay(delay)
      .then(async () => {
        this._pending.delete(itemID);
        if (this._shuttingDown) return;
        await this.processAttachment(itemID, { quietSkip: true });
      })
      .catch(e => {
        this._pending.delete(itemID);
        this.error(e, `Auto-processing item ${itemID}`);
      });

    this._pending.set(itemID, promise);
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

  async processAttachment(itemOrID, { quietSkip = false } = {}) {
    const item = typeof itemOrID === "number"
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
      const sourcePath = await this._waitForFile(item);
      if (!sourcePath) {
        return { status: "skipped", reason: "file-not-local" };
      }

      // Don't touch a file that is somehow already inside the external root.
      if (this._pathIsInside(baseDir, sourcePath)) {
        return { status: "skipped", reason: "already-under-base" };
      }

      const parent = item.parentID ? await Zotero.Items.getAsync(item.parentID) : item;
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
