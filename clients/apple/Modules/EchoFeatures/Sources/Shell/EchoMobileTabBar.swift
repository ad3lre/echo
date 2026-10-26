import SwiftUI

/// Floating liquid-glass pill — icon-only, web tab artwork.
/// Portrait: horizontal bottom float. Landscape: vertical trailing rail.
struct EchoMobileTabBar: View {
  @Binding var selection: EchoMainTab
  var homeBadge: Int = 0
  var serversHasActivity = false
  var exploreHasActivity = false
  /// Re-tap Servers while already selected — hierarchical back in that tab.
  var onReselectServers: (() -> Void)? = nil
  /// Vertical rail for landscape / Duo; horizontal pill otherwise.
  var axis: Axis = .horizontal

  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  // Larger capsule (~15%); icons stay at the original size.
  private let pillThickness: CGFloat = 62
  private let iconSize: CGFloat = 24
  private let barWidthFraction: CGFloat = 0.64
  private let barHeightFraction: CGFloat = 0.42

  private var isDarkChrome: Bool {
    colorScheme == .dark || displayPrefs.theme == "amoled"
  }

  private var isAmoled: Bool {
    displayPrefs.theme == "amoled"
      && displayPrefs.resolvedVariant(colorScheme: colorScheme) == .amoled
  }

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    return Group {
      if axis == .vertical {
        verticalBar
      } else {
        horizontalBar
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(EchoCopy.string("Main navigation"))
  }

  private var horizontalBar: some View {
    HStack(spacing: 0) {
      ForEach(EchoMainTab.allCases) { tab in
        tabButton(tab, vertical: false)
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.horizontal, 4)
    .frame(height: pillThickness)
    .background { pillBackground }
    .shadow(
      color: .black.opacity(isAmoled ? 0.55 : (isDarkChrome ? 0.42 : 0.12)),
      radius: isAmoled ? 16 : 20,
      y: 9
    )
    .shadow(
      color: .black.opacity(isDarkChrome ? 0.20 : 0.05), radius: 3, y: 1)
    .containerRelativeFrame(.horizontal) { width, _ in width * barWidthFraction }
  }

  private var verticalBar: some View {
    VStack(spacing: 0) {
      ForEach(EchoMainTab.allCases) { tab in
        tabButton(tab, vertical: true)
          .frame(maxHeight: .infinity)
      }
    }
    .padding(.vertical, 4)
    .frame(width: pillThickness)
    .background { pillBackground }
    .shadow(
      color: .black.opacity(isAmoled ? 0.55 : (isDarkChrome ? 0.42 : 0.12)),
      radius: isAmoled ? 16 : 20,
      x: -6
    )
    .shadow(
      color: .black.opacity(isDarkChrome ? 0.20 : 0.05), radius: 3, x: -1)
    .containerRelativeFrame(.vertical) { height, _ in
      min(height * barHeightFraction, 280)
    }
  }

  private func tabButton(_ tab: EchoMainTab, vertical: Bool) -> some View {
    let isSelected = selection == tab
    return Button {
      if selection == tab {
        // Re-tap Servers = hierarchical back (chat → channels → server list).
        // Use an explicit callback — overlay Environment(EchoShellChrome) was
        // missing and crashed the shell right after unlock.
        if tab == .servers {
          onReselectServers?()
        }
        return
      }
      // Do not wrap in withAnimation — that springs the whole shell (Home/Explore
      // trees). Animate only this pill via `.animation(_, value: selection)`.
      selection = tab
    } label: {
      ZStack {
        if isSelected {
          Capsule(style: .continuous)
            .fill(selectionFill)
            .padding(vertical ? .horizontal : .vertical, 5)
            .padding(vertical ? .vertical : .horizontal, 0)
        }

        Image(isSelected ? tab.assetNameSelected : tab.assetName, bundle: .main)
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: iconSize, height: iconSize)
          .foregroundStyle(
            EchoTheme.Color.ink(isSelected ? 0.96 : (isDarkChrome ? 0.42 : 0.46))
          )
          .overlay(alignment: .topTrailing) {
            badgeView(for: tab)
              .offset(x: 10, y: -6)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .frame(
            width: vertical ? pillThickness - 8 : nil,
            height: vertical ? nil : pillThickness - 8
          )
          .contentShape(Capsule())
      }
      // Instant chrome — never spring the tab bar (that dragged shell switches).
      .transaction { $0.animation = nil }
    }
    .buttonStyle(EchoTabBarButtonStyle())
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
  }

  private var selectionFill: Color {
    if isAmoled {
      return Color.white.opacity(0.12)
    }
    if isDarkChrome {
      return Color.white.opacity(0.14)
    }
    return EchoTheme.Color.ink(0.10)
  }

  @ViewBuilder
  private func badgeView(for tab: EchoMainTab) -> some View {
    switch tab {
    case .home where homeBadge > 0:
      Text(homeBadge > 99 ? "99+" : String(homeBadge))
        .font(.system(size: homeBadge > 9 ? 8 : 10, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.onAccent)
        .padding(.horizontal, homeBadge > 9 ? 4 : 0)
        .frame(minWidth: 16, minHeight: 16)
        .background(EchoTheme.Color.badge, in: Capsule())
    case .servers where serversHasActivity, .explore where exploreHasActivity:
      Circle()
        .fill(EchoTheme.Color.badge)
        .frame(width: 8, height: 8)
        .overlay(Circle().stroke(EchoTheme.Color.ink(0.12), lineWidth: 1.5))
    default:
      EmptyView()
    }
  }

  /// Dark liquid glass: blur for depth, then a heavy dark pool so it never
  /// washes out to system-gray material.
  @ViewBuilder
  private var pillBackground: some View {
    let elevated = displayPrefs.elevated(colorScheme: colorScheme)
    Capsule(style: .continuous)
      .fill(darkPoolFill(elevated: elevated))
      .background {
        if !displayPrefs.solidGlass {
          // Blur lives underneath the dark pool — visible only as soft depth.
          Capsule(style: .continuous)
            .fill(.ultraThinMaterial)
            .opacity(isDarkChrome ? 0.45 : 1)
        }
      }
      .clipShape(Capsule(style: .continuous))
  }

  private func darkPoolFill(elevated: Color) -> Color {
    if displayPrefs.solidGlass {
      return isAmoled ? Color.black.opacity(0.94) : elevated.opacity(0.96)
    }
    if isAmoled {
      return Color.black.opacity(0.90)
    }
    if isDarkChrome {
      // Near-black ink — no white specular wash on top.
      return EchoTheme.Color.tabBarDarkPool.opacity(0.90)
    }
    return Color.white.opacity(0.55)
  }
}

private struct EchoTabBarButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.96 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}
