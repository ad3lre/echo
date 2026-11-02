import EchoDomain
import EchoNetworking
import SwiftUI

/// Short-lived per-guild cache so reopening the picker does not refetch, while sticker admin
/// edits still show up within a minute (web invalidates explicitly on mutation).
@MainActor
private enum EchoStickerLibraryCache {
  static var entries: [String: (at: Date, packs: [EchoServerEmojiPack])] = [:]

  static func fresh(_ serverID: String) -> [EchoServerEmojiPack]? {
    guard let entry = entries[serverID], Date().timeIntervalSince(entry.at) < 60 else { return nil }
    return entry.packs
  }
}

/// Sticker tab of the expression picker — guild channels only (DMs have no library).
struct EchoStickerPickerPane: View {
  let serverID: String
  let baseURL: URL
  let accessToken: String
  let query: String
  let onPick: (EchoServerSticker) -> Void

  @State private var packs: [EchoServerEmojiPack] = []
  @State private var isLoading = false
  @State private var loadFailed = false

  private var visiblePacks: [EchoServerEmojiPack] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return packs }
    return packs.compactMap { pack in
      var copy = pack
      copy.stickers = pack.stickers.filter {
        $0.name.lowercased().contains(needle) || pack.name.lowercased().contains(needle)
      }
      return copy.stickers.isEmpty ? nil : copy
    }
  }

  var body: some View {
    Group {
      if isLoading && packs.isEmpty {
        ProgressView().tint(EchoTheme.Color.ink(0.7))
      } else if loadFailed {
        VStack(spacing: 8) {
          Text(EchoCopy.string("Stickers couldn’t be loaded."))
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
          Button(EchoCopy.string("Try again")) { Task { await load(force: true) } }
        }
      } else if visiblePacks.isEmpty {
        ContentUnavailableView(EchoCopy.string("No stickers found"), systemImage: "face.dashed")
      } else {
        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(visiblePacks) { pack in packSection(pack) }
          }
        }
      }
    }
    .task(id: serverID) { await load(force: false) }
  }

  private func packSection(_ pack: EchoServerEmojiPack) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(pack.name.uppercased())
        .font(.system(size: 10, weight: .bold, design: .rounded)).tracking(1.2)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6)
      {
        ForEach(pack.stickers) { sticker in
          Button {
            onPick(sticker)
          } label: {
            EchoMediaImage(source: sticker.imageURL, baseURL: baseURL, accessToken: accessToken) {
              Image(systemName: "face.smiling").foregroundStyle(EchoTheme.Color.ink(0.25))
            }
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: .infinity)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(sticker.name)
        }
      }
    }
  }

  private func load(force: Bool) async {
    if !force, let cached = EchoStickerLibraryCache.fresh(serverID) {
      packs = cached
      return
    }
    isLoading = true
    defer { isLoading = false }
    do {
      let loaded = try await EchoWorkspaceClient(baseURL: baseURL)
        .loadStickerPacks(serverID: serverID, accessToken: accessToken)
      guard !Task.isCancelled else { return }
      EchoStickerLibraryCache.entries[serverID] = (Date(), loaded)
      packs = loaded
      loadFailed = false
    } catch is CancellationError {
      return
    } catch {
      loadFailed = true
    }
  }
}
