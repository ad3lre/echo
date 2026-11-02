import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
final class EchoNotificationsModel {
  private let client: EchoHomeClient
  private let auth: EchoAuthenticationModel
  @ObservationIgnored private var reloadTask: Task<Void, Never>?
  @ObservationIgnored private var lastSeenMentionPingCount: Int?

  private(set) var rows: [EchoMentionNotificationRow] = []
  private(set) var isLoading = false
  private(set) var errorMessage: String?

  init(baseURL: URL, auth: EchoAuthenticationModel) {
    self.client = EchoHomeClient(baseURL: baseURL)
    self.auth = auth
  }

  func load() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      rows = try await client.loadMentionNotifications(accessToken: token)
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  /// Web mention inbox stays live while open — debounce reload when attention pings rise.
  func noteAttentionMentionPingCount(_ count: Int) {
    let previous = lastSeenMentionPingCount
    lastSeenMentionPingCount = count
    guard EchoNotificationsLiveSync.shouldReload(previous: previous, next: count) else { return }
    scheduleReload()
  }

  func scheduleReload(debounceMilliseconds: Int = 400) {
    reloadTask?.cancel()
    reloadTask = Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(debounceMilliseconds))
      guard !Task.isCancelled else { return }
      await load()
    }
  }

  private(set) var isMarkingRead = false

  func markRowRead(_ row: EchoMentionNotificationRow) async {
    isMarkingRead = true
    defer { isMarkingRead = false }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.markChannelRead(
        accessToken: token, channelID: row.channelID, lastReadMessageID: row.messageID)
      rows.removeAll { $0.channelID == row.channelID }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func markAllRead() async {
    isMarkingRead = true
    defer { isMarkingRead = false }
    let latestByChannel = Dictionary(grouping: rows, by: \.channelID).compactMap { _, group in
      group.max { ($0.timestamp ?? .distantPast) < ($1.timestamp ?? .distantPast) }
    }
    // Clear the list first so the ForEach cannot re-evaluate stale indices
    // against an emptied array mid-mutation (Mark all was trapping here).
    let snapshot = latestByChannel
    rows = []
    do {
      let token = try await auth.ensureAccessToken()
      for row in snapshot {
        try await client.markChannelRead(
          accessToken: token, channelID: row.channelID, lastReadMessageID: row.messageID)
      }
    } catch {
      errorMessage = error.localizedDescription
      await load()
    }
  }
}

struct EchoNotificationsView: View {
  let baseURL: URL
  let accessToken: String
  var conversations: [EchoDirectMessage] = []
  var personalNotes: EchoDirectMessage? = nil
  /// Optional guild list so source chips can show server names (web parity).
  var mentionServers: [EchoServerSummary] = []
  var onOpenMention: (EchoMentionNotificationRow) -> Void = { _ in }
  var onOpenNotes: (() -> Void)? = nil
  var onClose: (() -> Void)? = nil

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoNotificationsModel?
  @State private var readPreset: NotificationReadPreset = .unread
  @State private var sourceKey = "all"
  @State private var attention = EchoAttentionSync.shared

