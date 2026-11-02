import EchoDomain
import Foundation

/// Web `imageViewerZoom` — fit is contain at 1, open slightly pulled back.
enum EchoMediaViewerZoom {
  static let initial: CGFloat = 0.9
  static let min: CGFloat = 0.25
  static let max: CGFloat = 4
  static let panThreshold: CGFloat = initial + 0.001
  /// Trackpad two-finger pan is a bit floaty at 1:1; dampen toward mouse-drag feel.
  static let trackpadPanFactor: CGFloat = 0.55

  static func clamp(_ zoom: CGFloat) -> CGFloat {
    guard zoom.isFinite else { return initial }
    return Swift.min(max, Swift.max(min, zoom))
  }

  /// Max pan so zoomed content stays within a defined viewport (Photos-style).
  static func maxPanOffset(viewport: CGSize, zoom: CGFloat) -> CGSize {
    let z = clamp(zoom)
    guard z > panThreshold, viewport.width > 0, viewport.height > 0 else { return .zero }
    return CGSize(
      width: Swift.max(0, (viewport.width * z - viewport.width) / 2),
      height: Swift.max(0, (viewport.height * z - viewport.height) / 2)
    )
  }

  static func clampedPan(_ pan: CGSize, viewport: CGSize, zoom: CGFloat) -> CGSize {
    let limit = maxPanOffset(viewport: viewport, zoom: zoom)
    return CGSize(
      width: Swift.min(limit.width, Swift.max(-limit.width, pan.width)),
      height: Swift.min(limit.height, Swift.max(-limit.height, pan.height))
    )
  }
}

/// One page in the native media viewer (images, GIFs, or video).
struct EchoMediaViewerItem: Identifiable, Equatable, Sendable {
  enum Kind: Equatable, Sendable {
    case image
    case video
  }

  let id: String
  let kind: Kind
  let url: String
  let storageKey: String?
  let filename: String?
  let mimeType: String?

  init(
    id: String = UUID().uuidString,
    kind: Kind,
    url: String,
    storageKey: String? = nil,
    filename: String? = nil,
    mimeType: String? = nil
  ) {
    self.id = id
    self.kind = kind
    self.url = url
    self.storageKey = storageKey
    self.filename = filename
    self.mimeType = mimeType
  }

  init(attachment: EchoMessageAttachment) {
    let kind: Kind = attachment.isVideo ? .video : .image
    self.init(
      id: attachment.id,
      kind: kind,
      url: attachment.url,
      storageKey: attachment.storageKey,
      filename: attachment.filename,
      mimeType: attachment.mimeType)
  }
}

/// Session presented as a full-screen cover from a message attachment tap.
struct EchoMediaViewerSession: Identifiable, Equatable {
  let id: UUID
  let items: [EchoMediaViewerItem]
  let initialIndex: Int

  init(items: [EchoMediaViewerItem], initialIndex: Int) {
    self.id = UUID()
    self.items = items
    self.initialIndex = min(max(0, initialIndex), max(0, items.count - 1))
  }

  static func images(
    _ attachments: [EchoMessageAttachment], startingAt index: Int
  ) -> EchoMediaViewerSession? {
    let items = attachments.filter(\.isImage).map(EchoMediaViewerItem.init)
    guard !items.isEmpty else { return nil }
    return EchoMediaViewerSession(items: items, initialIndex: index)
  }

  static func media(
    _ attachments: [EchoMessageAttachment], startingAt attachment: EchoMessageAttachment
  ) -> EchoMediaViewerSession? {
    let items = attachments.compactMap { att -> EchoMediaViewerItem? in
      guard att.isImage || att.isVideo else { return nil }
      return EchoMediaViewerItem(attachment: att)
    }
    guard !items.isEmpty else { return nil }
    let index =
      items.firstIndex {
        $0.url == attachment.url && $0.kind == (attachment.isVideo ? .video : .image)
      } ?? 0
    return EchoMediaViewerSession(items: items, initialIndex: index)
  }
}
