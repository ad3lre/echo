import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Reads timeline message state only — typing lives in `EchoTypingIndicator`.
struct EchoConversationTimeline: View {
  @Bindable var model: EchoMessageTimelineModel
  let conversation: EchoDirectMessage
  let baseURL: URL
  let accessToken: String
  let userID: String
  let scrollTargetMessageID: String?
  /// Composer panel / keyboard chrome — re-stick when this bumps.
  var stickToBottomTick: Int = 0
  /// Opens the author's profile (DM peer panel, guild quick profile, or full profile).
  var onAuthorProfile: ((EchoMessage) -> Void)? = nil
  /// Guild / group-DM roster lookup when the message payload left the author bare.
  var resolveAuthor: ((String) -> EchoResolvedAuthor?)? = nil
  var onReply: ((EchoMessage) -> Void)? = nil
  var onEdit: ((EchoMessage) -> Void)? = nil
  var onDelete: ((EchoMessage) -> Void)? = nil
  var onReport: ((EchoMessage) -> Void)? = nil
  var onReact: ((EchoMessage) -> Void)? = nil
  var onForward: ((EchoMessage) -> Void)? = nil
  var onToggleReaction: ((EchoMessage, String) -> Void)? = nil
  var onJumpToReply: ((String) -> Void)? = nil
  /// Moderator menu (delete others' messages, timeout / kick / ban) — `nil` outside guilds.
  var moderationFor: ((EchoMessage) -> EchoMessageModerationActions?)? = nil
  /// Notification Settings → Mention highlights (web `mentionHighlights`).
  var mentionHighlightsEnabled: Bool = true
  /// Guild channels keep the generic empty chrome; DMs/groups use the history intro.
  var isGuildChannel = false
  /// Web `dmHistoryIntro` — shown when the DM/group thread has no messages.
  var historyIntro: EchoDmHistoryIntro.Content? = nil
  var historyIntroBusy = false
  var onHistoryIntroAction: ((EchoDmHistoryIntro.FriendAction) -> Void)? = nil
  /// Follow the latest message only while the user is already pinned near bottom.
  @State private var followLatest = true
  /// Web `pendingNewWhileAway` — new tails while scrolled up (Jump FAB badge).
  @State private var pendingNewWhileAway = 0
  /// Snapshot for pending-new delta (count + last id).
  @State private var lastKnownTail: (count: Int, lastID: String?) = (0, nil)
  /// Web-parity: leave the top trigger zone before another older-page load.
  @State private var loadOlderArmed = true
  /// Viewport height for short-thread bottom / empty-state centering (minHeight only).
  @State private var viewportHeight: CGFloat = 0

