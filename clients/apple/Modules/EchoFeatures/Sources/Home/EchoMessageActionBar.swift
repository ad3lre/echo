import SwiftUI

/// Floating hover/touch quick-react bar (web `MessageActionBar.vue`).
struct EchoMessageActionBar: View {
  let quickEmojis: [String]
  let baseURL: URL
  var accessToken: String? = nil
  var isOwnMessage = false
  var onQuickReact: (String) -> Void
  var onRemoveFavorite: (String) -> Void
  var onAddReaction: (() -> Void)?
  var onReply: (() -> Void)?
  var onEdit: (() -> Void)?

  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    HStack(spacing: 2) {
      ForEach(quickEmojis, id: \.self) { emoji in
        Button {
          onQuickReact(emoji)
        } label: {
          EchoReactionEmojiLabel(emoji: emoji, baseURL: baseURL, accessToken: accessToken)
            .frame(width: 22, height: 22)
            .frame(width: 28, height: 28)
            .contentShape(Rectangle())
            .echoPointerHoverFill(
              hoverFill: displayPrefs.ink(0.10),
              cornerRadius: 6)
        }
        .buttonStyle(.plain)
        .help(EchoCopy.format("React with %@", emoji))
        .accessibilityLabel(EchoCopy.format("React with %@", emoji))
        .contextMenu {
          Button(role: .destructive) {
            onRemoveFavorite(emoji)
          } label: {
            Label(
              EchoCopy.string("Remove from quick reactions"),
              systemImage: "minus.circle")
          }
        }
      }

      if !quickEmojis.isEmpty {
        Rectangle()
          .fill(displayPrefs.ink(0.12))
          .frame(width: 1, height: 14)
          .padding(.horizontal, 2)
      }

      if let onAddReaction {
        barButton(
          icon: .addReaction,
          label: EchoCopy.string("Add reaction"),
          action: onAddReaction)
      }
      if let onReply {
        barButton(
          icon: .reply,
          label: EchoCopy.string("Reply"),
          action: onReply)
      }
      if isOwnMessage, let onEdit {
        barButton(
          icon: .edit,
          label: EchoCopy.string("Edit message"),
          action: onEdit)
      }
    }
    .padding(.horizontal, 6)
    .padding(.vertical, 4)
    .background {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(.ultraThinMaterial)
        .overlay {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .strokeBorder(displayPrefs.ink(0.10), lineWidth: 1)
        }
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.35 : 0.12), radius: 6, y: 2)
    }
  }

  private func barButton(
    icon: EchoMessageActionIcon.Kind,
    label: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      EchoMessageActionIcon(kind: icon)
        .foregroundStyle(displayPrefs.ink(0.72))
        .frame(width: 24, height: 24)
        .frame(width: 28, height: 28)
        .contentShape(Rectangle())
        .echoPointerHoverFill(
          hoverFill: displayPrefs.ink(0.10),
          cornerRadius: 6)
    }
    .buttonStyle(.plain)
    .help(label)
    .accessibilityLabel(label)
  }
}

/// Action glyphs from the synced web icon catalog (same assets as channel chrome).
private struct EchoMessageActionIcon: View {
  enum Kind {
    case addReaction
    case reply
    case edit

    var catalogKey: String? {
      switch self {
      case .addReaction: nil
      case .reply: "arrow-left-curved.svg"
      case .edit: "edit.svg"
      }
    }

    var systemFallback: String {
      switch self {
      case .addReaction: "face.smiling"
      case .reply: "arrowshape.turn.up.left"
      case .edit: "pencil"
      }
    }
  }

  let kind: Kind

  var body: some View {
    Group {
      if let key = kind.catalogKey,
        let asset = EchoIconCatalog.assetName(forFilenameOrKey: key)
      {
        Image(asset, bundle: .module)
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: 15, height: 15)
      } else if kind == .addReaction {
        // Web MessageActionBar uses the Heroicons face-smile outline; no catalog twin.
        EchoHeroFaceSmile()
          .stroke(style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
          .frame(width: 15, height: 15)
      } else {
        Image(systemName: kind.systemFallback)
          .font(.system(size: 13, weight: .semibold))
      }
    }
  }
}

/// Heroicons `face-smile` outline — same path as web `MessageActionBar.vue`.
private struct EchoHeroFaceSmile: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 24
    let o = CGPoint(x: rect.midX - 12 * s, y: rect.midY - 12 * s)
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
      CGPoint(x: o.x + x * s, y: o.y + y * s)
    }
    var path = Path()
    path.addEllipse(in: CGRect(x: o.x + 3 * s, y: o.y + 3 * s, width: 18 * s, height: 18 * s))
    // Eyes (short strokes match `M9 10h.01` / `M15 10h.01`)
    path.move(to: p(8.6, 10))
    path.addLine(to: p(9.4, 10))
    path.move(to: p(14.6, 10))
    path.addLine(to: p(15.4, 10))
    // Smile: approximate `M14.828 14.828a4 4 0 01-5.656 0`
    path.move(to: p(9.172, 14.828))
    path.addQuadCurve(to: p(14.828, 14.828), control: p(12, 17.2))
    return path
  }
}

/// Hover (macOS) / always-visible (iOS) overlay hosting ``EchoMessageActionBar``.
struct EchoMessageActionBarOverlay: ViewModifier {
  let enabled: Bool
  let isOwnMessage: Bool
  let baseURL: URL
  var accessToken: String? = nil
  var onQuickReact: (String) -> Void
  var onAddReaction: (() -> Void)?
  var onReply: (() -> Void)?
  var onEdit: (() -> Void)?

  @State private var contentHovering = false
  @State private var barHovering = false
  @State private var favorites = EchoReactionFavoritesStore.shared

  private var barVisible: Bool {
    guard enabled else { return false }
    #if os(macOS)
      return contentHovering || barHovering
    #else
      return true
    #endif
  }

  func body(content: Content) -> some View {
    content
      .overlay(alignment: .topTrailing) {
        if enabled {
          EchoMessageActionBar(
            quickEmojis: favorites.topReactions,
            baseURL: baseURL,
            accessToken: accessToken,
            isOwnMessage: isOwnMessage,
            onQuickReact: onQuickReact,
            onRemoveFavorite: { favorites.remove($0) },
            onAddReaction: onAddReaction,
            onReply: onReply,
            onEdit: onEdit
          )
          .offset(x: -4, y: -14)
          .opacity(barVisible ? 1 : 0)
          .allowsHitTesting(barVisible)
          .zIndex(5)
          #if os(macOS)
            .onHover { barHovering = $0 }
          #endif
        }
      }
      #if os(macOS)
        .onHover { contentHovering = $0 }
      #endif
  }
}

extension View {
  func echoMessageActionBar(
    enabled: Bool,
    isOwnMessage: Bool,
    baseURL: URL,
    accessToken: String? = nil,
    onQuickReact: @escaping (String) -> Void,
    onAddReaction: (() -> Void)? = nil,
    onReply: (() -> Void)? = nil,
    onEdit: (() -> Void)? = nil
  ) -> some View {
    modifier(
      EchoMessageActionBarOverlay(
        enabled: enabled,
        isOwnMessage: isOwnMessage,
        baseURL: baseURL,
        accessToken: accessToken,
        onQuickReact: onQuickReact,
        onAddReaction: onAddReaction,
        onReply: onReply,
        onEdit: onEdit))
  }
}
