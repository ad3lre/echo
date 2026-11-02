import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

enum EchoExpressionTab: String, CaseIterable, Identifiable {
  case emoji = "Emoji"
  case icons = "Icons"
  case stickers = "Stickers"
  case gifs = "GIFs"
  case images = "Images"
  case favorites = "Favorites"

  var id: Self { self }
  var icon: String {
    switch self {
    case .emoji: "face.smiling"
    case .icons: "square.grid.2x2"
    case .stickers: "star.square"
    case .gifs: "rectangle.on.rectangle.angled"
    case .images: "photo.on.rectangle"
    case .favorites: "star"
    }
  }
}

struct EchoUnicodeEmoji: Decodable, Equatable, Sendable {
  let emoji: String
  let name: String
  let slug: String
}

struct EchoUnicodeEmojiCategory: Decodable, Equatable, Identifiable, Sendable {
  let name: String
  let slug: String
  let emojis: [EchoUnicodeEmoji]
  var id: String { slug }
}

enum EchoEmojiCatalog {
  static func load(bundle: Bundle = .main) -> [EchoUnicodeEmojiCategory] {
    let urls = [
      bundle.url(forResource: "data-by-group", withExtension: "json"),
      bundle.url(forResource: "emoji-data-by-group", withExtension: "json"),
    ]
    for url in urls.compactMap({ $0 }) {
      if let data = try? Data(contentsOf: url),
        let categories = try? JSONDecoder().decode([EchoUnicodeEmojiCategory].self, from: data)
      {
        return categories
      }
    }
    return fallback
  }

