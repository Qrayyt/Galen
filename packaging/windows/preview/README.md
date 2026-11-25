# Galen installer UI preview

Adapted from [Windows Setup Shell](https://github.com/MrUmid2oo4/windows-setup-shell) (MIT, see LICENSE.upstream).
Isolated demonstration: uses no application payload and cannot enter the installation stage.
The three custom pages are driven by a local timer, not installation or network activity.
Options are visual only. No Galen process, shortcuts, registry entries, updates, or user data changes.
Only temporary bitmap extraction by Inno Setup. No production installer files changed.

Build on Windows with Inno Setup 6.6+:
```powershell
.\packaging\windows\preview\build.ps1
```
Output: out/Galen-Installer-Visual-Preview.exe. The CI workflow uploads the unsigned test EXE as an artifact, not a release.
