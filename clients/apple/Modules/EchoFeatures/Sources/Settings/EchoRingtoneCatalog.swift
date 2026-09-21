import Foundation

/// Built-in DM / group call ringtone packs — mirrors web `callRingtoneAssets.ts`.
enum EchoRingtonePack: String, CaseIterable, Identifiable, Sendable {
  case bops = "Bops"
  case dialtone = "Dialtone"
  case retro = "Retro"
  case vibes = "Vibes"

  var id: String { rawValue }
}

struct EchoRingtoneEntry: Identifiable, Hashable, Sendable {
  let id: String
  let label: String
  let pack: EchoRingtonePack
  /// Filename stem inside `Sounds/Ringtones/<pack>/` (no extension).
  let resourceName: String
  /// Preferred bundle extension (`m4a` for converted Vorbis, `mp3` when source was mp3).
  let resourceExtension: String

  var subdirectory: String { "Sounds/Ringtones/\(pack.rawValue)" }
}

enum EchoRingtoneCatalog {
  /// Matches web `CALL_RINGTONE_DEFAULT_BUILTIN_ID`.
  static let defaultBuiltinID = "vibes:glass-wait"

  /// Maps pre-pack `builtin:*` camelCase ids to pack ids (web `LEGACY_BUILTIN_RINGTONE_IDS`).
  static let legacyBuiltinIDs: [String: String] = [
    "glassWait": "vibes:glass-wait",
    "glitchDance": "dialtone:glitch-dance",
    "grooveyGlass": "vibes:groovey-glass",
    "modestRing": "vibes:modest-ring",
    "pixelDance": "retro:pixel-dance",
    "pixelParty": "retro:pixel-party",
    "wobblyGlass": "vibes:wobbly-glass",
  ]

