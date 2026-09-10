/*
 * Zotero OneDrive Organizer
 * v0.1.7
 *
 * Safety model:
 *   1. Copy with no-overwrite semantics to a unique external path.
 *   2. Verify byte size and SHA-256 before any Zotero attachment is erased.
 *   3. Create a linked attachment clone and transfer annotations/relations/full-text.
 *   4. Treat note-link migration failure as fatal and roll back the DB transaction.
 *   5. Erase the old stored attachment only as the final DB operation.
 *
 * If conversion fails, the external copy is removed and the original stored item remains.
 */

var ZoteroOneDriveOrganizer = {
  PREF: "extensions.zotero-onedrive-organizer.",
  _observerID: null,
  _pending: new Map(),
  _busy: new Set(),
  _collectionRetries: new Map(),
  _collectionRetryCounts: new Map(),
  _shuttingDown: false,
  _capabilitiesOK: false,
  _capabilityFailures: [],

  async init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this._shuttingDown = false;

    const capabilityResult = this._checkCapabilities();
    this._capabilitiesOK = capabilityResult.ok;
    this._capabilityFailures = capabilityResult.missing;

    if (!this._capabilitiesOK) {
      const message =
        "Required Zotero/Firefox APIs are unavailable: " +
        this._capabilityFailures.join(", ") +
        ". Automatic organization has been disabled for this runtime session.";
      this.error(new Error(message), "Compatibility check failed");
      if (this.getPref("autoEnabled", false)) {
        this._notifyCompatibilityFailure(message);
      }
      return;
    }

    this._observerID = Zotero.Notifier.registerObserver(
      {
        notify: (event, type, ids) => this._onNotify(event, type, ids)
      },
      ["item"],
      "zotero-onedrive-organizer"
    );

    this.log("Compatibility check passed; notifier registered");
  },

  shutdown() {
    this._shuttingDown = true;
    if (this._observerID) {
      Zotero.Notifier.unregisterObserver(this._observerID);
      this._observerID = null;
    }
    this._pending.clear();
    this._busy.clear();
    this._collectionRetries.clear();
    this._collectionRetryCounts.clear();
  },

  log(message) {
    Zotero.debug("Zotero OneDrive Organizer: " + message);
  },

  error(error, context = "") {
    const message = context ? `${context}: ${error}` : String(error);
    Zotero.debug("Zotero OneDrive Organizer ERROR: " + message, 1);
    Zotero.logError(error instanceof Error ? error : new Error(message));
  },

  _checkCapabilities() {
    const checks = [
      ["IOUtils.copy", () => typeof IOUtils !== "undefined" && typeof IOUtils.copy === "function"],
      ["IOUtils.computeHexDigest", () => typeof IOUtils !== "undefined" && typeof IOUtils.computeHexDigest === "function"],
      ["IOUtils.stat", () => typeof IOUtils !== "undefined" && typeof IOUtils.stat === "function"],
      ["IOUtils.remove", () => typeof IOUtils !== "undefined" && typeof IOUtils.remove === "function"],
      ["IOUtils.exists", () => typeof IOUtils !== "undefined" && typeof IOUtils.exists === "function"],
      ["IOUtils.makeDirectory", () => typeof IOUtils !== "undefined" && typeof IOUtils.makeDirectory === "function"],
      ["PathUtils.join", () => typeof PathUtils !== "undefined" && typeof PathUtils.join === "function"],
      ["PathUtils.normalize", () => typeof PathUtils !== "undefined" && typeof PathUtils.normalize === "function"],
      ["PathUtils.filename", () => typeof PathUtils !== "undefined" && typeof PathUtils.filename === "function"],
      ["Zotero.DB.executeTransaction", () => typeof Zotero.DB?.executeTransaction === "function"],
      ["Zotero.Items.getAsync", () => typeof Zotero.Items?.getAsync === "function"],
      ["Zotero.Items.get", () => typeof Zotero.Items?.get === "function"],
      ["Zotero.Items.moveChildItems", () => typeof Zotero.Items?.moveChildItems === "function"],
      ["Zotero.Relations.copyObjectSubjectRelations", () => typeof Zotero.Relations?.copyObjectSubjectRelations === "function"],
      ["Zotero.Fulltext.transferItemIndex", () => typeof Zotero.Fulltext?.transferItemIndex === "function"],
      ["Zotero.Notes.replaceItemKey", () => typeof Zotero.Notes?.replaceItemKey === "function"],
      ["Zotero.Collections.getAsync", () => typeof Zotero.Collections?.getAsync === "function"],
      ["Zotero.Libraries.get", () => typeof Zotero.Libraries?.get === "function"],
      ["Zotero.File.getValidFileName", () => typeof Zotero.File?.getValidFileName === "function"],
      ["Zotero.Attachments.LINK_MODE_LINKED_FILE", () => typeof Zotero.Attachments?.LINK_MODE_LINKED_FILE === "number"],
    ];

    const missing = [];
    for (const [name, test] of checks) {
      try {
        if (!test()) missing.push(name);
      }
      catch (_) {
        missing.push(name);
      }
    }
    return { ok: missing.length === 0, missing };
  },

  _assertCapabilities() {
    if (this._capabilitiesOK) return;
    const detail = this._capabilityFailures.length
      ? this._capabilityFailures.join(", ")
      : "unknown compatibility failure";
    throw new Error(`Compatibility check failed; file-moving operations are blocked (${detail}).`);
  },

  getRuntimeStatus() {
    return {
      ok: Boolean(this._capabilitiesOK),
      missing: [...this._capabilityFailures]
    };
  },

  _notifyCompatibilityFailure(message) {
    Zotero.Promise.delay(0).then(() => {
      try {
        Services.prompt.alert(
          Zotero.getMainWindow?.() || null,
          "Zotero OneDrive Organizer",
          message
        );
      }
      catch (e) {
        this.error(e, "Could not show compatibility warning");
      }
    });
  },

  getPref(name, fallback = null) {
    const value = Zotero.Prefs.get(this.PREF + name);
    return value === undefined || value === null ? fallback : value;
  },

  setPref(name, value) {
    Zotero.Prefs.set(this.PREF + name, value);
  },

  _onNotify(event, type, ids) {
    if (this._shuttingDown || type !== "item" || !Array.isArray(ids)) return;
    if (!this.getPref("autoEnabled", false)) return;
    if (event !== "add" && event !== "modify") return;

    for (const id of ids) {
      if (typeof id !== "number") continue;
      this.schedule(id);

      // Connector imports can assign the parent item to the selected collection
      // shortly after the PDF attachment itself is created. If the regular item
      // changes, also reschedule its stored PDF children so we see the final
      // collection membership as soon as Zotero records it.
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
    try {
      attachmentIDs = item.getAttachments?.() || [];
    }
    catch (_) {}

    for (const attachmentID of attachmentIDs) {
      if (typeof attachmentID === "number") this.schedule(attachmentID);
    }
  },

  _scheduleCollectionRetry(itemID) {
    if (this._shuttingDown) return false;
    if (this._collectionRetries.has(itemID)) return true;

    const maxRetries = Math.max(1, Number(this.getPref("collectionMaxRetries", 8)) || 8);
    const retryDelay = Math.max(500, Number(this.getPref("collectionRetryMs", 1500)) || 1500);
    const attempt = Number(this._collectionRetryCounts.get(itemID) || 0);

    if (attempt >= maxRetries) {
      this.log(`No collection found for attachment ${itemID} after ${attempt} retries; using the configured Unfiled folder.`);
      this._clearCollectionRetry(itemID);
      return false;
    }

    this._collectionRetryCounts.set(itemID, attempt + 1);
    const promise = Zotero.Promise.delay(retryDelay)
      .then(async () => {
        // A successful earlier retry removes the entry; in that case this timer
        // is stale and must not touch the attachment again.
        if (!this._collectionRetries.has(itemID)) return;
        this._collectionRetries.delete(itemID);
        if (this._shuttingDown) return;
        await this.processAttachment(itemID, { quietSkip: true, autoTriggered: true });
      })
      .catch(e => {
        this._collectionRetries.delete(itemID);
        this.error(e, `Collection retry for attachment ${itemID}`);
      });

    this._collectionRetries.set(itemID, promise);
    this.log(`Collection not assigned yet for attachment ${itemID}; retry ${attempt + 1}/${maxRetries} in ${retryDelay} ms.`);
    return true;
  },

  _clearCollectionRetry(itemID) {
    this._collectionRetries.delete(itemID);
    this._collectionRetryCounts.delete(itemID);
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
    const item = typeof itemOrID === "number"
      ? await Zotero.Items.getAsync(itemOrID)
      : itemOrID;

    if (!item) {
      if (typeof itemOrID === "number") this._clearCollectionRetry(itemOrID);
      return { status: "skipped", reason: "missing-item" };
    }
    const originalID = item.id;
    if (this._busy.has(originalID)) return { status: "skipped", reason: "busy" };

    this._assertCapabilities();
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

      // Zotero Connector may create the attachment before the parent item's
      // collection assignment is visible to plugins. v0.1.4 immediately fell
      // back to _Unfiled in that short window. For automatic organization only,
      // defer a regular parent with no collection for a bounded period. Manual
      // organization keeps the old immediate behavior.
      let collectionPathOverride = null;
      if (autoTriggered && this.getPref("includeCollectionPath", true) && parent?.isRegularItem?.()) {
        collectionPathOverride = await this._chooseCollectionPath(parent);
        if (!collectionPathOverride.length) {
          if (this._scheduleCollectionRetry(originalID)) {
            return { status: "skipped", reason: "collection-pending" };
          }
          // Retry budget exhausted: this is treated as a genuinely unfiled item.
          collectionPathOverride = [];
        }
        else {
          this._clearCollectionRetry(originalID);
        }
      }

      const destinationDir = await this._buildDestinationDirectory(
        baseDir,
        item,
        parent,
        { collectionPathOverride }
      );
      await IOUtils.makeDirectory(destinationDir, {
        createAncestors: true,
        ignoreExisting: true
      });

      const destinationName = await this._buildFilename(item, parent, sourcePath);
      let destinationPath = null;
      let linkedItem = null;

      try {
        destinationPath = await this._copyToUniqueDestination(
          sourcePath,
          destinationDir,
          destinationName
        );
        this.log(`Copied ${sourcePath} -> ${destinationPath} with no-overwrite protection`);

        const verification = await this._verifyCopiedFile(sourcePath, destinationPath);
        const srcStat = verification.sourceStat;

        // Preserve the original file timestamp when possible.
        try {
          if (srcStat.lastModified) {
            await IOUtils.setModificationTime(destinationPath, srcStat.lastModified);
          }
        }
        catch (e) {
          this.error(e, `Could not preserve timestamp for ${destinationPath}`);
        }

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
            // Full-text can be regenerated by Zotero, so indexing failure is not a
            // reason to risk losing the original stored attachment. Log and continue.
            this.error(e, `Could not transfer full-text index from ${originalID}`);
          }

          // Notes can contain zotero:// links that encode the attachment key. A
          // failed key migration is data-integrity relevant, so let the exception
          // abort the transaction instead of deleting the old attachment anyway.
          const parentItem = item.parentItem;
          if (parentItem) {
            const notes = Zotero.Items.get(parentItem.getNotes());
            for (const note of notes) {
              Zotero.Notes.replaceItemKey(note, item.key, linkedItem.key);
              await note.save();
            }
          }

          // Erasing the old stored attachment is deliberately last. Zotero handles
          // its storage directory and remote storage state as a real item deletion.
          await item.erase();
        });
      }
      catch (e) {
        // Copy verification or the database transaction failed. Remove only the
        // destination allocated by this invocation; the original stored attachment
        // remains authoritative because item.erase() is transaction-protected.
        if (destinationPath) {
          try {
            await IOUtils.remove(destinationPath, { ignoreAbsent: true });
          }
          catch (cleanupError) {
            this.error(cleanupError, "Failed removing copied file after conversion failure");
          }
        }
        throw e;
      }

      this._clearCollectionRetry(originalID);
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

  async _buildDestinationDirectory(baseDir, attachment, parent, { collectionPathOverride = null } = {}) {
    const segments = [baseDir];

    if (this.getPref("includeLibraryFolder", true)) {
      const library = Zotero.Libraries.get(attachment.libraryID);
      segments.push(this._sanitizeSegment(library?.name || "My Library"));
    }

    if (this.getPref("includeCollectionPath", true)) {
      const collectionPath = Array.isArray(collectionPathOverride)
        ? collectionPathOverride
        : await this._chooseCollectionPath(parent);
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

  _safePathLengthLimit() {
    // Keep a conservative margin below legacy Windows MAX_PATH because OneDrive,
    // shell integrations, and third-party tools can still encounter shorter-path
    // limits even when the underlying filesystem supports long paths.
    return Zotero.isWin ? 240 : 1024;
  },

  _candidatePath(directory, filename, index = 1) {
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : "";
    const suffix = index > 1 ? ` (${index})` : "";
    const normalizedDir = PathUtils.normalize(directory).replace(/[\\/]+$/, "");
    const limit = this._safePathLengthLimit();

    // Reserve one separator plus the collision suffix and extension before
    // truncating the title-derived stem. Never silently truncate directories,
    // because that would change the user's collection hierarchy.
    const maxStemLength = limit - normalizedDir.length - 1 - suffix.length - extension.length;
    if (maxStemLength < 8) {
      throw new Error(
        `Destination folder is too long to create a safe filename (${normalizedDir.length} characters; limit ${limit}). ` +
        `Choose a shorter external root or shorten the Zotero collection path.`
      );
    }

    const fittedStem = this._truncate(stem, Math.min(stem.length, maxStemLength)) || "_";
    const candidate = PathUtils.join(directory, `${fittedStem}${suffix}${extension}`);
    if (candidate.length > limit) {
      throw new Error(`Destination path exceeds the safe ${limit}-character limit: ${candidate}`);
    }
    return candidate;
  },

  async _uniquePath(directory, filename) {
    // Preview helper only. Actual copies use _copyToUniqueDestination(), which
    // performs the allocation and copy together with noOverwrite=true.
    for (let index = 1; index < 10000; index++) {
      const candidate = this._candidatePath(directory, filename, index);
      if (!(await IOUtils.exists(candidate))) return candidate;
    }
    throw new Error(`Could not allocate a unique filename for ${filename}`);
  },

  _isAlreadyExistsError(error) {
    try {
      if (typeof Cr !== "undefined" && error?.result === Cr.NS_ERROR_FILE_ALREADY_EXISTS) {
        return true;
      }
    }
    catch (_) {}
    const text = `${error?.name || ""} ${error?.message || ""} ${String(error || "")}`;
    return /NS_ERROR_FILE_ALREADY_EXISTS|already exists/i.test(text);
  },

  async _copyToUniqueDestination(sourcePath, directory, filename) {
    for (let index = 1; index < 10000; index++) {
      const candidate = this._candidatePath(directory, filename, index);
      try {
        await IOUtils.copy(sourcePath, candidate, { noOverwrite: true });
        return candidate;
      }
      catch (e) {
        // noOverwrite closes the exists-then-copy race. Retry only a genuine
        // already-exists error; disk-full/access/other I/O failures must abort
        // immediately rather than producing a trail of partial numbered files.
        if (this._isAlreadyExistsError(e)) {
          this.log(`Destination already exists; retrying with a numbered suffix: ${candidate}`);
          continue;
        }
        throw new Error(`Could not copy PDF to ${candidate}: ${e}`);
      }
    }
    throw new Error(`Could not allocate a unique filename for ${filename}`);
  },

  async _verifyCopiedFile(sourcePath, destinationPath) {
    const [sourceStat, destinationStat] = await Promise.all([
      IOUtils.stat(sourcePath),
      IOUtils.stat(destinationPath)
    ]);

    if (sourceStat.size !== destinationStat.size) {
      throw new Error(
        `Copy verification failed: byte size differs ` +
        `(source ${sourceStat.size}, destination ${destinationStat.size})`
      );
    }

    const [sourceHash, destinationHash] = await Promise.all([
      IOUtils.computeHexDigest(sourcePath, "sha256"),
      IOUtils.computeHexDigest(destinationPath, "sha256")
    ]);
    if (!sourceHash || sourceHash !== destinationHash) {
      throw new Error(
        `Copy verification failed: SHA-256 differs ` +
        `(source ${String(sourceHash).slice(0, 12)}…, destination ${String(destinationHash).slice(0, 12)}…)`
      );
    }

    this.log(`SHA-256 verified for ${destinationPath}`);
    return { sourceStat, destinationStat, sha256: sourceHash };
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
