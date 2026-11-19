# Incremental Galen CI

The preview pipeline keys every reusable output by the files that can affect it.
An exact cache hit is reused; fallback or partial keys are deliberately not used.

- Frontend tests run only when frontend inputs changed and that exact input hash
  has not already passed. The verified `dist` bundle is passed to Windows, so
  React is not built twice in one release.
- OpenRealtime is cached independently by its Go source hash.
- The Windows installer is cached by the complete runtime/package input hash.
- A release-note, workflow, or documentation-only candidate reuses the current
  published installer after confirming runtime inputs are unchanged.
- The smoke workflow skips its frontend job when a release candidate changed,
  because the release workflow owns that validation for the same commit.

Python identity and release-contract validation stays intentionally fast and
runs on every push. Cache entries are saved only after their producing job has
completed successfully, and every reused installer is checked against its
published SHA-256 file before upload.
