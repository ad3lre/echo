import CoreGraphics
import Foundation
import Testing

@testable import EchoFeatures

@MainActor
@Suite("Skriggles canvas")
struct EchoSkrigglesCanvasTests {
  @Test func floodFillPaintsConnectedWhiteRegion() {
    let canvas = EchoSkrigglesCanvasModel()
    canvas.wipe()
    canvas.color = "#ef4444"
    canvas.tapFill(at: CGPoint(x: 400, y: 300))
    #expect(canvas.preview != nil)
    // Center pixel should be the fill color after a full-board white fill.
    let pixel = sample(canvas.preview!, x: 400, y: 300)
    #expect(pixel.r > 200 && pixel.g < 100 && pixel.b < 100)
  }

  @Test func ingestFillCommandAppliesPeerFloodFill() {
    let canvas = EchoSkrigglesCanvasModel()
    canvas.reset(roundSeq: 3)
    let payload: [String: Any] = [
      "type": "canvas_cmd",
      "fromUserId": "peer",
      "roundSeq": 3,
      "payload": [
        "cmd": "fill", "x": 10, "y": 10, "color": "#3b82f6",
      ],
    ]
    let data = try! JSONSerialization.data(withJSONObject: payload)
    canvas.ingest(data, selfID: "me")
    let pixel = sample(canvas.preview!, x: 10, y: 10)
    #expect(pixel.b > 200 && pixel.r < 100)
  }

  @Test func ingestSnapshotClearsStrokesAndShowsPNG() {
    let canvas = EchoSkrigglesCanvasModel()
    canvas.reset(roundSeq: 1)
    canvas.tool = .pen
    canvas.begin(at: CGPoint(x: 5, y: 5))
    canvas.end()
    #expect(!canvas.strokes.isEmpty)

    // 1×1 red PNG.
    let pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    let payload: [String: Any] = [
      "type": "canvas_snapshot",
      "fromUserId": "peer",
      "roundSeq": 1,
      "payload": ["pngBase64": pngBase64],
    ]
    canvas.ingest(try! JSONSerialization.data(withJSONObject: payload), selfID: "me")
    #expect(canvas.strokes.isEmpty)
    #expect(canvas.preview != nil)
  }

  private func sample(_ image: CGImage, x: Int, y: Int) -> (r: Int, g: Int, b: Int) {
    guard let cropped = image.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)) else {
      return (0, 0, 0)
    }
    var pixel = [UInt8](repeating: 0, count: 4)
    let ctx = CGContext(
      data: &pixel,
      width: 1,
      height: 1,
      bitsPerComponent: 8,
      bytesPerRow: 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    return (Int(pixel[0]), Int(pixel[1]), Int(pixel[2]))
  }
}
