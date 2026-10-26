import EchoDomain
import SwiftUI

#if os(iOS)
  import UIKit
#endif

struct EchoHomeBackground: View {
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    // Dark gets a stronger indigo wash (web rail glow); AMOLED stays flat black.
    let wash = EchoTheme.forcedVariant == .amoled ? 0.0 : (colorScheme == .dark ? 0.34 : 0.22)
    return ZStack {
      displayPrefs.canvas(colorScheme: colorScheme)
      if wash > 0 {
        RadialGradient(
          colors: [EchoTheme.Color.ambientIndigo.opacity(wash), .clear],
          center: UnitPoint(x: 0.88, y: 0.03),
          startRadius: 0,
          endRadius: 320
        )
        RadialGradient(
          colors: [EchoTheme.Color.launchGlowBlue.opacity(colorScheme == .dark ? 0.55 : 0.0), .clear],
          center: UnitPoint(x: 0.12, y: 0.92),
          startRadius: 0,
          endRadius: 280
        )
      }
    }
  }
}

/// Home wash aligned to the global screen so a clipped shelf doesn’t restart
/// the indigo glow and cut off mid-gradient under the search row.
struct EchoAlignedHomeWash: View {
  var body: some View {
    GeometryReader { geo in
      let frame = geo.frame(in: .global)
      EchoHomeBackground()
        .frame(width: frame.width, height: max(frame.maxY + 520, 1100))
        .offset(y: -frame.minY)
    }
    .allowsHitTesting(false)
  }
}

