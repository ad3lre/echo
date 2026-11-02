import EchoDomain
import SwiftUI

/// Why the composer cannot send (web `ChatInput` permission-lock overlay).
enum EchoComposerSendLock: Equatable, Sendable {
  /// Channel `sendMessages` is off for the viewer — read-only channel.
  case readOnly
  /// Communication timeout; `until` drives the "Ends in" countdown.
  case timeout(until: Date?)

  /// Timeout wins over read-only (web `blockKind === 'timeout'`). A missing capability row means
  /// "not loaded yet" and stays unlocked (`live?.canSendMessages ?? true`).
  static func resolve(
    capabilities: EchoChannelCapabilities?, memberTimeoutUntil: Date?, now: Date = Date()
  ) -> EchoComposerSendLock? {
    if let capabilities, capabilities.communicationTimeoutActive {
      let until = capabilities.communicationTimeoutUntilEpochMs.map {
        Date(timeIntervalSince1970: $0 / 1000)
      }
      if until == nil || until! > now { return .timeout(until: until) }
    }
    if let memberTimeoutUntil, memberTimeoutUntil > now { return .timeout(until: memberTimeoutUntil) }
    if let capabilities, !capabilities.canSendMessages { return .readOnly }
    return nil
  }

  /// Web `formatTimeoutCountdown`.
  static func countdownLabel(seconds total: Int) -> String {
    let total = max(0, total)
    let days = total / 86_400
    let hours = (total % 86_400) / 3_600
    let minutes = (total % 3_600) / 60
    let seconds = total % 60
    if days > 0 { return "\(days)d \(hours)h" }
    if hours > 0 { return "\(hours)h \(minutes)m" }
    if minutes > 0 { return "\(minutes)m \(seconds)s" }
    return "\(seconds)s"
  }
}

/// Replaces the composer while sending is blocked.
struct EchoComposerLockBanner: View {
  let lock: EchoComposerSendLock
  /// Fires when a timeout lapses so the parent can re-read capabilities.
  var onExpired: () -> Void = {}
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      Image(systemName: "lock.fill")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(displayPrefs.ink(0.58))
      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(displayPrefs.uiFont(size: 14, weight: .semibold))
          .foregroundStyle(displayPrefs.ink(0.9))
        switch lock {
        case .readOnly:
          detail(EchoCopy.string("You cannot send messages in this channel."))
        case .timeout(let until):
          timeoutDetail(until)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .echoLiquidGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous), shadow: true)
    .padding(.horizontal, 12)
    .padding(.top, 2)
    #if os(macOS)
      .padding(.bottom, 20)
    #else
      .padding(.bottom, 2)
    #endif
    .accessibilityElement(children: .combine)
    .task(id: lock) {
      guard case .timeout(let until?) = lock else { return }
      let remaining = until.timeIntervalSinceNow
      if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
      guard !Task.isCancelled else { return }
      onExpired()
    }
  }

  private var title: String {
    if case .timeout = lock { return EchoCopy.string("Communication timeout active") }
    return EchoCopy.string("Message input locked")
  }

  private func detail(_ text: String) -> some View {
    Text(text)
      .font(displayPrefs.uiFont(size: 12, weight: .regular))
      .foregroundStyle(displayPrefs.ink(0.55))
      .fixedSize(horizontal: false, vertical: true)
  }

  @ViewBuilder
  private func timeoutDetail(_ until: Date?) -> some View {
    if let until {
      TimelineView(.periodic(from: .now, by: 1)) { context in
        let label = EchoComposerSendLock.countdownLabel(
          seconds: Int(ceil(until.timeIntervalSince(context.date))))
        VStack(alignment: .leading, spacing: 6) {
          detail(
            EchoCopy.format(
              "You are in a communication timeout in this server. You can chat again in %@.", label))
          HStack(spacing: 6) {
            Text(EchoCopy.string("Ends in"))
              .foregroundStyle(displayPrefs.ink(0.5))
            Text(label)
              .fontWeight(.semibold)
              .monospacedDigit()
              .foregroundStyle(displayPrefs.ink(0.85))
          }
          .font(displayPrefs.uiFont(size: 11, weight: .medium))
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(displayPrefs.ink(0.07), in: Capsule())
        }
      }
    } else {
      detail(EchoCopy.string("You are in a communication timeout in this server."))
    }
  }
}
