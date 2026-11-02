import EchoDomain
import SwiftUI

/// Discord-style link preview cards under a message (web `MessageLinkEmbeds.vue`).
struct EchoMessageLinkEmbeds: View {
  let embeds: [EchoMessageEmbed]
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    let visible = EchoLinkEmbedPresentation.visibleEmbeds(embeds)
    if !visible.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(Array(visible.enumerated()), id: \.offset) { _, embed in
          EchoLinkEmbedCard(embed: embed, baseURL: baseURL, accessToken: accessToken)
        }
      }
    }
  }
}

private struct EchoLinkEmbedCard: View {
  let embed: EchoMessageEmbed
  let baseURL: URL
  let accessToken: String?
  @Environment(\.openURL) private var openURL
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap
  /// Inline YouTube / Vimeo player expanded (web `MessageLinkEmbeds` iframe).
  @State private var playing = false

  private var video: EchoVideoEmbedRef? { EchoVideoEmbed.resolve(embed) }
  private var preview: EchoMessageEmbed.Media? { EchoLinkEmbedPresentation.previewImage(embed) }
  private var isRich: Bool { preview != nil || EchoLinkEmbedPresentation.isPlayableVideo(embed) }
  private var pageURL: URL? { EchoLinkEmbedPresentation.safeHref(embed.url) }

  private var accent: Color {
    let rgb = EchoLinkEmbedPresentation.accentRGB(embed)
    return Color(
      red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255)
  }

  var body: some View {
    HStack(spacing: 0) {
      Rectangle().fill(accent).frame(width: 4)
      VStack(alignment: .leading, spacing: 6) {
        header
        if let description = embed.description, !description.isEmpty {
          Text(EchoLinkEmbedText.attributed(description))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.7))
            .fixedSize(horizontal: false, vertical: true)
        }
        fields
        mediaSection
        footer
      }
      .padding(.horizontal, 12).padding(.vertical, 10)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxWidth: isRich ? 420 : 360, alignment: .leading)
    .background(EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(
      embed.title.map { EchoCopy.format("Preview of %@", $0) } ?? EchoCopy.string("Link preview"))
  }

  @ViewBuilder
  private var header: some View {
    if let provider = embed.provider, !provider.isEmpty {
      Text(provider.uppercased())
        .font(.system(size: 10, weight: .bold)).tracking(1.2)
        .foregroundStyle(EchoTheme.Color.ink(0.45))
    }
    if let author = embed.author, !author.name.isEmpty {
      HStack(spacing: 6) {
        if let icon = author.iconURL {
          EchoMediaImage(source: icon, baseURL: baseURL, accessToken: accessToken) {
            Color.clear
          }
          .frame(width: 18, height: 18).clipShape(Circle())
        }
        linkText(author.name, url: EchoLinkEmbedPresentation.safeHref(author.url), size: 12)
      }
    }
    if let title = embed.title, !title.isEmpty {
      linkText(title, url: pageURL, size: 15, bold: true)
    } else if let pageURL, preview == nil {
      linkText(pageURL.absoluteString, url: pageURL, size: 15, bold: true)
    }
  }

  @ViewBuilder
  private func linkText(_ text: String, url: URL?, size: CGFloat, bold: Bool = false) -> some View {
    let label = Text(text).font(.system(size: size, weight: bold ? .semibold : .medium))
    if let url {
      Button {
        if consumeComposerKeyboardTap() { return }
        openURL(url)
      } label: {
        label.foregroundStyle(EchoTheme.Color.signInBlue).multilineTextAlignment(.leading)
      }
      .buttonStyle(.plain)
    } else {
      label.foregroundStyle(EchoTheme.Color.fg)
    }
  }

  @ViewBuilder
  private var fields: some View {
    if !embed.fields.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(embed.fields.enumerated()), id: \.offset) { _, field in
          VStack(alignment: .leading, spacing: 1) {
            Text(field.name).font(.system(size: 11, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.fg)
            Text(EchoLinkEmbedText.attributed(field.value)).font(.system(size: 11))
              .foregroundStyle(EchoTheme.Color.ink(0.7))
          }
        }
      }
    }
  }

  @ViewBuilder
  private var mediaSection: some View {
    if playing, let video {
      inlinePlayer(video)
    } else if let preview {
      media(preview)
    } else if let poster = video?.posterURL {
      media(EchoMessageEmbed.Media(url: poster.absoluteString))
    }
  }

  private func inlinePlayer(_ video: EchoVideoEmbedRef) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      EchoVideoEmbedWebView(video: video)
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityLabel(EchoCopy.string("Video player"))
      HStack(spacing: 14) {
        Button(EchoCopy.string("Close player")) {
          if consumeComposerKeyboardTap() { return }
          playing = false
        }
        if let pageURL {
          Button(EchoCopy.string("Open link")) {
            if consumeComposerKeyboardTap() { return }
            openURL(pageURL)
          }
        }
      }
      .buttonStyle(.plain)
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(EchoTheme.Color.signInBlue)
    }
  }

  private func media(_ media: EchoMessageEmbed.Media) -> some View {
    let playable = EchoLinkEmbedPresentation.isPlayableVideo(embed)
    return Button {
      if consumeComposerKeyboardTap() { return }
      if video != nil {
        playing = true
      } else if let pageURL {
        openURL(pageURL)
      }
    } label: {
      EchoMediaImage(
        source: media.url, baseURL: baseURL, accessToken: accessToken, contentMode: .fit
      ) {
        EchoTheme.Color.ink(0.08)
      }
      .aspectRatio(EchoLinkEmbedPresentation.aspectRatio(media), contentMode: .fit)
      .frame(maxWidth: .infinity)
      .background(EchoTheme.Color.ink(0.05))
      .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay {
        if playable {
          Image(systemName: "play.circle.fill").font(.system(size: 38))
            .foregroundStyle(Color.white.opacity(0.92)).shadow(radius: 6)
        }
      }
    }
    .buttonStyle(.plain)
    .disabled(pageURL == nil && video == nil)
    .accessibilityLabel(
      video != nil ? EchoCopy.string("Play video")
        : playable ? EchoCopy.string("Open video") : EchoCopy.string("Open link"))
  }

  @ViewBuilder
  private var footer: some View {
    let time = EchoLinkEmbedText.timestamp(embed.timestamp)
    let text = embed.footer?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !text.isEmpty || time != nil {
      HStack(spacing: 6) {
        if let icon = embed.footer?.iconURL {
          EchoMediaImage(source: icon, baseURL: baseURL, accessToken: accessToken) {
            Color.clear
          }
          .frame(width: 14, height: 14).clipShape(Circle())
        }
        Text([text, time].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • "))
          .font(.system(size: 10)).foregroundStyle(EchoTheme.Color.ink(0.45))
      }
    }
  }
}

enum EchoLinkEmbedText {
  /// Inline markdown subset (bold / italic / code / http(s) links); falls back to plain text.
  static func attributed(_ raw: String) -> AttributedString {
    let options = AttributedString.MarkdownParsingOptions(
      interpretedSyntax: .inlineOnlyPreservingWhitespace)
    guard var text = try? AttributedString(markdown: raw, options: options) else {
      return AttributedString(raw)
    }
    for run in text.runs {
      guard let link = run.link else { continue }
      if EchoLinkChrome.httpURL(from: link.absoluteString) == nil {
        text[run.range].link = nil
      }
    }
    return text
  }

  static func timestamp(_ raw: String?) -> String? {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty else { return nil }
    guard let date = EchoPoll.parseDate(trimmed) else { return trimmed }
    return date.formatted(date: .abbreviated, time: .shortened)
  }
}
