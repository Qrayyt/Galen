# Galen Windows installer shell

The approved V3 WPF interface is now the front end for the production Inno Setup engine. No demo timer or fake completion is shipped.

- Double-click: WPF interface, embedded engine runs with /VERYSILENT /SUPPRESSMSGBOXES /NORESTART. Percentages come from Inno's CurInstallProgressChanged; 100% and the success screen require exit code 0. Extraction shows preparation without an invented percentage. Finish opens the actual installed launcher if it is available.
- Параметры установки: opens the original interactive Inno wizard for directory, install scope, shortcuts and PATH.
- Any command-line arguments: no WPF window; all arguments are forwarded to Inno with Windows quoting and the exit code is propagated. Existing updater flags and logging are preserved. Inno's /SILENT may still show its native progress window; /VERYSILENT does not.
- During a real install the WPF close action is disabled to avoid interrupting file replacement. Use the original wizard for interactive cancellation/options.
- The original Inno AppId, tasks, data preservation, migration, and relaunch logic are retained. The wrapper itself does not modify the registry or PATH.
- build.ps1 builds the WPF PE and Inno EXE, streams them into one Galen-Setup-x64.exe with a length/hash footer and publishes only the outer file. The release pipeline hashes that file. The wrapper verifies the embedded engine before executing it. Authenticode signing, if configured later, must occur AFTER combining.
- Windows 10/11 x64 with .NET Framework 4.8 or newer; build requires .NET SDK 8 and the 4.8 targeting pack. Extraction requires additional temporary disk space approximately equal to the compressed installer; the extracted engine is deleted after exit. Failure logs are kept where available.

## First authorized build verification

1. Build the production package and verify combined PE and SHA256; verify WPF launch and original logo.
2. Fresh install on disposable Windows VM; progress advances only from backend; verify executable, launch, PATH and uninstall.
3. Upgrade an existing installation using /SILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART /RELAUNCH=1 /WAITPID=... /LOG=...; check real exit code, relaunch, unchanged user data and update logs.
4. Check advanced install directory/scope/task options, cancelled install, corrupted embedded bytes, and forced backend failure. Confirm no false success.
5. Verify release/website continues to serve Galen-Setup-x64.exe and the checksum of the combined executable.

No production build or live installation was executed when integrating this change.
