import EchoDomain
import PDFKit
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Web `PdfFirstPagePreview` — first PDF page as a fixed-width chat thumbnail.
struct EchoPDFFirstPageThumbnail: View {
  let sourceURL: String
  let baseURL: URL
  var storageKey: String? = nil
  var accessToken: String? = nil
  /// Web spoiler: blur + amber ring (no separate reveal on the thumb).
  var spoiler: Bool = false
  var width: CGFloat = EchoPDFThumbnailRenderer.thumbWidth

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var image: Image?
  @State private var failed = false

  var body: some View {
    ZStack {
      Group {
        if let image {
          image
            .resizable()
            .scaledToFit()
            .frame(width: width)
            .frame(maxHeight: 120)
            .clipped()
            .blur(radius: spoiler ? 8 : 0)
        } else if failed {
          placeholderBadge
        } else {
          ProgressView()
            .frame(width: width, height: 120)
        }
      }
      if spoiler, image != nil {
        Color.black.opacity(0.28)
          .frame(width: width, height: 120)
          .allowsHitTesting(false)
      }
    }
    .frame(width: width, height: 120)
    .background(Color(white: 0.16))
    .clipShape(RoundedRectangle(cornerRadius: 6))
    .overlay(
      RoundedRectangle(cornerRadius: 6)
        .stroke(
          spoiler ? Color.orange.opacity(0.7) : EchoTheme.Color.ink(0.14),
          lineWidth: spoiler ? 2 : 1)
    )
    .task(id: cacheKey) { await load() }
    .accessibilityLabel(EchoCopy.string("PDF preview"))
  }

  private var placeholderBadge: some View {
    Text(EchoCopy.string("PDF"))
      .font(.system(size: 10, weight: .bold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.55))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var cacheKey: String {
    let key = storageKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return key.isEmpty ? sourceURL : key
  }

  @MainActor
  private func load() async {
    if let cached = await EchoPDFThumbnailCache.shared.image(for: cacheKey) {
      image = cached
      return
    }
    guard
      let url = await EchoMediaURLResolver.resolve(
        source: sourceURL, baseURL: baseURL, storageKey: storageKey,
        accessToken: accessToken, auth: auth),
      EchoURLPolicy.isAllowedMediaURL(url, apiBaseURL: baseURL)
    else {
      failed = true
      return
    }
    guard let rendered = await EchoPDFThumbnailRenderer.render(from: url) else {
      failed = true
      return
    }
    await EchoPDFThumbnailCache.shared.insert(rendered, for: cacheKey)
    image = rendered
  }
}

enum EchoPDFThumbnailRenderer {
  static let thumbWidth: CGFloat = 232
  /// Match `EchoPDFViewer` so a hostile link cannot exhaust memory.
  private static let maxBytes = 64 * 1024 * 1024

  static func render(from url: URL) async -> Image? {
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
        data.count <= maxBytes
      else { return nil }
      return image(fromPDFData: data)
    } catch {
      return nil
    }
  }

  /// Pure PDFKit → SwiftUI Image (used by unit tests with fixture data).
  static func image(fromPDFData data: Data) -> Image? {
    guard data.count <= maxBytes,
      let document = PDFDocument(data: data),
      let page = document.page(at: 0)
    else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 0, bounds.height > 0 else { return nil }
    let scale = thumbWidth / bounds.width
    let size = CGSize(width: thumbWidth, height: max(1, bounds.height * scale))
    let thumb = page.thumbnail(of: size, for: .mediaBox)
    #if os(macOS)
      return Image(nsImage: thumb)
    #else
      return Image(uiImage: thumb)
    #endif
  }
}

/// In-memory SwiftUI `Image` cache keyed by storage key / URL.
@MainActor
final class EchoPDFThumbnailCache {
  static let shared = EchoPDFThumbnailCache()
  private var values: [String: Image] = [:]
  private var order: [String] = []
  private let maximumEntries = 48

  func image(for key: String) -> Image? { values[key] }

  func insert(_ image: Image, for key: String) {
    values[key] = image
    order.removeAll { $0 == key }
    order.append(key)
    while order.count > maximumEntries, let expired = order.first {
      order.removeFirst()
      values.removeValue(forKey: expired)
    }
  }

  func clear() {
    values.removeAll()
    order.removeAll()
  }
}
