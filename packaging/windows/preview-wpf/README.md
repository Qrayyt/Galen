# Galen installer visual preview V3

Standalone WPF UI demonstration, not Inno Setup. Uses the original Galen mark and icon embedded as resources. Three screens, compositor-driven progress and logo animations, asynchronous fade/slide transitions. Does not download, install, launch Galen, or change user settings. Close via X or Esc.

Targets .NET Framework 4.8, included with current Windows 10 and Windows 11, to keep the EXE compact and avoid a bundled runtime. No external app dependencies. On older systems the runtime must already be installed.

Build: `dotnet build GalenInstaller.csproj -c Release`. Optional `--smoke-test` runs the whole visual sequence and writes three PNGs next to the executable before exiting. Normal mode does not write these files. CI checks the three states and stores the EXE and images only in this demo branch. Production installer is unaffected.
