import EchoDomain
import EchoNetworking
import SwiftUI

/// Web `server-folder__pill--v` — left-edge bump, outline on hover, fill when selected.
struct EchoRailEdgePill: View {
  var selected: Bool
  var hovering: Bool
  var unread = false

  private var pillVisible: Bool { selected || hovering }
  private var unreadVisible: Bool { unread && !selected && !hovering }

  private var shape: UnevenRoundedRectangle {
    UnevenRoundedRectangle(
      topLeadingRadius: 0,
      bottomLeadingRadius: 0,
      bottomTrailingRadius: 6,
      topTrailingRadius: 6,
      style: .continuous
    )
  }

  var body: some View {
    ZStack(alignment: .leading) {
      shape
        .fill(selected ? EchoTheme.Color.fg : Color.clear)
        .overlay {
          shape.strokeBorder(
            EchoTheme.Color.fg.opacity(selected ? 0 : 1),
            lineWidth: 1
          )
        }
        .frame(width: 5, height: 28)
        .opacity(pillVisible ? 1 : 0)

      UnevenRoundedRectangle(
        topLeadingRadius: 0,
        bottomLeadingRadius: 0,
        bottomTrailingRadius: 4,
        topTrailingRadius: 4,
        style: .continuous
      )
      .fill(EchoTheme.Color.fg.opacity(0.78))
      .frame(width: 4, height: 10)
      .opacity(unreadVisible ? 1 : 0)
    }
    .frame(width: 5, height: 28, alignment: .leading)
    .animation(EchoRailMotion.pill, value: pillVisible)
    .animation(EchoRailMotion.pill, value: unreadVisible)
    .allowsHitTesting(false)
  }
}

enum EchoRailMotion {
  /// Softer than the first Mac pass — closer to web’s ease curve.
  static let pill = Animation.timingCurve(0.33, 1, 0.68, 1, duration: 0.32)
}

/// Pointer-fine hover wash for list rows (channels, DMs, overflow servers).
struct EchoPointerHoverFill: ViewModifier {
  var isSelected = false
  var selectedFill: Color = EchoTheme.Color.ink(0.10)
  var hoverFill: Color = EchoTheme.Color.ink(0.07)
  var idleFill: Color = .clear
  var cornerRadius: CGFloat = 12
  @State private var hovering = false

  func body(content: Content) -> some View {
    content
      .background(
        isSelected ? selectedFill : (hovering ? hoverFill : idleFill),
        in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
      )
      // Instant — web glass-hover feels immediate; a 120ms ease lagged behind the pointer.
      .onHover { hovering = $0 }
  }
}

extension View {
  func echoPointerHoverFill(
    isSelected: Bool = false,
    selectedFill: Color = EchoTheme.Color.ink(0.10),
    hoverFill: Color = EchoTheme.Color.ink(0.07),
    idleFill: Color = .clear,
    cornerRadius: CGFloat = 12
  ) -> some View {
    modifier(
      EchoPointerHoverFill(
        isSelected: isSelected,
        selectedFill: selectedFill,
        hoverFill: hoverFill,
        idleFill: idleFill,
        cornerRadius: cornerRadius
      )
    )
  }
}

