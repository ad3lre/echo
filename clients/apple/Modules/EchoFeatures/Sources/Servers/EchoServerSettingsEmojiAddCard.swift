import EchoDomain
import SwiftUI

/// "Add pack" card for the emoji panel: import from the market or create a server pack.
struct EchoServerSettingsEmojiAddCard: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  let packs: [EchoServerEmojiPack]
  let maxPacks: Int
  let descriptionMinLength: Int
  @Binding var localError: String?
  @Binding var feedback: (message: String, isError: Bool)?
  /// Called after a successful import (`marketPackID`) or create (`packID`).
  let onFinished: (_ packID: String?, _ marketPackID: String?) async -> Void

  private enum AddMode: String, CaseIterable, Identifiable {
    case market, create
    var id: String { rawValue }
  }

  @State private var addMode: AddMode = .market
  @State private var working = false
  @State private var marketQuery = ""
  @State private var marketPacks: [EchoEmojiMarketPack] = []
  @State private var marketLoading = false
  @State private var marketError: String?
  @State private var newPackName = ""
  @State private var newPackDescription = ""
  @State private var newPackTagsText = ""
  @State private var newPackListed = true

  private var canAddPack: Bool { packs.count < maxPacks }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Picker(EchoCopy.string("Pack source"), selection: $addMode) {
        Text(EchoCopy.string("Market")).tag(AddMode.market)
        Text(EchoCopy.string("Create pack")).tag(AddMode.create)
      }
      .pickerStyle(.segmented)

      switch addMode {
      case .market: marketList
      case .create: createForm
      }
    }
    .echoSettingsCard(padding: 16)
    .task { if addMode == .market { await loadMarket() } }
    .onChange(of: addMode) { _, mode in
      if mode == .market { Task { await loadMarket() } }
    }
  }

  private var filteredMarket: [EchoEmojiMarketPack] {
    let imported = Set(packs.compactMap(\.marketPackID))
    let q = marketQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return marketPacks
      .filter { !imported.contains($0.id) }
      .filter {
        q.isEmpty || $0.name.lowercased().contains(q) || $0.description.lowercased().contains(q)
      }
  }

  private var marketList: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoDesktopLabeledField(title: EchoCopy.string("Search")) {
        TextField(EchoCopy.string("Search the emoji market"), text: $marketQuery)
      }
      if marketLoading {
        ProgressView()
      } else if let marketError {
        HStack {
          EchoSettingsStatusLine(message: marketError, isError: true)
          Spacer()
          EchoSettingsSecondaryButton(title: EchoCopy.string("Retry")) {
            Task { await loadMarket() }
          }
        }
      } else if !canAddPack {
        Text(EchoCopy.format("Pack limit reached (%d).", maxPacks))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      } else if filteredMarket.isEmpty {
        Text(EchoCopy.string("No packs match."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      } else {
        ForEach(filteredMarket) { pack in
          HStack(spacing: 12) {
            EchoMediaImage(
              source: pack.previewEmojiURL ?? pack.previewURLs.first, baseURL: baseURL,
              accessToken: accessToken, contentMode: .fit, maxPixelSize: 160
            ) {
              EchoTheme.Color.ink(0.06)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
              Text(pack.name)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(EchoTheme.Color.fg)
              if !pack.description.isEmpty {
                Text(pack.description)
                  .font(.system(size: 12))
                  .foregroundStyle(EchoTheme.Color.ink(0.5))
                  .lineLimit(2)
              }
              Text(
                EchoCopy.format(
                  "%1$d emoji · %2$d uses", pack.emojiCount, pack.totalUseCount)
              )
              .font(.system(size: 11))
              .foregroundStyle(EchoTheme.Color.ink(0.42))
            }
            Spacer()
            EchoSettingsSecondaryButton(
              title: EchoCopy.string("Import"), disabled: working
            ) {
              Task { await importMarket(pack) }
            }
          }
          .padding(10)
          .background(
            EchoTheme.Color.ink(0.035),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
      }
    }
  }

  private var createForm: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoDesktopLabeledField(title: EchoCopy.string("Pack name")) {
        TextField(EchoCopy.string("My Emoji Pack"), text: $newPackName)
      }
      EchoDesktopLabeledField(
        title: EchoCopy.format("Description (min %d characters)", descriptionMinLength),
        minHeight: 72
      ) {
        TextField(
          EchoCopy.string("What is this pack about?"), text: $newPackDescription,
          axis: .vertical
        )
        .lineLimit(2...4)
      }
      EchoDesktopLabeledField(title: EchoCopy.string("Tags (optional)")) {
        TextField(EchoCopy.string("cute, reactions, anime"), text: $newPackTagsText)
      }
      EchoSettingsToggleRow(
        title: EchoCopy.string("List on the public market"),
        isOn: $newPackListed)
      HStack {
        if !canAddPack {
          EchoSettingsStatusLine(
            message: EchoCopy.format("Pack limit reached (%d).", maxPacks), isError: true)
        }
        Spacer()
        EchoDesktopPrimaryButton(
          title: EchoCopy.string("Create pack"), enabled: canAddPack && !working
        ) {
          Task { await createPack() }
        }
      }
    }
  }

  private func fail(_ error: Error, _ fallback: String) {
    feedback = (echoSettingsErrorMessage(error, fallback: fallback), true)
  }

  private func loadMarket() async {
    marketLoading = true
    marketError = nil
    defer { marketLoading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      marketPacks = try await model.client.loadEmojiMarketPacks(accessToken: token)
    } catch {
      marketPacks = []
      marketError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load the emoji market."))
    }
  }

  private func importMarket(_ pack: EchoEmojiMarketPack) async {
    guard canAddPack else { return }
    localError = nil
    feedback = nil
    working = true
    defer { working = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.importMarketEmojiPack(
        serverID: server.id, marketPackID: pack.id, accessToken: token)
      await onFinished(nil, pack.id)
    } catch {
      fail(error, EchoCopy.string("Import failed."))
    }
  }

  private func createPack() async {
    guard canAddPack else { return }
    localError = nil
    feedback = nil
    let name = newPackName.trimmingCharacters(in: .whitespacesAndNewlines)
    let description = newPackDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    guard description.count >= descriptionMinLength else {
      feedback = (
        EchoCopy.format(
          "Description must be at least %d characters.", descriptionMinLength), true
      )
      return
    }
    working = true
    defer { working = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      let packID = try await model.client.createCustomEmojiPack(
        serverID: server.id,
        name: name.isEmpty ? EchoCopy.string("My Emoji Pack") : name,
        description: description,
        tags: echoNormalizedPackTags(newPackTagsText),
        listedInMarket: newPackListed,
        accessToken: token)
      newPackName = ""
      newPackDescription = ""
      newPackTagsText = ""
      newPackListed = true
      await onFinished(packID, nil)
    } catch {
      fail(error, EchoCopy.string("Echo couldn’t create that pack."))
    }
  }
}

/// Dedupe, lowercase, max 8 tags, 32 chars each — emoji pack market listing.
func echoNormalizedPackTags(_ text: String) -> [String] {
  var seen = Set<String>()
  var out: [String] = []
  for raw in text.split(separator: ",") {
    let tag = String(raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().prefix(32))
    guard !tag.isEmpty, seen.insert(tag).inserted else { continue }
    out.append(tag)
    if out.count >= 8 { break }
  }
  return out
}
