import Foundation
import CryptoKit
import AppKit

let maximumOutputBytes = 1_048_576
struct Application {
    let id: String
    let name: String
    let bundleId: String
    let path: String
    var value: [String: String] { ["id": id, "name": name, "bundleId": bundleId, "path": path] }
}
enum CatalogFailure: Error { case unavailable }
func validText(_ value: String, maximum: Int) -> Bool {
    value.utf16.count <= maximum && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !value.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 })
}
func applicationRoots() -> [URL] {
    [URL(fileURLWithPath: "/Applications"), URL(fileURLWithPath: "/System/Applications"),
     FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications")]
}
func trustedPath(_ path: String) -> Bool {
    path.hasPrefix("/") && validText(path, maximum: 4096) &&
        URL(fileURLWithPath: path).pathExtension.lowercased() == "app" &&
        applicationRoots().contains(where: { path.hasPrefix($0.path + "/") })
}
func application(_ url: URL) -> Application? {
    let canonical = url.standardizedFileURL.resolvingSymlinksInPath()
    guard trustedPath(canonical.path), let bundle = Bundle(url: canonical),
          let bundleId = bundle.bundleIdentifier, validText(bundleId, maximum: 256) else { return nil }
    // Bundle handles ordinary bundles and iOS-on-Mac WrappedBundle applications.
    let name = bundle.localizedInfoDictionary?["CFBundleDisplayName"] as? String ??
        bundle.object(forInfoDictionaryKey: "CFBundleName") as? String ??
        canonical.deletingPathExtension().lastPathComponent
    guard validText(name, maximum: 1024) else { return nil }
    let digest = SHA256.hash(data: Data((canonical.path + "\0" + bundleId).utf8))
    let id = digest.map { String(format: "%02x", $0) }.joined()
    return Application(id: id, name: name, bundleId: bundleId, path: canonical.path)
}
func catalog() throws -> [Application] {
    let files = FileManager.default
    var result: [Application] = [], seen = Set<String>()
    for root in applicationRoots() {
        for directory in [root, root.appendingPathComponent("Utilities")] {
            guard files.fileExists(atPath: directory.path) else { continue }
            let children: [URL]
            do { children = try files.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) }
            catch { throw CatalogFailure.unavailable }
            for child in children where child.pathExtension.lowercased() == "app" {
                guard let app = application(child), !seen.contains(app.id) else { continue }
                seen.insert(app.id); result.append(app)
                if result.count > 1024 { throw CatalogFailure.unavailable }
            }
        }
    }
    return result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
          data.count <= maximumOutputBytes else {
        FileHandle.standardOutput.write(Data("{\"type\":\"error\",\"code\":\"invalid_response\"}\n".utf8))
        return
    }
    FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
}
let arguments = Array(CommandLine.arguments.dropFirst())
if arguments == ["--list"] {
    do { emit(["type": "applications", "applications": try catalog().map(\.value)]) }
    catch { emit(["type": "error", "code": "unavailable"]) }
} else {
    guard arguments.count == 4, arguments[0] == "--open", arguments[2] == "--bundle-id",
          trustedPath(arguments[1]), URL(fileURLWithPath: arguments[1]).standardizedFileURL.path == arguments[1],
          validText(arguments[3], maximum: 256) else {
        emit(["type": "error", "code": "invalid_request"]); exit(0)
    }
    do {
        let applications = try catalog()
        guard let selected = applications.first(where: { $0.path == arguments[1] && $0.bundleId == arguments[3] }),
              let verified = application(URL(fileURLWithPath: selected.path)), verified.id == selected.id else {
            emit(["type": "error", "code": "missing_app"]); exit(0)
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            emit(["type": "error", "code": "open_failed"])
            exit(0)
        }
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: verified.path), configuration: configuration) { running, error in
            DispatchQueue.main.async {
                if error == nil, running?.bundleIdentifier == verified.bundleId {
                    emit(["type": "opened", "applicationId": verified.id])
                } else {
                    emit(["type": "error", "code": "open_failed"])
                }
                exit(0)
            }
        }
        CFRunLoopRun()
    } catch {
        emit(["type": "error", "code": "unavailable"])
    }
}
