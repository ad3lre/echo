import EchoDomain
import SwiftUI

/// Web `ChannelDiscordVoiceMirrorPanel` / `CategoryDiscordVoiceMirrorPanel` — display-only
/// Discord voice roster for one voice channel, or for a whole category (optional Discord
/// category-id filter).
struct EchoDiscordVoiceMirrorPanel: View {
  enum Scope: Hashable {
    case channel(id: String)
    case category(id: String)
  }

  let server: EchoServerSummary
  let scope: Scope
  let model: EchoServersModel

  @State private var settings = EchoDiscordVoiceMirror()
  @State private var loading = true
  @State private var saving = false
  @State private var error: String?
  @State private var savedFlash = false

  private var isCategory: Bool {
    if case .category = scope { return true }
    return false
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      EchoSettingsSectionHeading(
        title: isCategory
          ? EchoCopy.string("Discord voice mirror (category)")
          : EchoCopy.string("Discord voice mirror"),
        subtitle: isCategory
          ? EchoCopy.string(
            "When enabled, Echo shows live Discord voice rosters for voice channels in this category. Echo voice join stays off — use Discord to participate in voice."
          )
          : EchoCopy.string(
            "Show who is connected on Discord for the linked voice channel. Echo stays display-only — join voice in Discord."
          ))
      EchoSettingsToggleRow(
        title: isCategory
          ? EchoCopy.string("Mirror Discord voice activity for this category")
          : EchoCopy.string("Mirror Discord voice roster for this channel"),
        isOn: $settings.enabled, disabled: loading || saving)
      if isCategory {
        EchoDesktopLabeledField(title: EchoCopy.string("Discord category ID (optional filter)")) {
          TextField(
            EchoCopy.string("Leave empty to mirror all Discord VCs into this Echo category"),
            text: $settings.discordCategoryID
          )
          .disabled(loading || saving)
          .autocorrectionDisabled()
          #if os(iOS)
            .textInputAutocapitalization(.never)
          #endif
        }
        Text(
          EchoCopy.string(
            "When set, only Discord voice channels under this Discord category id are mirrored into this Echo category. Developer Mode → right-click Discord category → Copy ID."
          )
        )
        .font(.system(size: 11))
        .foregroundStyle(EchoTheme.Color.ink(0.45))
        .fixedSize(horizontal: false, vertical: true)
      }
      if let error { EchoSettingsStatusLine(message: error, isError: true) }
      HStack(spacing: 10) {
        EchoDesktopPrimaryButton(
          title: saving ? EchoCopy.string("Saving…") : EchoCopy.string("Save"),
          enabled: !loading && !saving
        ) { Task { await save() } }
        if loading { ProgressView().controlSize(.small) }
        if savedFlash { EchoSettingsStatusLine(message: EchoCopy.string("Saved")) }
      }
    }
    .task(id: scope) { await load() }
  }

  private var ids: (channel: String?, category: String?) {
    switch scope {
    case .channel(let id): (id, nil)
    case .category(let id): (nil, id)
    }
  }

  private func load() async {
    loading = true
    error = nil
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      settings = try await model.client.loadDiscordVoiceMirror(
        serverID: server.id, channelID: ids.channel, categoryID: ids.category, accessToken: token)
    } catch {
      self.error = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Could not load voice mirror settings."))
    }
  }

  private func save() async {
    saving = true
    error = nil
    savedFlash = false
    defer { saving = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      settings = try await model.client.saveDiscordVoiceMirror(
        serverID: server.id, channelID: ids.channel, categoryID: ids.category,
        settings: settings, accessToken: token)
      savedFlash = true
    } catch {
      self.error = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Could not save voice mirror settings."))
    }
  }
}