  private static let fallback: [EchoUnicodeEmojiCategory] = [
    category(
      "Smileys & Emotion", "smileys_emotion",
      "😀 😃 😄 😁 😆 😂 😊 😇 🙂 🙃 😉 😍 🥰 😘 😎 🤩 🥳 😏 😔 😢 😭 😤 😡 🤯 😳 🥶 😱 🤗 🤔 🫡 🤫 🙄 😬 🫠 ❤️ 💜 💙 💚 💛 🤍 💯"),
    category(
      "People & Body", "people_body",
      "👋 🤚 🖐️ ✋ 🫶 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 💪 👀 🧠"),
    category(
      "Animals & Nature", "animals_nature",
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🦎 🐙 🐠 🐬 🌸 🌻 🌈 🔥 ✨"),
    category(
      "Food & Drink", "food_drink", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🍕 🍔 🍟 🌮 🍣 🍪 🎂 ☕️ 🧋 🍺 🍷"),
    category(
      "Travel & Places", "travel_places", "🚗 🚕 🚌 🚎 🏎️ 🚓 🚑 🚒 🚲 ✈️ 🚀 🛸 🚁 🚂 🗺️ 🗿 🗽 🗼 🏰 🏖️ 🏕️ 🌋 🏠 🌍 🌙 ⭐️"),
    category("Activities", "activities", "⚽️ 🏀 🏈 ⚾️ 🥎 🎾 🏐 🏉 🎱 🏓 🏸 🥅 ⛳️ 🛹 🎣 🤿 🎮 🕹️ 🎲 🎯 🎸 🎨 🎬 🎤 🏆 🎉"),
    category("Objects", "objects", "⌚️ 📱 💻 ⌨️ 🖥️ 📷 📸 🎥 📺 🔋 💡 🔦 📚 ✏️ 📝 📌 🔒 🔑 🔨 🧰 🧲 🧪 💊 🎁 📦 🔔 💬"),
    category("Symbols", "symbols", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ☮️ ✝️ ☯️ ♾️ ✅ ❌ ❓ ❗️ 💯"),
    category("Flags", "flags", "🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🇺🇳 🇪🇺 🇩🇪 🇫🇷 🇬🇧 🇺🇸 🇨🇦 🇯🇵 🇰🇷 🇮🇳 🇧🇷 🇦🇺 🇿🇦"),
  ]

  private static func category(_ name: String, _ slug: String, _ values: String)
    -> EchoUnicodeEmojiCategory
  {
    EchoUnicodeEmojiCategory(
      name: name,
      slug: slug,
      emojis: values.split(separator: " ").map {
        EchoUnicodeEmoji(emoji: String($0), name: String($0), slug: String($0))
      })
  }
}

@MainActor
@Observable
private final class EchoExpressionPickerModel {
  var tab: EchoExpressionTab = .emoji
  var query = ""
  var packs: [EchoEmojiPack] = []
  var gifs: [EchoGIF] = []
  var isLoadingLibrary = false
  var isLoadingGIFs = false
  var errorMessage: String?
  private(set) var recents: [String]

  let unicodeCategories = EchoEmojiCatalog.load()
  private let client: EchoHomeClient
  private let baseURL: URL
  private let accessToken: String
  private let defaultsKey = "echo.composer.recent-emojis"
  private var loadedLibrary = false

  init(baseURL: URL, accessToken: String) {
    client = EchoHomeClient(baseURL: baseURL)
    self.baseURL = baseURL
    self.accessToken = accessToken
    recents = UserDefaults.standard.stringArray(forKey: defaultsKey) ?? []
    // Seed from the session-wide prefetch so custom packs paint with unicode.
    let catalog = EchoCustomEmojiCatalog.shared
    packs = catalog.packs
    loadedLibrary = catalog.isLoaded
  }

  var filteredUnicodeCategories: [EchoUnicodeEmojiCategory] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return unicodeCategories }
    return unicodeCategories.compactMap { category in
      let matches = category.emojis.filter {
        $0.emoji == needle || $0.name.lowercased().contains(needle)
          || $0.slug.lowercased().contains(needle.replacingOccurrences(of: " ", with: "_"))
      }
      return matches.isEmpty
        ? nil
        : EchoUnicodeEmojiCategory(name: category.name, slug: category.slug, emojis: matches)
    }
  }

  var filteredPacks: [EchoEmojiPack] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return packs }
    return packs.compactMap { pack in
      let emojis = pack.emojis.filter {
        $0.name.lowercased().contains(needle) || pack.name.lowercased().contains(needle)
      }
      return emojis.isEmpty
        ? nil
        : EchoEmojiPack(
          id: pack.id, name: pack.name, source: pack.source, position: pack.position, emojis: emojis
        )
    }
  }

  func loadLibrary() async {
    let catalog = EchoCustomEmojiCatalog.shared
    if !catalog.packs.isEmpty {
      packs = catalog.packs
    }
    if catalog.isLoaded {
      loadedLibrary = true
      errorMessage = nil
      return
    }
    guard !isLoadingLibrary else { return }
    isLoadingLibrary = true
    defer { isLoadingLibrary = false }
    await catalog.refresh(baseURL: baseURL, accessToken: accessToken)
    guard !Task.isCancelled else { return }
    packs = catalog.packs
    if catalog.isLoaded {
      loadedLibrary = true
      errorMessage = nil
    } else if packs.isEmpty {
      errorMessage = "Custom emoji couldn’t be loaded."
    }
  }

  func loadGIFs() async {
    isLoadingGIFs = true
    defer { isLoadingGIFs = false }
    do {
      try await Task.sleep(for: .milliseconds(query.isEmpty ? 0 : 280))
      let results = try await client.loadGIFs(query: query)
      guard !Task.isCancelled else { return }
      gifs = results
      errorMessage = nil
    } catch is CancellationError {
      return
    } catch {
      errorMessage = "GIFs are unavailable right now."
    }
  }

  func record(_ value: String) {
    recents.removeAll { $0 == value }
    recents.insert(value, at: 0)
    recents = Array(recents.prefix(32))
    UserDefaults.standard.set(recents, forKey: defaultsKey)
  }
}

struct EchoExpressionPicker: View {
  let baseURL: URL
  let accessToken: String
  @Bindable var photos: EchoComposerPhotoLibrary
  var selectedPhotoIDs: [String] = []
  /// When true, only the emoji tab is shown (message reactions).
  var emojiOnly: Bool = false
  /// Guild id — enables the Stickers tab (DMs have no sticker library).
  var serverID: String?
  /// `/gif` slash command opens the picker on its GIFs tab.
  var startsOnGIFs: Bool = false
  var onSticker: ((EchoServerSticker) -> Void)?
  let onEmoji: (String) -> Void
  let onGIF: (EchoGIF) -> Void
  let onPhoto: (EchoComposerPhotoLibrary.Item) -> Void

