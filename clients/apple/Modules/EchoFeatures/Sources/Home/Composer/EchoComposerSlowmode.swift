import EchoDomain
import EchoNetworking
import SwiftUI

/// Channel slowmode (web `useChatInputSlowmode`): the interval comes from the channel,
/// the clock starts at the user's last message in the loaded thread.
enum EchoSlowmode {
  static func remainingSeconds(interval: Int, lastSentAt: Date?, now: Date) -> Int {
    guard interval > 0, let lastSentAt else { return 0 }
    let elapsed = Int(now.timeIntervalSince(lastSentAt).rounded(.down))
    return max(0, interval - elapsed)
  }

  /// Slowmode interval the composer should enforce. Editing never counts, and members with
  /// BYPASS_SLOWMODE / MANAGE_MESSAGES / MANAGE_CHANNELS (`echoPersistedMessageCreate.ts`
  /// `slowmodeBypass`) are never locked out.
  static func effectiveInterval(_ interval: Int, canBypass: Bool, isEditing: Bool) -> Int {
    (canBypass || isEditing) ? 0 : max(0, interval)
  }

  /// Newest of the thread's own last message and the instant the server last said `SLOWMODE`.
  static func clockStart(lastSentAt: Date?, serverRejectedAt: Date?) -> Date? {
    [lastSentAt, serverRejectedAt].compactMap { $0 }.max()
  }

  /// `429 SLOWMODE` from REST send (web `realtimeMessageFailedUserMessage` copy).
  static func isRejection(_ error: Error) -> Bool {
    (error as? EchoHomeClientError)?.isSlowmode == true
  }

  static func rejectionMessage() -> String {
    EchoCopy.string("Slowmode is active in this channel. Wait a moment, then send again.")
  }
}

extension EchoMessageTimelineModel {
  /// Newest message the current user authored (pending sends count, failed ones do not).
  var lastOwnSentAt: Date? {
    messages.lazy.filter { $0.isCurrentUser && $0.delivery != .failed }
      .compactMap(\.timestamp).max()
  }
}

/// Countdown pill above the composer; also locks `state.canSend` while slowmode is active.
struct EchoSlowmodeBanner: View {
  let state: EchoComposerState
  let interval: Int
  let lastSentAt: Date?
  @State private var remaining = 0

  var body: some View {
    Group {
      if remaining > 0 {
        VStack(spacing: 5) {
          HStack(spacing: 8) {
            Image(systemName: "clock").font(.system(size: 13, weight: .semibold))
            EchoCopy.text("Slowmode active")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
            Spacer(minLength: 0)
            Text(verbatim: "\(remaining)s")
              .font(.system(size: 12, weight: .semibold, design: .rounded).monospacedDigit())
          }
          ProgressView(value: Double(interval - remaining), total: Double(max(interval, 1)))
            .tint(EchoTheme.Color.ink(0.6))
        }
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .padding(.horizontal, 14).padding(.vertical, 9)
        .background(EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(EchoCopy.format("Slowmode active, %d seconds remaining", remaining))
      }
    }
    .task(id: SlowmodeKey(interval: interval, lastSentAt: lastSentAt)) {
      while !Task.isCancelled {
        let next = EchoSlowmode.remainingSeconds(
          interval: interval, lastSentAt: lastSentAt, now: Date())
        remaining = next
        state.slowmodeLocked = next > 0
        if next == 0 { break }
        try? await Task.sleep(for: .milliseconds(500))
      }
    }
    .onDisappear { state.slowmodeLocked = false }
  }

  private struct SlowmodeKey: Equatable {
    let interval: Int
    let lastSentAt: Date?
  }
}
