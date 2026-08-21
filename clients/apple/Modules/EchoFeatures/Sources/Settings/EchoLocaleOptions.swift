import Foundation

enum EchoLocaleOptions {
  static let languages: [(String, String)] = [
    ("en-US", "English (US)"),
    ("en-GB", "English (UK)"),
    ("es", "Español"),
  ]

  static let timeZones: [(String, String)] = {
    let identifiers = TimeZone.knownTimeZoneIdentifiers.sorted {
      $0.localizedStandardCompare($1) == .orderedAscending
    }
    return [("system", "System default")] + identifiers.map { ($0, $0) }
  }()
}