  @State private var model: EchoExpressionPickerModel
  @State var favoritesStore = EchoMediaFavoritesStore.shared

  init(
    baseURL: URL,
    accessToken: String,
    photos: EchoComposerPhotoLibrary,
    selectedPhotoIDs: [String] = [],
    emojiOnly: Bool = false,
    serverID: String? = nil,
    startsOnGIFs: Bool = false,
    onSticker: ((EchoServerSticker) -> Void)? = nil,
    onEmoji: @escaping (String) -> Void,
    onGIF: @escaping (EchoGIF) -> Void,
    onPhoto: @escaping (EchoComposerPhotoLibrary.Item) -> Void
  ) {
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.photos = photos
    self.selectedPhotoIDs = selectedPhotoIDs
    self.emojiOnly = emojiOnly
    self.serverID = serverID
    self.startsOnGIFs = startsOnGIFs
    self.onSticker = onSticker
    self.onEmoji = onEmoji
    self.onGIF = onGIF
    self.onPhoto = onPhoto
    let initial = EchoExpressionPickerModel(baseURL: baseURL, accessToken: accessToken)
    if startsOnGIFs && !emojiOnly { initial.tab = .gifs }
    _model = State(initialValue: initial)
  }

  private var visibleTabs: [EchoExpressionTab] {
    if emojiOnly { return [.emoji] }
    return EchoExpressionTab.allCases.filter { $0 != .stickers || stickersAvailable }
  }

  private var stickersAvailable: Bool {
    onSticker != nil && !(serverID?.isEmpty ?? true)
  }

