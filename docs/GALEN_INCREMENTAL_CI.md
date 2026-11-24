# Incremental Galen CI

Release candidates no longer depend on GitHub Actions artifact storage.

- Linux preflight validates source identity, localization, Python syntax and the affected frontend tests. Exact frontend tree evidence is reusable; no failed test is skipped.
- The Windows runner builds the frontend if its exact Windows cache is absent, then packages the application. No inter-job artifact upload or download is needed.
- OpenRealtime and the installer retain independent caches. Installer reuse is verified against SHA-256.
- The Windows runner publishes the installer and both SHA-256 files directly to GitHub Releases only after successful validation and packaging.
- A documentation-only candidate may reuse the previous published installer only when runtime inputs are unchanged.

Preview 3 candidate 2 (commit 5fc41f580a06bb3aa8b646689003647d4fd58093) passed all 570 frontend test files / 6216 tests and built the React bundle. Its release failed only at the artifact upload quota. The exact frontend tree 55bad89a0391dd5b02655843e8dd7dacd43cddc1 is recorded in .galen-frontend-tested from [that run](https://github.com/Qrayyt/Galen/actions/runs/45478952001).
