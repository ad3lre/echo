import EchoDomain
import SwiftUI

/// Identifies the category a settings modal was opened for (from the channel list header).
struct EchoCategoryTarget: Identifiable, Hashable {
  let id: String
  let name: String
}

/// Web `CategorySettingsModal` — overview, permissions, and danger zone (auto-delete + delete).
/// Discord chat sync / voice mirror tabs appear on Discord-imported servers.
struct EchoCategorySettingsView: View {
  let server: EchoServerSummary
  let target: EchoCategoryTarget
  let model: EchoServersModel
  var onClose: () -> Void

  enum SettingsTab: String, Hashable {
    case overview
    case permissions
    case discordChatSync
    case discordVoiceMirror
    case danger
  }

  @State private var tab = SettingsTab.overview
  @State private var name: String
  @State private var initialName: String
  @State private var autoDeleteSeconds = 0
  @State private var initialAutoDelete = 0
  @State private var rows: [EchoPermissionOverwrite] = []
  @State private var initialRows: [EchoPermissionOverwrite] = []
  @State private var permissionsLoading = true
  @State private var permissionsLoadFailed = false
  @State private var isSaving = false
  @State private var confirmDelete = false
  @State private var localError: String?
  @State private var savedNote: String?

  init(
    server: EchoServerSummary, target: EchoCategoryTarget, model: EchoServersModel,
    onClose: @escaping () -> Void
  ) {
    self.server = server
    self.target = target
    self.model = model
    self.onClose = onClose
    _name = State(initialValue: target.name)
    _initialName = State(initialValue: target.name)
  }

  private var caps: EchoServerCapabilities { model.capabilities(for: server.id) }
  private var canViewPermissions: Bool { caps.canManageRoles || caps.canManageServer }
  private var isDiscordImported: Bool {
    (model.servers.first { $0.id == server.id } ?? server).isDiscordImported
  }

  private var channelCount: Int {
    model.channels(for: server.id).filter { $0.categoryID == target.id }.count
  }

  private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

  private var permissionsDirty: Bool {
    !permissionsLoading && !permissionsLoadFailed
      && EchoPermissionOverwriteRows.changed(rows, initialRows)
  }

  private var isDirty: Bool {
    trimmedName != initialName.trimmingCharacters(in: .whitespacesAndNewlines)
      || autoDeleteSeconds != initialAutoDelete || permissionsDirty
  }

  private var tabs: [EchoSettingsTabItem<SettingsTab>] {
    var items = [
      EchoSettingsTabItem(
        id: SettingsTab.overview, title: EchoCopy.string("Overview"),
        copy: EchoCopy.string(
          "Rename this category. Channels that match category permissions use the Permissions tab."
        ),
        icon: "list.bullet")
    ]
    if canViewPermissions {
      items.append(
        EchoSettingsTabItem(
          id: .permissions, title: EchoCopy.string("Permissions"),
          copy: EchoCopy.string(
            "Set default permissions for this category. Channels that match the category use these rules."
          ),
          icon: "lock.shield"))
    }
    if isDiscordImported {
      items.append(
        EchoSettingsTabItem(
          id: .discordChatSync, title: EchoCopy.string("Discord messages (category)"),
          copy: EchoCopy.string(
            "Turn on the same Discord message linking for every text and forum channel in this category."
          ),
          icon: "arrow.triangle.2.circlepath"))
      items.append(
        EchoSettingsTabItem(
          id: .discordVoiceMirror, title: EchoCopy.string("Discord voice activity"),
          copy: EchoCopy.string(
            "Show who is in voice on Discord for channels in this category. Join voice in Discord to participate."
          ),
          icon: "waveform"))
    }
    items.append(
      EchoSettingsTabItem(
        id: .danger, title: EchoCopy.string("Danger Zone"),
        copy: EchoCopy.string(
          "Sensitive actions that permanently remove this category and its channels. Proceed carefully."
        ),
        icon: "exclamationmark.triangle", isDanger: true))
    return items
  }

