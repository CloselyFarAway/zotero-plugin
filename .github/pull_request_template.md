## Summary

Describe the change and why it is needed.

## Safety checklist

- [ ] Existing stored PDFs are never deleted before an external copy is verified.
- [ ] Failure paths preserve the original Zotero attachment whenever possible.
- [ ] Renames are previewed/confirmed and have a rollback path for Zotero DB failure.
- [ ] External deletion remains opt-in, permanent-delete-only, and root-bounded.
- [ ] Upgrading does not automatically rename/move/delete existing linked files.
- [ ] Group Library behavior remains safe.
- [ ] `python scripts/build.py` passes.
- [ ] `python scripts/check.py` passes.
- [ ] Manual test performed with a disposable Zotero item/folder.
