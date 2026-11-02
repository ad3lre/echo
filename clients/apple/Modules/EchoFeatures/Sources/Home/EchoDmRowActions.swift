import EchoDomain
import Foundation
import Observation
import SwiftUI

/// Client-only favorites pinned to the top of Messages — mirrors web `favoriteDmInbox`.
@MainActor
@Observable
final class EchoFavoriteDmInboxStore {
  static let shared = EchoFavoriteDmInboxStore()

  private let defaults: UserDefaults
  private let storageKey: String
  private var accountID: String?
  private var accountKey: String { "\(storageKey).\(accountID ?? "signed-out")" }

  /// Peer user ids of favorited 1:1 DMs.
  private(set) var users: Set<String> = []
  /// Channel ids of favorited group DMs.
  private(set) var groups: Set<String> = []

  convenience init() {
    self.init(defaults: .standard, storageKey: "echo_favorite_dm_inbox_v1")
  }

  init(defaults: UserDefaults, storageKey: String) {
    self.defaults = defaults
    self.storageKey = storageKey
  }

  func isFavorite(_ conversation: EchoDirectMessage, selfUserID: String) -> Bool {
    activate(selfUserID)
    switch key(for: conversation, selfUserID: selfUserID) {
    case .user(let id): return users.contains(id)
    case .group(let id): return groups.contains(id)
    }
  }

  func toggle(_ conversation: EchoDirectMessage, selfUserID: String) {
    activate(selfUserID)
    switch key(for: conversation, selfUserID: selfUserID) {
    case .user(let id):
      if !users.insert(id).inserted { users.remove(id) }
    case .group(let id):
      if !groups.insert(id).inserted { groups.remove(id) }
    }
    defaults.set(["users": Array(users), "groups": Array(groups)], forKey: accountKey)
  }

  /// Favorites float to the top; relative order inside each band is preserved.
  func ordered(_ conversations: [EchoDirectMessage], selfUserID: String) -> [EchoDirectMessage] {
    let favorites = conversations.filter { isFavorite($0, selfUserID: selfUserID) }
    guard !favorites.isEmpty else { return conversations }
    let rest = conversations.filter { !isFavorite($0, selfUserID: selfUserID) }
    return favorites + rest
  }

  private enum Key {
    case user(String)
    case group(String)
  }

  private func key(for conversation: EchoDirectMessage, selfUserID: String) -> Key {
    if let peer = conversation.peerUserID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !peer.isEmpty
    {
      return .user(peer)
    }
    return .group(conversation.channelID)
  }

  private func activate(_ id: String) {
    guard accountID != id else { return }
    accountID = id
    let raw = defaults.dictionary(forKey: accountKey)
    users = Set((raw?["users"] as? [String]) ?? [])
    groups = Set((raw?["groups"] as? [String]) ?? [])
  }
}

/// Row-level DM actions (web `DMPanel` context menu: mark read, favorite, remove, profile).
struct EchoDmRowActions {
  var isFavorite: Bool
  var onMarkRead: () -> Void
  var onToggleFavorite: () -> Void
  /// `nil` for Personal Notes (cannot be removed).
  var onHide: (() -> Void)?
  /// `nil` for group DMs.
  var onViewProfile: (() -> Void)?
}

/// Context menu everywhere; edge swipes on iOS (leading: mark read, trailing: remove).
struct EchoDmRowActionsModifier: ViewModifier {
  let conversation: EchoDirectMessage
  let actions: EchoDmRowActions
  let onOpen: () -> Void
  @AppStorage("echo.settings.advanced.developerMode") private var developerMode = false

  func body(content: Content) -> some View {
    let base = content.contextMenu {
      Button(action: onOpen) {
        Label(
          conversation.isGroup ? EchoCopy.string("Open group") : EchoCopy.string("Open DM"),
          systemImage: "bubble.left")
      }
      Button(action: actions.onMarkRead) {
        Label(EchoCopy.string("Mark as read"), systemImage: "checkmark")
      }
      Button(action: actions.onToggleFavorite) {
        Label(
          actions.isFavorite ? EchoCopy.string("Unfavorite") : EchoCopy.string("Favorite"),
          systemImage: actions.isFavorite ? "star.slash" : "star")
      }
      if let onHide = actions.onHide {
        Button(role: .destructive, action: onHide) {
          Label(EchoCopy.string("Remove from list"), systemImage: "xmark.circle")
        }
      }
      if let onViewProfile = actions.onViewProfile {
        Button(action: onViewProfile) {
          Label(EchoCopy.string("Profile"), systemImage: "person.crop.circle")
        }
      }
      if developerMode {
        Button {
          EchoClipboard.copy(conversation.peerUserID ?? conversation.channelID)
        } label: {
          Label(EchoCopy.string("Copy ID"), systemImage: "number")
        }
      }
    }
    #if os(iOS)
      base
        .echoSwipeAction(
          edge: .leading, systemImage: "checkmark", tint: EchoTheme.Color.indigoSoft,
          action: actions.onMarkRead
        )
        .echoSwipeAction(
          edge: .trailing, systemImage: "xmark", tint: EchoTheme.Color.mentionPing,
          enabled: actions.onHide != nil
        ) { actions.onHide?() }
    #else
      base
    #endif
  }
}

extension View {
  @ViewBuilder
  func echoDmRowActions(
    _ actions: EchoDmRowActions?, conversation: EchoDirectMessage, onOpen: @escaping () -> Void
  ) -> some View {
    if let actions {
      modifier(EchoDmRowActionsModifier(conversation: conversation, actions: actions, onOpen: onOpen))
    } else {
      self
    }
  }
}