  var body: some View {
    EchoSettingsTabsModal(
      kicker: EchoCopy.string("Category"),
      title: trimmedName.isEmpty ? target.name : trimmedName,
      subtitle: EchoCopy.string("Defaults for channels that sync with this category."),
      tabs: tabs,
      selection: $tab,
      isDirty: isDirty,
      canSave: !trimmedName.isEmpty && !permissionsLoading,
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
    .alert(
      EchoCopy.format("Delete category “%@”?", target.name), isPresented: $confirmDelete
    ) {
      Button(EchoCopy.string("Delete category"), role: .destructive) {
        Task {
          if await model.deleteCategory(target.id, server: server) { onClose() }
        }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(
        channelCount == 1
          ? EchoCopy.string("Delete this category and its channel? This cannot be undone.")
          : EchoCopy.format(
            "Delete this category and all %d channels inside it? This cannot be undone.",
            channelCount))
    }
  }

  @ViewBuilder
  private var tabContent: some View {
    switch tab {
    case .overview:
      EchoDesktopLabeledField(title: EchoCopy.string("Category name")) {
        TextField(EchoCopy.string("category-name"), text: $name)
          .onChange(of: name) { _, next in
            if next.count > 100 { name = String(next.prefix(100)) }
          }
      }
    case .permissions:
      if permissionsLoadFailed {
        Text(EchoCopy.string("Echo couldn’t load permissions for this category."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      } else {
        EchoPermissionOverwriteEditor(
          rows: $rows,
          defs: EchoChannelPermissionCatalog.category,
          roles: model.roles(for: server.id),
          members: model.members(for: server.id),
          loading: permissionsLoading)
      }
    case .discordChatSync:
      EchoCategoryDiscordChatSyncPanel(server: server, categoryID: target.id, model: model)
    case .discordVoiceMirror:
      EchoDiscordVoiceMirrorPanel(
        server: server, scope: .category(id: target.id), model: model)
    case .danger:
      dangerPanel
    }
  }

  private var dangerPanel: some View {
    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 12) {
        EchoSettingsSectionHeading(
          title: EchoCopy.string("Auto-delete messages"),
          subtitle: EchoCopy.string(
            "Messages in channels that sync with this category are removed after this period."))
        EchoSettingsPickerField(
          title: EchoCopy.string("Retention"),
          selection: $autoDeleteSeconds,
          options: EchoChannelSettingsDraft.retentionValues.map {
            ($0, EchoChannelSettingsDraft.retentionLabel($0))
          }
        )
      }
      HStack(alignment: .center, spacing: 16) {
        VStack(alignment: .leading, spacing: 4) {
          Text(EchoCopy.string("Delete category"))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.mentionPing)
          Text(
            EchoCopy.string(
              "Permanently delete this category and all channels inside it. Message history for those channels will be removed."
            )
          )
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 8)
        EchoSettingsDangerButton(title: EchoCopy.string("Delete category")) {
          confirmDelete = true
        }
      }
      .echoSettingsCard()
    }
  }

  // MARK: - Loading / saving

  private func load() async {
    model.actionErrorMessage = nil
    async let loadedCategories = model.loadCategories(for: server)
    if model.members(for: server.id).isEmpty || model.roles(for: server.id).isEmpty {
      await model.loadMembers(for: server.id)
    }
    if let category = await loadedCategories.first(where: { $0.id == target.id }) {
      if trimmedName == initialName.trimmingCharacters(in: .whitespacesAndNewlines) {
        name = category.name
      }
      initialName = category.name
      autoDeleteSeconds = category.autoDeleteAfterSeconds ?? 0
      initialAutoDelete = autoDeleteSeconds
    }
    guard canViewPermissions else {
      permissionsLoading = false
      return
    }
    if let loaded = await model.loadCategoryOverwrites(target.id, server: server) {
      rows = loaded
      initialRows = loaded
    } else {
      permissionsLoadFailed = true
    }
    permissionsLoading = false
  }

  private func discard() {
    name = initialName
    autoDeleteSeconds = initialAutoDelete
    rows = initialRows
    localError = nil
    savedNote = nil
  }

  private func save() async {
    isSaving = true
    localError = nil
    savedNote = nil
    defer { isSaving = false }
    let renamed = trimmedName != initialName.trimmingCharacters(in: .whitespacesAndNewlines)
    let retentionChanged = autoDeleteSeconds != initialAutoDelete
    if renamed || retentionChanged {
      let retention: EchoPatchValue<Int>? =
        retentionChanged ? (autoDeleteSeconds == 0 ? .clear : .set(autoDeleteSeconds)) : nil
      guard
        await model.updateCategory(
          target.id, server: server, name: renamed ? trimmedName : nil, autoDelete: retention)
      else { return }
      initialName = trimmedName
      name = trimmedName
      initialAutoDelete = autoDeleteSeconds
    }
    var stripped: [String] = []
    if permissionsDirty {
      guard
        let result = await model.saveCategoryOverwrites(
          target.id, server: server, rows: EchoPermissionOverwriteRows.canonical(rows))
      else { return }
      stripped = result
      if let fresh = await model.loadCategoryOverwrites(target.id, server: server) {
        rows = fresh
        initialRows = fresh
      } else {
        initialRows = rows
      }
    }
    savedNote =
      stripped.isEmpty
      ? EchoCopy.string("Category settings saved.")
      : EchoCopy.string(
        "Saved, but some allowed permissions were removed because you don’t hold them yourself.")
  }
}
