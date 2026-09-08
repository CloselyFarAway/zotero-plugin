var ZoteroOneDriveOrganizer;

function log(message) {
  Zotero.debug("Zotero OneDrive Organizer: " + message);
}

function install() {
  log("Installed");
}

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise;

  Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + "content/preferences.xhtml",
    scripts: [rootURI + "content/preferences.js"],
    label: "OneDrive Organizer"
  });

  Services.scriptloader.loadSubScript(rootURI + "organizer.js");
  Zotero.ZoteroOneDriveOrganizer = ZoteroOneDriveOrganizer;
  await ZoteroOneDriveOrganizer.init({ id, version, rootURI });
  log("Started " + version);
}

function onMainWindowLoad() {}
function onMainWindowUnload() {}

function shutdown() {
  try {
    ZoteroOneDriveOrganizer?.shutdown();
  }
  catch (e) {
    Zotero.logError(e);
  }
  try {
    delete Zotero.ZoteroOneDriveOrganizer;
  }
  catch (e) {}
  ZoteroOneDriveOrganizer = undefined;
  log("Stopped");
}

function uninstall() {
  log("Uninstalled");
}
