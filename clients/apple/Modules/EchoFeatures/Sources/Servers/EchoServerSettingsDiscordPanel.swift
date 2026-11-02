import EchoDomain
import SwiftUI

/// Web `ServerSettingsDiscordSection` — per-channel Discord bridge + staged server import.
struct EchoServerSettingsDiscordPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  private enum ImportStep: String, CaseIterable, Identifiable {
    case metadata, roles, members, channels
    var id: String { rawValue }
  }

  private enum PendingConfirm: Identifiable {
    case channels
    case refresh
    var id: String { self == .channels ? "channels" : "refresh" }
  }

  // Import
  @State private var state: EchoDiscordImportState?
  @State private var stateLoading = true
  @State private var activeStep: ImportStep?
  @State private var refreshBusy = false
  @State private var pendingConfirm: PendingConfirm?

  // Bridge
  @State private var bridgeChannelID = ""
  @State private var bridgeInbound = false
  @State private var bridgeOutbound = false
  @State private var bridgeWebhookDraft = ""
  @State private var bridgeHasWebhook = false
  @State private var bridgeLoading = false
  @State private var bridgeSaving = false
  @State private var bridgeSavedFlash = false

  private static let webhookPlaceholder = "https://discord.com/api/webhooks/…"

  private var textChannels: [EchoGuildChannel] {
    model.channels(for: server.id).filter { $0.type.lowercased() == "text" || $0.isTextLike }
  }

  private var metadataReady: Bool { state?.metadataImported == true }
  private var rolesReady: Bool { state?.rolesImported == true }
  private var membersReady: Bool { state?.membersImported == true }
  private var channelsReady: Bool { state?.channelsImported == true }
  private var importBusy: Bool { activeStep != nil || refreshBusy }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      if channelsReady { bridgeCard }
      importCard
      statusCard
    }
    .task { await reloadState() }
    .task(id: BridgeKey(channelsReady: channelsReady, channelID: bridgeChannelID)) {
      await loadBridge()
    }
    .onChange(of: textChannels.map(\.id)) { _, ids in selectDefaultChannel(ids) }
    .onAppear { selectDefaultChannel(textChannels.map(\.id)) }
    .alert(
      EchoCopy.string("Replace channels?"),
      isPresented: Binding(
        get: { pendingConfirm == .channels },
        set: { if !$0 { pendingConfirm = nil } })
    ) {
      Button(EchoCopy.string("Import channels"), role: .destructive) {
        pendingConfirm = nil
        Task { await runStep(.channels) }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) { pendingConfirm = nil }
    } message: {
      Text(
        EchoCopy.string(
          "Importing channels will replace existing categories/channels. This will remove existing channel messages. Continue?"
        ))
    }
    .alert(
      EchoCopy.string("Refresh from export?"),
      isPresented: Binding(
        get: { pendingConfirm == .refresh },
        set: { if !$0 { pendingConfirm = nil } })
    ) {
      Button(EchoCopy.string("Refresh"), role: .destructive) {
        pendingConfirm = nil
        Task { await refreshFromExport() }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) { pendingConfirm = nil }
    } message: {
      Text(
        EchoCopy.string(
          "Refresh from the latest Discord export on disk? This updates server name, icon, banner, and the imported emoji pack, then replaces all categories and channels to match the export. All messages in server channels will be removed. Continue?"
        ))
    }
  }

  private struct BridgeKey: Equatable {
    let channelsReady: Bool
    let channelID: String
  }

  // MARK: - Bridge

  private var bridgeCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Discord bridge"),
        subtitle: EchoCopy.string(
          "Mirror messages between an Echo text channel and a Discord channel. Inbound needs the bot to read GuildMessages; outbound posts through a webhook."
        ))

      if textChannels.isEmpty {
        Text(EchoCopy.string("Create a text channel first."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      } else {
        EchoSettingsPickerField(
          title: EchoCopy.string("Echo text channel"),
          selection: $bridgeChannelID,
          options: textChannels.map { ($0.id, "#" + $0.name) },
          disabled: bridgeLoading || bridgeSaving
        )

        EchoSettingsToggleRow(
          title: EchoCopy.string("Discord → Echo"),
          subtitle: EchoCopy.string("Show messages from the linked Discord channel here."),
          isOn: $bridgeInbound, disabled: bridgeLoading || bridgeSaving)
        EchoSettingsToggleRow(
          title: EchoCopy.string("Echo → Discord"),
          subtitle: EchoCopy.string("Post messages from this channel to Discord."),
          isOn: $bridgeOutbound, disabled: bridgeLoading || bridgeSaving)

        EchoDesktopLabeledField(title: EchoCopy.string("Discord webhook URL")) {
          TextField(Self.webhookPlaceholder, text: $bridgeWebhookDraft)
            .disabled(bridgeLoading || bridgeSaving)
            #if os(iOS)
              .textInputAutocapitalization(.never)
              .keyboardType(.URL)
            #endif
            .autocorrectionDisabled()
        }
        if bridgeHasWebhook && bridgeWebhookDraft.trimmingCharacters(in: .whitespaces).isEmpty {
          Text(EchoCopy.string("A webhook is stored. Paste a new URL to replace it."))
            .font(.system(size: 11))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
        }

        HStack {
          if bridgeLoading {
            ProgressView().controlSize(.small)
          }
          if bridgeSavedFlash {
            EchoSettingsStatusLine(message: EchoCopy.string("Saved"))
          }
          Spacer()
          EchoDesktopPrimaryButton(
            title: bridgeSaving
              ? EchoCopy.string("Saving…") : EchoCopy.string("Save bridge"),
            enabled: !bridgeLoading && !bridgeSaving && !bridgeChannelID.isEmpty
          ) {
            Task { await saveBridge() }
          }
        }
      }
    }
    .echoSettingsCard(padding: 16)
  }

  private func selectDefaultChannel(_ ids: [String]) {
    guard !ids.isEmpty else { return }
    if bridgeChannelID.isEmpty || !ids.contains(bridgeChannelID) {
      bridgeChannelID = ids[0]
    }
  }

  private func loadBridge() async {
    guard channelsReady, !bridgeChannelID.isEmpty else { return }
    bridgeLoading = true
    defer { bridgeLoading = false }
    bridgeSavedFlash = false
    do {
      let token = try await model.auth.ensureAccessToken()
      let bridge = try await model.client.loadDiscordBridge(
        serverID: server.id, channelID: bridgeChannelID, accessToken: token)
      bridgeInbound = bridge.inboundEnabled
      bridgeOutbound = bridge.outboundEnabled
      bridgeHasWebhook = bridge.hasWebhook
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load the Discord bridge."))
    }
  }

  private func saveBridge() async {
    guard !bridgeChannelID.isEmpty else { return }
    localError = nil
    bridgeSavedFlash = false
    bridgeSaving = true
    defer { bridgeSaving = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      let saved = try await model.client.saveDiscordBridge(
        serverID: server.id,
        channelID: bridgeChannelID,
        inboundEnabled: bridgeInbound,
        outboundEnabled: bridgeOutbound,
        webhookURL: bridgeWebhookDraft,
        accessToken: token)
      bridgeInbound = saved.inboundEnabled
      bridgeOutbound = saved.outboundEnabled
      bridgeHasWebhook = saved.hasWebhook
      bridgeWebhookDraft = ""
      bridgeSavedFlash = true
      await model.loadChannels(for: server.id)
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save the Discord bridge."))
    }
  }

  // MARK: - Import

  private var importCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Server import"),
        subtitle: EchoCopy.string(
          "Importing a Discord server is separate from linking your Discord account."))

      if channelsReady {
        VStack(alignment: .leading, spacing: 8) {
          Text(EchoCopy.string("Refresh from export"))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(
            EchoCopy.string(
              "Re-apply branding, the emoji pack, and channels from the latest export on the server."
            )
          )
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          EchoDesktopPrimaryButton(
            title: refreshBusy
              ? EchoCopy.string("Refreshing…") : EchoCopy.string("Refresh latest export"),
            enabled: !importBusy && !bridgeSaving && !bridgeLoading
          ) {
            pendingConfirm = .refresh
          }
        }
        .echoSettingsCard(padding: 14)
      }

      if let source = state?.sourceLabel, !source.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Text(EchoCopy.string("Source"))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(source)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.6))
        }
        .echoSettingsCard(padding: 14)
      }

      ForEach(Array(ImportStep.allCases.enumerated()), id: \.element.id) { index, step in
        stepCard(step, number: index + 1)
      }
    }
    .echoSettingsCard(padding: 16)
  }

  private func stepCard(_ step: ImportStep, number: Int) -> some View {
    let done = isDone(step)
    let unlocked = isUnlocked(step)
    return VStack(alignment: .leading, spacing: 6) {
      Text(EchoCopy.format("STEP %d", number))
        .font(.system(size: 11, weight: .semibold))
        .tracking(1.8)
        .foregroundStyle(EchoTheme.Color.ink(0.42))
      Text(stepTitle(step))
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
      Text(stepBlurb(step))
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Text(stepResult(step, done: done))
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(
            done ? EchoTheme.Color.presenceOnline : EchoTheme.Color.ink(0.55))
        Spacer()
        if !done {
          EchoSettingsSecondaryButton(
            title: activeStep == step
              ? EchoCopy.string("Importing…") : EchoCopy.string("Run import"),
            disabled: importBusy || !unlocked
          ) {
            if step == .channels {
              pendingConfirm = .channels
            } else {
              Task { await runStep(step) }
            }
          }
        }
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(done ? 0.02 : 0.045),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay {
      if done {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(EchoTheme.Color.presenceOnline.opacity(0.35), lineWidth: 1)
      }
    }
  }

  private func isDone(_ step: ImportStep) -> Bool {
    switch step {
    case .metadata: metadataReady
    case .roles: rolesReady
    case .members: membersReady
    case .channels: channelsReady
    }
  }

  private func isUnlocked(_ step: ImportStep) -> Bool {
    switch step {
    case .metadata: true
    case .roles: metadataReady
    case .members: rolesReady
    case .channels: membersReady
    }
  }

  private func stepTitle(_ step: ImportStep) -> String {
    switch step {
    case .metadata: EchoCopy.string("Import metadata")
    case .roles: EchoCopy.string("Import roles")
    case .members: EchoCopy.string("Import members & role assignments")
    case .channels: EchoCopy.string("Import channels")
    }
  }

  private func stepBlurb(_ step: ImportStep) -> String {
    switch step {
    case .metadata:
      EchoCopy.string("Server name, icon, and banner.")
    case .roles:
      EchoCopy.string("Roles with colors and permissions.")
    case .members:
      EchoCopy.string(
        "Maps Discord users to Echo accounts and applies roles from members.jsonl.")
    case .channels:
      EchoCopy.string("Categories and channels. Replaces the current layout.")
    }
  }

  private func stepResult(_ step: ImportStep, done: Bool) -> String {
    if activeStep == step { return EchoCopy.string("Importing…") }
    guard done else { return EchoCopy.string("Not imported yet") }
    switch step {
    case .metadata: return EchoCopy.string("Imported")
    case .roles: return EchoCopy.format("%d roles imported", state?.roleCount ?? 0)
    case .members: return EchoCopy.format("%d users mapped", state?.userMapEntryCount ?? 0)
    case .channels:
      return EchoCopy.format(
        "%1$d categories · %2$d channels", state?.categoryCount ?? 0, state?.channelCount ?? 0)
    }
  }

  // MARK: - Status

  private var statusCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      EchoSettingsSectionHeading(title: EchoCopy.string("Status"))
      if stateLoading {
        ProgressView()
      } else {
        ForEach(ImportStep.allCases) { step in
          statusRow(step)
        }
        if let last = state?.lastError, !last.isEmpty {
          Text(last)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.mentionPing)
        }
        ForEach(Array((state?.warnings ?? []).enumerated()), id: \.offset) { _, warning in
          Text(warning)
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
        }
      }
    }
    .echoSettingsCard(padding: 16)
  }

  private func statusRow(_ step: ImportStep) -> some View {
    let done = isDone(step)
    let completedAt: String? =
      switch step {
      case .metadata: state?.metadataImportedAt
      case .roles: state?.rolesImportedAt
      case .members: state?.membersImportedAt
      case .channels: state?.channelsImportedAt
      }
    return HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(statusTitle(step))
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        if let completedAt, let date = EchoServerSettingsDates.parse(completedAt) {
          Text(
            EchoCopy.format(
              "Completed %@", date.formatted(date: .abbreviated, time: .shortened))
          )
          .font(.system(size: 11))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
        }
      }
      Spacer()
      Text(done ? EchoCopy.string("Done") : EchoCopy.string("Pending"))
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(done ? EchoTheme.Color.presenceOnline : EchoTheme.Color.ink(0.5))
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
          EchoTheme.Color.ink(0.06),
          in: Capsule())
    }
  }

  private func statusTitle(_ step: ImportStep) -> String {
    switch step {
    case .metadata: EchoCopy.string("Metadata")
    case .roles: EchoCopy.string("Roles")
    case .members: EchoCopy.string("Members & user map")
    case .channels: EchoCopy.string("Channels")
    }
  }

  // MARK: - Networking

  private func reloadState() async {
    stateLoading = true
    defer { stateLoading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      state = try await model.client.loadDiscordImportState(
        serverID: server.id, accessToken: token)
    } catch {
      state = nil
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load import status."))
    }
  }

  private func runStep(_ step: ImportStep) async {
    guard activeStep == nil, !refreshBusy else { return }
    activeStep = step
    localError = nil
    defer { activeStep = nil }
    do {
      let token = try await model.auth.ensureAccessToken()
      state = try await model.client.runDiscordImportStep(
        serverID: server.id, step: step.rawValue, force: step == .channels,
        accessToken: token)
      await refreshWorkspace()
    } catch {
      await reloadState()
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Something went wrong during import. Try again."))
    }
  }

  private func refreshFromExport() async {
    guard !refreshBusy, activeStep == nil, channelsReady else { return }
    refreshBusy = true
    localError = nil
    defer { refreshBusy = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      state = try await model.client.refreshDiscordImportFromExport(
        serverID: server.id, accessToken: token)
      await refreshWorkspace()
    } catch {
      await reloadState()
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Refresh from export failed. Try again."))
    }
  }

  /// Web `onWorkspaceRefresh`: imports change server branding, roles, and channels.
  private func refreshWorkspace() async {
    await model.reload()
    await model.loadChannels(for: server.id)
    await model.loadMembers(for: server.id)
  }
}