  private enum NotificationReadPreset: String, CaseIterable, Identifiable {
    case unread
    case all
    var id: String { rawValue }
    var title: String {
      switch self {
      case .unread: EchoCopy.string("Unread")
      case .all: EchoCopy.string("All")
      }
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      filterBar
      Group {
        if let model {
          list(model)
        } else {
          ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .background(EchoHomeBackground().ignoresSafeArea())
    .task {
      let next = model ?? EchoNotificationsModel(baseURL: baseURL, auth: auth)
      model = next
      next.noteAttentionMentionPingCount(attention.snapshot.mentionPingCount)
      await next.load()
    }
    .onChange(of: attention.snapshot.mentionPingCount) { _, count in
      model?.noteAttentionMentionPingCount(count)
    }
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 12) {
      ZStack {
        Circle()
          .fill(
            LinearGradient(
              colors: [
                EchoTheme.Color.signInBlue.opacity(0.95),
                EchoTheme.Color.signInBlue.opacity(0.62),
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )
        Image(systemName: "bell.fill")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.onAccent)
      }
      .frame(width: 44, height: 44)

      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.string("Notifications"))
          .font(.system(size: 11, weight: .bold, design: .rounded))
          .tracking(1.6)
          .textCase(.uppercase)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        Text(EchoCopy.string("Mentions and pings"))
          .font(.system(size: 18, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
      }
      Spacer(minLength: 0)
      if let model, !model.rows.isEmpty {
        Button {
          Task { await model.markAllRead() }
        } label: {
          Text(EchoCopy.string("Mark all as read"))
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.62))
        }
        .buttonStyle(.plain)
        .disabled(model.isMarkingRead)
      }
      if let onClose {
        Button(action: onClose) {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 28, height: 28)
            .background(EchoTheme.Color.ink(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Close notifications"))
      }
    }
    .padding(.horizontal, 22)
    .padding(.top, 18)
    .padding(.bottom, 10)
    #if os(iOS)
      .safeAreaPadding(.top)
    #endif
  }

  private var filterBar: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(NotificationReadPreset.allCases) { preset in
          filterChip(
            title: preset.title,
            selected: readPreset == preset
          ) {
            readPreset = preset
          }
        }
        capsuleDivider
        filterChip(
          title: EchoCopy.string("All"),
          selected: sourceKey == "all"
        ) {
          sourceKey = "all"
        }
        filterChip(
          title: EchoCopy.string("Echo"),
          selected: sourceKey == "dms"
        ) {
          sourceKey = "dms"
        }
        ForEach(sourceServerChips, id: \.id) { server in
          filterChip(
            title: server.name,
            selected: sourceKey == "server:\(server.id)"
          ) {
            sourceKey = "server:\(server.id)"
          }
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 6)
    }
    .padding(.bottom, 4)
  }

  private var capsuleDivider: some View {
    Capsule()
      .fill(EchoTheme.Color.ink(0.12))
      .frame(width: 1, height: 18)
      .padding(.horizontal, 2)
  }

  private var sourceServerChips: [EchoServerSummary] {
    let ids = Set((model?.rows ?? []).compactMap(\.serverID))
    if !mentionServers.isEmpty {
      return mentionServers.filter { ids.contains($0.id) }
    }
    return ids.sorted().map { EchoServerSummary(id: $0, name: $0) }
  }

