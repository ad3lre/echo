import Foundation

/// Keyboard shortcut actions, mirroring web `KeybindActionId` in
/// `features/settings/keybindPreferences.ts`. Raw values are the web ids so a
/// stored map stays portable between clients.
enum EchoKeybindAction: String, CaseIterable, Identifiable {
  case voiceToggleMute = "voice.toggleMute"
  case voiceToggleDeafen = "voice.toggleDeafen"
  case quickSwitcher = "navigation.quickSwitcher"
  case openSearch = "navigation.openSearch"
  case markChannelRead = "navigation.markChannelRead"
  case railServer1 = "navigation.selectRailServer1"
  case railServer2 = "navigation.selectRailServer2"
  case railServer3 = "navigation.selectRailServer3"
  case railServer4 = "navigation.selectRailServer4"
  case railServer5 = "navigation.selectRailServer5"
  case composerBold = "composer.bold"
  case composerItalic = "composer.italic"
  case composerInlineCode = "composer.inlineCode"
  case composerStrike = "composer.strike"
  case composerSpoiler = "composer.spoiler"
  case paperToggleSourceView = "paper.toggleSourceView"

  var id: String { rawValue }

  /// Web defaults. `Ctrl` means "Command or Control" in the shared binding grammar.
  var defaultBinding: String {
    switch self {
    case .voiceToggleMute: "Ctrl+Shift+M"
    case .voiceToggleDeafen: "Ctrl+Shift+D"
    case .quickSwitcher: "Ctrl+K"
    case .openSearch: "Ctrl+F"
    case .markChannelRead: ""
    case .railServer1: "Ctrl+Shift+1"
    case .railServer2: "Ctrl+Shift+2"
    case .railServer3: "Ctrl+Shift+3"
    case .railServer4: "Ctrl+Shift+4"
    case .railServer5: "Ctrl+Shift+5"
    case .composerBold: "Ctrl+B"
    case .composerItalic: "Ctrl+I"
    case .composerInlineCode: "Ctrl+E"
    case .composerStrike: "Ctrl+Shift+S"
    case .composerSpoiler: "Ctrl+Shift+H"
    case .paperToggleSourceView: "Ctrl+Alt+M"
    }
  }

  var title: String {
    switch self {
    case .voiceToggleMute: EchoCopy.string("Mute / Unmute")
    case .voiceToggleDeafen: EchoCopy.string("Toggle Deafen")
    case .quickSwitcher: EchoCopy.string("Quick Switcher")
    case .openSearch: EchoCopy.string("Open Search")
    case .markChannelRead: EchoCopy.string("Mark Channel Read")
    case .railServer1: EchoCopy.string("Server rail: 1st slot")
    case .railServer2: EchoCopy.string("Server rail: 2nd slot")
    case .railServer3: EchoCopy.string("Server rail: 3rd slot")
    case .railServer4: EchoCopy.string("Server rail: 4th slot")
    case .railServer5: EchoCopy.string("Server rail: 5th slot")
    case .composerBold: EchoCopy.string("Bold (message composer)")
    case .composerItalic: EchoCopy.string("Italic (message composer)")
    case .composerInlineCode: EchoCopy.string("Inline code (message composer)")
    case .composerStrike: EchoCopy.string("Strikethrough (message composer)")
    case .composerSpoiler: EchoCopy.string("Spoiler (message composer)")
    case .paperToggleSourceView: EchoCopy.string("Paper: toggle raw / rendered")
    }
  }
}

/// Device-local shortcut overrides. The web client keeps these in `localStorage`
/// (`echo-keybind-preferences-v1`, no server sync), so Apple keeps them in
/// `UserDefaults` as the same partial `{ id: binding }` JSON object.
struct EchoKeybindPreferences: Equatable {
  static let storageKey = "echo.settings.keybinds.v1"

  private var overrides: [String: String]

  init(defaults: UserDefaults = .standard) {
    if let raw = defaults.string(forKey: Self.storageKey),
      let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    {
      overrides = decoded
    } else {
      overrides = [:]
    }
  }

