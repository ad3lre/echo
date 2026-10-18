import SwiftUI

#if os(macOS)
  /// iOS-only autocapitalization style — no-op polyfill so shared forms compile on macOS.
  enum TextInputAutocapitalization {
    case never
    case words
    case sentences
    case characters
  }

  extension View {
    func textInputAutocapitalization(_ style: TextInputAutocapitalization) -> some View {
      self
    }
  }
#endif
