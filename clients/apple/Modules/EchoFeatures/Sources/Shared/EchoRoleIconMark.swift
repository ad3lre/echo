import EchoDomain
import SwiftUI

/// Role accent mark: custom icon when present, otherwise the color dot (web `memberRoleIconImgSrc`).
struct EchoRoleIconMark: View {
  var iconURL: String?
  var colorHex: String
  var size: CGFloat = 10
  var baseURL: URL
  var accessToken: String?

  private var accent: Color {
    Color(hex: colorHex) ?? EchoTheme.Color.ink(0.35)
  }

  private var resolvedURL: String? {
    let trimmed = iconURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? nil : trimmed
  }

  var body: some View {
    if let source = resolvedURL {
      EchoMediaImage(source: source, baseURL: baseURL, accessToken: accessToken) {
        Circle().fill(accent)
      }
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: max(2, size * 0.22), style: .continuous))
      .accessibilityHidden(true)
    } else {
      Circle()
        .fill(accent)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
  }

  init(
    role: EchoServerRole, preferLight: Bool, size: CGFloat = 10, baseURL: URL,
    accessToken: String? = nil
  ) {
    self.iconURL = role.roleIconURL
    self.colorHex = role.displayColor(preferLight: preferLight)
    self.size = size
    self.baseURL = baseURL
    self.accessToken = accessToken
  }

  init(
    iconURL: String?, colorHex: String, size: CGFloat = 10, baseURL: URL,
    accessToken: String? = nil
  ) {
    self.iconURL = iconURL
    self.colorHex = colorHex
    self.size = size
    self.baseURL = baseURL
    self.accessToken = accessToken
  }
}
