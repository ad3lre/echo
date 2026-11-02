import EchoDomain
import PhotosUI
import SwiftUI

enum EchoServerSettingsSection: String, CaseIterable, Identifiable {
  case overview
  case structure
  case events
  case members
  case roles
  case selfRoles
  case emoji
  case discord
  case security
  case access
  case tickets
  case bannedWords
  case moderation
  case bans
  case auditLog
  case danger

  var id: String { rawValue }

  var title: String {
    switch self {
    case .overview: EchoCopy.string("Overview")
    case .structure: EchoCopy.string("Structure")
    case .events: EchoCopy.string("Events")
    case .members: EchoCopy.string("Members")
    case .roles: EchoCopy.string("Roles")
    case .selfRoles: EchoCopy.string("Self-assignable Roles")
    case .emoji: EchoCopy.string("Emoji")
    case .discord: EchoCopy.string("Discord")
    case .security: EchoCopy.string("Security")
    case .access: EchoCopy.string("Access")
    case .tickets: EchoCopy.string("Tickets")
    case .bannedWords: EchoCopy.string("Banned Words")
    case .moderation: EchoCopy.string("Moderation")
    case .bans: EchoCopy.string("Bans")
    case .auditLog: EchoCopy.string("Audit Log")
    case .danger: EchoCopy.string("Danger Zone")
    }
  }

  var copy: String {
    switch self {
    case .overview:
      EchoCopy.string("Manage branding, name, vanity, and discovery.")
    case .structure:
      EchoCopy.string("Reorder channels and categories.")
    case .events:
      EchoCopy.string("Schedule and manage server events.")
    case .members:
      EchoCopy.string("Review who's in this server.")
    case .roles:
      EchoCopy.string("Create roles and edit permissions.")
    case .selfRoles:
      EchoCopy.string("Let members pick roles from a panel.")
    case .emoji:
      EchoCopy.string("Manage custom emoji and stickers.")
    case .discord:
      EchoCopy.string("Discord import and bridge settings.")
    case .security:
      EchoCopy.string("Verification gates and guest access.")
    case .access:
      EchoCopy.string("Directory listing, invites, and applications.")
    case .tickets:
      EchoCopy.string("Support ticket channels and intake.")
    case .bannedWords:
      EchoCopy.string("Block messages that match banned terms.")
    case .moderation:
      EchoCopy.string("Automod and raid protection.")
    case .bans:
      EchoCopy.string("Review and lift bans.")
    case .auditLog:
      EchoCopy.string("See recent administrative actions.")
    case .danger:
      EchoCopy.string("Transfer ownership or delete this server.")
    }
  }

  var icon: String {
    switch self {
    case .overview: "square.grid.2x2"
    case .structure: "list.bullet.indent"
    case .events: "calendar"
    case .members: "person.2"
    case .roles: "tag"
    case .selfRoles: "person.crop.circle.badge.plus"
    case .emoji: "face.smiling"
    case .discord: "link"
    case .security: "lock.shield"
    case .access: "globe"
    case .tickets: "ticket"
    case .bannedWords: "text.badge.xmark"
    case .moderation: "shield.lefthalf.filled"
    case .bans: "hammer"
    case .auditLog: "list.clipboard"
    case .danger: "exclamationmark.triangle"
    }
  }
}

private struct EchoServerSettingsGroup: Identifiable {
  let id: String
  let title: String
  let items: [EchoServerSettingsSection]
}

