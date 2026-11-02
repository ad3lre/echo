import EchoDomain
import Foundation
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Web `findPreviewEmbed` / `normalizeExternalUrlForOpen` matching for hover cards.
enum EchoMessageLinkHoverMatching {
  /// Absolute http(s) form used for embed ↔ link equality (trailing slash collapsed).
  static func normalize(_ raw: String) -> String? {
    guard let url = EchoLinkChrome.httpURL(from: raw) else { return nil }
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return nil
    }
    components.user = nil
    components.password = nil
    components.fragment = nil
    let path = components.path
    if path.count > 1, path.hasSuffix("/") {
      components.path = String(path.dropLast())
    }
    return components.string ?? url.absoluteString
  }

  /// Prefer unfurl embeds with a matching `url` (skip jump embeds).
  static func previewEmbed(for href: URL, in embeds: [EchoMessageEmbed]) -> EchoMessageEmbed? {
    guard let normalized = normalize(href.absoluteString) else { return nil }
    return embeds.first { embed in
      guard embed.jump == nil else { return false }
      guard let raw = embed.url?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
      else { return false }
      return normalize(raw) == normalized
    }
  }
}

/// Web `MessageLinkHoverPreview` — provider / title / description / thumb + Copy / Open.
struct EchoMessageLinkHoverPreview: View {
  let url: URL
  var embed: EchoMessageEmbed? = nil
  @Environment(\.openURL) private var openURL
  @State private var copiedFlash = false

  private var host: String {
    (url.host ?? "").replacingOccurrences(
      of: #"^www\."#, with: "", options: .regularExpression)
  }

  private var displayURL: String { EchoLinkChrome.displayLabel(for: url) }

  private var title: String {
    let t = embed?.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !t.isEmpty { return t }
    return host.isEmpty ? displayURL : host
  }

  private var provider: String {
    let p = embed?.provider?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !p.isEmpty { return p }
    return host.isEmpty ? EchoCopy.string("Website") : host
  }

  private var description: String {
    embed?.description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }

  private var imageURL: URL? {
    if let media = embed.flatMap(EchoLinkEmbedPresentation.previewImage),
      let href = EchoLinkEmbedPresentation.safeHref(media.url)
    {
      return href
    }
    return EchoLinkChrome.faviconURL(for: url)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        if let imageURL {
          AsyncImage(url: imageURL) { phase in
            switch phase {
            case .success(let image):
              image.resizable().scaledToFill()
            default:
              EchoTheme.Color.ink(0.08)
            }
          }
          .frame(width: 40, height: 40)
          .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        VStack(alignment: .leading, spacing: 3) {
          Text(provider)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .lineLimit(1)
          Text(title)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
            .lineLimit(2)
          if !description.isEmpty {
            Text(description)
              .font(.system(size: 11, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.62))
              .lineLimit(3)
          }
          Text(displayURL)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .lineLimit(1)
            .truncationMode(.middle)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      HStack(spacing: 8) {
        Button(copiedFlash ? EchoCopy.string("Copied") : EchoCopy.string("Copy")) {
          copyLink()
        }
        .buttonStyle(.bordered)
        Button(EchoCopy.string("Open")) { openURL(url) }
          .buttonStyle(.borderedProminent)
      }
    }
    .padding(10)
    .frame(width: 320, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(EchoCopy.string("Link preview"))
  }

  private func copyLink() {
    #if os(iOS)
      UIPasteboard.general.string = url.absoluteString
    #elseif os(macOS)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(url.absoluteString, forType: .string)
    #endif
    copiedFlash = true
    Task {
      try? await Task.sleep(nanoseconds: 1_200_000_000)
      copiedFlash = false
    }
  }
}
