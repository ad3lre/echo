import Foundation

/// Allowed `imageSlot` aspect ratios (`contracts/imageSlot.ts` `IMAGE_SLOT_ASPECT_RATIOS`).
public let echoImageSlotAspectRatios: [(w: Int, h: Int)] = [
  (16, 9), (4, 3), (1, 1), (21, 9), (3, 2), (2, 3),
]

/// Top-level `imageSlot` block of a v2 message `contentJson` (web `MessageImageSlot`).
public struct EchoImageSlot: Identifiable, Equatable, Sendable {
  public let slotID: String
  public let aspectW: Int
  public let aspectH: Int
  public let imageURL: String?
  public let storageKey: String?
  public let width: Int?
  public let height: Int?

  public var id: String { slotID }
  public var isFilled: Bool { !(imageURL?.trimmingCharacters(in: .whitespaces).isEmpty ?? true) }
  public var aspectRatio: Double { Double(aspectW) / Double(max(aspectH, 1)) }

  public init(
    slotID: String, aspectW: Int, aspectH: Int, imageURL: String? = nil,
    storageKey: String? = nil, width: Int? = nil, height: Int? = nil
  ) {
    self.slotID = slotID
    self.aspectW = aspectW
    self.aspectH = aspectH
    self.imageURL = imageURL
    self.storageKey = storageKey
    self.width = width
    self.height = height
  }

  /// Mirrors `walkImageSlots` / `readSlotAttrs`: ordered top-level slots with valid attrs.
  public static func parse(_ doc: EchoJSONValue?) -> [EchoImageSlot] {
    guard let root = doc?.object, root["type"]?.string == "doc",
      let content = root["content"]?.array
    else { return [] }
    return content.compactMap { node in
      guard let obj = node.object, obj["type"]?.string == "imageSlot",
        let attrs = obj["attrs"]?.object,
        let slotID = attrs["slotId"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines),
        !slotID.isEmpty, let w = attrs["aspectW"]?.int, let h = attrs["aspectH"]?.int,
        w > 0, h > 0
      else { return nil }
      return EchoImageSlot(
        slotID: slotID, aspectW: w, aspectH: h, imageURL: attrs["imageUrl"]?.string,
        storageKey: attrs["storageKey"]?.string, width: attrs["width"]?.int,
        height: attrs["height"]?.int)
    }
  }

  public func filled(imageURL: String, storageKey: String?, width: Int?, height: Int?)
    -> EchoImageSlot
  {
    EchoImageSlot(
      slotID: slotID, aspectW: aspectW, aspectH: aspectH, imageURL: imageURL,
      storageKey: storageKey, width: width, height: height)
  }
}
