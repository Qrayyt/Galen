# Galen installer visual preview

Based on the Inno Setup shell techniques of [Windows Setup Shell](https://github.com/MrUmid2oo4/windows-setup-shell) (MIT; see LICENSE.upstream).

Second visual iteration: compact 680×420 client area, one monochrome surface, original Galen logo, restrained buttons and progress line. No app payload or real install. Options are illustrative only. The local timer drives three screens. No network calls, registry changes, shortcuts or application launch. 

Build on Windows with Inno Setup 6.6+ using `build.ps1`. The isolated branch CI compiles only this preview and commits the EXE under `out/`, not to a production release. The source of the original production installer is untouched.
