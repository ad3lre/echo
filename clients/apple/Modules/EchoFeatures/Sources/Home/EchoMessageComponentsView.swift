import EchoDomain
import SwiftUI

/// Web `MessageDiscordComponents` / `MessageButtonRow`: v2 text blocks plus button rows.
/// Like web, buttons are display-only — link buttons open the URL, the rest explain themselves.
struct EchoMessageComponentsView: View {
  let components: EchoMessageComponents
  let baseURL: URL
  var accessToken: String? = nil
  var channelID = ""
  var messageID = ""
  /// Only the message author can fill an empty image slot.
  var canFillImageSlots = false

  @Environment(\.openURL) private var openURL
  @State private var notice: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(components.textBlocks.enumerated()), id: \.offset) { _, block in
        if block == "---" {
          Divider().overlay(EchoTheme.Color.hairline)
        } else {
          EchoMarkdownView(
            markdown: block, mentions: [], apiBaseURL: baseURL, accessToken: accessToken)
        }
      }
      ForEach(components.rows) { row in
        HStack(spacing: 8) {
          ForEach(row.buttons) { button in
            buttonView(button)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      ForEach(components.imageSlots) { slot in
        EchoMessageImageSlotView(
          slot: slot, channelID: channelID, messageID: messageID, canFill: canFillImageSlots,
          baseURL: baseURL, accessToken: accessToken)
      }
      if let notice {
        Text(notice)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
    }
    .frame(maxWidth: 520, alignment: .leading)
  }

  private func buttonView(_ button: EchoMessageButton) -> some View {
    Button {
      activate(button)
    } label: {
      HStack(spacing: 6) {
        if let emoji = button.unicodeEmoji { Text(verbatim: emoji) }
        if !button.label.isEmpty {
          Text(verbatim: button.label).lineLimit(1)
        }
        if button.style == .link {
          Image(systemName: "arrow.up.right.square").font(.system(size: 11, weight: .semibold))
        }
      }
      .font(.system(size: 14, weight: .medium, design: .rounded))
      .foregroundStyle(EchoTheme.Color.onAccent)
      .padding(.horizontal, 14)
      .padding(.vertical, 8)
      .frame(minHeight: 36)
      .background(fill(button.style), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .opacity(button.disabled ? 0.5 : 1)
    }
    .buttonStyle(.plain)
    .disabled(button.disabled)
    .accessibilityLabel(button.label)
  }

  private func fill(_ style: EchoMessageButtonStyle) -> Color {
    switch style {
    case .primary: EchoTheme.Color.indigo
    case .success: EchoTheme.Color.presenceOnline.opacity(0.85)
    case .danger: EchoTheme.Color.presenceDnd
    case .secondary, .link: EchoTheme.Color.ink(0.18)
    }
  }

  private func activate(_ button: EchoMessageButton) {
    if button.style == .link {
      if let raw = button.url, let url = URL(string: raw),
        ["http", "https"].contains(url.scheme?.lowercased())
      {
        openURL(url)
      }
      return
    }
    notice =
      EchoCopy.format("Button “%@” is display-only in Echo.", button.label.isEmpty ? (button.customID ?? "") : button.label)
  }
}
