import EchoDomain
import SwiftUI

/// Web-parity banner effect stack: refraction glow, frosted blur, and blackout scrim.
///
/// Matches `MemberProfileHeader.vue` / `.ep-refraction` / `.echo-user-banner-blur` /
/// `bg-scrim-2` — opacity and blur radii track the web CSS tokens.
enum EchoBannerEffectStyle {
  /// `--profile-banner-refraction-opacity` (dark theme default).
  static let refractionOpacity: Double = 0.24
  /// Web `filter: blur(28px)`.
  static let refractionBlur: CGFloat = 28
  /// Web `.echo-user-banner-blur` `backdrop-filter: blur(8px)`.
  static let bannerBlur: CGFloat = 8
  /// Dark `--ui-scrim-2: rgba(0, 0, 0, 0.55)`.
  static let blackoutOpacity: Double = 0.55
  /// Extra bleed so refraction isn’t clipped at the banner edge (~web −22/−18 inset).
  static let refractionBleed: CGFloat = 22
}

/// Shared banner artwork + effect overlays used by home chrome, full profile, and edit preview.
struct EchoProfileBanner: View {
  let profile: EchoUserProfile
  let baseURL: URL
  var accessToken: String? = nil
  /// Blur / blackout / refraction. Keep on for web-parity; home chrome still
  /// clips refraction bloom via `showsRefractionBleed: false` + compositing.
  var appliesEffects: Bool = true
  /// Ambient refraction that extends past the banner box (full profile / edit).
  /// Home DM chrome leaves this off so bloom cannot paint a seam into search.
  var showsRefractionBleed: Bool = true

  var body: some View {
    GeometryReader { geo in
      let size = geo.size
      let effects = appliesEffects
      ZStack {
        if effects, profile.bannerRefractionEnabled {
          refractionLayer(in: size, allowBleed: showsRefractionBleed)
        }

        ZStack {
          bannerArtwork
            .blur(radius: effects && profile.bannerBlurEnabled ? EchoBannerEffectStyle.bannerBlur : 0)

          if effects, profile.bannerBlackoutEnabled {
            Color.black.opacity(EchoBannerEffectStyle.blackoutOpacity)
          }

          LinearGradient(
            colors: [.black.opacity(0.02), .black.opacity(0.42)],
            startPoint: .top,
            endPoint: .bottom
          )
        }
        .frame(width: size.width, height: size.height)
        // Flatten blur into this layer before clipping — otherwise SwiftUI blur
        // bloom can leak a 1px light fringe into sibling chrome below.
        .compositingGroup()
        .clipped()
      }
      .frame(width: size.width, height: size.height)
      .compositingGroup()
      .clipped()
    }
  }

  @ViewBuilder
  private var bannerArtwork: some View {
    if hasBannerImage {
      EchoMediaImage(source: profile.bannerURL, baseURL: baseURL, accessToken: accessToken) {
        fallbackColor.overlay(ProgressView().tint(EchoTheme.Color.ink(0.55)))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .offset(y: (0.5 - bannerFocusY) * 48)
      .clipped()
    } else {
      fallbackColor
    }
  }

  /// Soft ambient copy of the banner (or solid color). GIFs fall back to color like web.
  @ViewBuilder
  private func refractionLayer(in size: CGSize, allowBleed: Bool) -> some View {
    let bleed = allowBleed ? EchoBannerEffectStyle.refractionBleed : 0
    Group {
      if hasBannerImage, !bannerLooksAnimated {
        EchoMediaImage(source: profile.bannerURL, baseURL: baseURL, accessToken: accessToken) {
          fallbackColor
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .offset(y: (0.5 - bannerFocusY) * 48)
        .clipped()
      } else {
        fallbackColor
      }
    }
    .frame(width: size.width + bleed * 2, height: size.height + bleed * 2)
    .position(x: size.width / 2, y: size.height / 2)
    .blur(radius: EchoBannerEffectStyle.refractionBlur)
    .saturation(1.25)
    .opacity(EchoBannerEffectStyle.refractionOpacity)
    .blendMode(.screen)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private var hasBannerImage: Bool {
    guard let bannerURL = profile.bannerURL else { return false }
    return !bannerURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Web skips animated URLs for refraction (`isLikelyGifImageUrl`).
  private var bannerLooksAnimated: Bool {
    let value = (profile.bannerURL ?? "").lowercased()
    return value.contains(".gif") || value.contains("image/gif") || value.contains("format=gif")
  }

  private var bannerFocusY: CGFloat {
    let raw = profile.bannerPositionY ?? 50
    return CGFloat(min(100, max(0, raw)) / 100)
  }

  private var fallbackColor: some View {
    Color(hex: profile.bannerColor) ?? EchoTheme.Color.ink(0.08)
  }
}
