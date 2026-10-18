import SwiftUI

/// Square server mark — never lets a wide banner bleed outside the clip.
struct EchoServerIcon: View {
  let iconURL: String?
  let name: String
  let baseURL: URL
  var accessToken: String? = nil
  /// When the API reuses the banner URL as `iconUrl`, fall back to letters.
  var bannerURL: String? = nil
  var cornerRadius: CGFloat = 16

  private var resolvedIconURL: String? {
    guard let iconURL else { return nil }
    let icon = iconURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !icon.isEmpty else { return nil }
    if let bannerURL {
      let banner = bannerURL.trimmingCharacters(in: .whitespacesAndNewlines)
      if !banner.isEmpty, icon == banner { return nil }
      if let iconKey = assetKey(icon), let bannerKey = assetKey(banner), iconKey == bannerKey {
        return nil
      }
    }
    return icon
  }

  var body: some View {
    GeometryReader { proxy in
      let side = min(proxy.size.width, proxy.size.height)
      ZStack {
        if let resolvedIconURL {
          EchoMediaImage(
            source: resolvedIconURL, baseURL: baseURL, accessToken: accessToken
          ) {
            letterFallback
          }
          .frame(width: side, height: side)
          .clipped()
        } else {
          letterFallback
            .frame(width: side, height: side)
        }
      }
      .frame(width: side, height: side)
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
    .aspectRatio(1, contentMode: .fit)
    .accessibilityHidden(true)
  }

  private var letterFallback: some View {
    EchoGeneratedAvatar(name: name, seed: name)
  }

  private func assetKey(_ raw: String) -> String? {
    guard var components = URLComponents(string: raw) else { return raw }
    components.query = nil
    components.fragment = nil
    let path = components.path
    return path.isEmpty ? components.string : path
  }
}

/// Wide banner strip clipped hard so it cannot paint into the icon slot.
struct EchoServerBannerStrip<Fallback: View>: View {
  let bannerURL: String?
  let baseURL: URL
  var accessToken: String? = nil
  var height: CGFloat = 96
  @ViewBuilder let fallback: () -> Fallback

  var body: some View {
    // Fallback stays painted under the image — `Color.clear` + overlay alone
    // was leaving LazyVStack list cards blank while featured (eager HStack) worked.
    ZStack {
      fallback()
      if let bannerURL, !bannerURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        EchoMediaImage(
          source: bannerURL,
          baseURL: baseURL,
          accessToken: accessToken,
          contentMode: .fill
        ) {
          Color.clear
        }
        .allowsHitTesting(false)
      }
    }
    .frame(height: height)
    .frame(maxWidth: .infinity)
    .clipped()
  }
}
