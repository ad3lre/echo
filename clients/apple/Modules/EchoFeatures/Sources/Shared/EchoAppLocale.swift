import Foundation

/// Shared app-language preference: storage key, supported identifiers, and SwiftUI locale mapping.
public enum EchoAppLocale {
  public static let storageKey = "echo.settings.locale"

  public static let supportedIdentifiers: Set<String> = ["en-US", "en-GB", "es", "pt-BR", "de"]

  /// Locale currently preferred for Echo UI (settings / profile), not necessarily the system language.
  public static var preferredLocale: Locale {
    let stored = UserDefaults.standard.string(forKey: storageKey) ?? "en-US"
    return swiftUILocale(from: stored)
  }

  /// Maps a stored Echo locale identifier to the `Locale` injected into the SwiftUI environment
  /// and used by `EchoCopy` for String Catalog lookups.
  public static func swiftUILocale(from identifier: String) -> Locale {
    switch identifier {
    case "es":
      return Locale(identifier: "es")
    case "pt-BR":
      return Locale(identifier: "pt-BR")
    case "de":
      return Locale(identifier: "de")
    case let id where id.hasPrefix("en"):
      return Locale(identifier: id)
    default:
      return Locale(identifier: "en-US")
    }
  }

  /// Persist a supported profile locale into AppStorage-backed UserDefaults.
  public static func applyProfileLocaleIfSupported(_ value: String?) {
    guard let value, supportedIdentifiers.contains(value) else { return }
    UserDefaults.standard.set(value, forKey: storageKey)
  }
}
