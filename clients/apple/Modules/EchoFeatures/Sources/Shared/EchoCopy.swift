import Foundation
import SwiftUI

/// Localized copy for EchoFeatures.
///
/// Keys live in `Resources/Localizable.xcstrings`. Prefer `EchoCopy.text` /
/// `EchoCopy.string` over raw English literals so new languages can ship without
/// hunting through views.
enum EchoCopy {
  static func string(_ key: String.LocalizationValue) -> String {
    String(localized: key, bundle: .module)
  }

  /// Runtime catalog lookup (route titles, dynamic keys already present in xcstrings).
  static func string(key: String) -> String {
    string(String.LocalizationValue(stringLiteral: key))
  }

  static func format(_ key: String.LocalizationValue, _ args: CVarArg...) -> String {
    let template = String(localized: key, bundle: .module)
    return String(format: template, locale: .current, arguments: args)
  }

  static func text(_ key: String.LocalizationValue) -> Text {
    Text(String(localized: key, bundle: .module))
  }
}
