var ZoteroOneDriveOrganizerPrefs = {
  PREF: "extensions.zotero-onedrive-organizer.",
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this._bindCheckbox("zoo-auto-enabled", "autoEnabled", true);
    this._bindText("zoo-base-dir", "baseDir", "");
    this._bindCheckbox("zoo-library-folder", "includeLibraryFolder", true);
    this._bindCheckbox("zoo-collection-path", "includeCollectionPath", true);
    this._bindCheckbox("zoo-year-folder", "includeYearFolder", false);
    this._bindText("zoo-unfiled", "unfiledFolder", "_Unfiled");
    this._bindText("zoo-template", "filenameTemplate", "{firstCreator}_{year}_{title}");
    this._bindCheckbox("zoo-relative-paths", "useRelativePaths", false);
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
    element.addEventListener("command", () => this._set(prefName, element.checked));
  },

  _bindText(id, prefName, fallback) {
    const element = document.getElementById(id);
    element.value = String(this._get(prefName, fallback) ?? "");
    const save = () => this._set(prefName, element.value);
    element.addEventListener("change", save);
    element.addEventListener("input", save);
  },

  async chooseBaseDir() {
    try {
      const { FilePicker } = ChromeUtils.importESModule(
        "chrome://zotero/content/modules/filePicker.mjs"
      );
      const fp = new FilePicker();
      const win = Services.wm.getMostRecentWindow("navigator:browser");
      fp.init(win, "Choose OneDrive / external root folder", fp.modeGetFolder);
      fp.appendFilters(fp.filterAll);

      const result = await fp.show();
      if (result !== fp.returnOK) return;

      const path = String(fp.file);
      document.getElementById("zoo-base-dir").value = path;
      this._set("baseDir", path);
      this._setStatus("Folder selected.");
    }
    catch (e) {
      Zotero.logError(e);
      this._alert("Folder selection failed", String(e));
    }
  },

  async organizeExisting() {
    const button = document.getElementById("zoo-organize-existing");
    button.disabled = true;
    try {
      this._setStatus("Scanning…");
      const stats = await this.organizer.organizeExisting({
        progress: ({ current, total, stats }) => {
          this._setStatus(`${current}/${total} — moved ${stats.processed}, failed ${stats.failed}`);
        }
      });

      const detail = stats.failures.length
        ? `\n\nFirst error: ${stats.failures[0].message}`
        : "";
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
    document.getElementById("zoo-status").value = text;
  },

  _alert(title, message) {
    try {
      Services.prompt.alert(window, title, message);
    }
    catch (e) {
      window.alert(message);
    }
  }
};
