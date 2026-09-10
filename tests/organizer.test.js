const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeContext() {
  const prefStore = new Map();
  const existing = new Set();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    PathUtils: {
      normalize: p => path.win32.normalize(p),
      join: (...parts) => path.win32.join(...parts),
      filename: p => path.win32.basename(p),
    },
    IOUtils: {
      copy: async () => {},
      computeHexDigest: async () => 'a'.repeat(64),
      stat: async () => ({ type: 'regular', size: 10, lastModified: 0 }),
      remove: async () => {},
      exists: async p => existing.has(p),
      makeDirectory: async () => {},
      setModificationTime: async () => {},
      writeUTF8: async () => {},
    },
    Zotero: {
      isWin: true,
      debug: () => {},
      logError: () => {},
      getMainWindow: () => null,
      Promise: { delay: async () => {} },
      Prefs: {
        get: key => prefStore.get(key),
        set: (key, value) => prefStore.set(key, value),
      },
      Notifier: {
        registerObserver: () => 1,
        unregisterObserver: () => {},
      },
      DB: { executeTransaction: async fn => fn() },
      Items: {
        moveChildItems: async () => {},
        getAsync: async () => null,
        get: () => [],
      },
      Collections: { getAsync: async () => null },
      Relations: { copyObjectSubjectRelations: async () => {} },
      Fulltext: { transferItemIndex: async () => {} },
      Notes: { replaceItemKey: () => {} },
      Attachments: {
        LINK_MODE_LINKED_FILE: 2,
        getBaseDirectoryRelativePath: p => p,
      },
      Libraries: {
        userLibraryID: 1,
        get: () => ({ libraryType: 'user', name: 'My Library' }),
      },
      File: { getValidFileName: s => s },
    },
    Services: { prompt: { alert: () => {} } },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'organizer.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'organizer.js' });
  return { context, organizer: context.ZoteroOneDriveOrganizer, existing, prefStore };
}

async function testCapabilities() {
  const { context, organizer } = makeContext();
  let result = organizer._checkCapabilities();
  assert.equal(result.ok, true, `expected capabilities to pass: ${result.missing}`);

  const saved = context.IOUtils.computeHexDigest;
  delete context.IOUtils.computeHexDigest;
  result = organizer._checkCapabilities();
  assert.equal(result.ok, false);
  assert(result.missing.includes('IOUtils.computeHexDigest'));
  context.IOUtils.computeHexDigest = saved;
}

async function testPathLengthGuard() {
  const { organizer } = makeContext();
  const directory = 'D:\\OneDrive\\' + 'a'.repeat(180);
  const candidate = organizer._candidatePath(directory, 'b'.repeat(180) + '.pdf', 27);
  assert(candidate.length <= 240, `candidate too long: ${candidate.length}`);
  assert(candidate.endsWith(' (27).pdf'));

  const tooLongDirectory = 'D:\\' + 'x'.repeat(232);
  assert.throws(
    () => organizer._candidatePath(tooLongDirectory, 'paper.pdf', 1),
    /Destination folder is too long/
  );
}

async function testNoOverwriteCollisionRetry() {
  const { context, organizer, existing } = makeContext();
  const calls = [];
  let first = true;
  context.IOUtils.copy = async (src, dst, opts) => {
    calls.push({ src, dst, opts });
    assert.deepEqual(opts, { noOverwrite: true });
    if (first) {
      first = false;
      existing.add(dst);
      throw new Error('already exists');
    }
  };
  context.IOUtils.exists = async p => existing.has(p);

  const destination = await organizer._copyToUniqueDestination(
    'D:\\src\\paper.pdf',
    'D:\\OneDrive\\Papers',
    'paper.pdf'
  );
  assert.equal(calls.length, 2);
  assert(destination.endsWith('paper (2).pdf'));
}


async function testNonCollisionCopyFailureAborts() {
  const { context, organizer } = makeContext();
  let calls = 0;
  context.IOUtils.copy = async () => {
    calls++;
    throw new Error('disk full');
  };
  await assert.rejects(
    organizer._copyToUniqueDestination(
      'D:\\src\\paper.pdf',
      'D:\\OneDrive\\Papers',
      'paper.pdf'
    ),
    /disk full/
  );
  assert.equal(calls, 1, 'non-collision errors must not retry numbered filenames');
}

async function testSha256Verification() {
  const { context, organizer } = makeContext();
  context.IOUtils.stat = async p => ({ size: 1234, lastModified: 1, type: 'regular' });
  context.IOUtils.computeHexDigest = async p => 'f'.repeat(64);
  const ok = await organizer._verifyCopiedFile('source.pdf', 'destination.pdf');
  assert.equal(ok.sha256, 'f'.repeat(64));

  context.IOUtils.computeHexDigest = async p => p.includes('source') ? 'a'.repeat(64) : 'b'.repeat(64);
  await assert.rejects(
    organizer._verifyCopiedFile('source.pdf', 'destination.pdf'),
    /SHA-256 differs/
  );
}

async function testNoteFailureDoesNotEraseOriginal() {
  const { context, organizer } = makeContext();
  organizer._capabilitiesOK = true;
  organizer._capabilityFailures = [];
  organizer._checkEligibility = async () => ({ ok: true });
  organizer.validateBaseDirectory = async () => 'D:\\Base';
  organizer._waitForFile = async () => 'C:\\Zotero\\storage\\paper.pdf';
  organizer._pathIsInside = () => false;
  organizer._buildDestinationDirectory = async () => 'D:\\Base\\My Library\\Test';
  organizer._buildFilename = async () => 'paper.pdf';
  organizer._copyToUniqueDestination = async () => 'D:\\Base\\My Library\\Test\\paper.pdf';
  organizer._verifyCopiedFile = async () => ({ sourceStat: { size: 100, lastModified: 0 } });
  organizer._prepareLinkedPath = p => p;
  organizer.getPref = (name, fallback) => fallback;

  let erased = false;
  let cleaned = false;
  const parent = {
    id: 2,
    isRegularItem: () => true,
    getNotes: () => [99],
  };
  const linkedItem = {
    id: 3,
    key: 'NEWKEY',
    save: async () => {},
    attachmentLinkMode: null,
    attachmentPath: null,
    dateAdded: null,
  };
  const item = {
    id: 1,
    key: 'OLDKEY',
    parentID: 2,
    parentItem: parent,
    dateAdded: '2026-09-10 00:00:00',
    clone: () => linkedItem,
    erase: async () => { erased = true; },
  };
  const note = { save: async () => {} };

  context.Zotero.Items.getAsync = async id => id === 2 ? parent : item;
  context.Zotero.Items.get = ids => [note];
  context.Zotero.Notes.replaceItemKey = () => { throw new Error('note migration failed'); };
  context.IOUtils.remove = async p => {
    if (p.endsWith('paper.pdf')) cleaned = true;
  };

  await assert.rejects(
    organizer.processAttachment(item, { quietSkip: true, autoTriggered: false }),
    /note migration failed/
  );
  assert.equal(erased, false, 'original stored attachment must not be erased');
  assert.equal(cleaned, true, 'external copy should be cleaned after rollback');
  assert.equal(organizer._busy.has(item.id), false, 'busy lock must be released');
}

(async () => {
  await testCapabilities();
  await testPathLengthGuard();
  await testNoOverwriteCollisionRetry();
  await testNonCollisionCopyFailureAborts();
  await testSha256Verification();
  await testNoteFailureDoesNotEraseOriginal();
  console.log('OK: organizer regression tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
