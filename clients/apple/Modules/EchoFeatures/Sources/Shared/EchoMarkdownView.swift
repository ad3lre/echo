import EchoDomain
import EchoNetworking
import Foundation
import SwiftMath
import SwiftUI

/// Native message Markdown renderer.
///
/// Foundation handles CommonMark/GFM inline semantics and presentation
/// intents (emphasis, links, lists, tables, quotes, and fenced code). Echo's
/// web client adds underline, highlight, spoiler, and callout syntax; those
/// are handled by the small block/inline layer below so messages never need a
/// WebView or HTML round-trip.
struct EchoMarkdownView: View {
  let markdown: String
  let mentions: [EchoMessageMention]
  /// Used to decide whether markdown images may auto-fetch (Echo hosts only).
  var apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL
  var accessToken: String? = nil
  var magicTime: EchoMagicTimeContext? = nil
  /// Unfurl embeds for macOS link hover preview (web `MessageLinkHoverPreview`).
  var embeds: [EchoMessageEmbed] = []
  private let blocks: [EchoMarkdownBlock]
  private let emojiOnly: Bool

  init(
    markdown: String,
    mentions: [EchoMessageMention] = [],
    apiBaseURL: URL = EchoAPIConfiguration.defaultBaseURL,
    accessToken: String? = nil,
    magicTime: EchoMagicTimeContext? = nil,
    embeds: [EchoMessageEmbed] = []
  ) {
    self.markdown = markdown
    self.mentions = []
    self.apiBaseURL = apiBaseURL
    self.accessToken = accessToken
    self.magicTime = magicTime
    self.embeds = embeds
    blocks = EchoMarkdownBlockCache.blocks(EchoMarkdownMentions.mark(markdown, mentions: mentions))
    emojiOnly = EchoEmojiOnlySizing.isEmojiOnlyUpTo12(markdown)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: emojiOnly ? 4 : 8) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        EchoMarkdownBlockView(
          block: block,
          mentions: mentions,
          apiBaseURL: apiBaseURL,
          accessToken: accessToken,
          emojiOnly: emojiOnly,
          magicTime: magicTime,
          embeds: embeds)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

