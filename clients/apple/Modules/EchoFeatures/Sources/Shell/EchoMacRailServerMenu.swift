import EchoDomain
import SwiftUI

#if os(macOS)
  /// Sheet targets opened from the macOS server-rail context menu.
  enum EchoMacRailServerSheet: Identifiable, Equatable {
    case invite(EchoServerSummary)
    case notifications(EchoServerSummary)
    case settings(EchoServerSummary)

    var id: String {
      switch self {
      case .invite(let s): return "invite:\(s.id)"
      case .notifications(let s): return "notifications:\(s.id)"
      case .settings(let s): return "settings:\(s.id)"
      }
    }

    var server: EchoServerSummary {
      switch self {
      case .invite(let s), .notifications(let s), .settings(let s): return s
      }
    }
  }

  /// Web `ServerRailContextMenu` items for one guild icon.
  struct EchoMacRailServerContextMenu: View {
    let server: EchoServerSummary
    var canInvite: Bool
    var isOwner: Bool
    var hasUnreads: Bool
    var onInvite: () -> Void
    var onSettings: () -> Void
    var onNotifications: () -> Void
    var onMarkRead: () -> Void
    var onLeave: (() -> Void)?
    var onCopyID: (() -> Void)? = nil

    var body: some View {
      Button(action: onSettings) {
        Label(EchoCopy.string("Server Settings"), systemImage: "gearshape")
      }
      if canInvite {
        Button(action: onInvite) {
          Label(EchoCopy.string("Invite People"), systemImage: "person.badge.plus")
        }
      }
      Button(action: onNotifications) {
        Label(EchoCopy.string("Notification Settings"), systemImage: "bell")
      }
      if hasUnreads {
        Button(action: onMarkRead) {
          Label(EchoCopy.string("Mark as read"), systemImage: "envelope.open")
        }
      }
      if let onCopyID {
        Divider()
        Button(action: onCopyID) {
          Label(EchoCopy.string("Copy server ID"), systemImage: "doc.on.doc")
        }
      }
      if let onLeave, !isOwner {
        Divider()
        Button(role: .destructive, action: onLeave) {
          Label(EchoCopy.string("Leave server"), systemImage: "rectangle.portrait.and.arrow.right")
        }
      }
    }
  }
#endif