  private func filterChip(
    title: String, selected: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.55))
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(
          selected ? EchoTheme.Color.ink(0.12) : EchoTheme.Color.ink(0.05),
          in: Capsule()
        )
        .echoPointerHoverFill(
          isSelected: selected,
          selectedFill: Color.clear,
          hoverFill: EchoTheme.Color.ink(0.04),
          idleFill: Color.clear,
          cornerRadius: 999
        )
    }
    .buttonStyle(.plain)
  }

  private func filteredRows(from rows: [EchoMentionNotificationRow])
    -> [EchoMentionNotificationRow]
  {
    // Rows from the API are unread-only today; Unread/All share the same set
    // until a read-history endpoint lands — chips still match web chrome.
    let _ = readPreset
    return rows.filter { row in
      switch sourceKey {
      case "all":
        return true
      case "dms":
        return row.channelKind == "dm" || row.channelKind == "group"
      default:
        if sourceKey.hasPrefix("server:") {
          let id = String(sourceKey.dropFirst("server:".count))
          return row.serverID == id
        }
        return true
      }
    }
  }

  @ViewBuilder
  private func list(_ model: EchoNotificationsModel) -> some View {
    let rows = filteredRows(from: model.rows)
    if model.isLoading && model.rows.isEmpty {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel(EchoCopy.string("Loading notifications"))
    } else if let errorMessage = model.errorMessage, model.rows.isEmpty {
      EchoHomeUnavailableView(message: errorMessage) {
        Task { await model.load() }
      }
    } else if model.rows.isEmpty && personalNotes == nil {
      emptyState
    } else {
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 8) {
          #if os(iOS)
            if let personalNotes, let onOpenNotes {
              notesRow(personalNotes, action: onOpenNotes)
            }
          #endif
          if rows.isEmpty {
            Text(EchoCopy.string("No mentions yet."))
              .font(.system(size: 14, weight: .regular, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.46))
              .frame(maxWidth: .infinity)
              .padding(.top, 36)
          } else {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
              if showsDaySeparator(at: index, in: rows), let day = row.timestamp {
                EchoDaySeparator(date: day, isFirst: index == 0)
              }
              mentionRow(row)
            }
          }
        }
        .padding(.horizontal, 10)
        .padding(.top, 10)
        .padding(.bottom, 28)
      }
    }
  }

  private var emptyState: some View {
    VStack(spacing: 10) {
      Image(systemName: "bell")
        .font(.system(size: 28, weight: .medium))
        .foregroundStyle(EchoTheme.Color.ink(0.32))
      Text(EchoCopy.string("No mentions yet."))
        .font(.system(size: 16, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.82))
      Text(EchoCopy.string("Pings and @mentions from DMs and servers land here."))
        .font(.system(size: 13, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
        .multilineTextAlignment(.center)
        .padding(.horizontal, 28)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func notesRow(_ notes: EchoDirectMessage, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: "note.text")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.72))
          .frame(width: 44, height: 44)
          .background(EchoTheme.Color.ink(0.07), in: Circle())
        VStack(alignment: .leading, spacing: 2) {
          Text(EchoCopy.string("Personal notes"))
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.88))
          Text(notes.lastMessage ?? EchoCopy.string("Just you"))
            .font(.system(size: 12, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.46))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(
        EchoTheme.Color.ink(0.045),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
    }
    .buttonStyle(.plain)
    .padding(.top, 8)
  }

  private func mentionRow(_ row: EchoMentionNotificationRow) -> some View {
    Button {
      onOpenMention(row)
    } label: {
      HStack(alignment: .top, spacing: 12) {
        EchoMediaImage(source: row.authorAvatar, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: row.authorName, seed: row.authorID)
        }
        .frame(width: 44, height: 44)
        .clipShape(Circle())

        VStack(alignment: .leading, spacing: 4) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(row.authorName)
              .font(.system(size: 14, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.fg)
              .lineLimit(1)
            Text(kindLabel(row.mentionKinds))
              .font(.system(size: 11, weight: .medium, design: .rounded))
              .foregroundStyle(EchoTheme.Color.signInBlue)
            Spacer(minLength: 0)
            if let timestamp = row.timestamp {
              Text(shortTime(timestamp))
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
            }
          }
          HStack(spacing: 3) {
            Text(verbatim: "#")
              .opacity(0.7)
            Text(channelLabel(row))
              .lineLimit(1)
          }
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(
            EchoTheme.Color.ink(0.06),
            in: Capsule()
          )
          Text(preview(row))
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.58))
            .lineLimit(3)
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 12)
      .background(
        EchoTheme.Color.ink(0.03),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button {
        Task { await model?.markRowRead(row) }
      } label: {
        Label(EchoCopy.string("Mark as read"), systemImage: "envelope.open")
      }
      Button {
        onOpenMention(row)
      } label: {
        Label(EchoCopy.string("Jump"), systemImage: "arrow.right")
      }
    }
  }

  private func showsDaySeparator(at index: Int, in rows: [EchoMentionNotificationRow]) -> Bool {
    // Mark-all clears `rows` while SwiftUI may still evaluate a stale index.
    guard rows.indices.contains(index) else { return false }
    let current = rows[index].timestamp
    let previous = index > 0 ? rows[index - 1].timestamp : nil
    return EchoDaySeparatorLabel.shouldShow(at: index, previous: previous, current: current)
  }

  private func channelLabel(_ row: EchoMentionNotificationRow) -> String {
    if let match = conversations.first(where: { $0.channelID == row.channelID }) {
      return match.displayName
    }
    if personalNotes?.channelID == row.channelID {
      return EchoCopy.string("Personal notes")
    }
    if row.channelKind == "dm" || row.channelKind == "group" {
      return EchoCopy.string("Direct message")
    }
    if let serverID = row.serverID,
      let server = mentionServers.first(where: { $0.id == serverID })
    {
      let name = server.name.trimmingCharacters(in: .whitespacesAndNewlines)
      if !name.isEmpty { return name }
    }
    return EchoCopy.string("Server")
  }

  private func kindLabel(_ kinds: [String]) -> String {
    let lowered = Set(kinds.map { $0.lowercased() })
    if lowered.contains("user") { return "@you" }
    if lowered.contains("everyone") { return "@everyone" }
    if lowered.contains("active") { return "@active" }
    return EchoCopy.string("Mention")
  }

  private func preview(_ row: EchoMentionNotificationRow) -> String {
    let text = row.content.trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty ? EchoCopy.string("New message") : text
  }

  private func shortTime(_ date: Date) -> String {
    date.formatted(date: .omitted, time: .shortened)
  }
}
