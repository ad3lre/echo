import EchoDomain
import EchoNetworking
import PhotosUI
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

/// Group DM overview + light settings (web `GroupDMOverviewPanel` + `GroupDMSettingsModal`).
struct EchoGroupDmSettingsView: View {
  let conversation: EchoDirectMessage
  let viewerUserID: String
  let baseURL: URL
  let accessToken: String
  var onClose: () -> Void
  /// Called after the viewer leaves, so the caller can drop the conversation.
  var onLeft: () -> Void = {}

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var nameDraft: String
  @State private var savedName: String
  @State private var editingName = false
  @State private var iconURL: String?
  @State private var iconItem: PhotosPickerItem?
  @State private var iconPreview: Data?
  @State private var members: [EchoUserProfile] = []
  @State private var presenceByID: [String: String] = [:]
  @State private var removedIDs = Set<String>()
  @State private var addedIDs: [String] = []
  @State private var isBusy = false
  @State private var statusMessage: String?
  @State private var errorMessage: String?
  @State private var confirmLeave = false
  @State private var showingAdd = false
  @FocusState private var nameFocused: Bool

  init(
    conversation: EchoDirectMessage, viewerUserID: String, baseURL: URL, accessToken: String,
    onClose: @escaping () -> Void, onLeft: @escaping () -> Void = {}
  ) {
    self.conversation = conversation
    self.viewerUserID = viewerUserID
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onClose = onClose
    self.onLeft = onLeft
    _nameDraft = State(initialValue: conversation.displayName)
    _savedName = State(initialValue: conversation.displayName)
    _iconURL = State(initialValue: conversation.avatarURL)
  }

  private var client: EchoHomeClient { EchoHomeClient(baseURL: baseURL) }
  private var trimmedName: String { EchoGroupDmRules.clampName(nameDraft) }
  private var otherMemberIDs: [String] {
    var seen = Set<String>()
    return (conversation.memberUserIDs + addedIDs).filter {
      !EchoUserIdentity.matches($0, viewerUserID) && !removedIDs.contains($0)
        && seen.insert($0).inserted
    }
  }

  private var visibleMembers: [EchoUserProfile] {
    let byID = Dictionary(uniqueKeysWithValues: members.map { ($0.id, $0) })
    let resolved: [EchoUserProfile] = otherMemberIDs.map { id in
      byID[id]
        ?? EchoUserProfile(id: id, name: id, username: nil, avatarURL: nil)
    }
    // Prefer members with avatars first (web `membersSorted`).
    return resolved.sorted { lhs, rhs in
      let l = !(lhs.avatarURL?.isEmpty ?? true)
      let r = !(rhs.avatarURL?.isEmpty ?? true)
      if l == r { return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending }
      return l && !r
    }
  }

  private var overviewDescription: String {
    EchoGroupDmRules.overviewDescription(memberNames: visibleMembers.map(\.name))
  }

  private var collageConversation: EchoDirectMessage {
    EchoDirectMessage(
      id: conversation.id,
      channelID: conversation.channelID,
      memberUserIDs: conversation.memberUserIDs,
      displayName: savedName,
      avatarURL: iconURL,
      avatarURLs: conversation.avatarURLs.isEmpty
        ? visibleMembers.compactMap(\.avatarURL) : conversation.avatarURLs
    )
  }

