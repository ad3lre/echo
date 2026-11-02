import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

struct EchoRemoteImage<Placeholder: View>: View {
  let url: URL
  var contentMode: ContentMode = .fill
  var maxPixelSize: CGFloat = 1024
  @ViewBuilder let placeholder: () -> Placeholder
  @StateObject private var loader = EchoImageLoader()

  var body: some View {
    let painted = loader.bitmap ?? EchoDecodedImageCache.shared.bitmap(for: url)
    ZStack {
      if let bitmap = painted {
        paintedImage(bitmap)
      } else {
        placeholder()
      }
      // Never animate the spinner away — otherwise it can linger ~¼–½s after
      // the bitmap is already on screen (macOS ProgressView + implicit fades).
      if painted == nil, loader.isLoading {
        ProgressView()
          .tint(EchoTheme.Color.ink(0.55))
          .transaction { $0.animation = nil }
      }
    }
    .transaction { $0.animation = nil }
    .animation(nil, value: painted != nil)
    .animation(nil, value: loader.isLoading)
    .task(id: url) {
      loader.maxPixelSize = maxPixelSize
      loader.load(url: url)
    }
  }

  @ViewBuilder
  private func paintedImage(_ bitmap: EchoDecodedBitmap) -> some View {
    #if os(iOS)
      if bitmap.isAnimated {
        EchoAnimatedUIImage(image: bitmap.uiImage, contentMode: contentMode)
      } else {
        bitmap.image.resizable().aspectRatio(contentMode: contentMode)
      }
    #else
      bitmap.image.resizable().aspectRatio(contentMode: contentMode)
    #endif
  }
}

#if os(iOS)
  /// SwiftUI `Image(uiImage:)` only shows the first frame of an animated UIImage.
  private struct EchoAnimatedUIImage: UIViewRepresentable {
    let image: UIImage
    var contentMode: ContentMode = .fill

    func makeUIView(context: Context) -> UIImageView {
      let view = UIImageView()
      view.clipsToBounds = true
      view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
      view.setContentHuggingPriority(.defaultLow, for: .horizontal)
      view.setContentHuggingPriority(.defaultLow, for: .vertical)
      apply(to: view)
      return view
    }

    func updateUIView(_ uiView: UIImageView, context: Context) {
      apply(to: uiView)
    }

    private func apply(to view: UIImageView) {
      view.image = image
      view.contentMode = contentMode == .fit ? .scaleAspectFit : .scaleAspectFill
      if image.images != nil {
        view.startAnimating()
      }
    }
  }
#endif

struct EchoDataURL {
  let mimeType: String
  let data: Data

  init?(_ value: String?) {
    guard let value, value.lowercased().hasPrefix("data:") else { return nil }
    let parts = value.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
    guard parts.count == 2 else { return nil }
    let metadata = String(parts[0]).dropFirst(5)
    let metadataParts = metadata.split(separator: ";")
    guard let mimeType = metadataParts.first, !mimeType.isEmpty else { return nil }
    let payload = String(parts[1])
    let data: Data?
    if metadataParts.contains("base64") {
      data = Data(base64Encoded: payload)
    } else {
      data = payload.removingPercentEncoding?.data(using: .utf8)
    }
    guard let data else { return nil }
    self.mimeType = String(mimeType).lowercased()
    self.data = data
  }
}

func platformImage(_ data: Data) -> Image? {
  #if os(iOS)
    if let image = UIImage(data: data) { Image(uiImage: image) } else { nil }
  #elseif os(macOS)
    if let image = NSImage(data: data) { Image(nsImage: image) } else { nil }
  #else
    nil
  #endif
}
