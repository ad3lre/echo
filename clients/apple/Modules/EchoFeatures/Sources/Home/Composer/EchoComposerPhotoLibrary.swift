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
  private var requestedIDs = Set<String>()
  /// ~120pt cell at 2x — enough for the composer grid without decoding full assets.
  private let thumbnailSize = CGSize(width: 240, height: 240)

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
    // Warm the first screen of cells only; the rest load on appear.
    prefetchThumbnails(around: 0, window: 16)
  }

  func ensureThumbnail(for itemID: String) {
    guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
    requestThumbnail(at: index)
  }

  func prefetchThumbnails(around index: Int, window: Int = 12) {
    guard !items.isEmpty else { return }
    let lower = max(0, index - window / 2)
    let upper = min(items.count - 1, index + window / 2)
    let slice = Array(items[lower...upper].map(\.asset))
    imageManager.startCachingImages(
      for: slice,
      targetSize: thumbnailSize,
      contentMode: .aspectFill,
      options: nil
    )
    for i in lower...upper {
      requestThumbnail(at: i)
    }
  }

  func openSystemPhotoSettings() {
    #if os(iOS)
      guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
      UIApplication.shared.open(url)
    #else
      if let url = URL(
        string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Photos")
      {
        NSWorkspace.shared.open(url)
      }
    #endif
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
    guard items.indices.contains(index) else { return }
    let id = items[index].id
    guard requestedIDs.insert(id).inserted else { return }
    let options = PHImageRequestOptions()
    options.deliveryMode = .opportunistic
    options.resizeMode = .fast
    options.isNetworkAccessAllowed = true
    imageManager.requestImage(
      for: items[index].asset,
      targetSize: thumbnailSize,
      contentMode: .aspectFill,
      options: options
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

struct EchoComposerPhotoLibraryPane: View {
  @Bindable var photos: EchoComposerPhotoLibrary
  let onChoose: (EchoComposerPhotoLibrary.Item) -> Void

  var body: some View {
    Group {
      if photos.authorizationStatus == .denied || photos.authorizationStatus == .restricted {
        EchoComposerPhotoEmptyState(
          icon: "photo.badge.exclamationmark",
          title: EchoCopy.string("Photos access is off"),
          detail: EchoCopy.string("Allow access in System Settings to attach from your library."),
          actionTitle: EchoCopy.string("Open Settings"),
          action: photos.openSystemPhotoSettings
        )
      } else if photos.isLoading {
        ProgressView().tint(.white.opacity(0.62))
      } else if photos.items.isEmpty {
        EchoComposerPhotoEmptyState(
          icon: "photo.on.rectangle",
          title: EchoCopy.string("No photos yet"),
          detail: EchoCopy.string("Pictures you take or save will show up here.")
        )
      } else {
        EchoComposerPhotoGrid(photos: photos, onChoose: onChoose)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task { await photos.load() }
  }
}

struct EchoComposerPhotoGrid: View {
  @Bindable var photos: EchoComposerPhotoLibrary
  let onChoose: (EchoComposerPhotoLibrary.Item) -> Void

  private let spacing: CGFloat = 5
  private let columns = Array(
    repeating: GridItem(.flexible(minimum: 0), spacing: 5),
    count: 4
  )

  var body: some View {
    ScrollView(showsIndicators: false) {
      LazyVGrid(columns: columns, spacing: spacing) {
        ForEach(Array(photos.items.enumerated()), id: \.element.id) { index, item in
          Button {
            onChoose(item)
          } label: {
            Color.clear
              .aspectRatio(1, contentMode: .fit)
              .overlay {
                EchoComposerPhotoThumbnail(image: item.thumbnail)
              }
              .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
              .overlay {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                  .stroke(.white.opacity(0.08), lineWidth: 1)
              }
              .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
          }
          .buttonStyle(EchoComposerPhotoCellButtonStyle())
          .accessibilityLabel("Attach photo")
          .onAppear {
            photos.ensureThumbnail(for: item.id)
            photos.prefetchThumbnails(around: index)
          }
        }
      }
    }
  }
}

struct EchoComposerPhotoThumbnail: View {
  let image: EchoPlatformImage?

  var body: some View {
    GeometryReader { geo in
      ZStack {
        Rectangle().fill(.white.opacity(0.055))
        if let image {
          platformPhoto(image)
            .resizable()
            .scaledToFill()
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        } else {
          ProgressView().controlSize(.small).tint(.white.opacity(0.42))
        }
      }
    }
  }

  @ViewBuilder
  private func platformPhoto(_ image: EchoPlatformImage) -> Image {
    #if os(iOS)
      Image(uiImage: image)
    #else
      Image(nsImage: image)
    #endif
  }
}

private struct EchoComposerPhotoEmptyState: View {
  let icon: String
  let title: String
  let detail: String
  var actionTitle: String? = nil
  var action: (() -> Void)? = nil

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: icon)
        .font(.system(size: 26, weight: .medium))
        .foregroundStyle(.white.opacity(0.32))
      Text(title)
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.78))
      Text(detail)
        .font(.system(size: 12, design: .rounded))
        .foregroundStyle(.white.opacity(0.42))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 220)
      if let actionTitle, let action {
        Button(actionTitle, action: action)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .padding(.horizontal, 12)
          .padding(.vertical, 7)
          .background(
            EchoTheme.Color.indigo.opacity(0.92),
            in: Capsule()
          )
          .buttonStyle(.plain)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct EchoComposerPhotoCellButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.78 : 1)
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}
