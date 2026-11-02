import EchoDomain
import SwiftUI

struct EchoDirectMessageList: View {
  let conversations: [EchoDirectMessage]
  @Binding var searchText: String
  @FocusState.Binding var searchFocused: Bool
  let baseURL: URL
  var accessToken: String? = nil
  /// Extra scroll room so the last row clears the floating tab bar.
  var bottomContentInset: CGFloat = 84
  let onRefresh: () async -> Void
  /// When search was focused, first tap should only dismiss the keyboard.
  var onConsumeKeyboardTap: () -> Bool = { false }
  let onOpen: (EchoDirectMessage) -> Void
  let inboxNotificationCount: Int
  let onOpenInbox: () -> Void
  /// Desktop: selected conversation highlight (web list selection).
  var selectedConversationID: String? = nil
  var isFriendsSelected = false
  var isNotificationsSelected = false
  var isMessageRequestsSelected = false
  /// Pending DM message-request count (web Messages rail badge).
  var messageRequestCount = 0
  var onOpenMessageRequests: (() -> Void)? = nil
  /// Desktop: open personal notes instead of the phone Inbox tray.
  var personalNotes: EchoDirectMessage? = nil
  var onOpenPersonalNotes: (() -> Void)? = nil
  var onOpenFriends: (() -> Void)? = nil
  /// Messages-rail “Mark all as read” (web `handleDmRailMarkAllRead`).
  var canMarkAllDMsRead = false
  var onMarkAllDMsRead: (() -> Void)? = nil
  /// Context menu + swipe actions per row (mark read, favorite, remove, profile).
  var rowActions: ((EchoDirectMessage) -> EchoDmRowActions)? = nil
  /// Per-channel unread from attention summary (`channelAttentionByChannelId`).
  var unreadCountForChannel: (String) -> Int = { _ in 0 }
  /// Workspace “Going” RSVP cards (web `GuildEventActivityStrip`).
  var guildEventActivityCards: [EchoGuildEventActivityCard] = []
  var onOpenGuildEvent: ((EchoGuildEventActivityCard) -> Void)? = nil
  /// Desktop: collapse the DM inbox column (web `b10.dm.collapsePanel`).
  var onCollapse: (() -> Void)? = nil
  @State private var hasScrolled = false
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  private var usesDesktopSocialChrome: Bool {
    #if os(macOS)
      true
    #else
      false
    #endif
  }

  /// Match DM row highlight width: desktop keeps a hair of inset, phone keeps the
  /// original 22pt gutter so the search field doesn’t hug the screen edge.
  private var socialChromeInset: CGFloat {
    usesDesktopSocialChrome ? 8 : 22
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        conversationSearchField

        if onOpenFriends != nil {
          EchoHomeActionButton(
            systemName: "person.2.fill",
            accessibilityLabel: EchoCopy.string("Friends"),
            isSelected: isFriendsSelected,
            action: {
              if onConsumeKeyboardTap() { return }
              onOpenFriends?()
            }
          )
        }

        if let onMarkAllDMsRead, canMarkAllDMsRead {
          EchoHomeActionButton(
            systemName: "envelope.open.fill",
            accessibilityLabel: EchoCopy.string("Mark all as read"),
            action: {
              if onConsumeKeyboardTap() { return }
              onMarkAllDMsRead()
            }
          )
        }

        EchoHomeActionButton(
          systemName: "bell.fill",
          accessibilityLabel: EchoCopy.string("Notifications"),
          notificationCount: inboxNotificationCount,
          isSelected: isNotificationsSelected,
          action: {
            if onConsumeKeyboardTap() { return }
            onOpenInbox()
          }
        )

        #if os(macOS)
          if let onCollapse {
            EchoHomeActionButton(
              systemName: "sidebar.leading",
              accessibilityLabel: EchoCopy.string("Collapse messages"),
              action: {
                if onConsumeKeyboardTap() { return }
                onCollapse()
              }
            )
          }
        #endif
      }
      .padding(.horizontal, socialChromeInset)
      .padding(.top, 10)
      .padding(.bottom, usesDesktopSocialChrome ? 10 : 17)
      // Search chrome sits on the same continuous wash as the profile shelf.

