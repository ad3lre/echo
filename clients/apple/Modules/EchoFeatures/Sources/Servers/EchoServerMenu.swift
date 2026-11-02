import SwiftUI

/// Web `server-menu-trigger` — 28×28 trailing more-vertical, not a system Menu.
struct EchoServerMenuTrigger: View {
  var isOpen: Bool
  var action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "ellipsis")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(.white.opacity(0.92))
        .rotationEffect(.degrees(90))
        .frame(width: 28, height: 28)
        .background(
          Color.white.opacity(hovered || isOpen ? 0.16 : 0),
          in: RoundedRectangle(cornerRadius: 6, style: .continuous)
        )
        .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .accessibilityLabel(EchoCopy.string("Server options"))
    .accessibilityAddTraits(isOpen ? .isSelected : [])
  }
}

struct EchoServerMenuPanel: View {
  let canInvite: Bool
  let canCreateChannels: Bool
  let isOwner: Bool
  var onSearch: () -> Void
  var onInvite: () -> Void
  var onSettings: () -> Void
  var onCreateChannel: () -> Void
  var onCreateCategory: () -> Void
  var onNotifications: () -> Void
  var onLeave: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      row(EchoCopy.string("Search messages"), icon: "magnifyingglass", action: onSearch)
      if canInvite {
        row(
          EchoCopy.string("Invite People"),
          icon: "person.badge.plus",
          action: onInvite
        )
      }
      row(EchoCopy.string("Server Settings"), icon: "gearshape", action: onSettings)
      if canCreateChannels {
        row(EchoCopy.string("Create Channel"), icon: "plus", action: onCreateChannel)
        row(EchoCopy.string("Create Category"), icon: "list.bullet", action: onCreateCategory)
      }
      row(EchoCopy.string("Notification Settings"), icon: "bell", action: onNotifications)
      Rectangle()
        .fill(EchoTheme.Color.ink(0.10))
        .frame(height: 1)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
      if isOwner {
        Text(
          EchoCopy.string(
            "You own this server. Transfer ownership in Server settings (Danger Zone) before you can leave."
          )
        )
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
      } else {
        row(
          EchoCopy.string("Leave server"),
          icon: "rectangle.portrait.and.arrow.right",
          destructive: true,
          action: onLeave
        )
      }
    }
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.ultraThinMaterial)
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(EchoTheme.Color.elevated.opacity(0.72))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.08), lineWidth: 1)
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .echoShadow(color: .black.opacity(0.28), radius: 22, y: 10)
  }

  private func row(
    _ title: String,
    icon: String,
    destructive: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    EchoServerMenuRow(title: title, icon: icon, destructive: destructive, action: action)
  }
}

private struct EchoServerMenuRow: View {
  let title: String
  let icon: String
  var destructive = false
  var action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(destructive ? EchoTheme.Color.mentionPing : EchoTheme.Color.ink(0.62))
          .frame(width: 16, height: 16)
        Text(title)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(destructive ? EchoTheme.Color.mentionPing : EchoTheme.Color.fg)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
      .background(
        hovered
          ? (destructive
            ? EchoTheme.Color.mentionPing.opacity(0.14)
            : EchoTheme.Color.ink(0.08))
          : Color.clear
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
  }
}