  static let entries: [EchoRingtoneEntry] = [
    .init(id: "bops:beach-bowling", label: "Beach Bowling", pack: .bops,
          resourceName: "Beach Bowling", resourceExtension: "mp3"),
    .init(id: "bops:kiki", label: "Kiki", pack: .bops,
          resourceName: "Kiki", resourceExtension: "mp3"),
    .init(id: "bops:steal-yo-girl", label: "Steal yo girl", pack: .bops,
          resourceName: "Steal yo girl", resourceExtension: "mp3"),

    .init(id: "dialtone:digi-date", label: "Digi-date", pack: .dialtone,
          resourceName: "Digi-date", resourceExtension: "m4a"),
    .init(id: "dialtone:echo-machine", label: "Echo Machine", pack: .dialtone,
          resourceName: "Echo Machine", resourceExtension: "m4a"),
    .init(id: "dialtone:ed-sharron", label: "Ed Sharron", pack: .dialtone,
          resourceName: "Ed Sharron", resourceExtension: "m4a"),
    .init(id: "dialtone:fmty-sonic", label: "FMTY Sonic", pack: .dialtone,
          resourceName: "FMTY Sonic", resourceExtension: "m4a"),
    .init(id: "dialtone:fnc-dance", label: "FNC Dance", pack: .dialtone,
          resourceName: "FNC Dance", resourceExtension: "m4a"),
    .init(id: "dialtone:glitch-dance", label: "Glitch Dance", pack: .dialtone,
          resourceName: "Glitch Dance", resourceExtension: "m4a"),
    .init(id: "dialtone:glitchy-banger", label: "Glitchy Banger", pack: .dialtone,
          resourceName: "Glitchy Banger", resourceExtension: "m4a"),
    .init(id: "dialtone:htrag", label: "HTRAG", pack: .dialtone,
          resourceName: "HTRAG", resourceExtension: "m4a"),
    .init(id: "dialtone:indian-mafia", label: "Indian Mafia", pack: .dialtone,
          resourceName: "Indian Mafia", resourceExtension: "mp3"),
    .init(id: "dialtone:ping-me-again", label: "Ping Me Again", pack: .dialtone,
          resourceName: "Ping Me Again", resourceExtension: "mp3"),

    .init(id: "retro:8-bit-battle", label: "8-Bit Battle", pack: .retro,
          resourceName: "8-Bit Battle", resourceExtension: "m4a"),
    .init(id: "retro:80s-commerical", label: "80s Commerical", pack: .retro,
          resourceName: "80s Commerical", resourceExtension: "m4a"),
    .init(id: "retro:pixel-dance", label: "Pixel Dance", pack: .retro,
          resourceName: "Pixel Dance", resourceExtension: "mp3"),
    .init(id: "retro:pixel-party", label: "Pixel Party", pack: .retro,
          resourceName: "Pixel Party", resourceExtension: "mp3"),
    .init(id: "retro:quick-bit", label: "Quick Bit", pack: .retro,
          resourceName: "Quick Bit", resourceExtension: "mp3"),
    .init(id: "retro:rsl", label: "RSL", pack: .retro,
          resourceName: "RSL", resourceExtension: "mp3"),

    .init(id: "vibes:downward-spiraling", label: "Downward Spiraling", pack: .vibes,
          resourceName: "Downward Spiraling", resourceExtension: "m4a"),
    .init(id: "vibes:galactic-drake", label: "Galactic Drake", pack: .vibes,
          resourceName: "Galactic Drake", resourceExtension: "m4a"),
    .init(id: "vibes:galaxy-dance", label: "Galaxy Dance", pack: .vibes,
          resourceName: "Galaxy Dance", resourceExtension: "m4a"),
    .init(id: "vibes:glass-wait", label: "Glass Wait", pack: .vibes,
          resourceName: "Glass Wait", resourceExtension: "m4a"),
    .init(id: "vibes:groovey-glass", label: "Groovey Glass", pack: .vibes,
          resourceName: "Groovey Glass", resourceExtension: "m4a"),
    .init(id: "vibes:modest-ring", label: "Modest Ring", pack: .vibes,
          resourceName: "Modest Ring", resourceExtension: "m4a"),
    .init(id: "vibes:neutron", label: "Neutron", pack: .vibes,
          resourceName: "Neutron", resourceExtension: "m4a"),
    .init(id: "vibes:one-eight-nine", label: "One Eight Nine", pack: .vibes,
          resourceName: "One Eight Nine", resourceExtension: "m4a"),
    .init(id: "vibes:royal-mess", label: "Royal Mess", pack: .vibes,
          resourceName: "Royal Mess", resourceExtension: "mp3"),
    .init(id: "vibes:state-farm", label: "State Farm", pack: .vibes,
          resourceName: "State Farm", resourceExtension: "mp3"),
    .init(id: "vibes:wobbly-glass", label: "Wobbly Glass", pack: .vibes,
          resourceName: "Wobbly Glass", resourceExtension: "mp3"),
  ]

  static func entry(id: String) -> EchoRingtoneEntry? {
    let bare: String
    if id.hasPrefix("builtin:") {
      bare = String(id.dropFirst("builtin:".count))
    } else {
      bare = id
    }
    return entries.first { $0.id == bare }
  }

  static func entries(in pack: EchoRingtonePack) -> [EchoRingtoneEntry] {
    entries.filter { $0.pack == pack }
  }

  /// Persisted selection uses `builtin:<pack-id>` like web.
  static func storageID(forBuiltin entryID: String) -> String {
    "builtin:\(entryID)"
  }

  static func defaultStorageID() -> String {
    storageID(forBuiltin: defaultBuiltinID)
  }

  static func normalizeSelectedID(_ raw: String?) -> String {
    guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return defaultStorageID()
    }
    var t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.hasPrefix("builtin:") {
      let inner = String(t.dropFirst("builtin:".count))
      if let mapped = legacyBuiltinIDs[inner] {
        t = storageID(forBuiltin: mapped)
      }
    } else if let mapped = legacyBuiltinIDs[t] {
      t = storageID(forBuiltin: mapped)
    } else if entries.contains(where: { $0.id == t }) {
      t = storageID(forBuiltin: t)
    }
    let bare = t.hasPrefix("builtin:") ? String(t.dropFirst("builtin:".count)) : t
    if entries.contains(where: { $0.id == bare }) {
      return t.hasPrefix("builtin:") ? t : storageID(forBuiltin: bare)
    }
    return defaultStorageID()
  }
}
