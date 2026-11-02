import SwiftUI

/// Profile bio with web-style autolinked URLs (cleaned label + favicon).
struct EchoBioText: View {
  let text: String
  var size: CGFloat = 15
  var opacity: Double = 0.78

  var body: some View {
    EchoEmojiFlowLayout(spacing: 0) {
      ForEach(Array(EchoLinkChrome.bioFlowPieces(text).enumerated()), id: \.offset) { _, piece in
        switch piece {
        case .text(let value):
          Text(value)
            .font(.system(size: size, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(opacity))
        case .link(let url, let display):
          EchoMarkdownExternalLink(url: url, display: display, size: size)
        }
      }
    }
    .textSelection(.enabled)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
