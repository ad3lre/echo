import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

private enum EchoFriendsTab: String, CaseIterable, Identifiable {
  case all
  case online
  case pending
  case add

  var id: Self { self }

  var title: String {
    switch self {
    case .all: EchoCopy.string("All")
    case .online: EchoCopy.string("Online")
    case .pending: EchoCopy.string("Pending")
    case .add: EchoCopy.string("Add")
    }
  }
}

@MainActor
@Observable
final class EchoFriendsModel {
  private let client: EchoSettingsClient
  private let homeClient: EchoHomeClient
  private let auth: EchoAuthenticationModel

  private(set) var friends: [EchoUserProfile] = []
  private(set) var presence: [String: String] = [:]
  private(set) var lastOnlineAt: [String: String] = [:]
  private(set) var incoming: [EchoIncomingFriendRequest] = []
  private(set) var outgoing: [EchoFriendRequest] = []
  private(set) var outgoingProfiles: [String: EchoUserProfile] = [:]
  private(set) var addCandidates: [EchoFriendCandidate] = []
  private(set) var isLoading = false
  private(set) var errorMessage: String?
  private(set) var respondingIDs = Set<String>()
  private(set) var sentIDs = Set<String>()
  var searchQuery = ""
  var addQuery = ""

  init(baseURL: URL, auth: EchoAuthenticationModel) {
    self.client = EchoSettingsClient(baseURL: baseURL)
    self.homeClient = EchoHomeClient(baseURL: baseURL)
    self.auth = auth
  }

  var pendingCount: Int { incoming.count + outgoing.count }

  var visibleFriends: [EchoUserProfile] {
    let needle = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let filtered =
      needle.isEmpty
      ? friends
      : friends.filter {
        $0.name.lowercased().contains(needle)
          || ($0.username?.lowercased().contains(needle) ?? false)
      }
    return filtered.sorted { lhs, rhs in
      presenceRank(lhs.id) < presenceRank(rhs.id)
    }
  }

  func onlineFriends() -> [EchoUserProfile] {
    visibleFriends.filter { presence[$0.id]?.lowercased() == "online" }
  }

  func load() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      async let friendRows = client.loadFriends(accessToken: token)
      async let incomingRows = client.loadIncomingFriendRequests(accessToken: token)
      async let requestSummary = client.loadFriendRequests(accessToken: token)
      let rows = try await friendRows
      incoming = try await incomingRows
      outgoing = try await requestSummary.outgoing
      let ids = rows.map(\.peerID)
      let outgoingIDs = outgoing.compactMap(\.toUserID)
      let profiles = try await client.loadProfiles(
        userIDs: ids + outgoingIDs, accessToken: token)
      var byID: [String: EchoUserProfile] = [:]
      for profile in profiles { byID[profile.id] = profile }
      friends = ids.compactMap { byID[$0] }
      outgoingProfiles = byID
      if !ids.isEmpty {
        let batch =
          (try? await homeClient.loadPresenceBatch(accessToken: token, userIDs: ids))
          ?? .empty
        presence = batch.presence
        lastOnlineAt = batch.lastOnlineAt
      } else {
        lastOnlineAt = [:]
      }
      for row in rows where presence[row.peerID] == nil {
        presence[row.peerID] = row.status
      }
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func searchAddCandidates() async {
    let query = addQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query.count >= 2 else {
      addCandidates = []
      return
    }
    do {
      let token = try await auth.ensureAccessToken()
      addCandidates = try await client.searchFriendCandidates(
        query: query, limit: 12, accessToken: token)
    } catch {
      addCandidates = []
    }
  }

  func accept(_ request: EchoIncomingFriendRequest) {
    respond(request, accepting: true)
  }

  func decline(_ request: EchoIncomingFriendRequest) {
    respond(request, accepting: false)
  }

  func sendRequest(to candidate: EchoFriendCandidate) {
    guard !sentIDs.contains(candidate.id) else { return }
    Task {
      do {
        let token = try await auth.ensureAccessToken()
        try await client.sendFriendRequest(peerID: candidate.id, accessToken: token)
        sentIDs.insert(candidate.id)
        await load()
      } catch {
        errorMessage = EchoCopy.string("Echo couldn’t send that friend request.")
      }
    }
  }