/// Web `ServerSettingsModal` — full section taxonomy with capability gating.
struct EchoServerSettingsView: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  var userID: String = ""
  var onClose: () -> Void = {}
  var onLeftServer: () -> Void = {}

  @Environment(\.colorScheme) var colorScheme
  @State var section: EchoServerSettingsSection = .overview
  @State var name = ""
  @State var description = ""
  @State var vanityCode = ""
  @State var tagsText = ""
  @State var welcomeChannelID = ""
  @State var listedInDirectory = true
  @State var inviteJoinEnabled = true
  @State var applicationsEnabled = false
  @State var allowGlobalGuests = true
  @State var verificationRequireEmail = false
  @State var bannerBlurEnabled = false
  @State var bannerBlackoutEnabled = false
  @State var automodSpamEnabled = false
  @State var raidProtectionEnabled = false
  @State var raidJoinThresholdCount = 10
  @State var raidJoinWindowSeconds = 60
  @State var memberQuery = ""
  @State var localError: String?
  @State var savedFlash = false
  @State var showingLeave = false
  @State var deleteNameConfirm = ""
  @State var showingTransfer = false
  @State var transferOwnerID = ""
  @State var iconItem: PhotosPickerItem?
  @State var bannerItem: PhotosPickerItem?
  @State var pendingIconData: Data?
  @State var pendingBannerData: Data?

  var liveServer: EchoServerSummary {
    model.servers.first { $0.id == server.id } ?? server
  }

  var caps: EchoServerCapabilities { model.capabilities(for: liveServer.id) }
  var canManage: Bool { caps.canManageServer }
  private var canManageRoles: Bool { caps.canManageRoles }
  private var canStructure: Bool { caps.canCreateChannel }
  var isOwner: Bool {
    let owner = liveServer.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return !owner.isEmpty && EchoUserIdentity.matches(owner, userID)
  }

  private var groups: [EchoServerSettingsGroup] {
    let all: [EchoServerSettingsGroup] = [
      EchoServerSettingsGroup(
        id: "general", title: EchoCopy.string("General"),
        items: [.overview, .structure, .events]),
      EchoServerSettingsGroup(
        id: "community", title: EchoCopy.string("Community"),
        items: [.members, .roles, .selfRoles, .emoji]),
      EchoServerSettingsGroup(
        id: "integrations", title: EchoCopy.string("Integrations"),
        items: [.discord]),
      EchoServerSettingsGroup(
        id: "access", title: EchoCopy.string("Access"),
        items: [.security, .access, .tickets]),
      EchoServerSettingsGroup(
        id: "moderation", title: EchoCopy.string("Moderation"),
        items: [.bannedWords, .moderation, .bans, .auditLog]),
      EchoServerSettingsGroup(
        id: "danger", title: EchoCopy.string("Danger zone"), items: [.danger]),
    ]
    return all.compactMap { group in
      let items = group.items.filter(isVisible)
      guard !items.isEmpty else { return nil }
      return EchoServerSettingsGroup(id: group.id, title: group.title, items: items)
    }
  }

  private var visibleSections: [EchoServerSettingsSection] {
    groups.flatMap(\.items)
  }

  private func isVisible(_ item: EchoServerSettingsSection) -> Bool {
    switch item {
    case .roles: return canManageRoles
    case .danger: return isOwner
    case .structure: return canStructure
    case .discord: return liveServer.isDiscordImported && canManage
    default: return canManage
    }
  }

  var body: some View {
    HStack(spacing: 0) {
      sidebar
        .frame(width: 248)
        .frame(maxHeight: .infinity)
      Rectangle()
        .fill(EchoTheme.Color.ink(0.08))
        .frame(width: 1)
      detail
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(EchoTheme.Color.canvas.ignoresSafeArea())
    .onAppear {
      hydrate(from: liveServer)
      if !isVisible(section), let first = visibleSections.first {
        section = first
      }
      Task {
        if model.members(for: liveServer.id).isEmpty {
          await model.loadMembers(for: liveServer.id)
        }
        if model.channels(for: liveServer.id).isEmpty {
          await model.loadChannels(for: liveServer.id)
        }
      }
    }
    .onChange(of: section) { _, _ in
      localError = nil
      savedFlash = false
    }
    .onChange(of: liveServer) { _, next in hydrate(from: next) }
    .onChange(of: iconItem) { _, item in
      Task { pendingIconData = await loadImageData(from: item) }
    }
    .onChange(of: bannerItem) { _, item in
      Task { pendingBannerData = await loadImageData(from: item) }
    }
    .alert(EchoCopy.string("Leave server?"), isPresented: $showingLeave) {
      Button(EchoCopy.string("Leave"), role: .destructive) {
        Task {
          await model.leave(liveServer)
          if model.actionErrorMessage == nil { onLeftServer() }
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(EchoCopy.format("Leave %@? You can rejoin later with an invite.", liveServer.name))
    }
    .alert(EchoCopy.string("Transfer ownership?"), isPresented: $showingTransfer) {
      Button(EchoCopy.string("Transfer"), role: .destructive) {
        Task {
          if await model.transferOwnership(liveServer, to: transferOwnerID) {
            showingTransfer = false
          } else {
            localError = model.actionErrorMessage
          }
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      let name =
        model.members(for: liveServer.id).first { $0.userID == transferOwnerID }?.name
        ?? EchoCopy.string("this member")
      Text(
        EchoCopy.format(
          "Make %@ the owner? You will lose ownership privileges.", name))
    }
  }

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 6) {
        Text(EchoCopy.string("Server Settings"))
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .textCase(.uppercase)
        Text(liveServer.name)
          .font(.system(size: 24, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(2)
        Text(EchoCopy.string("Configure the server, roles, invites, and moderation."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.horizontal, 20)
      .padding(.top, 22)
      .padding(.bottom, 18)

      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          ForEach(groups) { group in
            VStack(alignment: .leading, spacing: 4) {
              Text(group.title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.8)
                .foregroundStyle(EchoTheme.Color.ink(0.40))
                .padding(.horizontal, 20)
                .padding(.bottom, 2)
              ForEach(group.items) { item in
                sidebarItem(item)
              }
            }
          }
        }
        .padding(.bottom, 24)
      }
    }
    .background(EchoTheme.Color.ink(0.03))
  }

  private func sidebarItem(_ item: EchoServerSettingsSection) -> some View {
    let selected = section == item
    return Button {
      section = item
    } label: {
      HStack(spacing: 10) {
        Image(systemName: item.icon)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.48))
          .frame(width: 18)
        Text(item.title)
          .font(.system(size: 13.5, weight: selected ? .semibold : .medium))
          .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.58))
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(
        selected ? EchoTheme.Color.signInBlue.opacity(0.16) : Color.clear,
        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 8)
  }

  private var detail: some View {
    VStack(alignment: .leading, spacing: 0) {
      detailHeader
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          if let localError {
            HStack(alignment: .top, spacing: 10) {
              EchoSettingsStatusLine(message: localError, isError: true)
              Spacer(minLength: 8)
              Button {
                self.localError = nil
              } label: {
                Image(systemName: "xmark")
                  .font(.system(size: 11, weight: .bold))
                  .foregroundStyle(EchoTheme.Color.ink(0.45))
                  .frame(width: 24, height: 24)
                  .contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .accessibilityLabel(EchoCopy.string("Dismiss"))
            }
            .padding(12)
            .background(
              EchoTheme.Color.mentionPing.opacity(0.08),
              in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay {
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(EchoTheme.Color.mentionPing.opacity(0.22), lineWidth: 1)
            }
          }
          if let action = model.actionErrorMessage, section == .danger {
            Text(action)
              .font(.system(size: 13))
              .foregroundStyle(EchoTheme.Color.mentionPing)
          }
          sectionBody
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 36)
        .frame(
          maxWidth: {
            switch section {
            case .roles, .overview, .structure, .events: 980
            default: 720
            }
          }(),
          alignment: .leading)
      }
    }
  }

  private var detailHeader: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        Text(EchoCopy.string("Server"))
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
          .textCase(.uppercase)
        HStack(spacing: 12) {
          Image(systemName: section.icon)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.62))
          Text(section.title)
            .font(.system(size: 28, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
        }
        Text(section.copy)
          .font(.system(size: 14))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
      Spacer(minLength: 12)
      EchoDesktopGhostButton(title: EchoCopy.string("Close"), action: onClose)
    }
    .padding(.horizontal, 32)
    .padding(.top, 22)
    .padding(.bottom, 18)
  }

  @ViewBuilder
  private var sectionBody: some View {
    switch section {
    case .overview: overviewSection
    case .members: membersSection
    case .roles:
      EchoServerSettingsRolesEditor(
        server: liveServer, model: model, baseURL: baseURL, accessToken: accessToken,
        localError: $localError, onCloseSettings: onClose)
    case .security: securitySection
    case .access: accessSection
    case .moderation: moderationSection
    case .bannedWords:
      EchoServerSettingsBannedWordsPanel(
        server: liveServer, model: model, localError: $localError)
    case .bans:
      EchoServerSettingsBansPanel(
        server: liveServer, model: model, localError: $localError)
    case .auditLog:
      EchoServerSettingsAuditPanel(
        server: liveServer, model: model, localError: $localError)
    case .danger: dangerSection
    case .structure:
      EchoServerSettingsStructurePanel(
        server: liveServer, model: model, baseURL: baseURL, accessToken: accessToken,
        localError: $localError)
    case .selfRoles:
      EchoServerSettingsSelfRolesPanel(
        server: liveServer, model: model, localError: $localError)
    case .events:
      EchoServerSettingsEventsPanel(
        server: liveServer, model: model, baseURL: baseURL, accessToken: accessToken,
        localError: $localError)
    case .emoji:
      EchoServerSettingsEmojiPanel(
        server: liveServer, model: model, baseURL: baseURL, accessToken: accessToken,
        localError: $localError)
    case .discord:
      EchoServerSettingsDiscordPanel(
        server: liveServer, model: model, localError: $localError)
    case .tickets:
      EchoServerSettingsTicketsPanel(
        server: liveServer, model: model, localError: $localError)
    }
  }

  private func hydrate(from server: EchoServerSummary) {
    name = server.name
    description = server.description ?? ""
    vanityCode = server.vanityCode ?? ""
    tagsText = server.tags.joined(separator: ", ")
    welcomeChannelID = server.welcomeChannelID ?? ""
    listedInDirectory = server.listedInDirectory
    inviteJoinEnabled = server.inviteJoinEnabled
    applicationsEnabled = server.applicationsEnabled
    allowGlobalGuests = server.allowGlobalGuests
    verificationRequireEmail = server.verificationRequireEmail
    bannerBlurEnabled = server.bannerBlurEnabled
    bannerBlackoutEnabled = server.bannerBlackoutEnabled
    automodSpamEnabled = server.automodSpamEnabled
    raidProtectionEnabled = server.raidProtectionEnabled
    raidJoinThresholdCount = server.raidJoinThresholdCount
    raidJoinWindowSeconds = server.raidJoinWindowSeconds
  }

  func saveCurrentSection() async {
    localError = nil
    savedFlash = false
    let tags = tagsText
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
      .filter { !$0.isEmpty }
    var patch = EchoServerPreferencesPatch()
    switch section {
    case .overview:
      patch.name = name
      patch.description = description
      patch.vanityCode = vanityCode.trimmingCharacters(in: .whitespacesAndNewlines)
      patch.tags = tags
      patch.bannerBlurEnabled = bannerBlurEnabled
      patch.bannerBlackoutEnabled = bannerBlackoutEnabled
      if welcomeChannelID.isEmpty {
        patch.clearWelcomeChannel = true
      } else {
        patch.welcomeChannelID = welcomeChannelID
      }
      if let pendingIconData {
        patch.iconURL = "data:image/png;base64,\(pendingIconData.base64EncodedString())"
      }
      if let pendingBannerData {
        patch.bannerURL = "data:image/png;base64,\(pendingBannerData.base64EncodedString())"
      }
    case .access:
      patch.listedInDirectory = listedInDirectory
      patch.inviteJoinEnabled = inviteJoinEnabled
      patch.applicationsEnabled = applicationsEnabled
    case .security:
      patch.allowGlobalGuests = allowGlobalGuests
      patch.verificationRequireEmail = verificationRequireEmail
    case .moderation:
      patch.automodSpamEnabled = automodSpamEnabled
      patch.raidProtectionEnabled = raidProtectionEnabled
      patch.raidJoinThresholdCount = max(2, raidJoinThresholdCount)
      patch.raidJoinWindowSeconds = max(10, raidJoinWindowSeconds)
    default:
      return
    }
    let ok = await model.patchPreferences(
      liveServer, patch, requireNonEmptyName: section == .overview)
    if ok {
      savedFlash = true
      pendingIconData = nil
      pendingBannerData = nil
      iconItem = nil
      bannerItem = nil
    } else {
      localError = model.actionErrorMessage
    }
  }

  private func loadImageData(from item: PhotosPickerItem?) async -> Data? {
    guard let item else { return nil }
    return try? await item.loadTransferable(type: Data.self)
  }
}
