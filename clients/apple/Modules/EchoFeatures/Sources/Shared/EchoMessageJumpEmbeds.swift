import EchoDomain
import EchoNetworking
import SwiftUI

/// Preview cards for pasted Echo message links (web `MessageJumpEmbed.vue`).
struct EchoMessageJumpEmbeds: View {
  let content: String
  let embeds: [EchoMessageEmbed]
  let baseURL: URL

  var body: some View {
    let jumps = EchoJumpEmbedPresentation.embeds(
      content: content, stored: embeds, origins: EchoJumpEmbedPresentation.origins(baseURL: baseURL))
    if !jumps.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(jumps.enumerated()), id: \.offset) { _, embed in
          EchoJumpEmbedCard(embed: embed, baseURL: baseURL)
        }
      }
    }
  }
}

struct EchoJumpEmbedCard: View {
  let embed: EchoMessageEmbed
  let baseURL: URL
  @State private var display: EchoJumpEmbedPresentation.Content
  @State private var loading = false
  @Environment(EchoShellChrome.self) private var shellChrome
  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(\.openURL) private var openURL
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap

  init(embed: EchoMessageEmbed, baseURL: URL) {
    self.embed = embed
    self.baseURL = baseURL
    _display = State(initialValue: EchoJumpEmbedPresentation.Content(embed: embed))
  }

  private var accent: Color {
    let rgb = display.hasError ? 0xED_4245 : display.accentRGB
    return Color(
      red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255)
  }

  var body: some View {
    HStack(spacing: 0) {
      Rectangle().fill(accent).frame(width: 4)
      VStack(alignment: .leading, spacing: 4) {
        Text(display.hasError ? EchoCopy.string("Echo · link unavailable") : EchoCopy.string("Echo · message link"))
          .font(.system(size: 10, weight: .bold)).tracking(1.2).textCase(.uppercase)
          .foregroundStyle(EchoTheme.Color.ink(0.45))
        if loading {
          skeleton
        } else if display.hasError {
          errorBody
        } else if display.jump != nil {
          Button {
            if consumeComposerKeyboardTap() { return }
            guard let jump = display.jump else { return }
            shellChrome.requestJumpToMessage(channelID: jump.channelID, messageID: jump.messageID)
          } label: { previewBody }
          .buttonStyle(.plain)
          .accessibilityHint(EchoCopy.string("Jump to message"))
        }
      }
      .padding(.horizontal, 12).padding(.vertical, 10)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxWidth: 360, alignment: .leading)
    .background(EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(
      display.hasError
        ? EchoCopy.string("Message link preview unavailable")
        : EchoCopy.string("Echo message link preview")
    )
    .task(id: embed) { await resolve() }
  }

  private var previewBody: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(display.title ?? EchoCopy.string("#channel"))
        .font(.system(size: 15, weight: .semibold)).foregroundStyle(EchoTheme.Color.fg)
      if let author = display.authorName, !author.isEmpty {
        Text("@\(author)").font(.system(size: 11, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.signInBlue)
      }
      if let description = display.description, !description.isEmpty {
        Text(EchoJumpEmbedPresentation.truncate(description, 220))
          .font(.system(size: 12)).lineLimit(3)
          .foregroundStyle(EchoTheme.Color.ink(0.7))
          .multilineTextAlignment(.leading)
      }
      if let timestamp = display.timestamp {
        Text(
          timestamp.formatted(
            Date.FormatStyle(locale: EchoAppLocale.preferredLocale)
              .month(.abbreviated).day().hour().minute())
        )
        .font(.system(size: 10)).foregroundStyle(EchoTheme.Color.ink(0.4))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
  }

  private var errorBody: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(display.title ?? EchoCopy.string("Message link"))
        .font(.system(size: 15, weight: .semibold)).foregroundStyle(EchoTheme.Color.fg)
      Text(display.description ?? "")
        .font(.system(size: 12)).foregroundStyle(EchoTheme.Color.mentionPing)
      if let url = embed.url.flatMap({ EchoLinkEmbedPresentation.safeHref($0) }) {
        Button(EchoCopy.string("Open original link")) {
          if consumeComposerKeyboardTap() { return }
          openURL(url)
        }
        .buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(EchoTheme.Color.signInBlue)
      }
    }
  }

  private var skeleton: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach([0.4, 1.0, 0.8], id: \.self) { fraction in
        RoundedRectangle(cornerRadius: 3).fill(EchoTheme.Color.ink(0.1)).frame(height: 10)
          .frame(maxWidth: 240 * fraction, alignment: .leading)
      }
    }
    .accessibilityHidden(true)
  }

  /// Enriches client stubs via `GET message` (web `useMessageJumpEmbedPreview`).
  private func resolve() async {
    let base = EchoJumpEmbedPresentation.Content(embed: embed)
    display = base
    guard let jump = embed.jump, !EchoJumpEmbedPresentation.isResolved(embed) else {
      loading = false
      return
    }
    loading = true
    defer { loading = false }
    guard let token = try? await auth.ensureAccessToken(), !token.isEmpty else {
      display = EchoJumpEmbedPresentation.failed(base, code: "forbidden")
      return
    }
    do {
      let message = try await EchoHomeClient(baseURL: baseURL).loadMessage(
        accessToken: token, channelID: jump.channelID, messageID: jump.messageID,
        currentUserID: nil)
      guard !Task.isCancelled else { return }
      display = EchoJumpEmbedPresentation.resolved(base, message: message)
    } catch {
      guard !Task.isCancelled else { return }
      display = EchoJumpEmbedPresentation.failed(
        base, code: EchoJumpEmbedPresentation.errorCode(for: error))
    }
  }
}
