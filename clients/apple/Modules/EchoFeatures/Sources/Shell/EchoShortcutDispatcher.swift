import SwiftUI

#if os(macOS)
  import AppKit
#endif

/// What a key chord can trigger: a user-configurable keybind, or a fixed system chord.
enum EchoShortcutTarget: Hashable {
  case action(EchoKeybindAction)
  /// Esc — closes the topmost overlay (settings, profile popout, search, pins).
  case escape
  /// ⌘, — fixed system chord (no web keybind id exists for it).
  case toggleSettings
}

extension EchoKeybindPreferences {
  /// Action whose stored binding equals `binding` (case-insensitive); unbound slots never match.
  func action(matching binding: String) -> EchoKeybindAction? {
    let wanted = Self.normalize(binding)
    guard !wanted.isEmpty else { return nil }
    return EchoKeybindAction.allCases.first {
      Self.normalize(self.binding(for: $0)).caseInsensitiveCompare(wanted) == .orderedSame
    }
  }
}

/// Routes shortcuts to whichever mounted surface owns them. Views register
/// handlers (`echoShortcuts`); the macOS key monitor asks the registry. The newest
/// handler wins, a handler returns `false` to let the next one (or the system) run,
/// and tab-scoped handlers only fire while their tab is frontmost (keep-alive tabs
/// stay mounted while hidden).
@MainActor
final class EchoShortcutDispatcher {
  static let shared = EchoShortcutDispatcher()

  private struct Entry {
    let token: UUID
    let target: EchoShortcutTarget
    let scope: EchoMainTab?
    let priority: Int
    let handler: () -> Bool
  }

  private var entries: [Entry] = []
  var activeTab: EchoMainTab = .home

  func register(
    _ target: EchoShortcutTarget, scope: EchoMainTab?, priority: Int,
    handler: @escaping () -> Bool
  ) -> UUID {
    #if os(macOS)
      EchoShortcutMonitor.shared.startIfNeeded()
    #endif
    let token = UUID()
    entries.append(
      Entry(token: token, target: target, scope: scope, priority: priority, handler: handler))
    return token
  }

  func unregister(_ token: UUID) {
    entries.removeAll { $0.token == token }
  }

  /// Runs the highest-priority, newest matching handler that accepts the shortcut.
  @discardableResult
  func dispatch(_ target: EchoShortcutTarget) -> Bool {
    let candidates = entries.enumerated()
      .filter { $0.element.target == target }
      .filter { $0.element.scope == nil || $0.element.scope == activeTab }
      .sorted { ($0.element.priority, $0.offset) > ($1.element.priority, $1.offset) }
    for candidate in candidates where candidate.element.handler() { return true }
    return false
  }
}

private struct EchoShortcutRegistration: ViewModifier {
  let id: AnyHashable
  let scope: EchoMainTab?
  let priority: Int
  let handlers: [EchoShortcutTarget: () -> Bool]

  func body(content: Content) -> some View {
    content.task(id: id) {
      let dispatcher = EchoShortcutDispatcher.shared
      let tokens = handlers.map {
        dispatcher.register($0.key, scope: scope, priority: priority, handler: $0.value)
      }
      defer { tokens.forEach(dispatcher.unregister) }
      await EchoRealtimeWait.untilCancelled()
    }
  }
}

extension View {
  /// Registers shortcut handlers while this view is mounted. Re-registers when `id` changes.
  func echoShortcuts(
    id: some Hashable, scope: EchoMainTab? = nil, priority: Int = 0,
    _ handlers: [EchoShortcutTarget: () -> Bool]
  ) -> some View {
    modifier(
      EchoShortcutRegistration(
        id: AnyHashable(id), scope: scope, priority: priority, handlers: handlers))
  }
}

#if os(macOS)
  /// One app-wide key-down monitor: resolves a chord to a target and dispatches it.
  @MainActor
  final class EchoShortcutMonitor {
    static let shared = EchoShortcutMonitor()
    private var monitor: Any?

    func startIfNeeded() {
      guard monitor == nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        (self?.handle(event) ?? false) ? nil : event
      }
    }

    private func handle(_ event: NSEvent) -> Bool {
      // The Keybinds page swallows chords itself while recording a new binding.
      guard !EchoKeyRecorder.isRecording else { return false }
      let dispatcher = EchoShortcutDispatcher.shared
      let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
      if event.keyCode == 53, flags.isEmpty { return dispatcher.dispatch(.escape) }
      if event.keyCode == 43, flags == .command { return dispatcher.dispatch(.toggleSettings) }

      // Bare keys are typing while a text field has focus — only chords are shortcuts.
      let isChord = !flags.isDisjoint(with: [.command, .control, .option])
      if !isChord, NSApp.keyWindow?.firstResponder is NSText { return false }
      guard
        let key = EchoKeybindPreferences.keyToken(
          characters: event.charactersIgnoringModifiers, keyCode: event.keyCode)
      else { return false }
      let binding = EchoKeybindPreferences.binding(
        key: key, command: flags.contains(.command), control: flags.contains(.control),
        shift: flags.contains(.shift), option: flags.contains(.option))
      guard let action = EchoKeybindPreferences().action(matching: binding) else { return false }
      if EchoComposerShortcuts.marker(for: action) != nil {
        return EchoComposerShortcuts.apply(action)
      }
      return dispatcher.dispatch(.action(action))
    }
  }
#endif
