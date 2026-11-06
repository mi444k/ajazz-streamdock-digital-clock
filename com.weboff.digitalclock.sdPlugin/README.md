# Digital Clock for AJAZZ Stream Dock

Current version: **0.2.0**. Independent community plugin by Weboff.

A 64 × 64 digital clock with orange geometric seven-segment time, weekday indicators and a white date on black. Press it to open any installed application discovered by the plugin.

## Features

- Local 24-hour HH:MM, Monday-first weekday indicators and DD.MM.
- Fresh date reads at aligned minute boundaries; wake refreshes immediately.
- Per-key application choice. Apple Calendar remains the macOS default; Windows requires an explicit application choice.
- Screen-key and pressable-knob support with a shared launch lock.

## Setup and workflow

Assign Digital Clock to a screen key or pressable knob. In its settings, choose Application to open, then Save application. The saved confirmation waits for AJAZZ settings readback. The chooser lists discovered applications, not only calendars. Apple Calendar is the backward-compatible macOS default. On Windows, choose an application explicitly. A saved Apple Calendar ID from a Mac is unavailable on Windows and is never silently replaced. Press the screen key or release the knob to open the selected application; rotation does not launch it.

The helper scans /Applications, /System/Applications and the current user's Applications directory, including their Utilities subdirectories. It supports the discovered outer app wrapper for iOS-on-Mac applications. Applications outside these scan locations are not listed. On Windows, the helper enumerates the Windows Shell AppsFolder catalog, including registered desktop and Store applications. Portable executables absent from that catalog are not listed.

## Privacy

The native helper reads installed-application metadata and launches only a freshly resolved catalog entry. macOS checks the bundle identity; Windows re-enumerates the Shell application catalog and invokes the exact matching item. A successful Windows response means the Shell accepted the launch dispatch; it does not prove an application window appeared. Saved settings contain an opaque application ID and display name, not an executable command or trusted path. No calendar contents, account data or clipboard are accessed. No external network service is used; the only socket is local AJAZZ. No user configuration or local app catalog is included.

## Troubleshooting

If only the default option appears, use Refresh list and check the status text. Version 0.1.3 fixes replies addressed to the action context when AJAZZ supplies a different inspector UUID. Restart AJAZZ after updating. An unavailable saved application stays visible until you choose a replacement; the plugin does not silently substitute another application. Saving must receive matching AJAZZ readback or times out visibly. A failed launch alerts without replaying it automatically.

The clock refreshes once per minute while visible. Manual clock or time-zone changes may take up to 60 seconds to appear; wake updates immediately. Hidden keys do not keep a clock timer running. There is no weather or temperature source.

## Development

From the plugin folder run `npm test`; no npm install is required. `npm run build:native` rebuilds the universal helper with Xcode command-line tools and the macOS SDK, targeting macOS 13 and applying an ad-hoc signature. Unit tests use synthetic catalogs and launch acknowledgements and do not open applications. Run `native/calendar-app-helper --list` for an explicit read-only native catalog check. This prints the applications installed on your own machine; review that output before sharing it.

On Windows, run `powershell -NoProfile -File scripts/build-windows.ps1` from the plugin folder to rebuild the Windows helper with the .NET Framework compiler. The standard Windows GitHub Actions workflow builds the same source and runs native engine tests before exporting a release helper. No PowerShell execution-policy changes are required by the plugin.

## Download and installation

Download the plugin ZIP from [GitHub Releases](https://github.com/mi444k/ajazz-streamdock-digital-clock/releases). Extract it and copy the complete `com.weboff.digitalclock.sdPlugin` folder into:

```text
~/Library/Application Support/HotSpot/StreamDock/plugins/
```

On Windows, copy the same complete plugin folder into the standard SDK location:

```text
%APPDATA%\HotSpot\StreamDock\plugins\
```

The exact vendor directory can differ between host editions; use your AJAZZ installation's plugin folder if it differs. The release ZIP includes both platform helpers.

Keep the folder name and its contents intact. Restart AJAZZ Stream Dock, find the plugin category, and drag its action onto the desired control. For an update, replace the runtime folder with AJAZZ closed; preserve your AJAZZ settings separately and never publish their backups. The repository also contains the plugin folder directly, so it can be copied manually without a release archive.

## Compatibility and verification limits

Requires Windows 10 or newer or macOS 13 or newer and AJAZZ's Node.js 20 plugin host. Standard Stream Dock screen keys and pressable knobs are supported across device families. Development device integration used AJAZZ Stream Dock 2.10.179.426 and an AKP03E revision 2 on macOS. Other models and host versions have not been exhaustively verified.

The macOS helper includes arm64 and x86_64 code; native execution was verified on Apple Silicon, not Intel. It is ad-hoc signed and not notarized. The Windows helper uses the Windows .NET Framework and is not Authenticode-signed. Windows automated build, native protocol and Node behavior checks are separate from real Windows AJAZZ/device acceptance, which has not been performed. Do not interpret simulated host or CI results as physical hardware verification.

## License and attribution

Project code is MIT-licensed, copyright 2026 Ilias Martis / Weboff. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Third-party dependencies retain their own rights. The supplied stock artwork is original MIT-licensed project artwork. This is an independent project and is not affiliated with or endorsed by AJAZZ.