  func cancelOutgoing(_ request: EchoFriendRequest) {
    guard let peerID = request.toUserID else { return }
    Task {
      do {
        let token = try await auth.ensureAccessToken()
        try await client.cancelFriendRequest(peerID: peerID, accessToken: token)
        outgoing.removeAll { $0.id == request.id }
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func respond(_ request: EchoIncomingFriendRequest, accepting: Bool) {
    guard respondingIDs.insert(request.id).inserted else { return }
    Task {
      defer { respondingIDs.remove(request.id) }
      do {
        let token = try await auth.ensureAccessToken()
        if accepting {
          try await client.acceptFriendRequest(peerID: request.sender.id, accessToken: token)
        } else {
          try await client.declineFriendRequest(peerID: request.sender.id, accessToken: token)
        }
        incoming.removeAll { $0.id == request.id }
        if accepting { await load() }
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func presenceRank(_ userID: String) -> Int {
    switch presence[userID]?.lowercased() {
    case "online": 0
    case "idle", "away": 1
    case "do_not_disturb", "dnd", "busy": 2
    default: 3
    }
  }
}

struct EchoFriendsView: View {
  let baseURL: URL
  let accessToken: String
  var onSelectFriend: (EchoUserProfile) -> Void = { _ in }
  var onClose: (() -> Void)? = nil

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoFriendsModel?
  @State private var tab: EchoFriendsTab = .all

  var body: some View {
    VStack(spacing: 0) {
      header
      tabBar
      Divider().overlay(EchoTheme.Color.ink(0.08))
      Group {
        if let model {
          tabContent(model)
        } else {
          ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .background(EchoHomeBackground().ignoresSafeArea())
    .task {
      let next = model ?? EchoFriendsModel(baseURL: baseURL, auth: auth)
      model = next
      await next.load()
    }
  }

  private var header: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.string("Friends"))
          .font(.system(size: 22, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        if let model, model.pendingCount > 0 {
          Text(EchoCopy.format("%lld pending", Int64(model.pendingCount)))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
      }
      Spacer()
      if let onClose {
        Button(action: onClose) {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 28, height: 28)
            .background(EchoTheme.Color.ink(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Close friends"))
      }
    }
    .padding(.horizontal, 22)
    .padding(.top, 18)
    .padding(.bottom, 10)
    #if os(iOS)
      .safeAreaPadding(.top)
    #endif
  }

  private var tabBar: some View {
    HStack(spacing: 6) {
      ForEach(EchoFriendsTab.allCases) { item in
        Button {
          tab = item
        } label: {
          HStack(spacing: 6) {
            Text(item.title)
            if item == .pending, let count = model?.pendingCount, count > 0 {
              Text("\(count)")
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(EchoTheme.Color.signInBlue.opacity(0.2), in: Capsule())
            }
          }
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(tab == item ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.48))
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .echoPointerHoverFill(
            isSelected: tab == item,
            selectedFill: EchoTheme.Color.ink(0.08),
            hoverFill: EchoTheme.Color.ink(0.06),
            cornerRadius: 10)
        }
        .buttonStyle(.plain)
      }
      Spacer()
    }
    .padding(.horizontal, 18)
    .padding(.bottom, 10)
  }

  @ViewBuilder
  private func tabContent(_ model: EchoFriendsModel) -> some View {
    switch tab {
    case .all:
      friendList(model.visibleFriends, model: model, empty: EchoCopy.string("No friends yet"))
    case .online:
      friendList(
        model.onlineFriends(), model: model, empty: EchoCopy.string("No friends online"))
    case .pending:
      pendingList(model)
    case .add:
      addList(model)
    }
  }

  private func friendList(
    _ rows: [EchoUserProfile], model: EchoFriendsModel, empty: String
  ) -> some View {
    VStack(spacing: 0) {
      searchField(
        EchoCopy.string("Search friends"),
        text: Binding(get: { model.searchQuery }, set: { model.searchQuery = $0 })
      )
      if model.isLoading && rows.isEmpty {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if rows.isEmpty {
        emptyLabel(empty)
      } else {
        ScrollView(showsIndicators: false) {
          LazyVStack(spacing: 0) {
            ForEach(rows) { profile in
              Button {
                onSelectFriend(profile)
              } label: {
                friendRow(profile, status: model.presence[profile.id])
              }
              .buttonStyle(.plain)
              .padding(.horizontal, 12)
              .echoPointerHoverFill(
                hoverFill: EchoTheme.Color.ink(0.06),
                cornerRadius: 12)
            }
          }
          .padding(.bottom, 24)
        }
      }
    }
  }

  private func pendingList(_ model: EchoFriendsModel) -> some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        if model.incoming.isEmpty && model.outgoing.isEmpty {
          emptyLabel(EchoCopy.string("No friend requests"))
        }
        if !model.incoming.isEmpty {
          EchoInboxFriendRequestSection(
            requests: model.incoming,
            baseURL: baseURL,
            accessToken: accessToken,
            errorMessage: model.errorMessage,
            respondingRequestIDs: model.respondingIDs,
            onAccept: { model.accept($0) },
            onDecline: { model.decline($0) },
            onRetry: { Task { await model.load() } }
          )
          .padding(.horizontal, 18)
        }
        if !model.outgoing.isEmpty {
          Text(EchoCopy.string("Outgoing"))
            .font(.system(size: 11, weight: .bold))
            .tracking(1.4)
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .padding(.horizontal, 22)
          ForEach(model.outgoing) { request in
            outgoingRow(request, model: model)
          }
        }
      }
      .padding(.top, 12)
      .padding(.bottom, 28)
    }
  }

  private func outgoingRow(_ request: EchoFriendRequest, model: EchoFriendsModel) -> some View {
    let peerID = request.toUserID ?? ""
    let profile = model.outgoingProfiles[peerID]
    return HStack(spacing: 12) {
      EchoMediaImage(source: profile?.avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: profile?.name ?? peerID, seed: peerID)
      }
      .frame(width: 36, height: 36)
      .clipShape(Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(profile?.name ?? peerID)
          .font(.system(size: 14, weight: .semibold))
        Text(EchoCopy.string("Outgoing request"))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }
      Spacer()
      Button(EchoCopy.string("Cancel")) { model.cancelOutgoing(request) }
        .font(.system(size: 12, weight: .semibold))
        .buttonStyle(.plain)
    }
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
  }

  private func addList(_ model: EchoFriendsModel) -> some View {
    VStack(spacing: 0) {
      searchField(
        EchoCopy.string("Search by name or username"),
        text: Binding(
          get: { model.addQuery },
          set: {
            model.addQuery = $0
            Task { await model.searchAddCandidates() }
          }
        )
      )
      if model.addCandidates.isEmpty {
        emptyLabel(EchoCopy.string("Search Echo to add friends."))
      } else {
        ScrollView(showsIndicators: false) {
          LazyVStack(spacing: 0) {
            ForEach(model.addCandidates) { candidate in
              addRow(candidate, model: model)
            }
          }
        }
      }
    }
  }

  private func addRow(_ candidate: EchoFriendCandidate, model: EchoFriendsModel) -> some View {
    HStack(spacing: 12) {
      EchoMediaImage(source: candidate.avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: candidate.name, seed: candidate.id)
      }
      .frame(width: 40, height: 40)
      .clipShape(Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(candidate.name)
          .font(.system(size: 14, weight: .semibold))
        Text("@\(candidate.username)")
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }
      Spacer()
      Button {
        model.sendRequest(to: candidate)
      } label: {
        Text(
          model.sentIDs.contains(candidate.id)
            ? EchoCopy.string("Sent")
            : EchoCopy.string("Add")
        )
        .font(.system(size: 12, weight: .semibold))
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(EchoTheme.Color.signInBlue.opacity(0.16), in: Capsule())
      }
      .buttonStyle(.plain)
      .disabled(model.sentIDs.contains(candidate.id))
    }
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
  }

  private func friendRow(_ profile: EchoUserProfile, status: String?) -> some View {
    HStack(spacing: 12) {
      ZStack(alignment: .bottomTrailing) {
        EchoMediaImage(source: profile.avatarURL, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: profile.name, seed: profile.id)
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
        EchoPresenceIndicator(status: status, size: 12, borderColor: EchoTheme.Color.canvas)
          .offset(x: 1, y: 1)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(profile.name)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.92))
        Text(presenceCaption(status, userID: profile.id))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(EchoTheme.Color.ink(0.28))
    }
    .padding(.horizontal, 22)
    .padding(.vertical, 10)
    .contentShape(Rectangle())
  }

  private func searchField(_ placeholder: String, text: Binding<String>) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(EchoTheme.Color.ink(0.4))
      TextField(placeholder, text: text)
        .textFieldStyle(.plain)
        .font(.system(size: 14))
    }
    .padding(.horizontal, 12)
    .frame(height: 36)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
    .padding(.horizontal, 18)
    .padding(.vertical, 10)
  }

  private func emptyLabel(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 14))
      .foregroundStyle(EchoTheme.Color.ink(0.46))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding(32)
  }

  private func presenceCaption(_ status: String?, userID: String) -> String {
    switch status?.lowercased() {
    case "online":
      return EchoCopy.string("Online")
    case "idle", "away":
      return EchoCopy.string("Idle")
    case "do_not_disturb", "dnd", "busy":
      return EchoCopy.string("Do Not Disturb")
    default:
      if EchoLastOnline.isOffline(status),
        let last = EchoLastOnline.offlineSubtitle(
          lastOnlineAt: model?.lastOnlineAt[userID])
      {
        return last
      }
      return EchoCopy.string("Offline")
    }
  }
}
