import EchoDomain
import Foundation
import Observation
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

/// Drawing surface for Skriggles (web `useSkrigglesCanvas` + `VcSkrigglesCanvas`).
/// Strokes + flood fills share an 800×600 RGBA buffer so Apple and web peers stay in sync.
@MainActor
@Observable
final class EchoSkrigglesCanvasModel {
  enum Tool: String, CaseIterable {
    case pen, eraser, fill
  }

  struct Stroke: Identifiable, Equatable {
    let id: Int
    let color: String
    let width: CGFloat
    let eraser: Bool
    var points: [CGPoint]
  }

  static let size = CGSize(width: 800, height: 600)
  static let width = 800
  static let height = 600
  static let palette = [
    "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6",
    "#ec4899", "#78716c",
  ]
  static let brushes: [CGFloat] = [2, 4, 8, 14, 22]

  private(set) var strokes: [Stroke] = []
  /// Live bitmap preview for the SwiftUI view (web top-left space).
  private(set) var preview: CGImage?
  var color = palette[0]
  var brush: CGFloat = brushes[1]
  var tool: Tool = .pen

  @ObservationIgnored var publish: ((String, [String: any Sendable]) -> Void)?
  @ObservationIgnored private var roundSeq = -1
  @ObservationIgnored private var nextStrokeID = 0
  @ObservationIgnored private var cmdSeq = 0
  @ObservationIgnored private var lastFlush = Date.distantPast
  /// Bottom-left-first RGBA buffer (CG layout). Flood fill remaps web y → row.
  @ObservationIgnored private var pixels = [UInt8]()

  var eraser: Bool {
    get { tool == .eraser }
    set { tool = newValue ? .eraser : .pen }
  }

  func reset(roundSeq: Int) {
    guard roundSeq != self.roundSeq else { return }
    self.roundSeq = roundSeq
    strokes = []
    nextStrokeID = 0
    cmdSeq = 0
    clearSurface()
  }

  /// Drops local strokes without publishing (new word pick / round).
  func wipe() {
    strokes = []
    clearSurface()
  }

  // MARK: Drawer input (view space → 800×600)

  func tapFill(at point: CGPoint) {
    floodFill(at: point, hex: color)
    cmdSeq += 1
    publish?(
      "canvas_cmd",
      [
        "v": 1, "t": "skriggles_canvas_cmd", "roundSeq": roundSeq, "cmd": "fill", "seq": cmdSeq,
        "x": Double(point.x), "y": Double(point.y), "color": color,
      ])
  }

  func begin(at point: CGPoint) {
    guard tool != .fill else {
      tapFill(at: point)
      return
    }
    nextStrokeID += 1
    let stroke = Stroke(
      id: nextStrokeID, color: color, width: brush, eraser: tool == .eraser, points: [point])
    strokes.append(stroke)
    drawStrokeSegment(stroke, from: 0)
    flush(force: true)
  }

  func extend(to point: CGPoint) {
    guard tool != .fill, !strokes.isEmpty else { return }
    let index = strokes.count - 1
    let from = max(0, strokes[index].points.count - 1)
    strokes[index].points.append(point)
    drawStrokeSegment(strokes[index], from: from)
    flush(force: false)
  }

  func end() {
    guard tool != .fill else { return }
    flush(force: true)
  }

  func clear() {
    strokes = []
    clearSurface()
    command("clear")
  }

  func undo() {
    guard !strokes.isEmpty else { return }
    strokes.removeLast()
    redrawAllStrokes()
    command("undo")
  }

  private func command(_ name: String) {
    cmdSeq += 1
    publish?(
      "canvas_cmd",
      ["v": 1, "t": "skriggles_canvas_cmd", "roundSeq": roundSeq, "cmd": name, "seq": cmdSeq])
  }

  /// Sends the stroke so far (cumulative, the shape the web receiver expects), at ~20 Hz.
  private func flush(force: Bool) {
    guard let stroke = strokes.last, let publish else { return }
    let now = Date()
    guard force || now.timeIntervalSince(lastFlush) > 0.05 else { return }
    lastFlush = now
    let flat: [Double] = stroke.points.flatMap { [Double($0.x), Double($0.y)] }
    publish(
      "stroke_batch",
      [
        "v": 1, "t": "skriggles_stroke_batch", "roundSeq": roundSeq, "strokeId": stroke.id,
        "color": stroke.color, "width": Double(stroke.width),
        "tool": stroke.eraser ? "eraser" : "pen", "points": flat,
      ])
  }

  // MARK: Viewer ingest (`game:event`, kind `relay`)

