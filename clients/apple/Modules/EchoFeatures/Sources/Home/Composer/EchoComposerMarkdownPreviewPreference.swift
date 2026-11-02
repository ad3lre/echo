import EchoDomain
import Foundation
import SwiftUI

/// Web `markdownPreviewModePreference` — off / split / full (`inline` coerces to split).
enum EchoComposerMarkdownPreviewMode: String, Equatable, Sendable {
  case off
  case split
  case full
}

enum EchoComposerMarkdownPreviewPreference {
  static let storageKey = "echo.chat.markdownPreviewMode"

  static func read() -> EchoComposerMarkdownPreviewMode {
    let raw = UserDefaults.standard.string(forKey: storageKey) ?? ""
    switch raw {
    case "split", "inline":
      return .split
    case "full":
      return .full
    default:
      return .off
    }
  }

  static func write(_ mode: EchoComposerMarkdownPreviewMode) {
    UserDefaults.standard.set(mode.rawValue, forKey: storageKey)
  }

  /// Cycle off → split → full → off (collapse is this control — no separate button).
  static func toggle() -> EchoComposerMarkdownPreviewMode {
    let next: EchoComposerMarkdownPreviewMode =
      switch read() {
      case .off: .split
      case .split: .full
      case .full: .off
      }
    write(next)
    return next
  }
}

/// Bubbles composer preview mode + draft into the conversation timeline (web `markdownPreviewState`).
struct EchoComposerMarkdownPreviewShare: Equatable {
  var mode: EchoComposerMarkdownPreviewMode
  var text: String
  var mentions: [EchoMessageMention]
}

struct EchoComposerMarkdownPreviewShareKey: PreferenceKey {
  static let defaultValue: EchoComposerMarkdownPreviewShare? = nil

  static func reduce(
    value: inout EchoComposerMarkdownPreviewShare?,
    nextValue: () -> EchoComposerMarkdownPreviewShare?
  ) {
    if let next = nextValue() { value = next }
  }
}
