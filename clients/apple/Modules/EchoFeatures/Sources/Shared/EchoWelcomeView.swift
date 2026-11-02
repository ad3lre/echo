import SwiftUI

struct EchoWelcomeView: View {
  var unlockTitle: String? = nil
  var onUnlock: (() -> Void)? = nil
  let onSelect: (EchoAuthPage) -> Void

  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @State private var appeared = false

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        EchoWelcomeBackdrop(size: proxy.size)
        #if os(macOS)
          macContent(size: proxy.size)
        #else
          phoneContent(size: proxy.size, bottomInset: proxy.safeAreaInsets.bottom)
        #endif
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    #if os(iOS)
      .safeAreaPadding(.top, 8)
    #endif
    .onAppear {
      guard !appeared else { return }
      if displayPrefs.prefersReducedMotion {
        appeared = true
      } else {
        withAnimation(.spring(response: 0.6, dampingFraction: 0.88)) { appeared = true }
      }
    }
  }

  #if os(macOS)
    @ViewBuilder
    private func macContent(size: CGSize) -> some View {
      let useSplit = size.width >= 920
      if useSplit {
        HStack(spacing: 0) {
          brandStage(height: min(320, size.height * 0.42))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .reveal(appeared, offset: 14)

          Divider()
            .background(EchoTheme.Color.ink(0.10))

          railColumn
            .frame(width: min(460, max(380, size.width * 0.34)))
            .frame(maxHeight: .infinity)
            .padding(.horizontal, 36)
            .padding(.vertical, 40)
        }
      } else {
        VStack(spacing: 28) {
          Spacer(minLength: 24)
          brandStage(height: min(240, size.height * 0.28))
            .reveal(appeared, offset: 12)
          railColumn
            .frame(maxWidth: 420)
            .padding(.horizontal, 32)
            .reveal(appeared, offset: 18)
          Spacer(minLength: 32)
        }
        .frame(width: size.width, height: size.height)
      }
    }

    private var railColumn: some View {
      VStack(alignment: .leading, spacing: 0) {
        Spacer(minLength: 12)
        hero(alignment: .leading, titleSize: 42)
          .reveal(appeared, offset: 16)
        Spacer(minLength: 28)
        actions(maxButtonWidth: .infinity, compact: false)
          .reveal(appeared, offset: 20)
        Spacer(minLength: 12)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  #endif

  #if os(iOS)
    private func phoneContent(size: CGSize, bottomInset: CGFloat) -> some View {
      VStack(spacing: 0) {
        Spacer(minLength: 12)

        brandStage(height: min(250, size.height * 0.30))
          .reveal(appeared, offset: 12)

        Spacer(minLength: 20)

        hero(alignment: .center, titleSize: 46)
          .reveal(appeared, offset: 16)

        Spacer(minLength: 28)

        actions(maxButtonWidth: .infinity, compact: true)
          .padding(.horizontal, 24)
          .frame(maxWidth: 420)
          .reveal(appeared, offset: 20)

        Spacer(minLength: max(24, bottomInset + 12))
      }
      .frame(width: size.width, height: size.height)
    }
  #endif

  private func brandStage(height: CGFloat) -> some View {
    EchoConversationStack()
      .scaleEffect(0.94)
      .frame(height: height)
      .frame(maxWidth: .infinity)
  }

  private func hero(alignment: HorizontalAlignment, titleSize: CGFloat) -> some View {
    VStack(alignment: alignment, spacing: 10) {
      EchoCopy.text("Welcome back")
        .font(.system(size: titleSize, weight: .heavy, design: .rounded))
        .tracking(-0.8)
        .foregroundStyle(EchoTheme.Color.fg)
        .multilineTextAlignment(alignment == .leading ? .leading : .center)
        .minimumScaleFactor(0.7)
        .lineLimit(1)
        .echoShadow(color: .black.opacity(0.35), radius: 24, y: 6)

      HStack(spacing: 7) {
        EchoCopy.text("to")
        EchoLogoMark(size: 24)
        EchoCopy.text("Echo")
      }
      .font(.system(size: 18, weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.66))
    }
    .frame(maxWidth: .infinity, alignment: alignment == .leading ? .leading : .center)
    .padding(.horizontal, alignment == .leading ? 0 : 24)
    .accessibilityElement(children: .combine)
  }

  private func actions(maxButtonWidth: CGFloat?, compact: Bool) -> some View {
    VStack(spacing: compact ? 6 : 10) {
      Button { onSelect(.signIn) } label: {
        HStack(spacing: 11) {
          EchoLogoMark(size: 24)
          EchoCopy.text("Sign in with Echo")
        }
        .font(.system(size: 17, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
        .frame(maxWidth: maxButtonWidth ?? .infinity, minHeight: compact ? 56 : 52)
        .background(
          EchoTheme.Color.signInBlue.opacity(0.22),
          in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      }
      .buttonStyle(EchoWelcomePressStyle())
      #if os(macOS)
        .keyboardShortcut(.defaultAction)
      #endif

      Button { onSelect(.register) } label: {
        EchoCopy.text("Create an account")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.78))
          .frame(maxWidth: maxButtonWidth ?? .infinity, minHeight: compact ? 46 : 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(EchoWelcomePressStyle())

      if let unlockTitle, let onUnlock {
        Button(action: onUnlock) {
          Label(unlockTitle, systemImage: unlockSystemImage)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.52))
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(EchoWelcomePressStyle())
      }
    }
  }

  private var unlockSystemImage: String {
    #if os(macOS)
      "touchid"
    #else
      "faceid"
    #endif
  }
}

/// Blurred, oversized Echo mark under a blue wash that fades into the launch
/// canvas — the native counterpart of the web mobile auth backdrop.
private struct EchoWelcomeBackdrop: View {
  let size: CGSize

  var body: some View {
    ZStack {
      Image("EchoLaunchLogo", bundle: .main)
        .resizable()
        .scaledToFit()
        .frame(width: size.width * 1.7)
        .rotationEffect(.degrees(-7))
        .blur(radius: 26)
        .saturation(1.25)
        .opacity(0.22)
        .position(x: size.width * 0.5, y: size.height * 0.42)

      RadialGradient(
        colors: [EchoTheme.Color.signInBlue.opacity(0.34), .clear],
        center: UnitPoint(x: 0.5, y: 0.04),
        startRadius: 0,
        endRadius: size.height * 0.55
      )

      RadialGradient(
        colors: [EchoTheme.Color.violetDeep.opacity(0.26), .clear],
        center: UnitPoint(x: 1.0, y: 1.0),
        startRadius: 0,
        endRadius: size.height * 0.6
      )

      LinearGradient(
        stops: [
          .init(color: .clear, location: 0),
          .init(color: EchoTheme.Color.launch.opacity(0.4), location: 0.5),
          .init(color: EchoTheme.Color.launch.opacity(0.92), location: 0.92),
          .init(color: EchoTheme.Color.launch, location: 1),
        ],
        startPoint: .top,
        endPoint: .bottom
      )
    }
    .frame(width: size.width, height: size.height)
    .clipped()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

struct EchoLogoMark: View {
  var size: CGFloat = 24

  var body: some View {
    Image("EchoLaunchLogo", bundle: .main)
      .resizable()
      .scaledToFill()
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
      .echoShadow(color: EchoTheme.Color.signInBlue.opacity(0.4), radius: 10, y: 3)
      .accessibilityHidden(true)
  }
}

struct EchoLaunchWordmark: View {
  var width: CGFloat = 240
  var height: CGFloat = 80

  var body: some View {
    Image("EchoLaunchWordmark", bundle: .main)
      .resizable()
      .scaledToFit()
      .frame(width: width, height: height)
      .accessibilityLabel(EchoCopy.string("Echo"))
  }
}

private struct EchoWelcomePressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .opacity(configuration.isPressed ? 0.8 : 1)
      .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
  }
}

extension View {
  fileprivate func reveal(_ shown: Bool, offset: CGFloat) -> some View {
    opacity(shown ? 1 : 0).offset(y: shown ? 0 : offset)
  }
}
