import EchoDomain
import EchoNetworking
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

struct EchoServerMembersView: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  var onSelectMember: ((EchoServerMember) -> Void)? = nil
  var presentsAsSidebar = false
  var speakingIDs: Set<String> = []

  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoAuthenticationModel.self) var auth
  @Environment(EchoRealtimeSession.self) private var realtime
  @Environment(EchoShellChrome.self) private var shellChrome
  @State private var selectedMember: EchoServerMember?
  @State private var fullProfileMember: EchoServerMember?
  @State private var messageConversation: EchoDirectMessage?
  @State private var nicknameMember: EchoServerMember?
  @State private var nicknameDraft = ""
  @State private var showGuests = false
  @State private var isSearching = false
  @State private var searchText = ""
  @State private var hoveredMemberID: String?
  @FocusState private var searchFieldFocused: Bool
  @State private var kickTarget: EchoServerMember?
  @State private var banTarget: EchoServerMember?
  @State private var timeoutTarget: EchoServerMember?
  @State private var rolesMember: EchoServerMember?
  @AppStorage("echo.settings.advanced.developerMode") private var developerModeEnabled = false
  /// Presence + privacy-gated last-online from GET `/presence` (web member list).
  @State var presenceByUserID: [String: String] = [:]
  @State var lastOnlineAtByUserID: [String: String] = [:]

  private var preferLight: Bool { colorScheme == .light }
  private var sections: [EchoMemberListSection] {
    let base = model.memberSections(
      for: server.id, preferLight: preferLight, hideGuests: !showGuests)
    let needle = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return base }
    return base.compactMap { section in
      let matched = section.members.filter { memberMatches($0, needle: needle) }
      guard !matched.isEmpty else { return nil }
      return EchoMemberListSection(
        id: section.id,
        title: section.title,
        colorHex: section.colorHex,
        roleIconURL: section.roleIconURL,
        sortKey: section.sortKey,
        isUnhoisted: section.isUnhoisted,
        members: matched
      )
    }
  }
  private var guestCount: Int {
    model.members(for: server.id).filter(\.isGuest).count
  }

  var body: some View {
    let members = model.members(for: server.id)
    let filteredEmpty = !members.isEmpty && sections.isEmpty
    hosted(memberList(members: members, filteredEmpty: filteredEmpty))
      .background(EchoHomeBackground().ignoresSafeArea())
      .task {
        await model.loadMembers(for: server.id)
        // Presence is secondary chrome — refresh after members so the list opens fast.
        await refreshPresence()
      }
      .sheet(
        item: Binding(
          get: { presentsAsSidebar ? nil : selectedMember },
          set: { selectedMember = $0 }
        )
      ) { member in
        EchoGuildMemberQuickProfile(
          server: server,
          member: member,
          model: model,
          baseURL: baseURL,
          accessToken: accessToken,
          presenceStatus: presenceByUserID[member.userID],
          onOpenFullProfile: {
            selectedMember = nil
            if let onSelectMember {
              onSelectMember(member)
            } else {
              fullProfileMember = member
            }
          },
          onMessage: { Task { await openMessage(member) } },
          onMention: { mention(member) }
        )
      }
      .sheet(item: $messageConversation) { conversation in
        EchoConversationView(
          conversation: conversation,
          baseURL: baseURL,
          userID: model.currentUserID ?? "",
          callModel: nil
        )
        .environment(auth)
        .environment(realtime)
      }
      #if os(iOS)
        .fullScreenCover(item: $fullProfileMember) { member in
          fullProfile(member)
        }
        .sheet(item: $rolesMember) { member in
          EchoGuildMemberRoleManager(server: server, member: member, model: model)
        }
      #else
        // Real expanded profile modal (web `ExpandedProfileModal`) — not another popover.
        .sheet(item: $fullProfileMember) { member in
          fullProfile(member)
        }
        .popover(item: $rolesMember, arrowEdge: .trailing) { member in
          EchoGuildMemberRoleManager(server: server, member: member, model: model)
          .frame(width: 320, height: 420)
        }
      #endif
      .alert(
        EchoCopy.string("Change nickname"),
        isPresented: Binding(
          get: { nicknameMember != nil },
          set: { if !$0 { nicknameMember = nil } }
        )
      ) {
        TextField(EchoCopy.string("Nickname"), text: $nicknameDraft)
        Button(EchoCopy.string("Save")) {
          if let member = nicknameMember {
            Task {
              await model.setNickname(server: server, member: member, nickname: nicknameDraft)
            }
          }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      }
      .memberModerationDialogs(
        kickTarget: $kickTarget,
        banTarget: $banTarget,
        timeoutTarget: $timeoutTarget,
        server: server,
        model: model
      )
  }

  private func fullProfile(_ member: EchoServerMember) -> some View {
    EchoFullProfileView(
      profile: EchoUserProfile(
        id: member.userID,
        name: member.name,
        username: member.username,
        avatarURL: member.avatarURL
      ),
      presenceStatus: presenceByUserID[member.userID],
      baseURL: baseURL,
      accessToken: accessToken ?? "",
      compactPanel: false,
      serversModel: model
    )
  }

  @ViewBuilder
  private func hosted<Content: View>(_ content: Content) -> some View {
    if presentsAsSidebar {
      VStack(spacing: 0) {
        // Same search chrome as conversation search — not a separate “members only” field.
        membersSearchField
          .padding(.horizontal, 10)
          .padding(.top, 10)
          .padding(.bottom, 6)
        content
      }
    } else {
      NavigationStack {
        content
          .navigationTitle(EchoCopy.string("Members"))
          #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
          #endif
          .safeAreaInset(edge: .top, spacing: 0) {
            if isSearching { membersSearchField.padding(.horizontal, 12).padding(.bottom, 8) }
          }
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(EchoCopy.string("Done")) { dismiss() }
                .membersToolbarFlatStyle()
            }
            ToolbarItem(placement: .primaryAction) {
              Button {
                withAnimation(.easeOut(duration: 0.18)) {
                  isSearching.toggle()
                  if isSearching {
                    searchFieldFocused = true
                  } else {
                    searchText = ""
                    searchFieldFocused = false
                  }
                }
              } label: {
                Image(systemName: isSearching ? "xmark" : "magnifyingglass")
                  .font(.system(size: 16, weight: .semibold))
                  .foregroundStyle(EchoTheme.Color.ink(0.88))
              }
              .membersToolbarFlatStyle()
            }
          }
      }
    }
  }

  @ViewBuilder
  private func memberList(members: [EchoServerMember], filteredEmpty: Bool) -> some View {
    if model.isLoadingMembers && members.isEmpty {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if let error = model.membersErrorMessage, members.isEmpty {
      Text(error).font(.system(size: 13)).foregroundStyle(EchoTheme.Color.ink(0.5)).padding()
    } else if members.isEmpty {
      Text(EchoCopy.string("No members yet.")).font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.46)).padding()
    } else if filteredEmpty {
      Text(EchoCopy.string("No matching members")).font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.46)).padding()
    } else {
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 18) {
          ForEach(sections) { section in
            sectionBlock(section)
          }
          if guestCount > 0, searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Button {
              showGuests.toggle()
            } label: {
              Text(
                showGuests
                  ? EchoCopy.string("Hide guests")
                  : EchoCopy.format("Show guests (%d)", guestCount)
              )
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(EchoTheme.Color.ink(0.48))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.top, 4)
          }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
        .padding(.bottom, 18)
      }
    }
  }

  private func sectionBlock(_ section: EchoMemberListSection) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 6) {
        EchoRoleIconMark(
          iconURL: section.roleIconURL, colorHex: section.colorHex, size: 10,
          baseURL: baseURL, accessToken: accessToken)
        Text(sectionHeaderTitle(section))
          .font(.system(size: 11, weight: .semibold))
          .tracking(0.8)
          .foregroundStyle(Color(hex: section.colorHex) ?? EchoTheme.Color.ink(0.42))
      }
      .padding(.horizontal, 8)
      .padding(.bottom, 4)
      ForEach(section.members) { member in
        memberRow(member, roleColor: Color(hex: section.colorHex) ?? EchoTheme.Color.ink(0.88))
      }
    }
  }

  private var membersSearchField: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .allowsHitTesting(false)
      TextField(EchoCopy.string("Search"), text: $searchText)
        .focused($searchFieldFocused)
        .textFieldStyle(.plain)
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
      if !searchText.isEmpty {
        Button {
          searchText = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.32))
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 12)
    .frame(maxWidth: .infinity, minHeight: 40, maxHeight: 40, alignment: .leading)
    .background(
      EchoTheme.Color.ink(searchFieldFocused ? 0.085 : 0.065),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(
          searchFieldFocused
            ? EchoTheme.Color.indigo.opacity(0.45) : EchoTheme.Color.ink(0.08))
    )
    .contentShape(Rectangle())
    .overlay {
      if !searchFieldFocused {
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture { searchFieldFocused = true }
      }
    }
  }

  private func memberRow(_ member: EchoServerMember, roleColor: Color) -> some View {
    let hovered = hoveredMemberID == member.userID
    let timedOut = isTimedOut(member)
    let speaking = speakingIDs.contains(where: { EchoUserIdentity.matches($0, member.userID) })
    let row = HStack(spacing: 10) {
      ZStack {
        EchoMediaImage(
          source: member.avatarURL, baseURL: baseURL, accessToken: accessToken
        ) {
          EchoGeneratedAvatar(name: member.name, seed: member.userID)
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        if speaking {
          Circle()
            .stroke(EchoTheme.Color.signInBlue, lineWidth: 2)
            .frame(width: 36, height: 36)
        }
      }
      .frame(width: 32, height: 32)
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Text(member.name)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(timedOut ? EchoTheme.Color.ink(0.45) : roleColor)
            .lineLimit(1)
          if isOwner(member) {
            Image(systemName: "crown.fill")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(EchoTheme.Color.ownerCrown)
          }
          if timedOut {
            Text(EchoCopy.string("Timed out"))
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(EchoTheme.Color.presenceIdle)
              .padding(.horizontal, 5)
              .padding(.vertical, 1)
              .background(EchoTheme.Color.presenceIdle.opacity(0.16), in: Capsule())
          }
        }
        if let subtitle = subtitle(member) {
          Text(subtitle)
            .font(.system(size: 11))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(hovered ? EchoTheme.Color.ink(0.07) : Color.clear)
    )
    .contentShape(Rectangle())

    return Button {
      selectedMember = member
    } label: {
      row
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      hoveredMemberID = hovering ? member.userID : nil
    }
    .contextMenu { memberContextMenu(member) }
    #if os(macOS)
      .popover(
        isPresented: Binding(
          get: { presentsAsSidebar && selectedMember?.id == member.id },
          set: { if !$0, selectedMember?.id == member.id { selectedMember = nil } }
        ),
        arrowEdge: .leading
      ) {
        EchoGuildMemberQuickProfile(
          server: server,
          member: member,
          model: model,
          baseURL: baseURL,
          accessToken: accessToken,
          presenceStatus: presenceByUserID[member.userID],
          onOpenFullProfile: {
            selectedMember = nil
            if let onSelectMember {
              onSelectMember(member)
            } else {
              fullProfileMember = member
            }
          },
          onMessage: { Task { await openMessage(member) } },
          onMention: { mention(member) }
        )
        .frame(width: 340)
      }
    #endif
  }

  @ViewBuilder
  private func memberContextMenu(_ member: EchoServerMember) -> some View {
    Button {
      selectedMember = member
    } label: {
      Label(EchoCopy.string("Profile"), systemImage: "person.crop.circle")
    }
    if !EchoUserIdentity.matches(model.currentUserID, member.userID) {
      Button {
        mention(member)
      } label: {
        Label(EchoCopy.string("Mention"), systemImage: "at")
      }
      Button {
        Task { await openMessage(member) }
      } label: {
        Label(EchoCopy.string("Message"), systemImage: "bubble.left")
      }
    }
    if model.canChangeNickname(server, targetUserID: member.userID) {
      Button {
        nicknameDraft = member.name
        nicknameMember = member
      } label: {
        Label(EchoCopy.string("Change nickname"), systemImage: "pencil")
      }
    }
    if model.canManageRolesUI(for: server.id) {
      Button {
        rolesMember = member
      } label: {
        Label(EchoCopy.string("Manage Roles"), systemImage: "person.badge.key")
      }
    }
    Divider()
    if model.canTimeout(server, targetUserID: member.userID) {
      if isTimedOut(member) {
        Button {
          Task { await model.untimeout(server: server, member: member) }
        } label: {
          Label(EchoCopy.string("Remove timeout"), systemImage: "clock.badge.checkmark")
        }
      } else {
        Button {
          timeoutTarget = member
        } label: {
          Label(EchoCopy.string("Timeout"), systemImage: "clock.badge.exclamationmark")
        }
      }
    }
    if model.canKick(server, targetUserID: member.userID) {
      Button(role: .destructive) {
        kickTarget = member
      } label: {
        Label(EchoCopy.string("Kick"), systemImage: "figure.walk")
      }
    }
    if model.canBan(server, targetUserID: member.userID) {
      Button(role: .destructive) {
        banTarget = member
      } label: {
        Label(EchoCopy.string("Ban"), systemImage: "hammer.fill")
      }
    }
    if developerModeEnabled {
      Divider()
      Button {
        copyUserID(member.userID)
      } label: {
        Label(EchoCopy.string("Copy user ID"), systemImage: "doc.on.doc")
      }
    }
  }

  private func copyUserID(_ userID: String) {
    #if os(iOS)
      UIPasteboard.general.string = userID
    #else
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(userID, forType: .string)
    #endif
  }

  private func mention(_ member: EchoServerMember) {
    shellChrome.requestMentionInsert(
      userID: member.userID, name: member.name, username: member.username)
  }

  private func openMessage(_ member: EchoServerMember) async {
    let token = (try? await auth.ensureAccessToken()) ?? accessToken ?? ""
    let channelID: String
    if let opened = try? await EchoHomeClient(baseURL: baseURL).openDirectMessage(
      peerUserID: member.userID, accessToken: token)
    {
      channelID = opened
    } else {
      channelID = "dm-\(member.userID)"
    }
    messageConversation = EchoDirectMessage(
      id: channelID,
      channelID: channelID,
      peerUserID: member.userID,
      displayName: member.name,
      username: member.username,
      avatarURL: member.avatarURL
    )
  }

}

