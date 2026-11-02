import Foundation
import Observation

/// Viewer-local notes about other users (web `profileNotesPersistence` / `echo_profile_notes_v1`).
@MainActor
@Observable
final class EchoProfileNotesStore {
  static let shared = EchoProfileNotesStore()
  static let storageKey = "echo_profile_notes_v1"
  /// Web expanded profile maxlength; compact popout uses 256 but storage caps at 512.
  static let maxLength = 512

  private let defaults: UserDefaults
  private let storageKey: String
  private(set) var notesByUserID: [String: String]

  convenience init() {
    self.init(defaults: .standard, storageKey: Self.storageKey)
  }

  init(defaults: UserDefaults, storageKey: String = storageKey) {
    self.defaults = defaults
    self.storageKey = storageKey
    notesByUserID = Self.load(from: defaults, storageKey: storageKey)
  }

  func note(for userID: String) -> String {
    let id = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return "" }
    return notesByUserID[id] ?? ""
  }

  func setNote(_ raw: String, for userID: String) {
    let id = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    let trimmed = String(
      raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxLength))
    if trimmed.isEmpty {
      notesByUserID.removeValue(forKey: id)
    } else {
      notesByUserID[id] = trimmed
    }
    persist()
  }

  /// Normalize draft text for the editor (length only; empty drafts stay empty until commit).
  static func clampDraft(_ raw: String) -> String {
    String(raw.prefix(maxLength))
  }

  private func persist() {
    defaults.set(notesByUserID, forKey: storageKey)
  }

  static func load(from defaults: UserDefaults, storageKey: String = storageKey) -> [String: String]
  {
    guard let raw = defaults.dictionary(forKey: storageKey) else { return [:] }
    var out: [String: String] = [:]
    for (key, value) in raw {
      let id = key.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, let text = value as? String else { continue }
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { continue }
      out[id] = String(trimmed.prefix(maxLength))
    }
    return out
  }
}
