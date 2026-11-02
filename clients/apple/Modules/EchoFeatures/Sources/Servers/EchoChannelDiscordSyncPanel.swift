import EchoDomain
import SwiftUI

/// Web `ChannelDiscordSyncPanel` — link one Echo text/forum channel to a Discord channel
/// (guild + channel pickers, inbound/outbound toggles, advanced webhook override).
struct EchoChannelDiscordSyncPanel: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let model: EchoServersModel

  @State private var guildList = EchoDiscordBridgeGuildList()
  @State private var channelOptions: [EchoDiscordBridgeChannelOption] = []
  @State private var guildID = ""
  @State private var discordChannelID = ""
  @State private var inbound = false
  @State private var outbound = false
  @State private var hasWebhook = false
  @State private var hasBridge = false
  @State private var webhookOverride = ""
  @State private var clearWebhook = false
  @State private var loading = true
  @State private var guildsLoading = false
  @State private var channelsLoading = false
  @State private var saving = false
  @State private var clearing = false
  @State private var confirmStop = false
  @State private var error: String?
  @State private var savedFlash = false

  private static let webhookPlaceholder = "https://discord.com/api/webhooks/…"

  private var busy: Bool { loading || saving || clearing }
  private var guildsWithBot: [EchoDiscordBridgeGuild] { guildList.guilds.filter(\.botInGuild) }

  private var guildChoices: [EchoDiscordBridgeGuild] {
    var base = guildsWithBot
    if !guildID.isEmpty, !base.contains(where: { $0.id == guildID }) {
      base.insert(
        EchoDiscordBridgeGuild(
          id: guildID, name: EchoCopy.string("Current bridge server"), botInGuild: true), at: 0)
    }
    return base
  }

  private var guildSelection: Binding<String> {
    Binding(
      get: { guildID },
      set: { next in
        guard next != guildID else { return }
        guildID = next
        discordChannelID = ""
        Task { await loadChannels() }
      })
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Discord messages"),
        subtitle: EchoCopy.string(
          "Keep messages in step between this Echo channel and a Discord channel. Messages from Discord need the Echo bot online in that server. Messages from Echo to Discord are set up automatically when you turn on Echo → Discord."
        ))
      if let banner = bannerMessage {
        Text(banner)
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.62))
          .echoSettingsCard()
      }
      guildPicker
      channelPicker
      EchoSettingsToggleRow(
        title: EchoCopy.string("Discord → Echo (live)"), isOn: $inbound, disabled: busy)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Echo → Discord"), isOn: $outbound, disabled: busy)
      advancedSection
      footer
    }
    .task(id: channel.id) { await load() }
    .alert(EchoCopy.string("Stop linking?"), isPresented: $confirmStop) {
      Button(EchoCopy.string("Stop linking"), role: .destructive) { Task { await stopLinking() } }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(
        EchoCopy.string(
          "Stop linking messages with Discord for this channel? Live mirroring will turn off."))
    }
  }

  private var bannerMessage: String? {
    guard !loading, !guildsLoading else { return nil }
    if !guildList.linked {
      return EchoCopy.string(
        "Link your Discord account under Echo user settings so Echo can list servers you manage.")
    }
    if guildList.tokenExpired {
      return EchoCopy.string(
        "Your Discord connection expired. Reconnect Discord in Echo settings, then try again.")
    }
    if guildList.missingGuildsScope {
      return EchoCopy.string(
        "Discord needs permission to list your servers. Reconnect Discord in Settings and allow access to your servers."
      )
    }
    if guildsWithBot.isEmpty {
      return guildList.botConfigured
        ? EchoCopy.string(
          "The Echo bot isn’t in any Discord server you can manage, or it hasn’t been invited yet. In Discord, open your server → Server Settings → Integrations → add the Echo bot."
        )
        : EchoCopy.string(
          "This Echo server isn’t set up with a Discord bot yet. Ask whoever runs it to enable Discord integration."
        )
    }
    return nil
  }

  private var guildPicker: some View {
    VStack(alignment: .leading, spacing: 4) {
      EchoSettingsPickerField(
        title: EchoCopy.string("Discord server"),
        selection: guildSelection,
        options: [("", EchoCopy.string("Select server…"))]
          + guildChoices.map { ($0.id, $0.name) },
        disabled: busy || guildsLoading || !guildList.linked
      )
      hint(
        EchoCopy.string("Servers where you can manage and where the Echo bot is installed."))
    }
  }

  private var channelPicker: some View {
    VStack(alignment: .leading, spacing: 4) {
      EchoSettingsPickerField(
        title: EchoCopy.string("Discord channel"),
        selection: $discordChannelID,
        options: {
          var opts: [(String, String)] = [("", EchoCopy.string("Select channel…"))]
          opts += channelOptions.map { ($0.id, $0.label) }
          if !discordChannelID.isEmpty,
            !channelOptions.contains(where: { $0.id == discordChannelID })
          {
            opts.append((discordChannelID, EchoCopy.format("Current: %@", discordChannelID)))
          }
          return opts
        }(),
        disabled: busy || channelsLoading || guildID.isEmpty
      )
      hint(EchoCopy.string("Text, announcement, and forum channels only."))
    }
  }

  private var advancedSection: some View {
    DisclosureGroup(EchoCopy.string("Advanced: custom posting link")) {
      VStack(alignment: .leading, spacing: 10) {
        hint(
          EchoCopy.string(
            "Leave blank and Echo will set up posting to Discord for you. Paste a link only if your admin gave you one to use instead."
          ))
        EchoDesktopLabeledField(title: EchoCopy.string("Discord webhook URL")) {
          TextField(Self.webhookPlaceholder, text: $webhookOverride)
            .disabled(busy || clearWebhook)
            #if os(iOS)
              .textInputAutocapitalization(.never)
              .keyboardType(.URL)
            #endif
            .autocorrectionDisabled()
        }
        Toggle(
          EchoCopy.string(
            "Remove saved posting link (Echo creates a new one on the next save if Echo → Discord stays on)"
          ), isOn: $clearWebhook
        )
        .font(.system(size: 12))
        .disabled(busy || !hasWebhook)
      }
      .padding(.top, 8)
    }
    .font(.system(size: 13, weight: .semibold))
    .foregroundStyle(EchoTheme.Color.ink(0.7))
    .echoSettingsCard()
  }

  private var footer: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let error {
        EchoSettingsStatusLine(message: error, isError: true)
      }
      HStack(spacing: 10) {
        EchoDesktopPrimaryButton(
          title: saving ? EchoCopy.string("Saving…") : EchoCopy.string("Save"), enabled: !busy
        ) { Task { await save() } }
        if hasBridge {
          EchoSettingsDangerButton(
            title: clearing ? EchoCopy.string("Turning off…") : EchoCopy.string("Stop linking"),
            disabled: busy
          ) { confirmStop = true }
        }
        if loading || guildsLoading || channelsLoading { ProgressView().controlSize(.small) }
        if savedFlash { EchoSettingsStatusLine(message: EchoCopy.string("Saved")) }
      }
    }
  }

  private func hint(_ text: String) -> some View {
    Text(text).font(.system(size: 11)).foregroundStyle(EchoTheme.Color.ink(0.45))
      .fixedSize(horizontal: false, vertical: true)
  }

  // MARK: - Networking

  private func apply(_ state: EchoDiscordBridgeState) {
    guildID = state.discordGuildID
    discordChannelID = state.discordChannelID
    inbound = state.inboundEnabled
    outbound = state.outboundEnabled
    hasWebhook = state.hasWebhook
    hasBridge = state.hasBridge
    webhookOverride = ""
    clearWebhook = false
  }

  private func load() async {
    loading = true
    error = nil
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      async let guilds = loadGuilds(token: token)
      let state = try await model.client.loadDiscordBridge(
        serverID: server.id, channelID: channel.id, accessToken: token)
      apply(state)
      await guilds
      if !guildID.isEmpty { await loadChannels() }
    } catch {
      self.error = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Could not load Discord message settings."))
    }
  }

  private func loadGuilds(token: String) async {
    guildsLoading = true
    defer { guildsLoading = false }
    guildList =
      (try? await model.client.loadDiscordBridgeGuilds(
        serverID: server.id, channelID: channel.id, accessToken: token))
      ?? EchoDiscordBridgeGuildList(guilds: [])
  }

  private func loadChannels() async {
    guard !guildID.isEmpty else {
      channelOptions = []
      return
    }
    channelsLoading = true
    error = nil
    defer { channelsLoading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      channelOptions = try await model.client.loadDiscordBridgeChannels(
        serverID: server.id, channelID: channel.id, discordGuildID: guildID, accessToken: token)
    } catch {
      channelOptions = []
      self.error = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Could not load Discord channels."))
    }
  }

  private func save() async {
    saving = true
    error = nil
    savedFlash = false
    defer { saving = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      apply(
        try await model.client.saveDiscordBridgeLink(
          serverID: server.id, channelID: channel.id, inboundEnabled: inbound,
          outboundEnabled: outbound, discordGuildID: guildID, discordChannelID: discordChannelID,
          webhookURL: webhookOverride, clearWebhook: clearWebhook, accessToken: token))
      savedFlash = true
      await model.loadChannels(for: server.id)
    } catch {
      self.error = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Could not save Discord message settings."))
    }
  }

  private func stopLinking() async {
    clearing = true
    error = nil
    savedFlash = false
    defer { clearing = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      apply(
        try await model.client.deleteDiscordBridge(
          serverID: server.id, channelID: channel.id, accessToken: token))
      await model.loadChannels(for: server.id)
    } catch {
      self.error = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Could not turn off Discord message linking."))
    }
  }
}