  var body: some View {
    ScrollViewReader { proxy in
      // Vertical-only: wide markdown/LaTeX must not unlock a horizontal axis.
      ScrollView(.vertical, showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 0) {
          if model.isLoading && model.messages.isEmpty {
            ProgressView()
              .tint(EchoTheme.Color.ink(0.78))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
              .accessibilityLabel(EchoCopy.string("Loading messages"))
              .frame(maxWidth: .infinity)
          } else if let errorMessage = model.errorMessage, model.messages.isEmpty {
            EchoConversationErrorView(message: errorMessage) {
              await model.loadInitial()
            }
            .frame(maxWidth: .infinity)
          } else if model.messages.isEmpty {
            // Intro / empty chrome is an overlay so it stays vertically centered;
            // keep a 1pt stub so the scroll view still measures a content size.
            Color.clear.frame(height: 1).id("dm-history-intro")
          } else {
            olderHistoryChrome

            ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
              if showsDaySeparator(at: index), let day = message.timestamp {
                EchoDaySeparator(date: day, isFirst: index == 0)
              }
              EchoMessageRow(
                message: message,
                conversation: conversation,
                baseURL: baseURL,
                accessToken: accessToken,
                showsHeader: showsHeader(at: index),
                currentUserID: userID,
                resolveVoterName: { voterName($0) },
                onPollVote: { optionID in
                  Task { await model.vote(messageID: message.id, optionID: optionID) }
                },
                onDismissFailed: message.delivery == .failed
                  ? { model.dismissFailedSend(id: message.id) } : nil,
                onAuthorProfileTap: canOpenAuthorProfile(message)
                  ? { onAuthorProfile?(message) } : nil,
                isPinned: model.isPinned(message.id),
                onTogglePin: message.delivery == .sent
                  ? { Task { await model.togglePin(messageID: message.id) } } : nil,
                onReply: message.delivery == .sent && !message.isSystemMessage
                  ? { onReply?(message) } : nil,
                onJumpToReply: message.replyTo.map { reply in
                  { onJumpToReply?(reply.messageID) }
                },
                onEdit: message.delivery == .sent && message.isCurrentUser
                  && !message.isSystemMessage
                  ? { onEdit?(message) } : nil,
                onDelete: message.delivery == .sent && message.isCurrentUser
                  && !message.isSystemMessage
                  ? { onDelete?(message) } : nil,
                onReport: message.delivery == .sent && !message.isCurrentUser
                  && !message.isSystemMessage
                  ? { onReport?(message) } : nil,
                moderation: moderationFor?(message),
                onReact: message.delivery == .sent && !message.isSystemMessage
                  ? { onReact?(message) } : nil,
                onForward: message.delivery == .sent && !message.isSystemMessage
                  ? { onForward?(message) } : nil,
                onJumpToForwarded: message.forwardedFrom.flatMap { fwd in
                  fwd.channelID == conversation.channelID && !fwd.messageID.isEmpty
                    ? { onJumpToReply?(fwd.messageID) } : nil
                },
                onToggleReaction: message.delivery == .sent
                  ? { emoji in onToggleReaction?(message, emoji) } : nil,
                highlightsMention: highlightsMention(message),
                resolvedAuthor: resolveAuthor?(message.authorID)
              )
              // Keep each row column-width so tall chats cannot grow a
              // horizontal content size that left-shifts the thread.
              .frame(maxWidth: .infinity, alignment: .leading)
              .id(message.id)
              .onAppear {
                if message.id == model.messages.last?.id {
                  // Scrolled back to (or still on) the latest row — resume live follow.
                  followLatest = true
                  pendingNewWhileAway = 0
                }
                guard index == 0, model.hasMoreBefore, loadOlderArmed else { return }
                loadOlderArmed = false
                Task { @MainActor in
                  // Anchor to the previous oldest row so prepending history does not
                  // jump the viewport (replaces bottom-pinned scrollPosition).
                  let anchorID = message.id
                  let added = await model.loadOlder()
                  if added {
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) {
                      proxy.scrollTo(anchorID, anchor: .top)
                    }
                  }
                  // Model also guards with `isLoadingOlder`; re-arm after this page.
                  loadOlderArmed = true
                }
              }
              // Do not clear followLatest in onDisappear — keyboard / inset resize
              // recycles the last LazyVStack cell and was falsely "scrolling away".
            }
          }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, model.messages.isEmpty ? 0 : 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Empty: center “No messages yet”. Short threads: pin to bottom so they
        // don’t leave a blank band above the composer. Tall threads grow past
        // this minHeight and scroll freely (no sticky scrollPosition fight).
        .frame(
          minHeight: viewportHeight > 0 ? viewportHeight : nil,
          alignment: model.messages.isEmpty ? .center : .bottom
        )
      }
      // `.bottom` is (0.5, 1) — when content is briefly wider than the
      // viewport (lazy LaTeX / markdown measure), that x=0.5 centers the
      // column and the whole DM list opens left-shifted. Pin leading+bottom.
      .defaultScrollAnchor(.bottomLeading)
      // Do not bind `.scrollPosition(id:anchor: .bottom…)` to the latest
      // message: while the last row is still at the bottom of the viewport,
      // small upward scrolls never change the id and SwiftUI spring-snaps
      // back down. Follow mode uses explicit `scrollTo` only.
      .scrollDismissesKeyboard(.interactively)
      .frame(maxHeight: .infinity)
      .overlay {
        if !model.isLoading, model.errorMessage == nil, model.messages.isEmpty {
          if let historyIntro,
            EchoDmHistoryIntro.shouldShow(
              isGuildChannel: isGuildChannel,
              isLoading: false,
              hasError: false,
              messageCount: 0)
          {
            EchoDmHistoryIntroCard(
              content: historyIntro,
              baseURL: baseURL,
              accessToken: accessToken,
              onPrimaryAction: historyIntro.primaryAction.map { action in
                { onHistoryIntroAction?(action) }
              },
              isActionBusy: historyIntroBusy
            )
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
          } else if historyIntro == nil {
            VStack(spacing: 10) {
              Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(EchoTheme.Color.ink(0.32))
              Text(EchoCopy.string("No messages yet"))
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.82))
              Text(EchoCopy.string("Your conversation is ready when you are."))
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.46))
                .multilineTextAlignment(.center)
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .allowsHitTesting(false)
          }
        }
      }
      .overlay(alignment: .bottom) {
        if EchoTimelineJumpUi.shouldShow(
          followLatest: followLatest,
          pendingNewWhileAway: pendingNewWhileAway,
          messageCount: model.messages.count)
        {
          EchoTimelineJumpFab(pendingNewWhileAway: pendingNewWhileAway) {
            followLatest = true
            pendingNewWhileAway = 0
            if let lastID = model.messages.last?.id {
              pinToLatest(lastID, proxy: proxy)
            }
          }
          .padding(.bottom, 12)
          .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
      }
      .background {
        GeometryReader { geo in
          Color.clear.preference(
            key: EchoTimelineViewportHeightKey.self,
            value: geo.size.height
          )
        }
      }
      .onPreferenceChange(EchoTimelineViewportHeightKey.self) { newHeight in
        let previous = viewportHeight
        viewportHeight = newHeight
        // Keyboard / composer panel shrinks or grows the viewport — stay glued.
        guard followLatest, abs(previous - newHeight) > 1,
          let lastID = model.messages.last?.id
        else { return }
        pinToLatest(lastID, proxy: proxy)
      }
      .onChange(of: model.messages.last?.id, initial: true) { _, lastID in
        noteTailGrowth()
        guard let lastID, followLatest else { return }
        pinToLatest(lastID, proxy: proxy)
      }
      .onChange(of: model.messages.count) { _, _ in
        noteTailGrowth()
      }
      .onChange(of: model.isLoading) { _, loading in
        guard !loading, followLatest, let lastID = model.messages.last?.id else { return }
        pinToLatest(lastID, proxy: proxy)
      }
      .onChange(of: stickToBottomTick) { _, _ in
        guard followLatest, let lastID = model.messages.last?.id else { return }
        pinToLatest(lastID, proxy: proxy)
      }
      .onChange(of: scrollTargetMessageID, initial: true) { _, messageID in
        guard let messageID else { return }
        followLatest = false
        Task {
          await model.reveal(messageID: messageID)
          await Task.yield()
          withTransaction(Transaction(animation: .easeInOut(duration: 0.24))) {
            proxy.scrollTo(messageID, anchor: .center)
          }
        }
      }
      #if os(iOS)
        .onReceive(
          NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillChangeFrameNotification)
        ) { _ in
          guard followLatest, let lastID = model.messages.last?.id else { return }
          pinToLatest(lastID, proxy: proxy)
        }
      #endif
      .simultaneousGesture(
        DragGesture(minimumDistance: 10)
          .onChanged { value in
            // Finger moves down → older messages enter from the top → leave follow.
            if value.translation.height > 6 {
              followLatest = false
            }
          }
      )
      .simultaneousGesture(
        TapGesture().onEnded {
          // Blank-area taps: drop the keyboard. Interactive controls also
          // call `echoConsumeComposerKeyboardTap` so their first tap is a no-op.
          EchoComposerKeyboardDismiss.resignFirstResponder()
        }
      )
    }
  }

  private func pinToLatest(_ lastID: String, proxy: ScrollViewProxy) {
    // Keep all proxy use on the main-actor task — ScrollViewProxy is not Sendable.
    Task { @MainActor in
      var transaction = Transaction()
      transaction.disablesAnimations = true
      withTransaction(transaction) {
        proxy.scrollTo(lastID, anchor: .bottomLeading)
      }
      // Keyboard / panel animations settle a beat later — re-anchor once more.
      await Task.yield()
      try? await Task.sleep(for: .milliseconds(80))
      guard followLatest, model.messages.last?.id == lastID else { return }
      withTransaction(transaction) {
        proxy.scrollTo(lastID, anchor: .bottomLeading)
      }
    }
  }

  /// Web `installPendingNewWhileAwayWatch` — bump badge when tails append while away.
  private func noteTailGrowth() {
    let nextCount = model.messages.count
    let nextLastID = model.messages.last?.id
    defer { lastKnownTail = (nextCount, nextLastID) }
    let previous = lastKnownTail
    // First observation / channel open — seed without counting history as "new".
    guard previous.count > 0 || previous.lastID != nil else { return }
    guard !followLatest else {
      pendingNewWhileAway = 0
      return
    }
    let delta = EchoTimelineJumpUi.pendingDelta(
      previousCount: previous.count,
      previousLastID: previous.lastID,
      nextCount: nextCount,
      nextLastID: nextLastID)
    guard delta > 0 else { return }
    pendingNewWhileAway += delta
  }

  /// Fixed-height slot while older history exists so the spinner appearing /
  /// disappearing does not itself shift message rows.
  @ViewBuilder
  private var olderHistoryChrome: some View {
    if model.hasMoreBefore || (model.errorMessage != nil && !model.messages.isEmpty) {
      ZStack {
        if model.isLoadingOlder {
          ProgressView()
            .tint(EchoTheme.Color.ink(0.62))
        } else if let errorMessage = model.errorMessage, !model.messages.isEmpty {
          EchoOlderMessagesErrorBanner(message: errorMessage) {
            loadOlderArmed = false
            _ = await model.loadOlder()
          }
        }
      }
      .frame(maxWidth: .infinity)
      .frame(minHeight: 44)
      .padding(.vertical, 4)
    }
  }

  private func showsDaySeparator(at index: Int) -> Bool {
    guard model.messages.indices.contains(index) else { return false }
    let current = model.messages[index].timestamp
    let previous = index > 0 ? model.messages[index - 1].timestamp : nil
    return EchoDaySeparatorLabel.shouldShow(at: index, previous: previous, current: current)
  }

  private func showsHeader(at index: Int) -> Bool {
    guard index > 0 else { return true }
    let current = model.messages[index]
    let previous = model.messages[index - 1]
    if current.isSystemMessage || previous.isSystemMessage { return true }
    guard current.authorID == previous.authorID else { return true }
    guard let currentDate = current.timestamp, let previousDate = previous.timestamp else {
      return false
    }
    return currentDate.timeIntervalSince(previousDate) > 5 * 60
  }

  private func canOpenAuthorProfile(_ message: EchoMessage) -> Bool {
    guard onAuthorProfile != nil else { return false }
    return !message.isCurrentUser && !EchoUserIdentity.matches(message.authorID, userID)
      && !message.isSystemMessage
  }

  private func highlightsMention(_ message: EchoMessage) -> Bool {
    let replyTargetAuthorID = message.replyTo.flatMap { reply in
      model.messages.first(where: { $0.id == reply.messageID })?.authorID ?? reply.authorID
    }
    return EchoMentionHighlight.shouldHighlight(
      message: message,
      currentUserID: userID,
      currentUsername: conversation.username,
      replyTargetAuthorID: replyTargetAuthorID,
      mentionHighlights: mentionHighlightsEnabled)
  }

  private func voterName(_ userID: String) -> String {
    EchoMessageTimelineModel.voterDisplayName(
      userID: userID, conversation: conversation, messages: model.messages)
  }
}

private struct EchoTimelineViewportHeightKey: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