  func ingest(_ data: Data, selfID: String) {
    guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let type = object["type"] as? String,
      (object["fromUserId"] as? String).map({ !EchoUserIdentity.matches($0, selfID) }) ?? true,
      (object["roundSeq"] as? Int).map({ $0 == roundSeq }) ?? true
    else { return }
    switch type {
    case "stroke_batch":
      guard let payload = object["payload"] as? [String: Any] else { return }
      applyBatch(payload)
    case "canvas_cmd":
      guard let payload = object["payload"] as? [String: Any] else { return }
      switch payload["cmd"] as? String {
      case "clear":
        strokes = []
        clearSurface()
      case "undo":
        if !strokes.isEmpty {
          strokes.removeLast()
          redrawAllStrokes()
        }
      case "fill":
        let x = (payload["x"] as? NSNumber)?.doubleValue ?? 0
        let y = (payload["y"] as? NSNumber)?.doubleValue ?? 0
        floodFill(at: CGPoint(x: x, y: y), hex: payload["color"] as? String ?? "#000000")
      default: break
      }
    case "canvas_snapshot":
      applySnapshot(object["payload"] as? [String: Any] ?? object)
    default: break
    }
  }

  private func applyBatch(_ batch: [String: Any]) {
    guard let id = (batch["strokeId"] as? NSNumber)?.intValue,
      let raw = batch["points"] as? [NSNumber], raw.count >= 2
    else { return }
    let points = stride(from: 0, to: raw.count - 1, by: 2).map {
      CGPoint(x: raw[$0].doubleValue, y: raw[$0 + 1].doubleValue)
    }
    if let index = strokes.firstIndex(where: { $0.id == id }) {
      let existing = strokes[index].points
      let cumulative =
        points.count >= existing.count && Array(points.prefix(existing.count)) == existing
      let from = max(0, existing.count - 1)
      strokes[index].points += cumulative ? Array(points.dropFirst(existing.count)) : points
      drawStrokeSegment(strokes[index], from: from)
      return
    }
    let stroke = Stroke(
      id: id, color: batch["color"] as? String ?? "#000000",
      width: CGFloat((batch["width"] as? NSNumber)?.doubleValue ?? 4),
      eraser: (batch["tool"] as? String) == "eraser", points: points)
    strokes.append(stroke)
    drawStrokeSegment(stroke, from: 0)
  }

