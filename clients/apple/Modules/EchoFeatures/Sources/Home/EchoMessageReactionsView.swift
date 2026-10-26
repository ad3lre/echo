import EchoDomain
import SwiftUI

/// Inline reaction chips under a message — tap toggles.
/// The “add” control only appears next to existing chips (not on every row).
struct EchoMessageReactionsView: View {
  let reactions: [EchoMessageReaction]
  let currentUserID: String
  let baseURL: URL
  var accessToken: String? = nil
  var onToggle: (String) -> Void
  var onAdd: (() -> Void)?
  @Environment(\.echoConsumeComposerKeyboardTap) private var consumeComposerKeyboardTap

  var body: some View {
    if !reactions.isEmpty {
      FlowLayout(spacing: 6) {
        ForEach(reactions) { reaction in
          Button {
            if consumeComposerKeyboardTap() { return }
            onToggle(reaction.emoji)
          } label: {
            HStack(spacing: 4) {
              EchoReactionEmojiLabel(
                emoji: reaction.emoji,
                baseURL: baseURL,
                accessToken: accessToken
              )
              Text("\(reaction.count)")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(
                  reaction.includes(userID: currentUserID)
                    ? EchoTheme.Color.indigoSoft
                    : EchoTheme.Color.ink(0.62)
                )
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
              reaction.includes(userID: currentUserID)
                ? EchoTheme.Color.indigoSoft.opacity(0.16)
                : EchoTheme.Color.ink(0.06),
              in: Capsule(style: .continuous)
            )
            .overlay(
              Capsule(style: .continuous)
                .strokeBorder(
                  reaction.includes(userID: currentUserID)
                    ? EchoTheme.Color.indigoSoft.opacity(0.45)
                    : EchoTheme.Color.ink(0.08),
                  lineWidth: 1
                )
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(
            "\(reaction.count) \(reaction.emoji)"
              + (reaction.includes(userID: currentUserID)
                ? ", \(EchoCopy.string("including you"))" : "")
          )
        }

        // “+1” style add — only once a message already has reactions.
        if let onAdd {
          Button {
            if consumeComposerKeyboardTap() { return }
            onAdd()
          } label: {
            Image(systemName: "plus")
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(EchoTheme.Color.ink(0.48))
              .frame(width: 30, height: 26)
              .background(EchoTheme.Color.ink(0.05), in: Capsule(style: .continuous))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Add reaction"))
        }
      }
      .padding(.top, 4)
    }
  }
}

struct EchoReactionEmojiLabel: View {
  let emoji: String
  let baseURL: URL
  var accessToken: String? = nil

  var body: some View {
    if let token = EchoMarkdownCustomEmoji.firstToken(in: emoji)?.ref,
      let source = EchoCustomEmojiCatalog.shared.imageSource(
        name: token.name, id: token.id, animated: token.animated, apiBaseURL: baseURL)
    {
      EchoMediaImage(source: source, baseURL: baseURL, accessToken: accessToken) {
        Text(token.name)
          .font(.system(size: 11, weight: .semibold, design: .rounded))
      }
      .frame(width: 18, height: 18)
    } else {
      Text(emoji)
        .font(.system(size: 15))
    }
  }
}

/// Minimal wrapping layout for reaction chips.
private struct FlowLayout: Layout {
  var spacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let maxWidth = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var width: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x + size.width > maxWidth, x > 0 {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      width = max(width, x + size.width)
      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
    }
    return CGSize(width: width, height: y + rowHeight)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var rowHeight: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x + size.width > bounds.maxX, x > bounds.minX {
        x = bounds.minX
        y += rowHeight + spacing
        rowHeight = 0
      }
      subview.place(
        at: CGPoint(x: x, y: y),
        anchor: .topLeading,
        proposal: ProposedViewSize(size)
      )
      rowHeight = max(rowHeight, size.height)
      x += size.width + spacing
    }
  }
}
