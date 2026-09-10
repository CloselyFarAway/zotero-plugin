## Summary

Describe the change and why it is needed.

## Safety checklist

- [ ] Existing stored PDFs are never deleted before an external copy is verified.
- [ ] Old stored attachments are not erased until the linked conversion transaction has committed.
- [ ] A post-commit cleanup failure never removes the verified external PDF.
- [ ] Failure paths preserve the original Zotero attachment whenever possible.
- [ ] Group Library behavior remains safe.
- [ ] `python scripts/build.py` passes.
- [ ] `python scripts/check.py` passes.
- [ ] Manual test performed with a disposable Zotero item/folder.
