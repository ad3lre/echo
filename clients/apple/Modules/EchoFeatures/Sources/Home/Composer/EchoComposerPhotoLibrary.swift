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
  private var fetchResult: PHFetchResult<PHAsset>?
  private var isObserving = false
  /// Held by Photos while registered; Sendable so `deinit` can unregister.
  private let changeObserver = PhotoLibraryChangeObserver()
  /// ~90pt cell at 3x — sharp enough for gallery-style browsing.
  private let thumbnailSize = CGSize(width: 360, height: 360)

  init() {
    changeObserver.owner = self
  }

  deinit {
    PHPhotoLibrary.shared().unregisterChangeObserver(changeObserver)
  }

  /// Loads the gallery on first open and refreshes when called again so newly
  /// captured / saved photos appear without relaunching Echo.
  func load() async {
    await refresh(forceSpinner: items.isEmpty)
  }

  func refresh(forceSpinner: Bool = false) async {
    if authorizationStatus == .notDetermined {
      authorizationStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    }
    guard authorizationStatus == .authorized || authorizationStatus == .limited else { return }
    startObservingIfNeeded()

    let showSpinner = forceSpinner || items.isEmpty
    if showSpinner { isLoading = true }
    defer { if showSpinner { isLoading = false } }

    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = 96
    let results = PHAsset.fetchAssets(with: .image, options: options)
    applyFetchResult(results, preserveThumbnails: true)
  }

  func ensureThumbnail(for itemID: String) {
    guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
    requestThumbnail(at: index)
  }

  func prefetchThumbnails(around index: Int, window: Int = 16) {
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
              kind: "image",
              sourcePhotoID: item.id))
        } else {
          continuation.resume(throwing: CocoaError(.fileReadUnknown))
        }
      }
    }
  }

  fileprivate func handlePhotoLibraryChange(_ changeInstance: PHChange) {
    if let fetchResult, let details = changeInstance.changeDetails(for: fetchResult) {
      applyFetchResult(details.fetchResultAfterChanges, preserveThumbnails: true)
      if details.hasIncrementalChanges {
        // Thumbnails for inserted assets still need a request.
        prefetchThumbnails(around: 0, window: 24)
      }
      return
    }
    // Limited-library selection changes (and first observer fire) often omit
    // incremental details — re-query the latest assets.
    Task { await refresh(forceSpinner: false) }
  }

  private func startObservingIfNeeded() {
    guard !isObserving else { return }
    PHPhotoLibrary.shared().register(changeObserver)
    isObserving = true
  }

  private func applyFetchResult(
    _ results: PHFetchResult<PHAsset>, preserveThumbnails: Bool
  ) {
    fetchResult = results
    let previousThumbs: [String: EchoPlatformImage] = preserveThumbnails
      ? Dictionary(
        uniqueKeysWithValues: items.compactMap { item in
          item.thumbnail.map { (item.id, $0) }
        })
      : [:]
    var loaded: [Item] = []
    loaded.reserveCapacity(results.count)
    results.enumerateObjects { asset, _, _ in
      let id = asset.localIdentifier
      loaded.append(Item(id: id, asset: asset, thumbnail: previousThumbs[id]))
    }

    let previousIDs = items.map(\.id)
    let nextIDs = loaded.map(\.id)
    guard previousIDs != nextIDs || items.isEmpty != loaded.isEmpty else {
      // Same set — still refresh asset references for metadata edits.
      if !loaded.isEmpty { items = loaded }
      return
    }

    let kept = Set(nextIDs)
    requestedIDs = requestedIDs.intersection(kept)
    for item in loaded where item.thumbnail != nil {
      requestedIDs.insert(item.id)
    }
    items = loaded
    prefetchThumbnails(around: 0, window: 20)
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

/// Bridges Photos change callbacks into the main-actor gallery model.
private final class PhotoLibraryChangeObserver: NSObject, PHPhotoLibraryChangeObserver,
  @unchecked Sendable
{
  weak var owner: EchoComposerPhotoLibrary?

  func photoLibraryDidChange(_ changeInstance: PHChange) {
    let change = changeInstance
    Task { @MainActor [weak owner] in
      owner?.handlePhotoLibraryChange(change)
    }
  }
}

struct EchoComposerPhotoLibraryPane: View {
  @Bindable var photos: EchoComposerPhotoLibrary
  /// Ordered PHAsset identifiers currently attached to the composer draft.
  var selectedPhotoIDs: [String] = []
  let onChoose: (EchoComposerPhotoLibrary.Item) -> Void
  @Environment(\.scenePhase) private var scenePhase

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
        ProgressView().tint(EchoTheme.Color.ink(0.62))
      } else if photos.items.isEmpty {
        EchoComposerPhotoEmptyState(
          icon: "photo.on.rectangle",
          title: EchoCopy.string("No photos yet"),
          detail: EchoCopy.string("Pictures you take or save will show up here.")
        )
      } else {
        EchoComposerPhotoGrid(
          photos: photos, selectedPhotoIDs: selectedPhotoIDs, onChoose: onChoose)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task { await photos.load() }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      Task { await photos.refresh(forceSpinner: false) }
    }
  }
}

