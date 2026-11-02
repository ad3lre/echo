import EchoDomain
import SwiftUI

/// Web `CategoryDiscordChatSyncPanel` — apply the same Discord ↔ Echo message toggles to every
/// text/forum channel in a category, or clear the links for all of them.
struct EchoCategoryDiscordChatSyncPanel: View {
  let server: EchoServerSummary
  let categoryID: String
  let model: EchoServersModel

  @State private var inbound = false
  @State private var outbound = false
  @State private var applying = false
  @State private var clearing = false
  @State private var confirmClear = false
  @State private var summary: String?
  @State private var error: String?

  private var bridgeableCount: Int {
    model.channels(for: server.id).filter {
      $0.categoryID == categoryID && !$0.isForumPost && ($0.isTextLike || $0.isForum)
    }.count
  }

  private var busy: Bool { applying || clearing }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Discord messages (category)"),
        subtitle: EchoCopy.string(
          "Turn the same Discord ↔ Echo message options on or off for every text and forum channel in this category. Each channel still uses its own linked Discord channel from import (you can fine-tune one channel in channel settings)."
        ))
      if bridgeableCount == 0 {
        Text(EchoCopy.string("This category has no text or forum channels — nothing to link."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
      }
      EchoSettingsToggleRow(
        title: EchoCopy.string("Discord → Echo (live)"), isOn: $inbound, disabled: busy)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Echo → Discord"), isOn: $outbound, disabled: busy)
      Text(
        EchoCopy.string(
          "Turning both off and saving only stops linking when no custom posting link is saved. Use “Stop linking in category” to fully remove links. Channels you cannot manage are skipped."
        )
      )
      .font(.system(size: 11))
      .foregroundStyle(EchoTheme.Color.ink(0.45))
      .fixedSize(horizontal: false, vertical: true)
      if let error { EchoSettingsStatusLine(message: error, isError: true) }
      if let summary { EchoSettingsStatusLine(message: summary) }
      HStack(spacing: 10) {
        EchoDesktopPrimaryButton(
          title: applying
            ? EchoCopy.string("Applying…") : EchoCopy.string("Sync all channels in category"),
          enabled: !busy && bridgeableCount > 0
        ) { Task { await apply() } }
        EchoSettingsDangerButton(
          title: clearing ? EchoCopy.string("Turning off…") : EchoCopy.string("Stop linking in category"),
          disabled: busy || bridgeableCount == 0
        ) { confirmClear = true }
      }
    }
    .alert(EchoCopy.string("Stop linking in category"), isPresented: $confirmClear) {
      Button(EchoCopy.string("Stop linking"), role: .destructive) { Task { await clear() } }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(
        bridgeableCount == 1
          ? EchoCopy.string(
            "Stop linking messages with Discord for all 1 text/forum channel in this category?")
          : EchoCopy.format(
            "Stop linking messages with Discord for all %d text/forum channels in this category?",
            bridgeableCount))
    }
  }

  private func apply() async {
    await run(fallback: EchoCopy.string("Could not update Discord message linking."), cleared: false) {
      token in
      try await model.client.bulkApplyCategoryDiscordBridge(
        serverID: server.id, categoryID: categoryID, inboundEnabled: inbound,
        outboundEnabled: outbound, accessToken: token)
    }
  }

  private func clear() async {
    await run(fallback: EchoCopy.string("Could not turn off Discord message linking."), cleared: true) {
      token in
      try await model.client.bulkClearCategoryDiscordBridge(
        serverID: server.id, categoryID: categoryID, accessToken: token)
    }
  }

  private func run(
    fallback: String, cleared: Bool,
    _ call: (String) async throws -> EchoDiscordBulkResult
  ) async {
    if cleared { clearing = true } else { applying = true }
    error = nil
    summary = nil
    defer {
      applying = false
      clearing = false
    }
    do {
      let token = try await model.auth.ensureAccessToken()
      let result = try await call(token)
      summary = Self.summary(result, cleared: cleared)
      if !result.failureMessages.isEmpty {
        let detail = result.failureMessages.prefix(4).joined(separator: "; ")
        error = result.failureMessages.count > 4 ? detail + "; …" : detail
      }
      await model.loadChannels(for: server.id)
    } catch {
      self.error = echoSettingsErrorMessage(error, fallback: fallback)
    }
  }

  private static func summary(_ result: EchoDiscordBulkResult, cleared: Bool) -> String {
    var parts: [String] = []
    if result.applied > 0 {
      switch (cleared, result.applied == 1) {
      case (false, true): parts.append(EchoCopy.string("1 channel updated"))
      case (false, false): parts.append(EchoCopy.format("%d channels updated", result.applied))
      case (true, true): parts.append(EchoCopy.string("1 channel cleared"))
      case (true, false): parts.append(EchoCopy.format("%d channels cleared", result.applied))
      }
    }
    if result.skipped > 0 {
      parts.append(
        EchoCopy.format("%d skipped (no permission on those channels)", result.skipped))
    }
    if result.failed > 0 { parts.append(EchoCopy.format("%d failed", result.failed)) }
    if parts.isEmpty {
      return cleared ? EchoCopy.string("Nothing to clear.") : EchoCopy.string("Nothing to apply.")
    }
    return parts.joined(separator: " · ")
  }
}
