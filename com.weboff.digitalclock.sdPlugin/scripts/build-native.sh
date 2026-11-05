#!/bin/bash
set -euo pipefail
plugin_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
native_build_tmp="$(mktemp -d "${TMPDIR:-/tmp}/digital-clock-native.XXXXXX")"
trap 'rm -rf "$native_build_tmp"' EXIT
for native_arch in arm64 x86_64; do
  xcrun --sdk macosx swiftc -O -target "${native_arch}-apple-macosx13.0" \
    -module-cache-path "$native_build_tmp/module-cache" \
    "$plugin_root/native/CalendarAppHelper.swift" -o "$native_build_tmp/helper-$native_arch"
done
lipo -create "$native_build_tmp/helper-arm64" "$native_build_tmp/helper-x86_64" \
  -output "$native_build_tmp/calendar-app-helper"
codesign --force --sign - --timestamp=none "$native_build_tmp/calendar-app-helper"
lipo "$native_build_tmp/calendar-app-helper" -verify_arch arm64
lipo "$native_build_tmp/calendar-app-helper" -verify_arch x86_64
cp "$native_build_tmp/calendar-app-helper" "$plugin_root/native/calendar-app-helper"
chmod 755 "$plugin_root/native/calendar-app-helper"
