import EchoDomain
import EchoNetworking
import SwiftUI
import UniformTypeIdentifiers

/// Web `ServerSettingsEmojiSection` + `useServerSettingsEmoji` — server emoji packs, stickers, and
/// the emoji market.
struct EchoServerSettingsEmojiPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  @Binding var localError: String?

  private enum ImportKind {
    case emoji, sticker
  }

  private static let maxPacks = 6
  private static let maxExpressionsPerPack = 64
  private static let descriptionMinLength = 10
  private static let maxInlineEmojiURLChars = 590_000
  private static let maxInlineStickerURLChars = 600_000

  @State private var packs: [EchoServerEmojiPack] = []
  @State private var loading = false
  @State private var selectedPackID = ""
  @State private var query = ""
  @State private var selectedEmojiID = ""
  @State private var selectedStickerID = ""
  @State private var renameDraft = ""
  @State private var feedback: (message: String, isError: Bool)?
  @State private var working = false

  // Pack listing editor (custom packs)
  @State private var packDescription = ""
  @State private var packTagsText = ""
  @State private var packListed = false

  @State private var addOpen = false

  // File import
  @State private var importing = false
  @State private var importKind: ImportKind = .emoji

  private var selectedPack: EchoServerEmojiPack? {
    packs.first { $0.id == selectedPackID }
  }

  private var totalExpressions: Int { packs.reduce(0) { $0 + $1.expressionCount } }
  private var canAddPack: Bool { packs.count < Self.maxPacks }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      header
      if let feedback {
        EchoSettingsStatusLine(message: feedback.message, isError: feedback.isError)
      }
      if addOpen {
        EchoServerSettingsEmojiAddCard(
          server: server, model: model, baseURL: baseURL, accessToken: accessToken,
          packs: packs, maxPacks: Self.maxPacks,
          descriptionMinLength: Self.descriptionMinLength,
          localError: $localError, feedback: $feedback
        ) { packID, marketPackID in
          addOpen = false
          await reload(selecting: packID)
          if let marketPackID, let imported = packs.first(where: { $0.marketPackID == marketPackID }) {
            selectedPackID = imported.id
          }
        }
      }
      if loading && packs.isEmpty {
        ProgressView()
      } else if packs.isEmpty {
        Text(EchoCopy.string("No emoji packs yet. Import one from the market or create your own."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .echoSettingsCard()
      } else {
        packPicker
        if let pack = selectedPack { packDetail(pack) }
      }
    }
    .task { await reload() }
    .onChange(of: selectedPackID) { _, _ in
      selectedEmojiID = ""
      selectedStickerID = ""
      query = ""
      syncPackEditor()
    }
    .onChange(of: selectedEmojiID) { _, id in
      renameDraft = selectedPack?.emojis.first { $0.id == id }?.name ?? ""
    }
    .fileImporter(
      isPresented: $importing,
      allowedContentTypes: [.image],
      allowsMultipleSelection: false
    ) { result in
      guard case .success(let urls) = result, let url = urls.first else { return }
      Task { await handleImport(url) }
    }
  }

  // MARK: - Header + picker

  private var header: some View {
    HStack(alignment: .top) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Emoji & stickers"),
        subtitle: EchoCopy.format(
          "%1$d of %2$d packs · %3$d expressions", packs.count, Self.maxPacks,
          totalExpressions))
      Spacer(minLength: 12)
      EchoDesktopPrimaryButton(
        title: addOpen ? EchoCopy.string("Close") : EchoCopy.string("Add pack"),
        enabled: addOpen || canAddPack
      ) {
        feedback = nil
        addOpen.toggle()
      }
    }
  }

  private var packPicker: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(packs) { pack in
          let selected = pack.id == selectedPackID
          Button {
            selectedPackID = pack.id
          } label: {
            Text(pack.name)
              .font(.system(size: 13, weight: selected ? .semibold : .medium))
              .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.58))
              .padding(.horizontal, 12)
              .frame(height: 32)
              .background(
                selected ? EchoTheme.Color.signInBlue.opacity(0.16) : EchoTheme.Color.ink(0.05),
                in: Capsule())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  // MARK: - Pack detail

  private func packDetail(_ pack: EchoServerEmojiPack) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 8) {
        Text(pack.name)
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(
          pack.isCustom ? EchoCopy.string("Server pack") : EchoCopy.string("Market")
        )
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(EchoTheme.Color.ink(0.06), in: Capsule())
        Spacer()
        Text(verbatim: "\(pack.expressionCount)/\(Self.maxExpressionsPerPack)")
          .font(.system(size: 12).monospacedDigit())
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }

      if pack.isCustom {
        packListingEditor(pack)
        HStack(spacing: 8) {
          EchoSettingsSecondaryButton(
            title: EchoCopy.string("Add emoji"),
            disabled: working || pack.expressionCount >= Self.maxExpressionsPerPack
          ) {
            importKind = .emoji
            importing = true
          }
          EchoSettingsSecondaryButton(
            title: EchoCopy.string("Add sticker"),
            disabled: working || pack.expressionCount >= Self.maxExpressionsPerPack
          ) {
            importKind = .sticker
            importing = true
          }
          if working { ProgressView().controlSize(.small) }
        }
      } else {
        Text(
          EchoCopy.string("Market packs are read-only. Create a server pack to add your own emoji.")
        )
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.48))
      }

      EchoDesktopLabeledField(title: EchoCopy.string("Search")) {
        TextField(EchoCopy.string("Search emoji and stickers"), text: $query)
      }

      let emojis = filteredEmojis(pack)
      let stickers = filteredStickers(pack)
      if emojis.isEmpty && stickers.isEmpty {
        Text(
          pack.expressionCount == 0
            ? EchoCopy.string("This pack is empty.")
            : EchoCopy.string("Nothing matches your search.")
        )
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
      if !emojis.isEmpty {
        Text(EchoCopy.string("Emoji").uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 8)], spacing: 8) {
          ForEach(emojis) { emoji in
            expressionCell(
              name: emoji.name, imageURL: emoji.imageURL,
              selected: emoji.id == selectedEmojiID
            ) {
              selectedEmojiID = emoji.id
              selectedStickerID = ""
            }
          }
        }
        if let emoji = pack.emojis.first(where: { $0.id == selectedEmojiID }) {
          emojiDetail(pack: pack, emoji: emoji)
        }
      }
      if !stickers.isEmpty {
        Text(EchoCopy.string("Stickers").uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 8)], spacing: 8) {
          ForEach(stickers) { sticker in
            expressionCell(
              name: sticker.name, imageURL: sticker.imageURL,
              selected: sticker.id == selectedStickerID
            ) {
              selectedStickerID = sticker.id
              selectedEmojiID = ""
            }
          }
        }
        if let sticker = pack.stickers.first(where: { $0.id == selectedStickerID }) {
          stickerDetail(pack: pack, sticker: sticker)
        }
      }
    }
    .echoSettingsCard(padding: 16)
  }

  private func filteredEmojis(_ pack: EchoServerEmojiPack) -> [EchoServerEmoji] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return pack.emojis
      .filter { q.isEmpty || $0.name.lowercased().contains(q) }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private func filteredStickers(_ pack: EchoServerEmojiPack) -> [EchoServerSticker] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return pack.stickers
      .filter { q.isEmpty || $0.name.lowercased().contains(q) }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private func expressionCell(
    name: String, imageURL: String, selected: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 6) {
        EchoMediaImage(
          source: imageURL, baseURL: baseURL, accessToken: accessToken, contentMode: .fit,
          maxPixelSize: 160
        ) {
          EchoTheme.Color.ink(0.06)
        }
        .frame(width: 44, height: 44)
        Text(verbatim: ":" + name + ":")
          .font(.system(size: 11))
          .foregroundStyle(EchoTheme.Color.ink(0.6))
          .lineLimit(1)
      }
      .padding(8)
      .frame(maxWidth: .infinity)
      .background(
        selected ? EchoTheme.Color.signInBlue.opacity(0.16) : EchoTheme.Color.ink(0.04),
        in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  private func emojiDetail(pack: EchoServerEmojiPack, emoji: EchoServerEmoji) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        EchoMediaImage(
          source: emoji.imageURL, baseURL: baseURL, accessToken: accessToken,
          contentMode: .fit, maxPixelSize: 256
        ) {
          EchoTheme.Color.ink(0.06)
        }
        .frame(width: 64, height: 64)
        VStack(alignment: .leading, spacing: 4) {
          Text(emoji.animated ? EchoCopy.string("Animated") : EchoCopy.string("Static"))
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
          Text(EchoCopy.format("%d uses", emoji.useCount))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        }
        Spacer()
      }
      if pack.isCustom {
        EchoDesktopLabeledField(title: EchoCopy.string("Name")) {
          TextField(EchoCopy.string("emoji_name"), text: $renameDraft)
        }
        HStack(spacing: 8) {
          EchoSettingsSecondaryButton(
            title: EchoCopy.string("Save name"),
            disabled: working || normalizedName(renameDraft).isEmpty
              || normalizedName(renameDraft) == emoji.name
          ) {
            Task { await rename(pack: pack, emoji: emoji) }
          }
          EchoSettingsDangerButton(title: EchoCopy.string("Delete emoji"), disabled: working) {
            Task { await delete(pack: pack, expressionID: emoji.id, isSticker: false) }
          }
        }
      } else {
        Text(EchoCopy.string("Market packs can’t be renamed."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func stickerDetail(pack: EchoServerEmojiPack, sticker: EchoServerSticker)
    -> some View
  {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        EchoMediaImage(
          source: sticker.imageURL, baseURL: baseURL, accessToken: accessToken,
          contentMode: .fit, maxPixelSize: 512
        ) {
          EchoTheme.Color.ink(0.06)
        }
        .frame(width: 96, height: 96)
        VStack(alignment: .leading, spacing: 4) {
          Text(verbatim: ":" + sticker.name + ":")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(EchoCopy.format("Format: %@", sticker.format.uppercased()))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
          Text(EchoCopy.format("%d uses", sticker.useCount))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        }
        Spacer()
      }
      if pack.isCustom {
        EchoSettingsDangerButton(title: EchoCopy.string("Delete sticker"), disabled: working) {
          Task { await delete(pack: pack, expressionID: sticker.id, isSticker: true) }
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func packListingEditor(_ pack: EchoServerEmojiPack) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(EchoCopy.string("Market listing"))
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      EchoDesktopLabeledField(
        title: EchoCopy.format("Description (min %d characters)", Self.descriptionMinLength),
        minHeight: 72
      ) {
        TextField(
          EchoCopy.string("What is this pack about?"), text: $packDescription, axis: .vertical
        )
        .lineLimit(2...4)
      }
      EchoDesktopLabeledField(title: EchoCopy.string("Tags")) {
        TextField(EchoCopy.string("cute, reactions, anime"), text: $packTagsText)
      }
      EchoSettingsToggleRow(
        title: EchoCopy.string("List on the public market"),
        subtitle: EchoCopy.string("Other servers can import this pack."),
        isOn: $packListed)
      HStack {
        Spacer()
        EchoDesktopPrimaryButton(
          title: EchoCopy.string("Save pack settings"), enabled: !working
        ) {
          Task { await savePackSettings(pack) }
        }
      }
    }
    .padding(12)
    .background(
      EchoTheme.Color.ink(0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  // MARK: - Helpers

  private func normalizedName(_ raw: String) -> String {
    raw.trimmingCharacters(in: .whitespacesAndNewlines)
      .split(whereSeparator: \.isWhitespace).joined(separator: "_")
  }

  private func syncPackEditor() {
    guard let pack = selectedPack, pack.isCustom else {
      packDescription = ""
      packTagsText = ""
      packListed = false
      return
    }
    packDescription = pack.description
    packTagsText = pack.tags.joined(separator: ", ")
    packListed = pack.listedInMarket
  }

  private func fail(_ error: Error, _ fallback: String) {
    feedback = (echoSettingsErrorMessage(error, fallback: fallback), true)
  }

  // MARK: - Networking

  private func reload(selecting packID: String? = nil) async {
    loading = true
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      packs = try await model.client.loadServerEmojiPacks(
        serverID: server.id, accessToken: token)
      if let packID, packs.contains(where: { $0.id == packID }) {
        selectedPackID = packID
      } else if !packs.contains(where: { $0.id == selectedPackID }) {
        selectedPackID = packs.first?.id ?? ""
      }
      syncPackEditor()
      if let id = selectedEmojiID.nilIfEmpty,
        selectedPack?.emojis.contains(where: { $0.id == id }) != true
      {
        selectedEmojiID = ""
      }
      if let id = selectedStickerID.nilIfEmpty,
        selectedPack?.stickers.contains(where: { $0.id == id }) != true
      {
        selectedStickerID = ""
      }
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load emoji packs."))
    }
  }

  private func savePackSettings(_ pack: EchoServerEmojiPack) async {
    localError = nil
    feedback = nil
    let description = packDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    guard description.count >= Self.descriptionMinLength else {
      feedback = (
        EchoCopy.format(
          "Description must be at least %d characters.", Self.descriptionMinLength), true
      )
      return
    }
    working = true
    defer { working = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.updateEmojiPackMeta(
        serverID: server.id, packID: pack.id, description: description,
        tags: echoNormalizedPackTags(packTagsText), listedInMarket: packListed, accessToken: token)
      await reload()
      feedback = (EchoCopy.string("Pack settings saved."), false)
    } catch {
      fail(error, EchoCopy.string("Echo couldn’t save pack settings."))
    }
  }

  private func rename(pack: EchoServerEmojiPack, emoji: EchoServerEmoji) async {
    let name = normalizedName(renameDraft)
    guard !name.isEmpty else { return }
    localError = nil
    feedback = nil
    working = true
    defer { working = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.renameCustomExpression(
        serverID: server.id, packID: pack.id, expressionID: emoji.id, name: name,
        accessToken: token)
      await reload()
      renameDraft = name
    } catch {
      fail(error, EchoCopy.string("Echo couldn’t rename that emoji."))
    }
  }

  private func delete(pack: EchoServerEmojiPack, expressionID: String, isSticker: Bool) async {
    localError = nil
    feedback = nil
    working = true
    defer { working = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.deleteCustomExpression(
        serverID: server.id, packID: pack.id, expressionID: expressionID, accessToken: token)
      if isSticker { selectedStickerID = "" } else { selectedEmojiID = "" }
      await reload()
    } catch {
      fail(
        error,
        isSticker
          ? EchoCopy.string("Echo couldn’t remove that sticker.")
          : EchoCopy.string("Echo couldn’t remove that emoji."))
    }
  }

  private func handleImport(_ url: URL) async {
    guard let pack = selectedPack, pack.isCustom else {
      feedback = (EchoCopy.string("Upload is only available for server packs."), true)
      return
    }
    guard pack.expressionCount < Self.maxExpressionsPerPack else {
      feedback = (
        EchoCopy.format("Pack is full (%d expressions max).", Self.maxExpressionsPerPack), true
      )
      return
    }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let raw = try? Data(contentsOf: url) else {
      feedback = (EchoCopy.string("Echo couldn’t read that file."), true)
      return
    }
    localError = nil
    feedback = nil
    working = true
    defer { working = false }
    let isSticker = importKind == .sticker
    let prepared: EchoSettingsImage.Prepared
    do {
      prepared =
        isSticker ? try EchoSettingsImage.prepareSticker(raw) : try EchoSettingsImage.prepareEmoji(raw)
    } catch EchoSettingsImage.PrepareError.unsupported {
      feedback = (
        isSticker
          ? EchoCopy.string("Use PNG, APNG, or GIF for stickers.")
          : EchoCopy.string("Invalid format. Please upload an image file."), true
      )
      return
    } catch EchoSettingsImage.PrepareError.animatedTooLarge {
      feedback = (
        EchoCopy.string(
          "Could not compress animated sticker to 512KB. Try a smaller or shorter animation."),
        true
      )
      return
    } catch {
      feedback = (
        EchoCopy.string("File too large. Try a simpler or smaller image."), true
      )
      return
    }

    let name = EchoSettingsImage.expressionName(
      fromFilename: url.lastPathComponent,
      fallback: isSticker ? "sticker" : "emoji")
    do {
      let token = try await model.auth.ensureAccessToken()
      let imageURL: String
      do {
        imageURL = try await model.client.uploadServerAsset(
          serverID: server.id,
          purpose: "server_emoji",
          data: prepared.data,
          filename: "\(name).\(prepared.fileExtension)",
          mimeType: prepared.mimeType,
          accessToken: token)
      } catch let error as EchoHomeClientError {
        // Object storage not configured: same inline `data:` fallback as web.
        guard case .server(let status, _, _) = error, status == 503 else { throw error }
        let inline = "data:\(prepared.mimeType);base64,\(prepared.data.base64EncodedString())"
        let limit = isSticker ? Self.maxInlineStickerURLChars : Self.maxInlineEmojiURLChars
        guard inline.count <= limit else {
          feedback = (
            EchoCopy.string(
              "Image is too large to store without object storage. Use a smaller file."),
            true
          )
          return
        }
        imageURL = inline
      }
      let newID = try await model.client.addCustomExpression(
        serverID: server.id,
        packID: pack.id,
        name: name,
        animated: prepared.animated,
        imageURL: imageURL,
        stickerFormat: isSticker ? prepared.stickerFormat : nil,
        accessToken: token)
      await reload()
      if isSticker {
        selectedStickerID = newID
        selectedEmojiID = ""
        feedback = (EchoCopy.format("Sticker :%@: uploaded.", name), false)
      } else {
        selectedEmojiID = newID
        selectedStickerID = ""
        feedback = (EchoCopy.string("Emoji uploaded successfully."), false)
      }
    } catch {
      fail(error, EchoCopy.string("Upload failed. Please try another image."))
    }
  }
}

extension String {
  fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