  func binding(for action: EchoKeybindAction) -> String {
    overrides[action.rawValue] ?? action.defaultBinding
  }

  /// Another action already using `binding`, if any (web rejects duplicates).
  func conflict(for binding: String, excluding action: EchoKeybindAction) -> EchoKeybindAction? {
    let wanted = Self.normalize(binding)
    guard !wanted.isEmpty else { return nil }
    return EchoKeybindAction.allCases.first {
      $0 != action && Self.normalize(self.binding(for: $0)).caseInsensitiveCompare(wanted) == .orderedSame
    }
  }

  mutating func set(_ binding: String, for action: EchoKeybindAction, defaults: UserDefaults = .standard) {
    overrides[action.rawValue] = Self.normalize(binding)
    persist(to: defaults)
  }

  mutating func resetToDefaults(defaults: UserDefaults = .standard) {
    overrides = [:]
    defaults.removeObject(forKey: Self.storageKey)
  }

  private func persist(to defaults: UserDefaults) {
    guard let data = try? JSONEncoder().encode(overrides),
      let raw = String(data: data, encoding: .utf8)
    else { return }
    defaults.set(raw, forKey: Self.storageKey)
  }

  // MARK: - Binding grammar (shared with web `normalizeBindingString`)

  static func normalize(_ binding: String) -> String {
    binding.components(separatedBy: .whitespacesAndNewlines).joined()
      .replacingOccurrences(of: "Command", with: "Cmd", options: .caseInsensitive)
      .replacingOccurrences(of: "Control", with: "Ctrl", options: .caseInsensitive)
  }

  /// Builds a web-compatible binding (`Ctrl+Shift+M`). Command and Control both
  /// map to `Ctrl`, matching web's `ctrlKey || metaKey`.
  static func binding(key: String, command: Bool, control: Bool, shift: Bool, option: Bool)
    -> String
  {
    var parts: [String] = []
    if command || control { parts.append("Ctrl") }
    if shift { parts.append("Shift") }
    if option { parts.append("Alt") }
    parts.append(key)
    return parts.joined(separator: "+")
  }

  /// Key token for a macOS key-down: layout-independent for the digit row and
  /// backquote (so Shift+1 stays `1`), named for navigation keys, else the character.
  static func keyToken(characters: String?, keyCode: UInt16) -> String? {
    let named: [UInt16: String] = [
      36: "Enter", 48: "Tab", 49: "Space", 51: "Backspace", 117: "Delete", 115: "Home",
      119: "End", 116: "PageUp", 121: "PageDown", 123: "ArrowLeft", 124: "ArrowRight",
      125: "ArrowDown", 126: "ArrowUp", 50: "`",
      18: "1", 19: "2", 20: "3", 21: "4", 23: "5", 22: "6", 26: "7", 28: "8", 25: "9", 29: "0",
    ]
    if let token = named[keyCode] { return token }
    guard let characters, characters.count == 1,
      characters.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) })
    else { return nil }
    return characters.uppercased()
  }

  /// Mac-style glyphs for display, e.g. `Ctrl+Shift+M` → `⇧⌘M`.
  static func display(_ binding: String) -> String {
    let normalized = normalize(binding)
    // A bound "+" key serialises as a trailing "++" (e.g. `Ctrl++`).
    let plusKey = normalized.hasSuffix("++") || normalized == "+"
    let parts = (plusKey ? String(normalized.dropLast()) : normalized)
      .split(separator: "+").map(String.init) + (plusKey ? ["+"] : [])
    guard !parts.isEmpty else { return "" }
    let lower = Set(parts.dropLast().map { $0.lowercased() })
    var glyphs = ""
    if lower.contains("alt") || lower.contains("option") { glyphs += "⌥" }
    if lower.contains("shift") { glyphs += "⇧" }
    if lower.contains("ctrl") || lower.contains("cmd") || lower.contains("meta") { glyphs += "⌘" }
    return glyphs + parts[parts.count - 1]
  }
}