extension View {
  @ViewBuilder
  fileprivate func membersToolbarFlatStyle() -> some View {
    #if os(iOS)
      self.buttonStyle(.borderless)
    #else
      self.buttonStyle(.plain)
    #endif
  }

  func memberModerationDialogs(
    kickTarget: Binding<EchoServerMember?>,
    banTarget: Binding<EchoServerMember?>,
    timeoutTarget: Binding<EchoServerMember?>,
    server: EchoServerSummary,
    model: EchoServersModel
  ) -> some View {
    let caps = model.capabilities(for: server.id)
    return self
      .confirmationDialog(
        EchoCopy.string("Kick member?"),
        isPresented: Binding(
          get: { kickTarget.wrappedValue != nil },
          set: { if !$0 { kickTarget.wrappedValue = nil } }
        ),
        titleVisibility: .visible,
        presenting: kickTarget.wrappedValue
      ) { member in
        Button(EchoCopy.string("Kick"), role: .destructive) {
          Task { await model.kick(server: server, member: member) }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: { member in
        Text(EchoCopy.format("Remove %@ from %@?", member.name, server.name))
      }
      .sheet(item: banTarget) { member in
        EchoModerationActionSheet(
          action: .ban,
          member: member,
          server: server,
          canDeleteRecentMessages: caps.canManageMessages,
          onCancel: { banTarget.wrappedValue = nil },
          onConfirmTimeout: { _ in },
          onConfirmBan: { duration, reason, deleteHours in
            banTarget.wrappedValue = nil
            Task {
              await model.ban(
                server: server,
                member: member,
                durationMinutes: duration,
                reason: reason,
                deleteRecentMessagesHours: deleteHours)
            }
          }
        )
      }
      .sheet(item: timeoutTarget) { member in
        EchoModerationActionSheet(
          action: .timeout,
          member: member,
          server: server,
          onCancel: { timeoutTarget.wrappedValue = nil },
          onConfirmTimeout: { minutes in
            timeoutTarget.wrappedValue = nil
            Task { await model.timeout(server: server, member: member, minutes: minutes) }
          },
          onConfirmBan: { _, _, _ in }
        )
      }
      .alert(
        EchoCopy.string("Couldn’t update member"),
        isPresented: Binding(
          get: { model.memberActionErrorMessage != nil },
          set: { if !$0 { model.clearMemberActionError() } }
        )
      ) {
        Button(EchoCopy.string("OK"), role: .cancel) { model.clearMemberActionError() }
      } message: {
        Text(model.memberActionErrorMessage ?? "")
      }
  }
}