  var body: some View {
    VStack(spacing: 0) {
      topBar
      ScrollView(showsIndicators: false) {
        VStack(spacing: 0) {
          hero
          membersSection
          if let errorMessage {
            Text(errorMessage)
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.mentionPing)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 16)
              .padding(.top, 8)
          } else if let statusMessage {
            Text(statusMessage)
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.ink(0.5))
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 16)
              .padding(.top, 8)
          }
          EchoSettingsDangerButton(
            title: EchoCopy.string("Leave group"), disabled: isBusy
          ) { confirmLeave = true }
          .padding(.horizontal, 16)
          .padding(.top, 18)
          .padding(.bottom, 24)
        }
      }
    }
    .background(EchoTheme.Color.elevatedDeep.ignoresSafeArea())
    .task { await loadMembers() }
    .sheet(isPresented: $showingAdd) { addSheet }
    .alert(EchoCopy.string("Leave this group?"), isPresented: $confirmLeave) {
      Button(EchoCopy.string("Leave group"), role: .destructive) { Task { await leave() } }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(EchoCopy.format("You will no longer receive messages from %@.", savedName))
    }
  }

  private var topBar: some View {
    HStack(alignment: .center, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.string("Group DM").uppercased())
          .font(.system(size: 10, weight: .bold))
          .tracking(1.6)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        if editingName {
          TextField(EchoCopy.string("Group name"), text: $nameDraft)
            .textFieldStyle(.plain)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
            .focused($nameFocused)
            .onSubmit { Task { await commitNameEdit() } }
            .onChange(of: nameFocused) { _, focused in
              if !focused && editingName { Task { await commitNameEdit() } }
            }
            .onChange(of: nameDraft) { _, next in
              if next.count > EchoGroupDmRules.maxNameLength {
                nameDraft = String(next.prefix(EchoGroupDmRules.maxNameLength))
              }
            }
        } else {
          Button {
            editingName = true
            nameDraft = savedName
            nameFocused = true
          } label: {
            Text(savedName)
              .font(.system(size: 16, weight: .bold))
              .foregroundStyle(EchoTheme.Color.fg)
              .lineLimit(1)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Edit group name"))
        }
      }
      Spacer(minLength: 8)
      Button {
        showingAdd = true
      } label: {
        Image(systemName: "person.badge.plus")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.7))
          .frame(width: 32, height: 32)
          .echoPointerHoverFill(
            hoverFill: EchoTheme.Color.ink(0.14),
            idleFill: EchoTheme.Color.ink(0.08),
            cornerRadius: 16)
      }
      .buttonStyle(.plain)
      .disabled(isBusy)
      .accessibilityLabel(EchoCopy.string("Add Members"))
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .echoPointerHoverFill(
            hoverFill: EchoTheme.Color.ink(0.14),
            idleFill: EchoTheme.Color.ink(0.08),
            cornerRadius: 14)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
    .padding(.horizontal, 16)
    .padding(.top, 14)
    .padding(.bottom, 10)
  }

  private var hero: some View {
    VStack(spacing: 10) {
      PhotosPicker(selection: $iconItem, matching: .images) {
        ZStack {
          Group {
            if let iconPreview, let preview = Self.previewImage(iconPreview) {
              preview.resizable().scaledToFill()
            } else if let iconURL, !iconURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              EchoMediaImage(source: iconURL, baseURL: baseURL, accessToken: accessToken) {
                EchoConversationAvatar(
                  conversation: collageConversation, baseURL: baseURL, accessToken: accessToken)
              }
            } else {
              EchoConversationAvatar(
                conversation: collageConversation, baseURL: baseURL, accessToken: accessToken)
            }
          }
          .frame(width: 80, height: 80)
          .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .overlay {
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(EchoTheme.Color.ink(0.12), lineWidth: 2)
        }
        .overlay(alignment: .bottomTrailing) {
          Image(systemName: "pencil")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
            .frame(width: 22, height: 22)
            .background(EchoTheme.Color.elevatedDeep, in: Circle())
            .overlay(Circle().stroke(EchoTheme.Color.ink(0.12), lineWidth: 1))
            .offset(x: 4, y: 4)
        }
      }
      .buttonStyle(.plain)
      .disabled(isBusy)
      .accessibilityLabel(EchoCopy.string("Change group icon"))
      .task(id: iconItem) {
        let item = iconItem
        let data = try? await item?.loadTransferable(type: Data.self)
        guard !Task.isCancelled, item == iconItem, let data else { return }
        iconPreview = data
        await saveIcon(data)
      }

      Text(
        EchoGroupDmRules.memberCountLabel(
          for: otherMemberIDs.count + (removedIDs.contains(viewerUserID) ? 0 : 1))
      )
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(EchoTheme.Color.ink(0.55))

      Text(overviewDescription)
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .multilineTextAlignment(.center)
        .padding(.horizontal, 28)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 6)
    .padding(.bottom, 18)
  }

  private var membersSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(EchoCopy.string("Members").uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .padding(.horizontal, 16)

      LazyVStack(spacing: 2) {
        ForEach(visibleMembers) { member in
          memberRow(member)
        }
      }
      .padding(.horizontal, 10)
    }
  }

  private func memberRow(_ member: EchoUserProfile) -> some View {
    let status = presenceByID[member.id]
    return HStack(spacing: 12) {
      ZStack(alignment: .bottomTrailing) {
        EchoMediaImage(source: member.avatarURL, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: member.name, seed: member.id)
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        EchoPresenceIndicator(
          status: status, size: 10, borderColor: EchoTheme.Color.elevatedDeep
        )
        .offset(x: 1, y: 1)
      }
      Text(member.name)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(
          status?.lowercased() == "offline"
            ? EchoTheme.Color.ink(0.55) : EchoTheme.Color.fg
        )
        .lineLimit(1)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 8)
    .contentShape(Rectangle())
    .echoPointerHoverFill(
      hoverFill: EchoTheme.Color.ink(0.06),
      cornerRadius: 10)
    .contextMenu {
      Button(EchoCopy.string("Remove")) {
        Task { await remove(member.id, name: member.name) }
      }
    }
  }

  private var addSheet: some View {
    EchoGroupDmPickerSheet(
      mode: .add(existing: Set(otherMemberIDs + [viewerUserID])),
      baseURL: baseURL, accessToken: accessToken,
      onSubmit: { _, picked in await add(picked) },
      onClose: { showingAdd = false }
    )
    .environment(auth)
  }

  // MARK: - Actions

  private func token() async throws -> String { try await auth.ensureAccessToken() }

  private func loadMembers() async {
    let ids = conversation.memberUserIDs.filter { !EchoUserIdentity.matches($0, viewerUserID) }
    guard !ids.isEmpty, let token = try? await token() else { return }
    async let profiles = try? EchoSettingsClient(baseURL: baseURL).loadProfiles(
      userIDs: ids, accessToken: token)
    async let presence = try? EchoHomeClient(baseURL: baseURL).loadPresenceMap(
      accessToken: token, userIDs: ids)
    members = await profiles ?? []
    presenceByID = await presence ?? [:]
  }

  private func perform(_ failure: String, _ work: () async throws -> Void) async -> String? {
    isBusy = true
    errorMessage = nil
    statusMessage = nil
    defer { isBusy = false }
    do {
      try await work()
      return nil
    } catch {
      let message = echoSettingsErrorMessage(error, fallback: failure)
      errorMessage = message
      return message
    }
  }

  private func commitNameEdit() async {
    editingName = false
    nameFocused = false
    let name = trimmedName.isEmpty ? savedName : trimmedName
    nameDraft = name
    guard name != savedName else { return }
    let failure = await perform(EchoCopy.string("Echo couldn’t rename this group.")) {
      try await client.renameGroupDirectMessage(
        channelID: conversation.channelID, name: name, accessToken: try await token())
    }
    guard failure == nil else {
      nameDraft = savedName
      return
    }
    savedName = name
    statusMessage = EchoCopy.string("Group updated.")
    EchoGroupDmRules.notifyChanged(channelID: conversation.channelID)
  }

  private func saveIcon(_ data: Data) async {
    let pfp = "data:image/png;base64,\(data.base64EncodedString())"
    let failure = await perform(EchoCopy.string("Echo couldn’t update the group icon.")) {
      try await client.updateGroupDirectMessage(
        channelID: conversation.channelID, pfp: pfp, accessToken: try await token())
    }
    guard failure == nil else {
      iconPreview = nil
      return
    }
    iconURL = pfp
    statusMessage = EchoCopy.string("Group updated.")
    EchoGroupDmRules.notifyChanged(channelID: conversation.channelID)
  }

  private func remove(_ id: String, name: String) async {
    let failure = await perform(EchoCopy.string("Echo couldn’t remove that member.")) {
      try await client.removeGroupDirectMessageMember(
        channelID: conversation.channelID, userID: id, accessToken: try await token())
    }
    guard failure == nil else { return }
    removedIDs.insert(id)
    statusMessage = EchoCopy.format("Removed %@.", name)
    EchoGroupDmRules.notifyChanged(channelID: conversation.channelID)
  }

  private func add(_ picked: [EchoUserProfile]) async -> String? {
    let failure = await perform(EchoCopy.string("Echo couldn’t add those members.")) {
      try await client.addGroupDirectMessageMembers(
        channelID: conversation.channelID, memberUserIDs: picked.map(\.id),
        accessToken: try await token())
    }
    guard failure == nil else { return failure }
    members.append(contentsOf: picked)
    addedIDs.append(contentsOf: picked.map(\.id))
    removedIDs.subtract(picked.map(\.id))
    statusMessage = EchoCopy.string("Group updated.")
    EchoGroupDmRules.notifyChanged(channelID: conversation.channelID)
    return nil
  }

  private func leave() async {
    let failure = await perform(EchoCopy.string("Echo couldn’t leave this group.")) {
      try await client.leaveGroupDirectMessage(
        channelID: conversation.channelID, accessToken: try await token())
    }
    guard failure == nil else { return }
    EchoGroupDmRules.notifyChanged(channelID: conversation.channelID, left: true)
    onLeft()
  }

  private static func previewImage(_ data: Data) -> Image? {
    #if canImport(UIKit)
      guard let image = UIImage(data: data) else { return nil }
      return Image(uiImage: image)
    #elseif canImport(AppKit)
      guard let image = NSImage(data: data) else { return nil }
      return Image(nsImage: image)
    #else
      return nil
    #endif
  }
}
