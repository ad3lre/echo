import Observation
import Photos
import SwiftUI

#if os(iOS)
  import UIKit
  typealias EchoPlatformImage = UIImage
#else
  import AppKit
  typealias EchoPlatformImage = NSImage
#endif

@MainActor
@Observable
final class EchoComposerPhotoLibrary {
  struct Item: Identifiable {
    let id: String
    let asset: PHAsset
    var thumbnail: EchoPlatformImage?
  }

  private(set) var items: [Item] = []
  private(set) var authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
  private(set) var isLoading = false
  private let imageManager = PHCachingImageManager()

  func load() async {
    if authorizationStatus == .notDetermined {
      authorizationStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    }
    guard authorizationStatus == .authorized || authorizationStatus == .limited else { return }
    guard items.isEmpty else { return }
    isLoading = true
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = 72
    let results = PHAsset.fetchAssets(with: .image, options: options)
    var loaded: [Item] = []
    results.enumerateObjects { asset, _, _ in
      loaded.append(Item(id: asset.localIdentifier, asset: asset, thumbnail: nil))
    }
    items = loaded
    isLoading = false
    for index in items.indices { requestThumbnail(at: index) }
  }

  func composerAsset(for item: Item) async throws -> EchoComposerAsset {
    let options = PHImageRequestOptions()
    options.isNetworkAccessAllowed = true
    options.deliveryMode = .highQualityFormat
    return try await withCheckedThrowingContinuation { continuation in
      imageManager.requestImageDataAndOrientation(for: item.asset, options: options) {
        data, uti, _, info in
        if let error = info?[PHImageErrorKey] as? Error {
          continuation.resume(throwing: error)
        } else if let data {
          let mimeType = Self.mimeType(for: uti)
          let extensionName = mimeType == "image/png" ? "png" : "jpg"
          continuation.resume(
            returning: EchoComposerAsset(
              data: data,
              filename: "Photo-\(UUID().uuidString.prefix(8)).\(extensionName)",
              mimeType: mimeType,
              kind: "image"))
        } else {
          continuation.resume(throwing: CocoaError(.fileReadUnknown))
        }
      }
    }
  }

  private func requestThumbnail(at index: Int) {
    let id = items[index].id
    imageManager.requestImage(
      for: items[index].asset,
      targetSize: CGSize(width: 240, height: 240),
      contentMode: .aspectFill,
      options: nil
    ) { [weak self] image, _ in
      Task { @MainActor in
        guard let self, let currentIndex = self.items.firstIndex(where: { $0.id == id }) else {
          return
        }
        self.items[currentIndex].thumbnail = image
      }
    }
  }

  nonisolated private static func mimeType(for uti: String?) -> String {
    guard let uti else { return "image/jpeg" }
    if uti.localizedCaseInsensitiveContains("png") { return "image/png" }
    if uti.localizedCaseInsensitiveContains("heic") { return "image/heic" }
    return "image/jpeg"
  }
}

struct EchoComposerPhotoThumbnail: View {
  let image: EchoPlatformImage?

  var body: some View {
    Group {
      if let image {
        #if os(iOS)
          Image(uiImage: image)
            .resizable()
        #else
          Image(nsImage: image)
            .resizable()
        #endif
      } else {
        Rectangle().fill(.white.opacity(0.06)).overlay { ProgressView().tint(.white.opacity(0.5)) }
      }
    }
    .scaledToFill()
    .clipped()
  }
}
