import EchoDomain
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Web `MessageImageSlot`: filled slots show the image; the author can fill empty ones.
struct EchoMessageImageSlotView: View {
  let slot: EchoImageSlot
  let channelID: String
  let messageID: String
  let canFill: Bool
  let baseURL: URL
  var accessToken: String? = nil
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoImageSlotFillModel?
  /// Optimistic result until the `message:updated` echo carries the filled slot.
  @State private var filled: EchoImageSlot?
  @State private var picked: PhotosPickerItem?

  private var shown: EchoImageSlot { slot.isFilled ? slot : (filled ?? slot) }
  private var isUploading: Bool { model?.isUploading == true }

  var body: some View {
    Group {
      if shown.isFilled {
        EchoMediaImage(
          source: shown.imageURL, baseURL: baseURL, accessToken: accessToken,
          storageKey: shown.storageKey, contentMode: .fit
        ) { Color.clear }
      } else if canFill && !isUploading {
        PhotosPicker(selection: $picked, matching: .images) { emptyChrome }
          .buttonStyle(.plain)
          .accessibilityLabel(
            EchoCopy.format("Add an image to the %d:%d slot", slot.aspectW, slot.aspectH))
      } else {
        emptyChrome
      }
    }
    .aspectRatio(slot.aspectRatio, contentMode: .fit)
    .frame(maxWidth: 360)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .onChange(of: picked) { _, item in
      guard let item else { return }
      Task { await upload(item) }
    }
  }

  private var emptyChrome: some View {
    VStack(spacing: 4) {
      Text(EchoCopy.format("Image slot %d:%d", slot.aspectW, slot.aspectH))
        .font(.system(size: 12, weight: .semibold, design: .rounded))
      if isUploading {
        EchoCopy.text("Uploading…").font(.system(size: 11, design: .rounded))
      } else if let error = model?.errorMessage {
        Text(error).font(.system(size: 11, design: .rounded)).foregroundStyle(.red.opacity(0.85))
      } else if canFill {
        EchoCopy.text("Add image").font(.system(size: 11, design: .rounded))
      }
    }
    .foregroundStyle(EchoTheme.Color.ink(0.5))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(EchoTheme.Color.ink(0.05))
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.2), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
  }

  private func upload(_ item: PhotosPickerItem) async {
    defer { picked = nil }
    let fill = model ?? EchoImageSlotFillModel(baseURL: baseURL, auth: auth)
    model = fill
    guard let data = try? await item.loadTransferable(type: Data.self) else { return }
    let type = item.supportedContentTypes.first
    let ext = type?.preferredFilenameExtension ?? "jpg"
    let result = await fill.fill(
      slot: slot, channelID: channelID, messageID: messageID, data: data,
      filename: "Photo.\(ext)", mimeType: type?.preferredMIMEType ?? "image/jpeg")
    if let result { filled = result }
  }
}
