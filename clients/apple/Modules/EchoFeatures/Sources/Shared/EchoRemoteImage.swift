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
  @ViewBuilder let placeholder: () -> Placeholder
  @StateObject private var loader = EchoImageLoader()

  var body: some View {
    Group {
      if let bitmap = loader.bitmap {
        #if os(iOS)
          if bitmap.isAnimated {
            EchoAnimatedUIImage(image: bitmap.uiImage, contentMode: contentMode)
          } else {
            bitmap.image.resizable().aspectRatio(contentMode: contentMode)
          }
        #else
          bitmap.image.resizable().aspectRatio(contentMode: contentMode)
        #endif
      } else {
        placeholder().overlay {
          if loader.isLoading {
            ProgressView().tint(EchoTheme.Color.ink(0.55))
          }
        }
      }
    }
    .task(id: url) {
      loader.load(url: url)
    }
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