struct EchoComposerPhotoGrid: View {
  @Bindable var photos: EchoComposerPhotoLibrary
  var selectedPhotoIDs: [String]
  let onChoose: (EchoComposerPhotoLibrary.Item) -> Void

  private let spacing: CGFloat = 2
  private let columns = Array(
    repeating: GridItem(.flexible(minimum: 0), spacing: 2),
    count: 4
  )

  var body: some View {
    ScrollView(showsIndicators: false) {
      LazyVGrid(columns: columns, spacing: spacing) {
        ForEach(Array(photos.items.enumerated()), id: \.element.id) { index, item in
          let selectionIndex = selectedPhotoIDs.firstIndex(of: item.id).map { $0 + 1 }
          Button {
            onChoose(item)
          } label: {
            Color.clear
              .aspectRatio(1, contentMode: .fit)
              .overlay {
                EchoComposerPhotoThumbnail(image: item.thumbnail)
              }
              .overlay {
                if selectionIndex != nil {
                  Color.black.opacity(0.22)
                }
              }
              .overlay(alignment: .topTrailing) {
                if selectionIndex != nil {
                  EchoComposerPhotoSelectionMark()
                    .padding(5)
                }
              }
              .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
              .overlay {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                  .stroke(
                    selectionIndex == nil ? EchoTheme.Color.ink(0.06) : EchoTheme.Color.indigo,
                    lineWidth: selectionIndex == nil ? 1 : 2
                  )
              }
              .contentShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
          }
          .buttonStyle(EchoComposerPhotoCellButtonStyle())
          .accessibilityLabel(EchoCopy.string("Photo"))
          .accessibilityValue(
            selectionIndex.map { EchoCopy.format("Selected, %lld", $0) }
              ?? EchoCopy.string("Not selected")
          )
          .accessibilityHint(
            selectionIndex == nil
              ? EchoCopy.string("Double tap to select")
              : EchoCopy.string("Double tap to deselect")
          )
          .onAppear {
            photos.ensureThumbnail(for: item.id)
            photos.prefetchThumbnails(around: index)
          }
        }
      }
    }
  }
}

struct EchoComposerPhotoSelectionMark: View {
  var body: some View {
    Image(systemName: "checkmark.circle.fill")
      .font(.system(size: 20, weight: .semibold))
      .symbolRenderingMode(.palette)
      .foregroundStyle(EchoTheme.Color.onAccent, EchoTheme.Color.indigo)
      .accessibilityHidden(true)
  }
}

struct EchoComposerPhotoThumbnail: View {
  let image: EchoPlatformImage?

  var body: some View {
    GeometryReader { geo in
      ZStack {
        Rectangle().fill(EchoTheme.Color.ink(0.055))
        if let image {
          platformPhoto(image)
            .resizable()
            .scaledToFill()
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        } else {
          ProgressView().controlSize(.small).tint(EchoTheme.Color.ink(0.42))
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
        .foregroundStyle(EchoTheme.Color.ink(0.32))
      Text(title)
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.78))
      Text(detail)
        .font(.system(size: 12, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .multilineTextAlignment(.center)
        .frame(maxWidth: 220)
      if let actionTitle, let action {
        Button(actionTitle, action: action)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.onAccent)
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
