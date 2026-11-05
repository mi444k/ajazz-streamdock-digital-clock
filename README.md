# Digital Clock for AJAZZ Stream Dock

Current version: **0.1.3**. Independent community plugin by Weboff.

A 64 × 64 digital clock with orange geometric seven-segment time, weekday indicators and a white date on black. Press it to open any installed application discovered by the plugin.

## Features

- Local 24-hour HH:MM, Monday-first weekday indicators and DD.MM.
- Fresh date reads at aligned minute boundaries; wake refreshes immediately.
- Per-key application choice, with Apple Calendar as the default.
- Screen-key and pressable-knob support with a shared launch lock.

## Setup and workflow

Assign Digital Clock to a screen key or pressable knob. In its settings, choose Application to open, then Save application. The saved confirmation waits for AJAZZ settings readback. The chooser lists discovered applications, not only calendars. Apple Calendar is the backward-compatible default. Press the screen key or release the knob to open the selected application; rotation does not launch it.

The helper scans /Applications, /System/Applications and the current user's Applications directory, including their Utilities subdirectories. It supports the discovered outer app wrapper for iOS-on-Mac applications. Applications outside these scan locations are not listed.

## Privacy

The native helper reads application bundle metadata and launches only a freshly resolved catalog entry after checking its bundle identity. Saved settings contain an opaque application ID and display name, not an executable command or trusted path. No calendar contents, account data or clipboard are accessed. No external network service is used; the only socket is local AJAZZ. No user configuration or local app catalog is included.

## Troubleshooting

If only the default option appears, use Refresh list and check the status text. Version 0.1.3 fixes replies addressed to the action context when AJAZZ supplies a different inspector UUID. Restart AJAZZ after updating. An unavailable saved application stays visible until you choose a replacement; the plugin does not silently substitute another application. Saving must receive matching AJAZZ readback or times out visibly. A failed launch alerts without replaying it automatically.

The clock refreshes once per minute while visible. Manual clock or time-zone changes may take up to 60 seconds to appear; wake updates immediately. Hidden keys do not keep a clock timer running. There is no weather or temperature source.

## Development

From the plugin folder run `npm test`; no npm install is required. `npm run build:native` rebuilds the universal helper with Xcode command-line tools and the macOS SDK, targeting macOS 13 and applying an ad-hoc signature. Unit tests use synthetic catalogs and launch acknowledgements and do not open applications. Run `native/calendar-app-helper --list` for an explicit read-only native catalog check. This prints the applications installed on your own machine; review that output before sharing it.

## Download and installation

Download the plugin ZIP from [GitHub Releases](https://github.com/mi444k/ajazz-streamdock-digital-clock/releases). Extract it and copy the complete `com.weboff.digitalclock.sdPlugin` folder into:

```text
~/Library/Application Support/HotSpot/StreamDock/plugins/
```

Keep the folder name and its contents intact. Restart AJAZZ Stream Dock, find the plugin category, and drag its action onto the desired control. For an update, replace the runtime folder with AJAZZ closed; preserve your AJAZZ settings separately and never publish their backups. The repository also contains the plugin folder directly, so it can be copied manually without a release archive.

## Compatibility and verification limits

Requires macOS 13 or newer and AJAZZ's Node.js 20 plugin host. Development integration used AJAZZ Stream Dock 2.10.179.426 and an AKP03E revision 2. Other device models and host versions have not been exhaustively verified. The bundled helper contains arm64 and x86_64 code; native execution was verified on Apple Silicon, not Intel. The helper is ad-hoc signed and is not notarized; macOS security policy may require additional review before execution. Automated fake-transport tests and browser previews do not establish behavior on every physical key or knob. No Windows support is claimed.

## License and attribution

Project code is MIT-licensed, copyright 2026 Ilias Martis / Weboff. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Third-party dependencies retain their own rights. The supplied stock artwork is original MIT-licensed project artwork. This is an independent project and is not affiliated with or endorsed by AJAZZ.
