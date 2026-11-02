import SwiftUI

#if os(macOS)
  import AppKit
#endif

/// Settings → Keybinds (web `SettingsSupplementarySections.vue`, `Keybinds` section).
/// macOS only: iPhone has no hardware-shortcut surface, so the route is not in the
/// iOS catalog and this view renders nothing there.
struct EchoKeybindsSettingsView: View {
  #if os(macOS)
    @State private var preferences = EchoKeybindPreferences()
    @State private var recording: EchoKeybindAction?
    @State private var errorText: String?
    @State private var recorder = EchoKeyRecorder()

    var body: some View {
      EchoDetailSection(title: EchoCopy.string("Keyboard Shortcuts")) {
        ForEach(Array(EchoKeybindAction.allCases.enumerated()), id: \.element.id) { index, action in
          if index > 0 {
            Rectangle().fill(EchoTheme.Color.ink(0.08)).frame(height: 1)
          }
          row(action)
        }
        if let errorText {
          Text(errorText).font(.footnote).foregroundStyle(.red)
        }
        EchoCopy.text("Click a shortcut and press a new key combo to change it.")
          .font(.footnote).foregroundStyle(.secondary)
        EchoCopy.text("Shortcuts are saved on this Mac only and are not synced to your account.")
          .font(.footnote).foregroundStyle(.secondary)
        Button {
          stopRecording()
          preferences.resetToDefaults()
          errorText = nil
        } label: {
          EchoCopy.text("Reset defaults")
            .font(.system(size: 13, weight: .semibold))
        }
        .buttonStyle(.bordered)
      }
      .onDisappear { stopRecording() }
    }

    private func row(_ action: EchoKeybindAction) -> some View {
      let isRecording = recording == action
      let binding = preferences.binding(for: action)
      return HStack(spacing: 16) {
        Text(action.title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        Spacer(minLength: 16)
        Button {
          isRecording ? stopRecording() : startRecording(action)
        } label: {
          Text(
            isRecording
              ? EchoCopy.string("Press new shortcut…")
              : binding.isEmpty ? "—" : EchoKeybindPreferences.display(binding)
          )
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .frame(minWidth: 140)
          .padding(.vertical, 6)
          .background(
            EchoTheme.Color.ink(0.07), in: RoundedRectangle(cornerRadius: 8, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .stroke(isRecording ? EchoTheme.Color.signInBlue : .clear, lineWidth: 2)
          }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.title)
        .accessibilityValue(binding.isEmpty ? EchoCopy.string("Unassigned") : binding)
      }
      .padding(.vertical, 10)
    }

    private func startRecording(_ action: EchoKeybindAction) {
      errorText = nil
      recording = action
      recorder.start { event in
        handle(event, for: action)
      }
    }

    private func stopRecording() {
      recorder.stop()
      recording = nil
    }

    private func handle(_ event: NSEvent, for action: EchoKeybindAction) {
      if event.keyCode == 53 {  // Escape cancels, matching web.
        stopRecording()
        return
      }
      let flags = event.modifierFlags
      guard
        let key = EchoKeybindPreferences.keyToken(
          characters: event.charactersIgnoringModifiers, keyCode: event.keyCode)
      else {
        errorText = EchoCopy.string("Use at least one non-modifier key.")
        return
      }
      let next = EchoKeybindPreferences.binding(
        key: key, command: flags.contains(.command), control: flags.contains(.control),
        shift: flags.contains(.shift), option: flags.contains(.option))
      if preferences.conflict(for: next, excluding: action) != nil {
        errorText = EchoCopy.string("That shortcut is already assigned to another action.")
        return
      }
      preferences.set(next, for: action)
      errorText = nil
      stopRecording()
    }
  #else
    var body: some View { EmptyView() }
  #endif
}

#if os(macOS)
  /// Swallows key-downs while a row is recording so ⌘-combos don't trigger menus.
  @MainActor
  final class EchoKeyRecorder {
    /// True while any row is capturing a chord; the app shortcut monitor stands down.
    static private(set) var isRecording = false
    private var monitor: Any?

    func start(_ onKeyDown: @escaping (NSEvent) -> Void) {
      stop()
      Self.isRecording = true
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
        onKeyDown(event)
        return nil
      }
    }

    func stop() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      Self.isRecording = false
    }
  }
#endif
