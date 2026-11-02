import EchoDomain
import EchoNetworking
import Foundation
import ImageIO
import Observation

/// Uploads a picked image and fills an empty message `imageSlot` (web `fillImageSlot`).
@MainActor
@Observable
final class EchoImageSlotFillModel {
  private(set) var isUploading = false
  private(set) var errorMessage: String?
  @ObservationIgnored private let client: any EchoImageSlotFilling
  @ObservationIgnored var auth: EchoAuthenticationModel

  init(baseURL: URL, auth: EchoAuthenticationModel, client: (any EchoImageSlotFilling)? = nil) {
    self.client = client ?? EchoHomeClient(baseURL: baseURL)
    self.auth = auth
  }

  /// Returns the filled slot on success so the row updates before the realtime echo lands.
  func fill(
    slot: EchoImageSlot, channelID: String, messageID: String, data: Data, filename: String,
    mimeType: String
  ) async -> EchoImageSlot? {
    guard !isUploading, !slot.isFilled else { return nil }
    isUploading = true
    errorMessage = nil
    defer { isUploading = false }
    let upload = EchoComposerImageUploadNormalize.jpegCompatibleUpload(
      data: data, filename: filename, mimeType: mimeType)
    let size = Self.pixelSize(upload.data)
    do {
      return try await auth.withAccessTokenRetry { token in
        let image = try await client.uploadAttachment(
          accessToken: token, channelID: channelID, data: upload.data,
          filename: upload.filename, mimeType: upload.mimeType, kind: "image")
        try await client.fillImageSlot(
          channelID: channelID, messageID: messageID, slotID: slot.slotID, image: image,
          width: size?.width, height: size?.height, accessToken: token)
        return slot.filled(
          imageURL: image.url, storageKey: image.storageKey, width: size?.width,
          height: size?.height)
      }
    } catch {
      errorMessage = EchoCopy.string("Couldn’t fill image slot")
      return nil
    }
  }

  static func pixelSize(_ data: Data) -> (width: Int, height: Int)? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = props[kCGImagePropertyPixelWidth] as? Int,
      let height = props[kCGImagePropertyPixelHeight] as? Int
    else { return nil }
    return (width, height)
  }
}
