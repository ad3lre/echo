import EchoNetworking
import Observation
import SwiftUI

private enum EchoExpressionTab: String, CaseIterable, Identifiable {
  case emoji = "Emoji"
  case gifs = "GIFs"
  case images = "Images"

  var id: Self { self }
  var icon: String {
    switch self {
    case .emoji: "face.smiling"
    case .gifs: "rectangle.on.rectangle.angled"
    case .images: "photo.on.rectangle"
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
  private let accessToken: String
  private let defaultsKey = "echo.composer.recent-emojis"
  private var loadedLibrary = false

  init(baseURL: URL, accessToken: String) {
    client = EchoHomeClient(baseURL: baseURL)
    self.accessToken = accessToken
    recents = UserDefaults.standard.stringArray(forKey: defaultsKey) ?? []
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
    guard !loadedLibrary else { return }
    loadedLibrary = true
    isLoadingLibrary = true
    defer { isLoadingLibrary = false }
    do {
      packs = try await client.loadEmojiLibrary(accessToken: accessToken)
    } catch {
      errorMessage = "Custom emoji couldn’t be loaded."
    }
  }

  func loadGIFs() async {
    isLoadingGIFs = true
    defer { isLoadingGIFs = false }
    do {
      try await Task.sleep(for: .milliseconds(query.isEmpty ? 0 : 280))
      gifs = try await client.loadGIFs(query: query)
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
  let onEmoji: (String) -> Void
  let onGIF: (EchoGIF) -> Void
  let onPhoto: (EchoComposerPhotoLibrary.Item) -> Void

  @State private var model: EchoExpressionPickerModel

  init(
    baseURL: URL,
    accessToken: String,
    photos: EchoComposerPhotoLibrary,
    onEmoji: @escaping (String) -> Void,
    onGIF: @escaping (EchoGIF) -> Void,
    onPhoto: @escaping (EchoComposerPhotoLibrary.Item) -> Void
  ) {
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.photos = photos
    self.onEmoji = onEmoji
    self.onGIF = onGIF
    self.onPhoto = onPhoto
    _model = State(
      initialValue: EchoExpressionPickerModel(baseURL: baseURL, accessToken: accessToken))
  }

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 8) {
      HStack(spacing: 4) {
        ForEach(EchoExpressionTab.allCases) { tab in
          Button {
            model.tab = tab
            model.query = ""
          } label: {
            Label(tab.rawValue, systemImage: tab.icon)
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .frame(maxWidth: .infinity)
              .padding(.vertical, 8)
              .foregroundStyle(model.tab == tab ? .white : .white.opacity(0.48))
              .background(
                model.tab == tab ? .white.opacity(0.09) : .clear,
                in: RoundedRectangle(cornerRadius: 9))
          }
          .buttonStyle(.plain)
        }
      }

      if model.tab != .images {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.35))
          TextField(model.tab == .emoji ? "Search emoji" : "Search GIFs", text: $model.query)
            .textFieldStyle(.plain)
            .font(.system(size: 14, design: .rounded))
        }
        .padding(.horizontal, 11)
        .frame(height: 36)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 11))
      }

      Group {
        switch model.tab {
        case .emoji: emojiContent
        case .gifs: gifContent
        case .images: imageContent
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .padding(9)
    .background(
      Color(red: 0.035, green: 0.038, blue: 0.052).opacity(0.99),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(.white.opacity(0.08)) }
    .shadow(color: .black.opacity(0.34), radius: 16, y: 7)
    .task { await model.loadLibrary() }
    .task(id: model.tab) { if model.tab == .images { await photos.load() } }
    .task(id: model.tab == .gifs ? model.query : "") {
      if model.tab == .gifs { await model.loadGIFs() }
    }
  }

  private var emojiContent: some View {
    ScrollViewReader { proxy in
      HStack(spacing: 7) {
        categoryRail(proxy: proxy)
        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 12) {
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
              ContentUnavailableView("No emoji found", systemImage: "face.dashed")
            }
          }
          .padding(.trailing, 2)
        }
      }
    }
  }

  private func categoryRail(proxy: ScrollViewProxy) -> some View {
    ScrollView(showsIndicators: false) {
      VStack(spacing: 5) {
        if !model.recents.isEmpty { railButton("clock.fill", target: "recent", proxy: proxy) }
        ForEach(model.packs) { pack in
          Button {
            withAnimation { proxy.scrollTo("pack-\(pack.id)", anchor: .top) }
          } label: {
            if let emoji = pack.emojis.first {
              EchoMediaImage(source: emoji.imageURL, baseURL: baseURL, accessToken: accessToken) {
                Image(systemName: "sparkles")
              }
              .frame(width: 22, height: 22)
            } else {
              Image(systemName: "sparkles")
            }
          }
          .buttonStyle(.plain).frame(width: 34, height: 34)
        }
        ForEach(model.unicodeCategories) { category in
          Button {
            withAnimation { proxy.scrollTo(category.slug, anchor: .top) }
          } label: {
            Text(category.emojis.first?.emoji ?? "•").font(.system(size: 19))
          }
          .buttonStyle(.plain).frame(width: 34, height: 34)
        }
      }
    }
    .frame(width: 36)
    .background(.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 11))
  }

  private func railButton(_ icon: String, target: String, proxy: ScrollViewProxy) -> some View {
    Button {
      withAnimation { proxy.scrollTo(target, anchor: .top) }
    } label: {
      Image(systemName: icon).font(.system(size: 15)).foregroundStyle(.white.opacity(0.62))
    }
    .buttonStyle(.plain).frame(width: 34, height: 34)
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
              onEmoji(token)
            } label: {
              EchoMediaImage(source: custom.imageURL, baseURL: baseURL, accessToken: accessToken) {
                Image(systemName: "face.smiling").foregroundStyle(.white.opacity(0.25))
              }.frame(width: 29, height: 29)
            }.buttonStyle(.plain).accessibilityLabel(custom.name)
          } else if !token.hasPrefix("<") {
            Button {
              onEmoji(token)
            } label: {
              Text(token).font(.system(size: 25)).frame(width: 31, height: 31)
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
            model.record(emoji.messageToken)
            onEmoji(emoji.messageToken)
          } label: {
            EchoMediaImage(source: emoji.imageURL, baseURL: baseURL, accessToken: accessToken) {
              Image(systemName: "face.smiling").foregroundStyle(.white.opacity(0.25))
            }.frame(width: 29, height: 29)
          }
          .buttonStyle(.plain).accessibilityLabel(emoji.name)
        }
      }
    }
  }

  private var gifContent: some View {
    Group {
      if model.isLoadingGIFs && model.gifs.isEmpty {
        ProgressView().tint(.white.opacity(0.7))
      } else if model.gifs.isEmpty {
        ContentUnavailableView("No GIFs found", systemImage: "rectangle.on.rectangle.slash")
      } else {
        ScrollView(showsIndicators: false) {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 5) {
            ForEach(model.gifs) { gif in
              Button {
                onGIF(gif)
              } label: {
                EchoMediaImage(source: gif.thumbnailURL, baseURL: baseURL, accessToken: accessToken) {
                  Rectangle().fill(.white.opacity(0.05))
                }
                .frame(height: 92).clipShape(RoundedRectangle(cornerRadius: 8))
              }.buttonStyle(.plain).accessibilityLabel(gif.title.isEmpty ? "GIF" : gif.title)
            }
          }
        }
      }
    }
  }

  private var imageContent: some View {
    Group {
      if photos.authorizationStatus == .denied || photos.authorizationStatus == .restricted {
        ContentUnavailableView("Photos access is off", systemImage: "photo.badge.exclamationmark")
      } else if photos.isLoading {
        ProgressView().tint(.white.opacity(0.7))
      } else if photos.items.isEmpty {
        ContentUnavailableView("No photos", systemImage: "photo.on.rectangle")
      } else {
        ScrollView(showsIndicators: false) {
          LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 4), spacing: 3
          ) {
            ForEach(photos.items) { item in
              Button {
                onPhoto(item)
              } label: {
                EchoComposerPhotoThumbnail(image: item.thumbnail)
                  .aspectRatio(1, contentMode: .fill).clipShape(RoundedRectangle(cornerRadius: 7))
              }.buttonStyle(.plain).accessibilityLabel("Attach photo")
            }
          }
        }
      }
    }
  }

  private var emojiColumns: [GridItem] {
    Array(repeating: GridItem(.flexible(), spacing: 3), count: 6)
  }

  private func sectionTitle(_ title: String) -> some View {
    Text(title.uppercased())
      .font(.system(size: 10, weight: .bold, design: .rounded)).tracking(1.2)
      .foregroundStyle(.white.opacity(0.42))
  }
}
