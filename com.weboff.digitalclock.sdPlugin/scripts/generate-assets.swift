import Foundation
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()
let images = root.appendingPathComponent("images")
try FileManager.default.createDirectory(at: images, withIntermediateDirectories: true)
func image(_ size: Int, _ name: String, draw: (NSRect) -> Void) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    draw(NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: images.appendingPathComponent(name))
}
func clockIcon(_ bounds: NSRect) {
    let transform = NSAffineTransform(); transform.scale(by: bounds.width / 128); transform.concat()
    NSColor.white.setStroke(); NSColor.white.setFill()
    let circle = NSBezierPath(ovalIn: NSRect(x: 16, y: 16, width: 96, height: 96)); circle.lineWidth = 7; circle.stroke()
    let hands = NSBezierPath(); hands.lineWidth = 7; hands.lineCapStyle = .round
    hands.move(to: NSPoint(x: 64, y: 89)); hands.line(to: NSPoint(x: 64, y: 64)); hands.line(to: NSPoint(x: 85, y: 53)); hands.stroke()
    for angle in [0.0, Double.pi / 2, Double.pi, 3 * Double.pi / 2] {
        let mark = NSBezierPath(); mark.lineWidth = 4
        mark.move(to: NSPoint(x: 64 + cos(angle) * 37, y: 64 + sin(angle) * 37))
        mark.line(to: NSPoint(x: 64 + cos(angle) * 42, y: 64 + sin(angle) * 42)); mark.stroke()
    }
}
try image(128, "icon.png", draw: clockIcon)
try image(48, "category.png", draw: clockIcon)
try image(40, "action.png", draw: clockIcon)
try image(64, "idle.png") { bounds in
    NSColor.black.setFill()
    NSBezierPath(rect: bounds).fill()
    NSColor(srgbRed: 1, green: 148/255, blue: 28/255, alpha: 1).setFill()
    for x in [3, 17, 37, 51] { NSBezierPath(roundedRect: NSRect(x: x, y: 30, width: 10, height: 3), xRadius: 1, yRadius: 1).fill() }
    for y in [27, 37] { NSBezierPath(ovalIn: NSRect(x: 31, y: y, width: 2, height: 2)).fill() }
    NSColor.white.setFill()
    for x in [18, 25, 34, 41] { NSBezierPath(rect: NSRect(x: x, y: 8, width: 5, height: 1)).fill() }
    NSBezierPath(ovalIn: NSRect(x: 31, y: 4, width: 1, height: 1)).fill()
}