struct EchoProfileHeader: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  /// Landscape / Duo sidebar — shorter banner so the list gets vertical room.
  var compact = false
  let onProfileTap: () -> Void
  let onMenuTap: () -> Void

  private var bannerHeight: CGFloat { compact ? 132 : 226 }
  private var avatarSize: CGFloat { compact ? 56 : 76 }
  private var shelfHeight: CGFloat { compact ? 64 : 84 }
  private var nameSize: CGFloat { compact ? 17 : 21 }

  var body: some View {
    // Whole header is tappable for profile — generous by design so near-misses
    // on the banner / name shelf still land intentionally.
    Button(action: onProfileTap) {
      VStack(spacing: 0) {
        ZStack(alignment: .bottom) {
          EchoProfileBanner(
            profile: profile, baseURL: baseURL, accessToken: accessToken,
            appliesEffects: true,
            showsRefractionBleed: false
          )
          // Extend the artwork beneath the curve so raster/remote-image
          // edges can never form a hairline seam at the section boundary.
          .frame(height: bannerHeight)
          .clipped()

          // Screen-aligned wash so the indigo glow continues into the search row.
          EchoAlignedHomeWash()
            .frame(height: shelfHeight)
            .clipShape(EchoHeaderSlice(raisedChromeShelves: colorScheme == .light))
            .allowsHitTesting(false)

          HStack(alignment: .bottom, spacing: compact ? 10 : 14) {
            EchoProfileAvatar(
              profile: profile, baseURL: baseURL, accessToken: accessToken
            )
            .frame(width: avatarSize, height: avatarSize)
            .zIndex(2)

            VStack(alignment: .leading, spacing: 3) {
              Text(profile.name)
                .font(.system(size: nameSize, weight: .semibold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.fg)
                .lineLimit(1)
              Text(profile.username.map { "@\($0)" } ?? "")
                .font(.system(size: compact ? 12 : 13, weight: .medium, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.58))
                .lineLimit(1)
            }
            .padding(.bottom, compact ? 6 : 10)

            Spacer(minLength: 0)

            Button(action: onMenuTap) {
              Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(EchoTheme.Color.ink(0.46))
                // Extra padding so roughly tapping near the chevron still hits.
                .frame(width: 48, height: compact ? 48 : 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.bottom, compact ? 6 : 10)
            .accessibilityLabel(EchoCopy.string("Open menu"))
          }
          .padding(.horizontal, compact ? 14 : 22)
          .padding(.bottom, compact ? 4 : 8)
          .zIndex(1)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.format("Open profile for %@", profile.name))
  }
}

/// Canvas fill that seals the home banner. In light mode the top edge lifts in
/// two soft shelves under the display name and the trailing caret so ink stays
/// readable without raising the entire wave.
struct EchoHeaderSlice: Shape {
  /// When true, peek the curve up under name + caret (light / sunny chrome).
  var raisedChromeShelves: Bool = false

  func path(in rect: CGRect) -> Path {
    if raisedChromeShelves {
      return lightReadablePath(in: rect)
    }
    return standardPath(in: rect)
  }

  private func standardPath(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + 10))
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: rect.midY - 8),
      control1: CGPoint(x: rect.width * 0.27, y: rect.minY - 4),
      control2: CGPoint(x: rect.width * 0.70, y: rect.maxY + 8)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.closeSubpath()
    return path
  }

  /// Soft rise under the display name (+ a lighter one under the caret) so
  /// light-mode ink sits on chrome, not the banner photograph.
  private func lightReadablePath(in rect: CGRect) -> Path {
    var path = Path()
    let w = rect.width
    // A modest lift vs the prior shelves — enough for the name to clear the
    // banner, without the tall twin peaks that read as excessive.
    let nameY = rect.midY - 12
    let dipY = rect.midY + 4
    let caretY = rect.midY - 8
    path.move(to: CGPoint(x: rect.minX, y: rect.midY + 10))
    path.addCurve(
      to: CGPoint(x: w * 0.36, y: nameY),
      control1: CGPoint(x: w * 0.16, y: rect.midY + 6),
      control2: CGPoint(x: w * 0.26, y: nameY + 2)
    )
    path.addCurve(
      to: CGPoint(x: w * 0.70, y: dipY),
      control1: CGPoint(x: w * 0.48, y: nameY),
      control2: CGPoint(x: w * 0.58, y: dipY + 2)
    )
    path.addCurve(
      to: CGPoint(x: rect.maxX, y: caretY),
      control1: CGPoint(x: w * 0.82, y: dipY),
      control2: CGPoint(x: w * 0.92, y: caretY)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

struct EchoProfileAvatar: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  var presenceStatus: String? = nil
  /// Canvas (or themed) ring around the avatar — drawn under the presence badge
  /// so the online indicator is never half-covered by the stroke.
  var rimWidth: CGFloat = 0
  var rimColor: Color? = nil
  var presenceSize: CGFloat = 20
  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  private var resolvedRimColor: Color {
    rimColor ?? displayPrefs.canvas(colorScheme: colorScheme)
  }

  var body: some View {
    // Presence must overlay the circle bounds — not the shadow. Shadow after
    // the badge was expanding layout and parking the dot under the avatar.
    avatarImage
      .overlay {
        if rimWidth > 0 {
          Circle()
            .stroke(resolvedRimColor, lineWidth: rimWidth)
            .allowsHitTesting(false)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        if presenceStatus != nil {
          EchoPresenceIndicator(
            status: presenceStatus,
            size: presenceSize,
            borderColor: resolvedRimColor
          )
          // Sit on the rim; keep above the stroke so half the badge isn’t clipped.
          .offset(x: rimWidth > 0 ? 1 : -2, y: rimWidth > 0 ? 1 : -2)
          .zIndex(2)
          .allowsHitTesting(false)
        }
      }
      .echoShadow(color: .black.opacity(0.32), radius: 14, y: 8)
  }

  @ViewBuilder
  private var avatarImage: some View {
    if let avatarURL = profile.avatarURL,
      !avatarURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      EchoMediaImage(
        source: profile.avatarURL,
        baseURL: baseURL,
        accessToken: accessToken,
        maxPixelSize: EchoAvatarPrefetcher.avatarMaxPixelSize
      ) {
        EchoGeneratedAvatar(name: profile.name, seed: profile.name)
      }
      .clipShape(Circle())
    } else {
      EchoGeneratedAvatar(name: profile.name, seed: profile.name)
    }
  }
}

