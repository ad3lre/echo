import EchoDomain
import Observation
import SwiftUI

/// Shell chrome knobs for tab bar suppress, Duo layout, and Servers back.
@MainActor
@Observable
final class EchoShellChrome {
  /// Immersive guild chat — hide the floating tab bar.
  var immersiveGuildChat = false
  /// List search focus (Home / Servers / Explore) — hide the floating tab bar.
  var listSearchActive = false
  /// Bumped when the user re-taps Servers while already on that tab — nested
  /// surfaces pop one level (chat → channel list → server list).
  private(set) var serversBackRequest = 0
  /// Bumped on tab switch so keep-alive tabs resign list search (focus can
  /// otherwise survive while `listSearchActive` was cleared).
  private(set) var resignListSearchRequest = 0
  /// Bumped from the Mac rail / menu to open Settings on Home.
  private(set) var openSettingsRequest = 0
  /// Bumped by the quick-switcher shortcut on iOS; Home focuses its conversation search
  /// (macOS opens the shell `EchoQuickSwitcherView` overlay instead).
  private(set) var quickSwitcherRequest = 0
  /// Bumped from the Mac rail avatar to open the self profile menu.
  private(set) var openProfileMenuRequest = 0
  /// Bumped from the status popout to open edit profile (with notes).
  private(set) var openProfileEditRequest = 0
  /// Home publishes its DM list here so the shell-level Quick Switcher can search it.
  var quickSwitcherConversations: [EchoDirectMessage] = []
  /// Quick Switcher DM pick: Home opens the conversation with this channel id.
  var pendingDMOpenChannelID: String?
  /// Currently open guild — drives Mac rail highlight independently of tab.
  var activeServerID: String?
  /// Member-list / message-menu “Mention” inserts a real mention token into the open composer.
  var pendingMentionInsert: EchoPendingMentionInsert?
  /// Notifications / search: switch to Servers and open this guild channel.
  var pendingGuildOpen: EchoPendingGuildOpen?
  /// Jump the matching conversation timeline to this message after it mounts.
  var pendingMessageJump: EchoPendingMessageJump?
  /// `#channel` pill / cross-server link without a message: open this channel (any server).
  var pendingChannelOpen: EchoPendingChannelOpen?
  /// Profile “Join” → open guild voice and optionally open a VC activity (web `handleDmPanelJoinGuildVoiceActivity`).
  var pendingProfileVoiceJoin: EchoPendingProfileVoiceJoin?
  /// Latest Duo / wide layout measurement from ``EchoDuoLayoutReader``.
  var layout = EchoDuoLayout()
  /// Mac guild: members list open on the trailing edge (web-collapsible).
  var macMembersPanelOpen = true
  /// Mac home: DM inbox column open (web `isDMPanelOpen`).
  var macDmListPanelOpen = true
  /// Live “Preview as role” (web `useRolePreview`) — composer + header chip.
  var rolePreview: EchoRolePreviewState?

  var suppressTabBar: Bool {
    immersiveGuildChat || listSearchActive
  }

  func toggleMacMembersPanel() {
    withAnimation(.easeOut(duration: 0.18)) {
      macMembersPanelOpen.toggle()
    }
  }

  func setMacMembersPanelOpen(_ open: Bool) {
    guard macMembersPanelOpen != open else { return }
    withAnimation(.easeOut(duration: 0.18)) {
      macMembersPanelOpen = open
    }
  }

  func toggleMacDmListPanel() {
    withAnimation(.easeOut(duration: 0.18)) {
      macDmListPanelOpen.toggle()
    }
  }

  func setMacDmListPanelOpen(_ open: Bool) {
    guard macDmListPanelOpen != open else { return }
    withAnimation(.easeOut(duration: 0.18)) {
      macDmListPanelOpen = open
    }
  }

  func requestServersBack() {
    serversBackRequest &+= 1
  }

  func clearListSearch() {
    listSearchActive = false
  }

  func requestResignListSearch() {
    resignListSearchRequest &+= 1
    listSearchActive = false
  }

  func requestOpenSettings() {
    openSettingsRequest &+= 1
  }

  func requestQuickSwitcher() {
    quickSwitcherRequest &+= 1
  }

  func requestOpenProfileMenu() {
    openProfileMenuRequest &+= 1
  }

  func requestOpenProfileEdit() {
    openProfileEditRequest &+= 1
  }

  func requestMentionInsert(userID: String, name: String, username: String? = nil) {
    let label = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !userID.isEmpty, !label.isEmpty else { return }
    pendingMentionInsert = EchoPendingMentionInsert(
      option: EchoMentionOption(
        kind: .user, refID: userID, name: label, aliases: username.map { [$0] } ?? []))
  }

  func requestOpenGuild(serverID: String, channelID: String?, messageID: String?) {
    if let channelID, let messageID {
      pendingMessageJump = EchoPendingMessageJump(channelID: channelID, messageID: messageID)
    }
    pendingGuildOpen = EchoPendingGuildOpen(
      serverID: serverID, channelID: channelID, messageID: messageID)
  }

  /// Leave a profile and connect to the peer’s guild voice channel (optional shared activity after connect).
  func requestJoinProfileGuildVoice(
    serverID: String,
    channelID: String,
    channelName: String,
    vcActivityPhase: String? = nil
  ) {
    let sid = serverID.trimmingCharacters(in: .whitespacesAndNewlines)
    let cid = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, !cid.isEmpty else { return }
    let phase = vcActivityPhase?.trimmingCharacters(in: .whitespacesAndNewlines)
    pendingProfileVoiceJoin = EchoPendingProfileVoiceJoin(
      serverID: sid,
      channelID: cid,
      channelName: channelName.trimmingCharacters(in: .whitespacesAndNewlines),
      vcActivityPhase: phase.flatMap { $0.isEmpty ? nil : $0 })
    requestOpenGuild(serverID: sid, channelID: cid, messageID: nil)
  }

  func requestJumpToMessage(channelID: String, messageID: String) {
    pendingMessageJump = EchoPendingMessageJump(channelID: channelID, messageID: messageID)
  }

  func requestOpenChannel(channelID: String) {
    pendingChannelOpen = EchoPendingChannelOpen(channelID: channelID)
  }

  func startRolePreview(_ state: EchoRolePreviewState) {
    rolePreview = EchoRolePreviewState(
      serverID: state.serverID,
      roleID: state.roleID,
      roleName: state.roleName,
      roleColor: state.roleColor,
      uiPermissions: Array(Set(state.uiPermissions)))
  }

  func clearRolePreview() {
    rolePreview = nil
  }
}

/// Mention picked outside the composer (member list, message menu).
struct EchoPendingMentionInsert: Equatable {
  let option: EchoMentionOption
  let nonce = UUID()
}

struct EchoPendingGuildOpen: Equatable {
  var serverID: String
  var channelID: String?
  var messageID: String?
}

struct EchoPendingMessageJump: Equatable {
  var channelID: String
  var messageID: String
}

struct EchoPendingChannelOpen: Equatable {
  var channelID: String
  let nonce = UUID()
}

struct EchoPendingProfileVoiceJoin: Equatable {
  var serverID: String
  var channelID: String
  var channelName: String
  /// Web `activityPhase` after LiveKit connects (`applyVcActivityUiPhase`).
  var vcActivityPhase: String?
}