#if os(macOS)
  struct EchoMacRailServerButton: View {
    let server: EchoServerSummary
    let selected: Bool
    let baseURL: URL
    var accessToken: String?
    var userID: String = ""
    var canInvite = false
    var isOwner = false
    var onInvite: (() -> Void)? = nil
    var onSettings: (() -> Void)? = nil
    var onNotifications: (() -> Void)? = nil
    var onLeave: (() -> Void)? = nil
    let iconSide: CGFloat
    let railWidth: CGFloat
    var action: () -> Void

    @Environment(EchoAuthenticationModel.self) private var auth
    @State private var hovering = false
    @State private var markReadNote: String?
    @State private var attentionSync = EchoAttentionSync.shared

    private var railAttention: EchoServerRailAttention {
      let _ = attentionSync.snapshot.unreadCount
      return EchoAttentionPingIndicators.indicators(
        for: server.id, snapshot: attentionSync.snapshot)
    }

    private var hasServerUnreads: Bool {
      attentionSync.snapshot.channelAttention.values.contains {
        ($0.kind?.lowercased() == "server")
          && ($0.serverID == server.id)
          && $0.unreadCount > 0
      }
    }

    var body: some View {
      Button(action: action) {
        EchoServerIcon(
          iconURL: server.iconURL,
          name: server.name,
          baseURL: baseURL,
          accessToken: accessToken,
          bannerURL: server.bannerURL,
          cornerRadius: selected ? 14 : (hovering ? 16 : 22)
        )
        .frame(width: iconSide, height: iconSide)
        .overlay {
          EchoServerRailAttentionOverlay(attention: railAttention, iconSide: iconSide)
        }
        .offset(y: hovering && !selected ? -0.5 : 0)
        .frame(width: railWidth, height: 48)
        .overlay(alignment: .leading) {
          EchoRailEdgePill(
            selected: selected, hovering: hovering, unread: railAttention.plainUnread)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .onHover { hovering in
        withAnimation(EchoRailMotion.pill) { self.hovering = hovering }
      }
      .contextMenu {
        EchoMacRailServerContextMenu(
          server: server,
          canInvite: canInvite,
          isOwner: isOwner,
          hasUnreads: hasServerUnreads,
          onInvite: { onInvite?() },
          onSettings: { onSettings?() },
          onNotifications: { onNotifications?() },
          onMarkRead: { Task { await markServerRead() } },
          onLeave: onLeave,
          onCopyID: {
            EchoChannelRowMenu.copyToPasteboard(server.id)
          }
        )
      }
      .help(server.name)
      .accessibilityLabel(server.name)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .alert(
        EchoCopy.string("Mark as read"),
        isPresented: Binding(
          get: { markReadNote != nil },
          set: { if !$0 { markReadNote = nil } })
      ) {
        Button(EchoCopy.string("OK"), role: .cancel) { markReadNote = nil }
      } message: {
        Text(markReadNote ?? "")
      }
    }

    private func markServerRead() async {
      let result = await EchoServerMarkRead.markServer(
        serverID: server.id,
        baseURL: baseURL,
        auth: auth,
        userID: userID.isEmpty ? (auth.activeSession?.userID ?? "") : userID)
      switch result {
      case .ok:
        break
      case .empty:
        markReadNote = EchoCopy.string("Nothing to mark as read.")
      case .failed:
        markReadNote = EchoCopy.string("Echo couldn’t mark that server as read.")
      case .unauthenticated:
        markReadNote = EchoCopy.string("Sign in to mark servers as read.")
      }
    }
  }

  struct EchoMacRailTabButton<Label: View>: View {
    var selected: Bool
    var badge: Int
    var accessibility: String
    var iconSide: CGFloat
    var railWidth: CGFloat
    var action: () -> Void
    @ViewBuilder var label: () -> Label

    @State private var hovering = false

    var body: some View {
      Button(action: action) {
        ZStack {
          RoundedRectangle(
            cornerRadius: selected ? 14 : (hovering ? 16 : 22),
            style: .continuous
          )
          .fill(
            selected
              ? EchoTheme.Color.signInBlue.opacity(0.14)
              : (hovering ? EchoTheme.Color.ink(0.055) : Color.clear)
          )
          .frame(width: iconSide, height: iconSide)

          label()
            .foregroundStyle(
              selected || hovering ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.55)
            )
            .offset(y: hovering && !selected ? -0.5 : 0)

          if badge > 0 {
            Text(badge > 99 ? "99+" : "\(badge)")
              .font(.system(size: 9, weight: .bold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.onAccent)
              .padding(.horizontal, 4)
              .frame(minWidth: 16, minHeight: 16)
              .background(EchoTheme.Color.badge, in: Capsule())
              .offset(x: 16, y: -16)
          }
        }
        .frame(width: railWidth, height: 48)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .onHover { hovering in
        withAnimation(EchoRailMotion.pill) { self.hovering = hovering }
      }
      .accessibilityLabel(accessibility)
      .accessibilityAddTraits(selected ? .isSelected : [])
    }
  }
#endif
