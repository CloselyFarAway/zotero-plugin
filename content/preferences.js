/* Zotero OneDrive Organizer — preference pane, Zotero 10 */

globalThis.ZoteroOneDriveOrganizerPrefs = {
  PREF: "extensions.zotero-onedrive-organizer.",
  _initialized: false,

  init() {
    if (this._initialized) return true;

    const required = [
      "zoo-auto-enabled", "zoo-base-dir", "zoo-browse", "zoo-check-folder",
      "zoo-library-folder", "zoo-collection-path", "zoo-year-folder",
      "zoo-unfiled", "zoo-template", "zoo-relative-paths",
      "zoo-organize-selected", "zoo-organize-existing", "zoo-status"
    ];
    if (!required.every(id => document.getElementById(id))) return false;

    this._initialized = true;

    // Explicitly initialize values as a fallback in addition to Zotero's native
    // `preference=` binding. This also makes the pane robust if native binding
    // behavior changes across Zotero versions.
    this._bindCheckbox("zoo-auto-enabled", "autoEnabled", false);
    this._bindText("zoo-base-dir", "baseDir", "");
    this._bindCheckbox("zoo-library-folder", "includeLibraryFolder", true);
    this._bindCheckbox("zoo-collection-path", "includeCollectionPath", true);
    this._bindCheckbox("zoo-year-folder", "includeYearFolder", false);
    this._bindText("zoo-unfiled", "unfiledFolder", "_Unfiled");
    this._bindText("zoo-template", "filenameTemplate", "{firstCreator}_{year}_{title}");
    this._bindCheckbox("zoo-relative-paths", "useRelativePaths", false);

    document.getElementById("zoo-browse")
      .addEventListener("command", () => this.chooseBaseDir());
    document.getElementById("zoo-check-folder")
      .addEventListener("command", () => this.validateFolder());
    document.getElementById("zoo-organize-selected")
      .addEventListener("command", () => this.organizeSelected());
    document.getElementById("zoo-organize-existing")
      .addEventListener("command", () => this.organizeExisting());

    this._setStatus("Ready");
    Zotero.debug("Zotero OneDrive Organizer: preference pane initialized");
    return true;
  },

  get organizer() {
    return Zotero.ZoteroOneDriveOrganizer;
  },

  _get(name, fallback) {
    const value = Zotero.Prefs.get(this.PREF + name);
    return value === undefined || value === null ? fallback : value;
  },

  _set(name, value) {
    Zotero.Prefs.set(this.PREF + name, value);
  },

  _bindCheckbox(id, prefName, fallback) {
    const element = document.getElementById(id);
    element.checked = Boolean(this._get(prefName, fallback));
    const save = () => this._set(prefName, Boolean(element.checked));
    element.addEventListener("command", save);
    element.addEventListener("change", save);
  },

  _bindText(id, prefName, fallback) {
    const element = document.getElementById(id);
    element.value = String(this._get(prefName, fallback) ?? "");
    const save = () => this._set(prefName, String(element.value ?? ""));
    element.addEventListener("input", save);
    element.addEventListener("change", save);
  },

  async chooseBaseDir() {
    try {
      const { FilePicker } = ChromeUtils.importESModule(
        "chrome://zotero/content/modules/filePicker.mjs"
      );
      const fp = new FilePicker();
      const parentWindow = Zotero.getMainWindow?.() || window;
      fp.init(parentWindow, "Choose OneDrive / external root folder", fp.modeGetFolder);

      const current = String(this._get("baseDir", "") || "").trim();
      if (current && await IOUtils.exists(current)) {
        try { fp.displayDirectory = current; } catch (_) {}
      }

      const result = await fp.show();
      if (result !== fp.returnOK && result !== fp.returnReplace) return;

      // Zotero's FilePicker returns a path string in current versions, while
      // older implementations may expose an nsIFile-like object.
      let path = fp.file;
      if (path && typeof path !== "string") {
        path = path.path || String(path);
      }
      path = String(path || "").trim();
      if (!path) throw new Error("The folder picker returned an empty path.");

      document.getElementById("zoo-base-dir").value = path;
      this._set("baseDir", path);
      this._setStatus("Folder selected — click Check folder");
    }
    catch (e) {
      Zotero.logError(e);
      this._setStatus("Folder selection failed");
      this._alert("Folder selection failed", String(e));
    }
  },

  async validateFolder() {
    try {
      // Save whatever is currently typed before validating it.
      const typed = String(document.getElementById("zoo-base-dir").value || "").trim();
      this._set("baseDir", typed);
      const path = await this.organizer.validateBaseDirectory(typed);
      this._setStatus(`Folder OK — ${path}`);
      this._alert("OneDrive Organizer", `Folder is accessible:\n${path}`);
    }
    catch (e) {
      Zotero.logError(e);
      this._setStatus("Folder check failed");
      this._alert("OneDrive Organizer", `Folder check failed:\n${e}`);
    }
  },

  async organizeSelected() {
    const button = document.getElementById("zoo-organize-selected");
    button.disabled = true;
    try {
      const typed = String(document.getElementById("zoo-base-dir").value || "").trim();
      this._set("baseDir", typed);
      await this.organizer.validateBaseDirectory(typed);
      const pane = Zotero.getActiveZoteroPane();
      const selected = pane?.getSelectedItems?.() || [];
      if (!selected.length) {
        this._alert("OneDrive Organizer", "Select one or more items or PDF attachments in the Zotero library pane first.");
        return;
      }

      const attachmentIDs = [];
      const seen = new Set();
      for (const item of selected) {
        let ids = [];
        if (item.isAttachment?.()) ids = [item.id];
        else if (item.isRegularItem?.()) ids = item.getAttachments?.() || [];
        for (const id of ids) {
          if (!seen.has(id)) {
            seen.add(id);
            attachmentIDs.push(id);
          }
        }
      }

      if (!attachmentIDs.length) {
        this._alert("OneDrive Organizer", "The selected Zotero item(s) contain no attachments to process.");
        return;
      }

      const stats = { processed: 0, skipped: 0, failed: 0, failures: [] };
      for (let i = 0; i < attachmentIDs.length; i++) {
        try {
          const result = await this.organizer.processAttachment(attachmentIDs[i], { quietSkip: true });
          if (result.status === "processed") stats.processed++;
          else stats.skipped++;
        }
        catch (e) {
          stats.failed++;
          stats.failures.push(String(e));
          Zotero.logError(e);
        }
        this._setStatus(`${i + 1}/${attachmentIDs.length} — moved ${stats.processed}, skipped ${stats.skipped}, failed ${stats.failed}`);
      }

      const detail = stats.failures.length ? `\n\nFirst error: ${stats.failures[0]}` : "";
      this._alert(
        "OneDrive Organizer",
        `Selected-item test finished.\n\nProcessed: ${stats.processed}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}${detail}`
      );
    }
    catch (e) {
      Zotero.logError(e);
      this._alert("OneDrive Organizer", `Could not process selected items:\n${e}`);
      this._setStatus("Error");
    }
    finally {
      button.disabled = false;
    }
  },

  async organizeExisting() {
    const button = document.getElementById("zoo-organize-existing");
    button.disabled = true;
    try {
      const typed = String(document.getElementById("zoo-base-dir").value || "").trim();
      this._set("baseDir", typed);
      await this.organizer.validateBaseDirectory(typed);
      const eligible = await this.organizer.countEligible();
      if (!eligible) {
        this._alert("OneDrive Organizer", "No eligible stored PDFs were found in My Library.");
        return;
      }
      const confirmed = Services.prompt.confirm(
        window,
        "OneDrive Organizer — bulk migration",
        `This will attempt to reorganize ${eligible} stored PDF(s) across My Library.\n\nContinue only after a successful selected-item test and a backup.`
      );
      if (!confirmed) return;

      this._setStatus("Scanning…");
      const stats = await this.organizer.organizeExisting({
        progress: ({ current, total, stats }) => {
          this._setStatus(`${current}/${total} — moved ${stats.processed}, failed ${stats.failed}`);
        }
      });

      const detail = stats.failures.length ? `\n\nFirst error: ${stats.failures[0].message}` : "";
      this._alert(
        "OneDrive Organizer",
        `Finished.\n\nProcessed: ${stats.processed}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}${detail}`
      );
      this._setStatus(`Done — moved ${stats.processed}, failed ${stats.failed}`);
    }
    catch (e) {
      Zotero.logError(e);
      this._alert("OneDrive Organizer", `Could not start:\n${e}`);
      this._setStatus("Error");
    }
    finally {
      button.disabled = false;
    }
  },

  _setStatus(text) {
    const el = document.getElementById("zoo-status");
    if (el) el.value = text;
  },

  _alert(title, message) {
    try {
      Services.prompt.alert(window, title, message);
    }
    catch (_) {
      window.alert(message);
    }
  }
};

// Preference-pane scripts can be loaded after the pane document's normal load
// event, so don't rely on an inline onload handler. Poll briefly until Zotero
// has inserted the fragment, then wire all events explicitly.
(function initializePreferencePane(attempt = 0) {
  try {
    if (globalThis.ZoteroOneDriveOrganizerPrefs.init()) return;
  }
  catch (e) {
    Zotero.logError(e);
  }
  if (attempt < 100) {
    setTimeout(() => initializePreferencePane(attempt + 1), 25);
  }
  else {
    Zotero.logError(new Error("Zotero OneDrive Organizer preference pane failed to initialize"));
  }
})();