      // Only surface the rail entry when there is at least one pending request.
      if onOpenMessageRequests != nil, messageRequestCount > 0 {
        EchoDirectMessagePinnedRow(
          systemName: "envelope.badge.fill",
          title: EchoCopy.string("Message requests"),
          subtitle: EchoCopy.string("Pending conversations"),
          badge: messageRequestCount,
          isSelected: isMessageRequestsSelected,
          usesAccentAvatar: false
        ) {
          if onConsumeKeyboardTap() { return }
          onOpenMessageRequests?()
        }
        .padding(.horizontal, socialChromeInset)
        .padding(.bottom, 10)
      }

      if !guildEventActivityCards.isEmpty {
        EchoGuildEventActivityStrip(
          cards: guildEventActivityCards,
          baseURL: baseURL,
          accessToken: accessToken,
          onOpen: { card in onOpenGuildEvent?(card) }
        )
        .padding(.horizontal, socialChromeInset)
        .padding(.bottom, 8)
      }

      ZStack(alignment: .top) {
        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 0) {
            if conversations.isEmpty {
              Text(
                searchText.isEmpty
                  ? EchoCopy.string("No conversations yet.")
                  : EchoCopy.string("No conversations found.")
              )
              .font(.system(size: 15, weight: .regular, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.46))
              .padding(.horizontal, 24)
              .padding(.top, 18)
              .frame(maxWidth: .infinity)
              .contentShape(Rectangle())
              .onTapGesture { dismissSearchKeyboard() }
            } else {
              ForEach(conversations) { conversation in
                EchoDirectMessageRow(
                  conversation: conversation,
                  baseURL: baseURL,
                  accessToken: accessToken,
                  isSelected: selectedConversationID == conversation.id,
                  unreadCount: unreadCountForChannel(conversation.channelID),
                  onTap: {
                    if onConsumeKeyboardTap() { return }
                    onOpen(conversation)
                  }
                )
                .echoDmRowActions(
                  rowActions?(conversation), conversation: conversation,
                  onOpen: { onOpen(conversation) })
              }
            }
          }
          // Match Friends / search chrome width — same side gutter as the pinned rows.
          .padding(.horizontal, socialChromeInset)
          .padding(.bottom, bottomContentInset)
          .background {
            GeometryReader { proxy in
              Color.clear.preference(
                key: EchoDirectMessageScrollOffsetKey.self,
                value: proxy.frame(in: .named("echo-direct-messages-scroll")).minY
              )
            }
          }
        }
        .coordinateSpace(name: "echo-direct-messages-scroll")
        .scrollDismissesKeyboard(.immediately)
        .refreshable {
          await onRefresh()
        }

        LinearGradient(
          colors: [
            displayPrefs.canvas(colorScheme: colorScheme),
            displayPrefs.canvas(colorScheme: colorScheme).opacity(0),
          ],
          startPoint: .top,
          endPoint: .bottom
        )
        .frame(height: 18)
        .opacity(hasScrolled ? 1 : 0)
        .allowsHitTesting(false)
      }
      .frame(maxHeight: .infinity)
      .onPreferenceChange(EchoDirectMessageScrollOffsetKey.self) { offset in
        hasScrolled = offset < -4
      }
    }
    .onDisappear { dismissSearchKeyboard() }
  }

  /// Full chrome is the hit target — padding around the TextField used to miss
  /// clicks near the left/right edges of the search capsule.
  private var conversationSearchField: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .allowsHitTesting(false)
      TextField(EchoCopy.string("Search conversations"), text: $searchText)
        .font(.system(size: 15, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
        .tint(EchoTheme.Color.fg)
        .textFieldStyle(.plain)
        .focused($searchFocused)
        .submitLabel(.search)
        #if os(iOS)
          .textInputAutocapitalization(.never)
        #endif
        .autocorrectionDisabled()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 16)
    .frame(maxWidth: .infinity, minHeight: 48, maxHeight: 48, alignment: .leading)
    .background(
      EchoTheme.Color.ink(searchFocused ? 0.085 : 0.065),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(
        searchFocused ? EchoTheme.Color.indigo.opacity(0.55) : EchoTheme.Color.ink(0.08))
    )
    .echoPointerHoverFill(
      isSelected: searchFocused,
      selectedFill: Color.clear,
      hoverFill: EchoTheme.Color.ink(0.04),
      idleFill: Color.clear,
      cornerRadius: 16
    )
    .contentShape(Rectangle())
    .overlay {
      // Expand the clickable region past the caret-sized TextField bounds.
      if !searchFocused {
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture { searchFocused = true }
      }
    }
  }

  private func dismissSearchKeyboard() {
    guard searchFocused else { return }
    searchFocused = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }
}
