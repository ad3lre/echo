import SwiftUI

/// Native equivalent of the backend default avatar generator.
/// It intentionally hashes the display name and uses the same FNV-1a palette
/// and dominant-letter rules as `backend/src/auth/defaultAvatarPfp.ts`.
struct EchoGeneratedAvatar: View {
  let name: String
  let seed: String

  var body: some View {
    (Color(hex: avatarBackground(seed)) ?? Color(red: 0.345, green: 0.396, blue: 0.949))
      .overlay {
        GeometryReader { proxy in
          let diameter = min(proxy.size.width, proxy.size.height)
          Text(avatarLetters(name))
            // The backend avatar is authored on a 128pt canvas with a 52pt
            // glyph. Scale that proportionally so small surfaces (notably
            // the 34pt DM header avatar) never collapse into SwiftUI's
            // truncation ellipsis.
            .font(.system(size: max(10, diameter * 0.40625), weight: .semibold, design: .default))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .allowsTightening(true)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .clipped()
      .accessibilityLabel("Avatar for \(name)")
  }

  private func avatarBackground(_ value: String) -> String {
    let palette = [
      "#5865F2", "#3BA55D", "#F26522", "#9B59B6", "#E74C3C", "#1ABC9C",
      "#3498DB", "#E91E63", "#C0392B", "#16A085", "#2980B9", "#8E44AD",
      "#D35400", "#27AE60", "#2C3E50", "#E67E22", "#1F618D", "#884EA0",
      "#117864", "#B03A2E", "#AF601A", "#6C3483", "#2874A6",
    ]
    let key = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return palette[Int(fnv1a32(key.isEmpty ? "\0" : key) % UInt32(palette.count))]
  }

  private func avatarLetters(_ value: String) -> String {
    let parts = value.trimmingCharacters(in: .whitespacesAndNewlines)
      .split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard let first = parts.first, !first.isEmpty else { return "?" }
    if parts.count >= 2, let last = parts.last {
      return "\(first.prefix(1))\(last.prefix(1))".uppercased()
    }
    let chars = Array(first)
    if chars.count == 1 { return String(chars[0]).uppercased() + String(chars[0]).uppercased() }
    return String(chars.prefix(2)).uppercased()
  }
}

private func fnv1a32(_ value: String) -> UInt32 {
  var hash: UInt32 = 0x811C_9DC5
  for byte in value.utf8 {
    hash ^= UInt32(byte)
    hash = hash &* 0x0100_0193
  }
  return hash
}