  var searchPlaceholder: String {
    switch model.tab {
    case .emoji: EchoCopy.string("Search emoji")
    case .icons: EchoCopy.string("Search icons")
    case .stickers: EchoCopy.string("Search stickers")
    case .favorites: EchoCopy.string("Search favorites")
    default: EchoCopy.string("Search GIFs")
    }
  }

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 8) {
      if !emojiOnly {
        HStack(spacing: 4) {
          ForEach(visibleTabs) { tab in
            Button {
              model.tab = tab
              model.query = ""
            } label: {
              Label(EchoCopy.string(key: tab.rawValue), systemImage: tab.icon)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .foregroundStyle(model.tab == tab ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.48))
                .echoPointerHoverFill(
                  isSelected: model.tab == tab,
                  selectedFill: EchoTheme.Color.ink(0.09),
                  hoverFill: EchoTheme.Color.ink(0.06),
                  cornerRadius: 9)
            }
            .buttonStyle(.plain)
          }
        }
      }

      if model.tab != .images && model.tab != .favorites && model.tab != .icons {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass").foregroundStyle(EchoTheme.Color.ink(0.35))
          TextField(searchPlaceholder, text: $model.query)
          .textFieldStyle(.plain)
          .font(.system(size: 14, design: .rounded))
        }
        .padding(.horizontal, 11)
        .frame(height: 36)
        .background(EchoTheme.Color.ink(0.055), in: RoundedRectangle(cornerRadius: 11))
      }

      Group {
        switch emojiOnly ? EchoExpressionTab.emoji : model.tab {
        case .emoji: emojiContent
        case .icons: iconsContent
        case .stickers: stickerContent
        case .gifs: gifContent
        case .images: imageContent
        case .favorites: favoritesContent
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .padding(8)
    .background(
      EchoTheme.Color.elevatedDeep.opacity(0.99),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    #if os(iOS)
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(EchoTheme.Color.ink(0.08))
      }
    #endif
    .task { await model.loadLibrary() }
    .task(id: model.tab) { if model.tab == .images { await photos.load() } }
    .task(id: "\(model.tab)|\(model.query)") {
      if model.tab == .gifs { await model.loadGIFs() }
    }
  }

  private var emojiContent: some View {
    ScrollViewReader { proxy in
      HStack(spacing: 7) {
        categoryRail(proxy: proxy)
        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 12) {
            if model.errorMessage != nil {
              Button(EchoCopy.string("Try again")) { Task { await model.loadLibrary() } }
            }
            if model.query.isEmpty, !model.recents.isEmpty {
              recentSection
            }
            ForEach(model.filteredPacks) { pack in
              customSection(pack).id("pack-\(pack.id)")
            }
            ForEach(model.filteredUnicodeCategories) { category in
              unicodeSection(category.name, id: category.slug, emojis: category.emojis)
            }
            if model.filteredPacks.isEmpty && model.filteredUnicodeCategories.isEmpty {
              ContentUnavailableView(EchoCopy.string("No emoji found"), systemImage: "face.dashed")
            }
          }
          .padding(.trailing, 2)
        }
      }
    }
  }

  /// Web `EmojiPopout` Icons tab → `linkTokenAppIcon`.
  private var iconsContent: some View {
    EchoAppIconPickerGrid { filename in
      onEmoji(Self.appIconToken(filename))
    }
    .padding(.horizontal, 4)
  }

  static func appIconToken(_ filename: String) -> String {
    let safe = filename
      .replacingOccurrences(of: "<", with: "")
      .replacingOccurrences(of: ">", with: "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let clipped = String(safe.prefix(200))
    return "<icon:\(clipped.isEmpty ? "icon.svg" : clipped)>"
  }

  private func categoryRail(proxy: ScrollViewProxy) -> some View {
    ScrollView(showsIndicators: false) {
      VStack(spacing: 5) {
        if !model.recents.isEmpty { railButton("clock.fill", target: "recent", proxy: proxy) }
        ForEach(model.packs) { pack in
          Button {
            withAnimation { proxy.scrollTo("pack-\(pack.id)", anchor: .top) }
          } label: {
            Group {
              if let emoji = pack.emojis.first {
                EchoMediaImage(source: emoji.imageURL, baseURL: baseURL, accessToken: accessToken) {
                  Image(systemName: "sparkles")
                }
                .frame(width: 22, height: 22)
              } else {
                Image(systemName: "sparkles")
              }
            }
            .frame(width: 34, height: 34)
            .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
          }
          .buttonStyle(.plain)
        }
        ForEach(model.unicodeCategories) { category in
          Button {
            withAnimation { proxy.scrollTo(category.slug, anchor: .top) }
          } label: {
            Text(category.emojis.first?.emoji ?? "•").font(.system(size: 19))
              .frame(width: 34, height: 34)
              .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .frame(width: 36)
    .background(EchoTheme.Color.ink(0.035), in: RoundedRectangle(cornerRadius: 11))
  }

  private func railButton(_ icon: String, target: String, proxy: ScrollViewProxy) -> some View {
    Button {
      withAnimation { proxy.scrollTo(target, anchor: .top) }
    } label: {
      Image(systemName: icon).font(.system(size: 15)).foregroundStyle(EchoTheme.Color.ink(0.62))
        .frame(width: 34, height: 34)
        .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
    }
    .buttonStyle(.plain)
  }

  private func unicodeSection(_ title: String, id: String, emojis: [EchoUnicodeEmoji]) -> some View
  {
    VStack(alignment: .leading, spacing: 7) {
      sectionTitle(title)
      LazyVGrid(columns: emojiColumns, spacing: 6) {
        ForEach(Array(emojis.enumerated()), id: \.offset) { _, item in
          Button {
            model.record(item.emoji)
            onEmoji(item.emoji)
          } label: {
            Text(item.emoji).font(.system(size: 25)).frame(width: 31, height: 31)
              .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
          }
          .buttonStyle(.plain).accessibilityLabel(item.name)
        }
      }
    }.id(id)
  }

  private var recentSection: some View {
    VStack(alignment: .leading, spacing: 7) {
      sectionTitle("Recently used")
      LazyVGrid(columns: emojiColumns, spacing: 6) {
        ForEach(model.recents, id: \.self) { token in
          if let custom = model.packs.lazy.flatMap(\.emojis).first(where: {
            $0.messageToken == token
          }) {
            Button {
              insertCustomEmoji(custom)
            } label: {
              EchoMediaImage(source: custom.imageURL, baseURL: baseURL, accessToken: accessToken) {
                Image(systemName: "face.smiling").foregroundStyle(EchoTheme.Color.ink(0.25))
              }
              .frame(width: 29, height: 29)
              .frame(width: 31, height: 31)
              .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
            }.buttonStyle(.plain).accessibilityLabel(custom.name)
          } else if !token.hasPrefix("<") {
            Button {
              onEmoji(token)
            } label: {
              Text(token).font(.system(size: 25)).frame(width: 31, height: 31)
                .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
            }.buttonStyle(.plain)
          }
        }
      }
    }.id("recent")
  }

  private func customSection(_ pack: EchoEmojiPack) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      sectionTitle(pack.name)
      LazyVGrid(columns: emojiColumns, spacing: 6) {
        ForEach(pack.emojis) { emoji in
          Button {
            insertCustomEmoji(emoji)
          } label: {
            EchoMediaImage(source: emoji.imageURL, baseURL: baseURL, accessToken: accessToken) {
              Image(systemName: "face.smiling").foregroundStyle(EchoTheme.Color.ink(0.25))
            }
            .frame(width: 29, height: 29)
            .frame(width: 31, height: 31)
            .echoPointerHoverFill(hoverFill: EchoTheme.Color.ink(0.08), cornerRadius: 8)
          }
          .buttonStyle(.plain).accessibilityLabel(emoji.name)
        }
      }
    }
  }

  @ViewBuilder
  private var stickerContent: some View {
    if let serverID, let onSticker {
      EchoStickerPickerPane(
        serverID: serverID, baseURL: baseURL, accessToken: accessToken, query: model.query,
        onPick: onSticker)
    }
  }

  var gifContent: some View {
    Group {
      if model.isLoadingGIFs && model.gifs.isEmpty {
        ProgressView().tint(EchoTheme.Color.ink(0.7))
      } else if model.gifs.isEmpty {
        ContentUnavailableView(
          EchoCopy.string("No GIFs found"), systemImage: "rectangle.on.rectangle.slash")
      } else {
        ScrollView(showsIndicators: false) {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 5) {
            ForEach(model.gifs) { gif in
              gifTileWithFavorite(gif)
            }
          }
        }
      }
    }
  }

  private var imageContent: some View {
    EchoComposerPhotoLibraryPane(
      photos: photos, selectedPhotoIDs: selectedPhotoIDs, onChoose: onPhoto)
  }

  private var emojiColumns: [GridItem] {
    Array(repeating: GridItem(.flexible(), spacing: 3), count: 6)
  }

  private func sectionTitle(_ title: String) -> some View {
    Text(title.uppercased())
      .font(.system(size: 10, weight: .bold, design: .rounded)).tracking(1.2)
      .foregroundStyle(EchoTheme.Color.ink(0.42))
  }

  private func insertCustomEmoji(_ emoji: EchoCustomEmoji) {
    let token = emoji.messageToken
    // Prefer catalog-resolved source (public CDN / data:) so composer attachments
    // match what EchoMediaImage already painted in the picker grid.
    let source =
      EchoCustomEmojiCatalog.shared.imageSource(
        name: emoji.name, id: emoji.id, animated: emoji.animated, apiBaseURL: baseURL)
      ?? emoji.imageURL
    EchoComposerEmojiImages.warm(token: token, source: source, apiBaseURL: baseURL)
    EchoComposerEmojiImages.prefetch(
      token: token, source: source, apiBaseURL: baseURL, accessToken: accessToken)
    // Also warm the raw library URL — picker cache may be keyed on that string.
    if source != emoji.imageURL {
      EchoComposerEmojiImages.warm(
        token: token, source: emoji.imageURL, apiBaseURL: baseURL)
      EchoComposerEmojiImages.prefetch(
        token: token, source: emoji.imageURL, apiBaseURL: baseURL, accessToken: accessToken)
    }
    model.record(token)
    onEmoji(token)
  }
}