  private func applySnapshot(_ payload: [String: Any]) {
    let raw = (payload["pngBase64"] as? String)
      ?? (payload["payload"] as? [String: Any])?["pngBase64"] as? String
    guard let raw, let data = Data(base64Encoded: raw),
      let image = EchoSkrigglesRaster.decodePNG(data)
    else { return }
    strokes = []
    ensurePixels()
    withContext { ctx in
      ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
      ctx.fill(CGRect(x: 0, y: 0, width: Self.width, height: Self.height))
      ctx.interpolationQuality = .high
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: Self.width, height: Self.height))
    }
    publishPreview()
  }

  // MARK: Raster

  private func ensurePixels() {
    let count = Self.width * Self.height * 4
    if pixels.count != count {
      pixels = [UInt8](repeating: 255, count: count)
    }
  }

  private func clearSurface() {
    ensurePixels()
    withContext { ctx in
      ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
      ctx.fill(CGRect(x: 0, y: 0, width: Self.width, height: Self.height))
    }
    publishPreview()
  }

  private func redrawAllStrokes() {
    clearSurface()
    for stroke in strokes { drawStrokeSegment(stroke, from: 0) }
  }

  private func drawStrokeSegment(_ stroke: Stroke, from: Int) {
    ensurePixels()
    guard !stroke.points.isEmpty else { return }
    withContext { ctx in
      let cg = stroke.eraser
        ? CGColor(red: 1, green: 1, blue: 1, alpha: 1) : Self.cgColor(stroke.color)
      ctx.setStrokeColor(cg)
      ctx.setFillColor(cg)
      ctx.setLineCap(.round)
      ctx.setLineJoin(.round)
      ctx.setLineWidth(stroke.width)
      if stroke.points.count == 1 {
        let p = stroke.points[0]
        let r = stroke.width / 2
        ctx.fillEllipse(
          in: CGRect(x: p.x - r, y: p.y - r, width: stroke.width, height: stroke.width))
      } else {
        let start = min(max(from, 0), stroke.points.count - 1)
        ctx.beginPath()
        ctx.move(to: stroke.points[start])
        for p in stroke.points.suffix(from: start + 1) { ctx.addLine(to: p) }
        ctx.strokePath()
      }
    }
    publishPreview()
  }

  private func floodFill(at point: CGPoint, hex: String) {
    ensurePixels()
    let fx = Int(point.x.rounded(.down))
    let fy = Int(point.y.rounded(.down))
    guard fx >= 0, fy >= 0, fx < Self.width, fy < Self.height, let fill = Self.rgba(hex) else {
      return
    }
    func offset(_ x: Int, _ y: Int) -> Int { ((Self.height - 1 - y) * Self.width + x) * 4 }
    let o0 = offset(fx, fy)
    let target = (pixels[o0], pixels[o0 + 1], pixels[o0 + 2], pixels[o0 + 3])
    if target == fill { return }
    var stack = [(fx, fy)]
    var visited = [UInt8](repeating: 0, count: Self.width * Self.height)
    while let (x, y) = stack.popLast() {
      let idx = y * Self.width + x
      if visited[idx] != 0 { continue }
      visited[idx] = 1
      let o = offset(x, y)
      let current = (pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])
      guard current == target else { continue }
      pixels[o] = fill.0
      pixels[o + 1] = fill.1
      pixels[o + 2] = fill.2
      pixels[o + 3] = fill.3
      if x > 0 { stack.append((x - 1, y)) }
      if x < Self.width - 1 { stack.append((x + 1, y)) }
      if y > 0 { stack.append((x, y - 1)) }
      if y < Self.height - 1 { stack.append((x, y + 1)) }
    }
    publishPreview()
  }

  /// Temporary CGContext over `pixels` with web top-left coordinates.
  private func withContext(_ body: (CGContext) -> Void) {
    pixels.withUnsafeMutableBytes { raw in
      guard let base = raw.baseAddress,
        let ctx = CGContext(
          data: base,
          width: Self.width,
          height: Self.height,
          bitsPerComponent: 8,
          bytesPerRow: Self.width * 4,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return }
      ctx.translateBy(x: 0, y: CGFloat(Self.height))
      ctx.scaleBy(x: 1, y: -1)
      body(ctx)
    }
  }

  private func publishPreview() {
    ensurePixels()
    preview = pixels.withUnsafeMutableBytes { raw -> CGImage? in
      guard let base = raw.baseAddress,
        let ctx = CGContext(
          data: base,
          width: Self.width,
          height: Self.height,
          bitsPerComponent: 8,
          bytesPerRow: Self.width * 4,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else { return nil }
      return ctx.makeImage()
    }
  }

  private static func rgba(_ hex: String) -> (UInt8, UInt8, UInt8, UInt8)? {
    let raw = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard let value = UInt32(raw, radix: 16) else { return nil }
    if raw.count == 3 {
      let r = UInt8((value >> 8) & 0xF) * 17
      let g = UInt8((value >> 4) & 0xF) * 17
      let b = UInt8(value & 0xF) * 17
      return (r, g, b, 255)
    }
    guard raw.count == 6 else { return nil }
    return (
      UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF), 255
    )
  }

  private static func cgColor(_ hex: String) -> CGColor {
    guard let rgba = rgba(hex) else { return CGColor(red: 0, green: 0, blue: 0, alpha: 1) }
    return CGColor(
      red: CGFloat(rgba.0) / 255, green: CGFloat(rgba.1) / 255, blue: CGFloat(rgba.2) / 255,
      alpha: 1)
  }
}

enum EchoSkrigglesRaster {
  static func decodePNG(_ data: Data) -> CGImage? {
    #if canImport(UIKit)
      return UIImage(data: data)?.cgImage
    #elseif canImport(AppKit)
      guard let image = NSImage(data: data) else { return nil }
      var rect = NSRect(origin: .zero, size: image.size)
      return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
    #else
      return nil
    #endif
  }
}

struct EchoSkrigglesCanvasView: View {
  var model: EchoSkrigglesCanvasModel
  let canDraw: Bool

  var body: some View {
    GeometryReader { proxy in
      let scale = proxy.size.width / EchoSkrigglesCanvasModel.size.width
      ZStack {
        Color.white
        if let preview = model.preview {
          Image(decorative: preview, scale: 1)
            .resizable()
            .interpolation(.high)
        }
      }
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { drag in
            guard canDraw else { return }
            let point = CGPoint(
              x: min(max(drag.location.x / scale, 0), EchoSkrigglesCanvasModel.size.width),
              y: min(max(drag.location.y / scale, 0), EchoSkrigglesCanvasModel.size.height))
            if model.tool == .fill {
              if !fillArmed { return }
              fillArmed = false
              model.tapFill(at: point)
              return
            }
            if strokeActive {
              model.extend(to: point)
            } else {
              strokeActive = true
              model.begin(at: point)
            }
          }
          .onEnded { _ in
            guard canDraw else { return }
            if model.tool == .fill {
              fillArmed = true
              return
            }
            strokeActive = false
            model.end()
          }
      )
    }
    .aspectRatio(4.0 / 3.0, contentMode: .fit)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .onAppear {
      if model.preview == nil { model.wipe() }
    }
  }

  @State private var strokeActive = false
  @State private var fillArmed = true
}

extension Color {
  /// `#rrggbb` palette entries only (the web palette); falls back to black.
  init(echoHex hex: String) {
    let raw = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    let value = UInt32(raw, radix: 16) ?? 0
    self.init(
      .sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255, opacity: 1)
  }
}
