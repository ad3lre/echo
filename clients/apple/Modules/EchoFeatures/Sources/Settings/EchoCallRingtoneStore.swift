import EchoNetworking
import Foundation
import Observation

/// Local UI prefs + synced custom ringtones — mirrors web `echo-call-ringtone-ui-v1` / `callRingtone.ts`.
@MainActor
@Observable
final class EchoCallRingtoneStore {
  static let shared = EchoCallRingtoneStore()

  private static let storageKey = "echo-call-ringtone-ui-v1"

  var selectedStorageID: String {
    didSet { persist() }
  }

  /// 0…100, matches web `volumePercent`.
  var volumePercent: Double {
    didSet { persist() }
  }

  var muted: Bool {
    didSet {
      persist()
      if muted { stopIncomingLoop() }
    }
  }

  private(set) var customRingtones: [EchoUserRingtone] = []
  private(set) var maxCustom = 0
  private(set) var isLoadingCustoms = false
  var customsError: String?

  var selectedBuiltinEntry: EchoRingtoneEntry? {
    EchoRingtoneCatalog.entry(id: selectedStorageID)
  }

  var selectedCustom: EchoUserRingtone? {
    customRingtones.first { $0.id == selectedStorageID }
  }

  var selectedLabel: String {
    if let custom = selectedCustom { return custom.label }
    if let builtin = selectedBuiltinEntry { return builtin.label }
    return EchoRingtoneCatalog.entry(id: EchoRingtoneCatalog.defaultBuiltinID)?.label
      ?? EchoCopy.string("Default ringtone")
  }

  /// Built-in fallback used when a custom id is unknown / offline.
  var selectedEntry: EchoRingtoneEntry {
    if let entry = selectedBuiltinEntry { return entry }
    return EchoRingtoneCatalog.entries.first {
      $0.id == EchoRingtoneCatalog.defaultBuiltinID
    } ?? EchoRingtoneCatalog.entries[0]
  }

  var playbackVolume01: Float {
    guard !muted else { return 0 }
    let ringtone = max(0, min(100, volumePercent)) / 100
    let output =
      (UserDefaults.standard.object(forKey: "echo.settings.voice.outputVolume") as? Double) ?? 100
    let output01 = Float(max(0, min(100, output)) / 100)
    return Float(ringtone) * output01
  }

  var canUploadCustom: Bool {
    maxCustom > 0 && customRingtones.count < maxCustom
  }

  private init() {
    let loaded = Self.load()
    selectedStorageID = EchoRingtoneCatalog.normalizeSelectedID(loaded.selectedId)
    volumePercent = loaded.volumePercent ?? 100
    muted = loaded.muted ?? false
  }

