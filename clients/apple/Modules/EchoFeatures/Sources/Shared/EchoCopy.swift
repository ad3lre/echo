import Foundation
import SwiftUI

/// Localized copy for EchoFeatures.
///
/// Keys live in `Resources/Localizable.xcstrings`. Prefer `EchoCopy.text` /
/// `EchoCopy.string` over raw English literals so new languages can ship without
/// hunting through views.
///
/// Lookups use `EchoAppLocale.preferredLocale` so the in-app language picker
/// (not only the system language) drives String Catalog resolution.
enum EchoCopy {
  static func string(_ key: String.LocalizationValue) -> String {
    String(localized: key, bundle: .module, locale: EchoAppLocale.preferredLocale)
  }

  /// Runtime catalog lookup (route titles, dynamic keys already present in xcstrings).
  static func string(key: String) -> String {
    string(String.LocalizationValue(stringLiteral: key))
  }

  static func format(_ key: String.LocalizationValue, _ args: CVarArg...) -> String {
    let template = String(localized: key, bundle: .module, locale: EchoAppLocale.preferredLocale)
    return String(format: template, locale: EchoAppLocale.preferredLocale, arguments: args)
  }

  static func text(_ key: String.LocalizationValue) -> Text {
    Text(string(key))
  }
}
