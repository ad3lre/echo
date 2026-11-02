import EchoDomain
import EchoNetworking
import PhotosUI
import SwiftUI

/// Web `RoleIconPickerField.vue` — pick a role icon from the server emoji library (stores the
/// emoji id + asset URL), an http(s) image URL, or an uploaded image. Bundled app icons are
/// offered for channel `iconKey` pickers; roles still need a hosted URL (web uses asset URLs).
struct EchoRoleIconPicker: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  /// The draft icon shown in the trigger tile.
  let icon: EchoRoleIconPatch
  let accent: Color
  /// `persistNow` is true for uploads (web persists those immediately).
  var onPick: (EchoRoleIconPatch, _ persistNow: Bool) -> Void

  private enum Tab: String, CaseIterable, Identifiable {
    case emoji, image
    var id: String { rawValue }
  }

  private static let urlPlaceholder = "https://…"

  @State private var open = false
  @State private var tab = Tab.emoji
  @State private var query = ""
  @State private var packs: [EchoServerEmojiPack] = []
  @State private var packsLoading = false
  @State private var urlDraft = ""
  @State private var uploadItem: PhotosPickerItem?
  @State private var uploading = false
  @State private var pickerError: String?

  private var emojis: [EchoServerEmoji] {
    let all = packs.flatMap(\.emojis)
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return needle.isEmpty ? all : all.filter { $0.name.lowercased().contains(needle) }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(EchoCopy.string("Role icon").uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      HStack(spacing: 10) {
        Button { open = true } label: { tile }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Choose role icon"))
          .popover(isPresented: $open, arrowEdge: .bottom) { pickerBody }
        EchoSettingsSecondaryButton(title: EchoCopy.string("Choose icon")) { open = true }
        if icon.url != nil {
          EchoSettingsSecondaryButton(title: EchoCopy.string("Remove")) {
            onPick(.clear, false)
          }
        }
      }
    }
  }

  private var tile: some View {
    Group {
      if let url = icon.url {
        EchoMediaImage(
          source: url, baseURL: baseURL, accessToken: accessToken, contentMode: .fit,
          maxPixelSize: 128
        ) { accent.opacity(0.4) }
      } else {
        Circle().fill(accent.opacity(0.55)).padding(10)
      }
    }
    .frame(width: 36, height: 36)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
  }

  private var pickerBody: some View {
    VStack(alignment: .leading, spacing: 12) {
      Picker(EchoCopy.string("Role icon"), selection: $tab) {
        Text(EchoCopy.string("Emoji")).tag(Tab.emoji)
        Text(EchoCopy.string("Image")).tag(Tab.image)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      switch tab {
      case .emoji: emojiTab
      case .image: imageTab
      }
      if let pickerError { EchoSettingsStatusLine(message: pickerError, isError: true) }
    }
    .padding(14)
    .frame(minWidth: 300, idealWidth: 360, maxWidth: 400, minHeight: 260)
    .task { await loadPacks() }
    .onChange(of: uploadItem) { _, item in
      guard let item else { return }
      Task { await upload(item) }
    }
  }

  private var emojiTab: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(EchoCopy.string("Pick a custom emoji from this server’s library."))
        .font(.system(size: 11))
        .foregroundStyle(EchoTheme.Color.ink(0.45))
      EchoDesktopLabeledField(title: EchoCopy.string("Search")) {
        TextField(EchoCopy.string("Search emoji"), text: $query)
      }
      if packsLoading {
        ProgressView().controlSize(.small)
      } else if emojis.isEmpty {
        Text(
          query.isEmpty
            ? EchoCopy.string("This server has no custom emoji yet.")
            : EchoCopy.format("No emoji match “%@”.", query)
        )
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      } else {
        ScrollView {
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 40), spacing: 6)], spacing: 6) {
            ForEach(emojis) { emoji in
              Button {
                onPick(EchoRoleIconPatch(url: emoji.imageURL, emojiID: emoji.id), false)
                open = false
              } label: {
                EchoMediaImage(
                  source: emoji.imageURL, baseURL: baseURL, accessToken: accessToken,
                  contentMode: .fit, maxPixelSize: 96
                ) { EchoTheme.Color.ink(0.06) }
                .frame(width: 32, height: 32)
                .padding(4)
              }
              .buttonStyle(.plain)
              .accessibilityLabel(Text(verbatim: ":" + emoji.name + ":"))
            }
          }
        }
        .frame(maxHeight: 240)
      }
    }
  }

  private var imageTab: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(
        EchoCopy.string(
          "Paste an image link, or upload a small square image (PNG, JPEG, or GIF).")
      )
      .font(.system(size: 11))
      .foregroundStyle(EchoTheme.Color.ink(0.45))
      .fixedSize(horizontal: false, vertical: true)
      EchoDesktopLabeledField(title: EchoCopy.string("Image URL")) {
        TextField(Self.urlPlaceholder, text: $urlDraft)
          #if os(iOS)
            .textInputAutocapitalization(.never)
            .keyboardType(.URL)
          #endif
          .autocorrectionDisabled()
          .onSubmit(applyURL)
      }
      EchoSettingsSecondaryButton(
        title: EchoCopy.string("Use URL"),
        disabled: urlDraft.trimmingCharacters(in: .whitespaces).isEmpty, action: applyURL)
      PhotosPicker(selection: $uploadItem, matching: .images) {
        Text(uploading ? EchoCopy.string("Uploading…") : EchoCopy.string("Choose image"))
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.75))
          .padding(.horizontal, 12)
          .frame(height: 32)
          .background(
            EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(uploading)
    }
  }

  // MARK: - Actions

  private func applyURL() {
    guard let patch = EchoRoleIconPatch.externalURL(urlDraft) else {
      pickerError = EchoCopy.string("Enter a valid http(s) image URL.")
      return
    }
    pickerError = nil
    urlDraft = ""
    onPick(patch, false)
    open = false
  }

  private func loadPacks() async {
    guard packs.isEmpty else { return }
    packsLoading = true
    defer { packsLoading = false }
    guard let token = try? await model.auth.ensureAccessToken() else { return }
    packs =
      (try? await model.client.loadServerEmojiPacks(serverID: server.id, accessToken: token)) ?? []
  }

  private func upload(_ item: PhotosPickerItem) async {
    defer { uploadItem = nil }
    pickerError = nil
    guard let raw = try? await item.loadTransferable(type: Data.self),
      let png = EchoSettingsImage.downscaledPNG(raw, maxPixel: 256)
    else {
      pickerError = EchoCopy.string("Use a PNG, JPEG, or GIF image.")
      return
    }
    uploading = true
    defer { uploading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      let url = try await model.client.uploadServerAsset(
        serverID: server.id, purpose: "server_icon", data: png, filename: "role-icon.png",
        mimeType: "image/png", accessToken: token)
      onPick(EchoRoleIconPatch(url: url), true)
      open = false
    } catch {
      pickerError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t upload that role icon."))
    }
  }
}
