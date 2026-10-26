import SwiftUI

#if os(iOS)
  import UIKit
#endif

/// First tap while the conversation composer keyboard is up only dismisses it
/// (DM list search / servers search parity). Survives the UIKit resign race
/// where focus clears before the control’s action runs.
private struct EchoConsumeComposerKeyboardTapKey: EnvironmentKey {
  // Closure defaults are not Sendable; EnvironmentKey requires a static default.
  nonisolated(unsafe) static let defaultValue: () -> Bool = { false }
}

extension EnvironmentValues {
  /// Returns `true` when the tap was consumed to dismiss the composer keyboard.
  var echoConsumeComposerKeyboardTap: () -> Bool {
    get { self[EchoConsumeComposerKeyboardTapKey.self] }
    set { self[EchoConsumeComposerKeyboardTapKey.self] = newValue }
  }
}

extension View {
  /// Inject keyboard-rejection + wrap `openURL` so markdown / document links
  /// also take a first tap to dismiss instead of navigating.
  func echoComposerKeyboardRejection(
    consume: @escaping () -> Bool,
    openURL: OpenURLAction
  ) -> some View {
    environment(\.echoConsumeComposerKeyboardTap, consume)
      .environment(
        \.openURL,
        OpenURLAction { url in
          if consume() { return .handled }
          openURL(url)
          return .handled
        }
      )
  }
}

enum EchoComposerKeyboardDismiss {
  static func resignFirstResponder() {
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }
}
