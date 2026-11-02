import EchoDomain
import SwiftUI

/// Web `ChannelSettingsModal` for the channel types Apple supports (text, voice/stage, forum, paper):
/// overview, permissions, format (text), forum defaults, paper options, Discord sync / voice mirror
/// (Discord-imported servers), and danger zone. Webhooks stay kill-switched on web.
struct EchoChannelSettingsView: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let model: EchoServersModel
  let baseURL: URL
  var onClose: () -> Void

  enum SettingsTab: String, Hashable {
    case overview
    case permissions
    case format
    case forumCreator
    case paper
    case discordSync
    case discordVoiceMirror
    case danger
  }

  @State private var tab = SettingsTab.overview
  @State private var draft: EchoChannelSettingsDraft
  @State private var initialDraft: EchoChannelSettingsDraft
  @State private var rows: [EchoPermissionOverwrite] = []
  @State private var initialRows: [EchoPermissionOverwrite] = []
  @State private var permissionsLoading = true
  @State private var permissionsLoadFailed = false
  @State private var categories: [EchoGuildCategory] = []
  @State private var isSaving = false
  @State private var confirmDelete = false
  @State private var localError: String?
  @State private var savedNote: String?

  init(
    server: EchoServerSummary,
    channel: EchoGuildChannel,
    model: EchoServersModel,
    baseURL: URL,
    onClose: @escaping () -> Void
  ) {
    self.server = server
    self.channel = channel
    self.model = model
    self.baseURL = baseURL
    self.onClose = onClose
    let initial = EchoChannelSettingsDraft(channel: channel)
    _draft = State(initialValue: initial)
    _initialDraft = State(initialValue: initial)
  }

  private var liveChannel: EchoGuildChannel {
    model.channels(for: server.id).first { $0.id == channel.id } ?? channel
  }

  private var caps: EchoServerCapabilities { model.capabilities(for: server.id) }
  private var isDiscordImported: Bool {
    (model.servers.first { $0.id == server.id } ?? server).isDiscordImported
  }
  private var canViewPermissions: Bool { caps.canManageRoles || caps.canManageServer }

  private var permissionsDirty: Bool {
    !permissionsLoading && !permissionsLoadFailed
      && EchoPermissionOverwriteRows.changed(rows, initialRows)
  }

  private var isDirty: Bool { draft != initialDraft || permissionsDirty }

  private var tabs: [EchoSettingsTabItem<SettingsTab>] {
    var items = [
      EchoSettingsTabItem(
        id: SettingsTab.overview, title: EchoCopy.string("Overview"),
        copy: EchoCopy.string(
          "Set the channel name, category, slowmode, and other channel options."),
        icon: "slider.horizontal.3")
    ]
    if canViewPermissions {
      items.append(
        EchoSettingsTabItem(
          id: .permissions, title: EchoCopy.string("Permissions"),
          copy: EchoCopy.string("Control who can see this channel and what they can do here."),
          icon: "lock.shield"))
    }
    if draft.isText {
      items.append(
        EchoSettingsTabItem(
          id: .format, title: EchoCopy.string("Format"),
          copy: EchoCopy.string(
            "Default text inserted in the message box. Soft: users can delete it. Hard: prefix stays and is enforced when sending text."
          ),
          icon: "text.alignleft"))
    }
    if draft.isForum {
      items.append(
        EchoSettingsTabItem(
          id: .forumCreator, title: EchoCopy.string("Forum defaults"),
          copy: EchoCopy.string("Default sort, tags, and posting rules for new forum threads."),
          icon: "text.bubble"))
    }
    if draft.isPaper {
      items.append(
        EchoSettingsTabItem(
          id: .paper, title: EchoCopy.string("Paper"),
          copy: EchoCopy.string("Comments and author gutter for this document channel."),
          icon: "doc.richtext"))
    }
    if isDiscordImported, liveChannel.isTextLike || liveChannel.isForum {
      items.append(
        EchoSettingsTabItem(
          id: .discordSync, title: EchoCopy.string("Discord Sync"),
          copy: EchoCopy.string(
            "Mirror messages between this Echo channel and a Discord channel."),
          icon: "arrow.triangle.2.circlepath"))
    }
    if isDiscordImported, liveChannel.type.lowercased() == "voice" {
      items.append(
        EchoSettingsTabItem(
          id: .discordVoiceMirror, title: EchoCopy.string("Discord voice mirror"),
          copy: EchoCopy.string(
            "Show who is in Discord voice channels (display-only in Echo — join voice in Discord)."
          ),
          icon: "waveform"))
    }
    items.append(
      EchoSettingsTabItem(
        id: .danger, title: EchoCopy.string("Danger Zone"),
        copy: EchoCopy.string(
          "Sensitive actions that permanently remove this channel. Proceed carefully."),
        icon: "exclamationmark.triangle", isDanger: true))
    return items
  }

  var body: some View {
    EchoSettingsTabsModal(
      kicker: EchoCopy.string("Channel"),
      title: liveChannel.name,
      subtitle: EchoCopy.string("Configure this channel’s name, access, and options."),
      tabs: tabs,
      selection: $tab,
      isDirty: isDirty,
      canSave: !draft.trimmedName.isEmpty && !permissionsLoading,
      isSaving: isSaving,
      errorMessage: localError ?? model.actionErrorMessage,
      statusMessage: savedNote,
      onSave: { Task { await save() } },
      onDiscard: discard,
      onClose: onClose
    ) {
      tabContent
    }
    .task { await load() }
    .alert(EchoCopy.string("Delete this channel?"), isPresented: $confirmDelete) {
      Button(EchoCopy.string("Delete"), role: .destructive) {
        Task {
          if await model.deleteChannel(liveChannel, server: server) { onClose() }
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(EchoCopy.format("Delete #%@? This cannot be undone.", liveChannel.name))
    }
  }

  @ViewBuilder
  private var tabContent: some View {
    switch tab {
    case .overview:
      EchoChannelSettingsOverviewPanel(
        draft: $draft, initialCategoryID: initialDraft.categoryID, channel: liveChannel,
        categories: categories, baseURL: baseURL)
    case .permissions:
      if permissionsLoadFailed {
        Text(EchoCopy.string("Echo couldn’t load permissions for this channel."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      } else {
        EchoPermissionOverwriteEditor(
          rows: $rows,
          defs: EchoChannelPermissionCatalog.defs(forChannelType: liveChannel.type),
          roles: model.roles(for: server.id),
          members: model.members(for: server.id),
          loading: permissionsLoading)
      }
    case .format:
      EchoChannelSettingsFormatPanel(draft: $draft)
    case .forumCreator:
      EchoChannelSettingsForumPanel(draft: $draft)
    case .paper:
      EchoChannelSettingsPaperPanel(draft: $draft)
    case .discordSync:
      EchoChannelDiscordSyncPanel(server: server, channel: liveChannel, model: model)
    case .discordVoiceMirror:
      EchoDiscordVoiceMirrorPanel(
        server: server, scope: .channel(id: channel.id), model: model)
    case .danger:
      EchoChannelSettingsDangerPanel(
        draft: $draft, channel: liveChannel,
        canDelete: model.canManageChannel(channel.id, server: server)
      ) { confirmDelete = true }
    }
  }

  // MARK: - Loading / saving

  private func load() async {
    model.actionErrorMessage = nil
    await model.refreshChannelCapabilities(channelID: channel.id)
    async let loadedCategories = model.loadCategories(for: server)
    if model.members(for: server.id).isEmpty || model.roles(for: server.id).isEmpty {
      await model.loadMembers(for: server.id)
    }
    categories = await loadedCategories
    guard canViewPermissions else {
      permissionsLoading = false
      return
    }
    if let loaded = await model.loadOverwrites(channelID: channel.id) {
      rows = loaded
      initialRows = loaded
    } else {
      permissionsLoadFailed = true
    }
    permissionsLoading = false
  }

  private func discard() {
    draft = initialDraft
    rows = initialRows
    localError = nil
    savedNote = nil
  }

  private func save() async {
    isSaving = true
    localError = nil
    savedNote = nil
    defer { isSaving = false }
    let patch = draft.patch(against: initialDraft)
    if !patch.isEmpty {
      guard await model.updateChannel(liveChannel, server: server, patch: patch) else { return }
      let refreshed = EchoChannelSettingsDraft(channel: liveChannel)
      draft = refreshed
      initialDraft = refreshed
    }
    var stripped: [String] = []
    if permissionsDirty {
      guard
        let result = await model.saveOverwrites(
          channelID: channel.id, rows: EchoPermissionOverwriteRows.canonical(rows))
      else { return }
      stripped = result
      if let fresh = await model.loadOverwrites(channelID: channel.id) {
        rows = fresh
        initialRows = fresh
      } else {
        initialRows = rows
      }
    }
    savedNote =
      stripped.isEmpty
      ? EchoCopy.string("Channel settings saved.")
      : EchoCopy.string(
        "Saved, but some allowed permissions were removed because you don’t hold them yourself.")
  }
}
