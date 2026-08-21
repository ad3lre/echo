import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

struct EchoRemoteImage<Placeholder: View>: View {
  let url: URL
  @ViewBuilder let placeholder: () -> Placeholder
  @StateObject private var loader = EchoImageLoader()

  var body: some View {
    Group {
      if let image = loader.image {
        image.resizable().scaledToFill()
      } else {
        placeholder().overlay {
          if loader.isLoading {
            ProgressView().tint(.white.opacity(0.55))
          }
        }
      }
    }
    .task(id: url) {
      loader.load(url: url)
    }
  }
}

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
