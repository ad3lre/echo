import SwiftUI

#if os(iOS)
  import UIKit
#endif

private struct EchoDesktopSettingsKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  var echoDesktopSettings: Bool {
    get { self[EchoDesktopSettingsKey.self] }
    set { self[EchoDesktopSettingsKey.self] = newValue }
  }
}

struct EchoDetailSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @Environment(\.echoDesktopSettings) private var desktop

  init(title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: desktop ? 10 : 8) {
      Text(title.uppercased())
        .font(.system(size: desktop ? 11 : 11, weight: .bold, design: .rounded))
        .tracking(desktop ? 1.4 : 1.8)
        .foregroundStyle(EchoTheme.Color.ink(desktop ? 0.46 : 0.42))
        .padding(.horizontal, desktop ? 2 : 4)
      VStack(alignment: .leading, spacing: desktop ? 0 : 14) {
        content()
      }
      .padding(desktop ? 4 : 14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .modifier(EchoDetailSectionSurface(desktop: desktop))
      .overlay {
        if !desktop {
          RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(EchoTheme.Color.ink(0.09), lineWidth: 1)
        }
      }
    }
  }
}

private struct EchoDetailSectionSurface: ViewModifier {
  let desktop: Bool
  func body(content: Content) -> some View {
    if desktop {
      content
    } else {
      content.echoGlassBackground(cornerRadius: 22)
    }
  }
}

struct EchoDetailHeader: View {
  let title: String
  let description: String
  let icon: String
  let tint: Color

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: icon)
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 52, height: 52)
        .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.system(size: 24, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(description)
          .font(.system(size: 14, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 12)
  }
}

enum EchoSettingDetailChrome: Equatable {
  /// Phone push stack — Back returns to the settings list.
  case stack
  /// Desktop sidebar host — Exit closes settings (web SettingsModal).
  case desktop
}

/// Header used by settings detail tabs. The detail navigation bar is hidden so
/// Echo owns the visual title and the trailing back/exit affordance as one stable row.
struct EchoSettingDetailHeader: View {
  let title: String
  let description: String
  let icon: String
  let tint: Color
  var chrome: EchoSettingDetailChrome = .stack
  var groupLabel: String? = nil
  let onDismiss: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 13) {
      if chrome == .stack {
        Image(systemName: icon)
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(tint)
          .frame(width: 46, height: 46)
          .background(
            tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      }
      VStack(alignment: .leading, spacing: chrome == .desktop ? 6 : 3) {
        if chrome == .desktop, let groupLabel, !groupLabel.isEmpty {
          Text(groupLabel.uppercased())
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .tracking(1.6)
            .foregroundStyle(EchoTheme.Color.signInBlue.opacity(0.85))
        }
        Text(title)
          .font(
            .system(
              size: chrome == .desktop ? 28 : 25, weight: .bold, design: .rounded)
          )
          .foregroundStyle(EchoTheme.Color.fg)
        Text(description)
          .font(.system(size: chrome == .desktop ? 14 : 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .lineLimit(chrome == .desktop ? 3 : 1)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      Button(action: onDismiss) {
        if chrome == .desktop {
          Text(EchoCopy.string("Exit"))
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.72))
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(
              EchoTheme.Color.ink(0.06),
              in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
        } else {
          Label(EchoCopy.string("Back"), systemImage: "chevron.left")
            .labelStyle(.titleAndIcon)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.9))
            .padding(.horizontal, 13)
            .frame(height: 40)
            .background(EchoTheme.Color.ink(0.075), in: Capsule())
            .overlay { Capsule().stroke(EchoTheme.Color.ink(0.10), lineWidth: 1) }
        }
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        chrome == .desktop
          ? EchoCopy.string("Exit settings") : EchoCopy.string("Back to Settings"))
    }
    .padding(.bottom, chrome == .desktop ? 18 : 0)
    .frame(minHeight: chrome == .desktop ? 72 : 58)
  }
}

#if os(iOS)
  /// Restores the system edge swipe-back when the nav bar (and its back button)
  /// is hidden — otherwise `navigationBarBackButtonHidden` disables the gesture.
  struct EchoSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
      Controller()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    private final class Controller: UIViewController, UIGestureRecognizerDelegate {
      override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let pop = navigationController?.interactivePopGestureRecognizer else { return }
        pop.isEnabled = true
        pop.delegate = self
      }

      func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        (navigationController?.viewControllers.count ?? 0) > 1
      }

      func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
      ) -> Bool {
        false
      }
    }
  }

  extension View {
    /// Edge-swipe back to the settings list while Echo’s custom Back chrome is shown.
    func echoSettingsSwipeBack() -> some View {
      background(EchoSwipeBackEnabler())
    }
  }
#endif
