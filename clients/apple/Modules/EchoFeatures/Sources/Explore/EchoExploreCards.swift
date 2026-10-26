import EchoDomain
import EchoNetworking
import SwiftUI


struct EchoExploreTagChip: View {
  let title: String
  let count: Int?
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 4) {
        Text(title)
        if let count {
          Text("\(count)")
            .foregroundStyle(EchoTheme.Color.ink(selected ? 0.70 : 0.40))
        }
      }
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(selected ? 0.96 : 0.55))
      .padding(.horizontal, 12)
      .frame(height: 34)
      .background(
        selected ? EchoTheme.Color.ink(0.14) : EchoTheme.Color.ink(0.06),
        in: Capsule(style: .continuous)
      )
    }
    .buttonStyle(.plain)
  }
}

struct EchoExploreFeaturedCard: View {
  let listed: EchoExploreDirectory.ListedServer
  let baseURL: URL
  var accessToken: String? = nil
  let isJoined: Bool
  let isJoining: Bool
  let onJoin: () -> Void

  @Environment(\.colorScheme) private var colorScheme
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  private var isLight: Bool {
    colorScheme == .light || displayPrefs.theme == "sunny"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      EchoServerBannerStrip(
        bannerURL: listed.server.bannerURL ?? listed.server.iconURL,
        baseURL: baseURL,
        accessToken: accessToken,
        height: 112
      ) {
        LinearGradient(
          colors: [
            EchoTheme.Color.ambientIndigo.opacity(0.55),
            EchoTheme.Color.ink(0.08),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }

      HStack(alignment: .top, spacing: 10) {
        EchoServerIcon(
          iconURL: listed.server.iconURL,
          name: listed.name,
          baseURL: baseURL,
          accessToken: accessToken,
          bannerURL: listed.server.bannerURL,
          cornerRadius: 12
        )
        .frame(width: 44, height: 44)
        .allowsHitTesting(false)

        VStack(alignment: .leading, spacing: 4) {
          Text(listed.name)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.94))
            .lineLimit(1)
          Text(listed.blurb)
            .font(.system(size: 11, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .lineLimit(2)
          HStack {
            Text(memberLabel(listed.memberCount))
              .font(.system(size: 10, weight: .bold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.42))
              .textCase(.uppercase)
              .tracking(0.8)
            Spacer(minLength: 0)
            EchoExploreActionButton(
              isJoined: isJoined, isJoining: isJoining, action: onJoin)
          }
        }
      }
      .padding(12)
    }
    // Full-card hit surface so swipes starting on the footer (not only the
    // banner) drive the parent horizontal ScrollView.
    .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .background {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(displayPrefs.elevated(colorScheme: colorScheme).opacity(isLight ? 0.92 : 0.88))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(EchoTheme.Color.ink(0.07), lineWidth: 1)
    }
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

struct EchoExploreServerCard: View {
  let listed: EchoExploreDirectory.ListedServer
  let baseURL: URL
  var accessToken: String? = nil
  let isJoined: Bool
  let isJoining: Bool
  let onJoin: () -> Void

  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  private var isLight: Bool {
    colorScheme == .light || displayPrefs.theme == "sunny"
  }

  /// Web `bannerFor`: real banner, else icon — never leave the strip blank.
  private var displayBannerURL: String? {
    let banner = listed.server.bannerURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !banner.isEmpty { return banner }
    let icon = listed.server.iconURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return icon.isEmpty ? nil : icon
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ZStack(alignment: .bottomLeading) {
        EchoServerBannerStrip(
          bannerURL: displayBannerURL,
          baseURL: baseURL,
          accessToken: accessToken,
          height: 96
        ) {
          bannerFallback
        }

        // Scrim only at the bottom (web explore banner fade) — must not expand
        // to the full ZStack or it paints the whole strip empty/dark.
        VStack(spacing: 0) {
          Spacer(minLength: 0)
          LinearGradient(
            colors: [
              .clear,
              (isLight ? Color.white : EchoTheme.Color.canvas).opacity(isLight ? 0.35 : 0.72),
            ],
            startPoint: .top,
            endPoint: .bottom
          )
          .frame(height: 40)
        }
        .allowsHitTesting(false)

        EchoServerIcon(
          iconURL: listed.server.iconURL,
          name: listed.name,
          baseURL: baseURL,
          accessToken: accessToken,
          bannerURL: listed.server.bannerURL,
          cornerRadius: 16
        )
        .frame(width: 52, height: 52)
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(EchoTheme.Color.canvas, lineWidth: 3)
        )
        .padding(.leading, 14)
        .offset(y: 18)
      }

      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 4) {
            Text(listed.name)
              .font(.system(size: 17, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.94))
              .lineLimit(2)
            HStack(spacing: 8) {
              Text(memberLabel(listed.memberCount))
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.42))
              if listed.voiceParticipantCount > 0 {
                Text(voiceLabel(listed.voiceParticipantCount))
                  .font(.system(size: 12, weight: .semibold, design: .rounded))
                  .foregroundStyle(Color.cyan.opacity(0.9))
              }
            }
          }
          Spacer(minLength: 0)
          EchoExploreActionButton(
            isJoined: isJoined, isJoining: isJoining, action: onJoin)
        }
        .padding(.top, 22)

        Text(listed.blurb)
          .font(.system(size: 13, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.52))
          .lineLimit(3)

        if !listed.tags.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
              ForEach(listed.tags.prefix(6), id: \.self) { tag in
                // Web `.explore-server-tag`: ~72% fg on a light chip — ink(0.50)
                // on ink(0.06) was unreadable on dark elevated cards.
                Text(EchoExploreDirectory.QuickFilter(tag: tag, count: 0).label)
                  .font(.system(size: 11, weight: .semibold, design: .rounded))
                  .foregroundStyle(EchoTheme.Color.ink(isLight ? 0.58 : 0.82))
                  .padding(.horizontal, 8)
                  .frame(height: 24)
                  .background(
                    EchoTheme.Color.ink(isLight ? 0.07 : 0.14),
                    in: Capsule()
                  )
                  .overlay(
                    Capsule().stroke(
                      EchoTheme.Color.ink(isLight ? 0.06 : 0.16),
                      lineWidth: 1
                    )
                  )
              }
            }
          }
        }
      }
      .padding(.horizontal, 14)
      .padding(.bottom, 14)
    }
    .background {
      // Solid elevated fill — per-card materials were a major Explore switch hitch.
      // Shadow lives on the shape only; on the whole card it forced an offscreen
      // pass over banner + icon + text every frame.
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(displayPrefs.elevated(colorScheme: colorScheme).opacity(isLight ? 0.92 : 0.90))
        .shadow(
          color: isLight ? .clear : .black.opacity(0.22),
          radius: isLight ? 0 : 14,
          y: isLight ? 0 : 6
        )
    }
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(EchoTheme.Color.ink(isLight ? 0.06 : 0.08), lineWidth: 1)
    }
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  private var bannerFallback: some View {
    LinearGradient(
      colors: [
        EchoTheme.Color.ambientIndigo.opacity(isLight ? 0.42 : 0.55),
        EchoTheme.Color.ink(isLight ? 0.06 : 0.12),
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

struct EchoExploreActionButton: View {
  let isJoined: Bool
  let isJoining: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Group {
        if isJoining {
          ProgressView().controlSize(.small)
        } else {
          Text(isJoined ? EchoCopy.string("Open") : EchoCopy.string("Join"))
            .font(.system(size: 13, weight: .semibold, design: .rounded))
        }
      }
      .foregroundStyle(isJoined ? EchoTheme.Color.ink(0.92) : EchoTheme.Color.onAccent)
      .frame(minWidth: 72, minHeight: 44)
      .padding(.horizontal, 4)
      .background(
        isJoined
          ? EchoTheme.Color.ink(0.14)
          : EchoTheme.Color.actionHighlight,
        in: Capsule(style: .continuous)
      )
      .overlay {
        if isJoined {
          Capsule(style: .continuous)
            .strokeBorder(EchoTheme.Color.ink(0.22), lineWidth: 1)
        }
      }
      .contentShape(Capsule(style: .continuous))
    }
    // Yield pans to Explore’s vertical + featured horizontal scrolls; taps still fire.
    .buttonStyle(.echoScrollFriendly)
    .disabled(isJoining)
    .accessibilityLabel(isJoined ? EchoCopy.string("Open") : EchoCopy.string("Join"))
  }
}

@MainActor let memberCountFormatter: NumberFormatter = {
  let formatter = NumberFormatter()
  formatter.numberStyle = .decimal
  formatter.maximumFractionDigits = 1
  return formatter
}()

@MainActor func memberLabel(_ count: Int) -> String {
  if count <= 0 { return EchoCopy.string("New") }
  if count >= 1000 {
    let compact = Double(count) / 1000.0
    let text = memberCountFormatter.string(from: NSNumber(value: compact)) ?? "\(count)"
    return EchoCopy.format("%@k members", text)
  }
  return EchoCopy.format("%lld members", Int64(count))
}

@MainActor func voiceLabel(_ count: Int) -> String {
  if count == 1 { return EchoCopy.string("In voice") }
  return EchoCopy.format("%lld in voice", Int64(count))
}