  func refreshCustoms(baseURL: URL, auth: EchoAuthenticationModel) async {
    isLoadingCustoms = true
    customsError = nil
    defer { isLoadingCustoms = false }
    do {
      let page = try await auth.withAccessTokenRetry { token in
        try await EchoWorkspaceClient(baseURL: baseURL).loadUserRingtones(accessToken: token)
      }
      customRingtones = page.ringtones
      maxCustom = page.maxCustom
      // If selection points at a deleted custom, fall back to default builtin.
      if !EchoRingtoneCatalog.isBuiltinStorageID(selectedStorageID),
        selectedCustom == nil
      {
        selectedStorageID = EchoRingtoneCatalog.defaultStorageID()
      }
    } catch {
      customsError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func selectBuiltin(_ entry: EchoRingtoneEntry) {
    let wasLooping = EchoSoundPlayer.shared.isPlayingAnyRingtoneLoop
    selectedStorageID = EchoRingtoneCatalog.storageID(forBuiltin: entry.id)
    if wasLooping, !muted {
      EchoSoundPlayer.shared.stopRingtone()
      startIncomingLoop()
    }
  }

  func selectCustom(_ ringtone: EchoUserRingtone) {
    let wasLooping = EchoSoundPlayer.shared.isPlayingAnyRingtoneLoop
    selectedStorageID = ringtone.id
    if wasLooping, !muted {
      EchoSoundPlayer.shared.stopRingtone()
      startIncomingLoop()
    }
  }

  func selectAndHearBuiltin(_ entry: EchoRingtoneEntry) {
    let wasLooping = EchoSoundPlayer.shared.isPlayingAnyRingtoneLoop
    selectBuiltin(entry)
    guard !muted else { return }
    if wasLooping || EchoSoundPlayer.shared.isPlayingAnyRingtoneLoop {
      startIncomingLoop()
      return
    }
    previewSelected()
  }

  func selectAndHearCustom(_ ringtone: EchoUserRingtone) {
    let wasLooping = EchoSoundPlayer.shared.isPlayingAnyRingtoneLoop
    selectCustom(ringtone)
    guard !muted else { return }
    if wasLooping || EchoSoundPlayer.shared.isPlayingAnyRingtoneLoop {
      startIncomingLoop()
      return
    }
    previewSelected()
  }

  /// Compatibility for call sites that still pass a builtin entry.
  func select(_ entry: EchoRingtoneEntry) { selectBuiltin(entry) }
  func selectAndHear(_ entry: EchoRingtoneEntry) { selectAndHearBuiltin(entry) }

  func previewSelected() {
    let volume = Double(playbackVolume01)
    if let custom = selectedCustom, let url = URL(string: custom.url) {
      EchoSoundPlayer.shared.previewRemoteRingtone(
        id: custom.id, url: url, volume: volume)
      return
    }
    EchoSoundPlayer.shared.previewRingtone(selectedEntry, volume: volume)
  }

  func startIncomingLoop() {
    guard !muted else {
      stopIncomingLoop()
      return
    }
    guard EchoSoundPlayback.cachedPreferences().soundEffects else {
      stopIncomingLoop()
      return
    }
    let volume = Double(playbackVolume01)
    if let custom = selectedCustom, let url = URL(string: custom.url) {
      EchoSoundPlayer.shared.startRemoteRingtoneLoop(
        id: custom.id, url: url, volume: volume)
      return
    }
    EchoSoundPlayer.shared.startRingtoneLoop(selectedEntry, volume: volume)
  }

  func stopIncomingLoop() {
    EchoSoundPlayer.shared.stopRingtone()
  }

  func deleteCustom(
    _ ringtone: EchoUserRingtone, baseURL: URL, auth: EchoAuthenticationModel
  ) async {
    do {
      try await auth.withAccessTokenRetry { token in
        try await EchoWorkspaceClient(baseURL: baseURL).deleteUserRingtone(
          ringtoneID: ringtone.id, accessToken: token)
      }
      customRingtones.removeAll { $0.id == ringtone.id }
      if selectedStorageID == ringtone.id {
        selectedStorageID = EchoRingtoneCatalog.defaultStorageID()
      }
    } catch {
      customsError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func uploadCustom(
    data: Data,
    filename: String,
    mimeType: String,
    baseURL: URL,
    auth: EchoAuthenticationModel
  ) async {
    guard canUploadCustom else { return }
    do {
      let client = EchoWorkspaceClient(baseURL: baseURL)
      let uploaded = try await auth.withAccessTokenRetry { token in
        try await client.uploadUserRingtone(
          data: data, filename: filename, mimeType: mimeType, accessToken: token)
      }
      let label = URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent
      let registered = try await auth.withAccessTokenRetry { token in
        try await client.registerUserRingtone(
          label: label.isEmpty ? "Ringtone" : label,
          storageKey: uploaded.storageKey,
          publicURL: uploaded.publicURL,
          mimeType: mimeType,
          sizeBytes: data.count,
          accessToken: token)
      }
      customRingtones.insert(registered, at: 0)
      selectAndHearCustom(registered)
    } catch {
      customsError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  private func persist() {
    let payload: [String: Any] = [
      "selectedId": selectedStorageID,
      "volumePercent": volumePercent,
      "muted": muted,
    ]
    UserDefaults.standard.set(payload, forKey: Self.storageKey)
  }

  private struct Loaded {
    var selectedId: String?
    var volumePercent: Double?
    var muted: Bool?
  }

  private static func load() -> Loaded {
    guard let raw = UserDefaults.standard.dictionary(forKey: storageKey) else {
      return Loaded()
    }
    return Loaded(
      selectedId: raw["selectedId"] as? String,
      volumePercent: (raw["volumePercent"] as? NSNumber)?.doubleValue
        ?? (raw["volumePercent"] as? Double),
      muted: raw["muted"] as? Bool
    )
  }
}
