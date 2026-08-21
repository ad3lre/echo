import SwiftUI

enum SocialProvider: String {
  case apple = "Apple"
  case google = "Google"
  case discord = "Discord"
}

enum EchoAuthPage: Hashable {
  case welcome
  case register
  case signIn
}

enum EchoAuthMode {
  case register
  case signIn

  var title: String { self == .register ? EchoCopy.string("Create your Echo") : EchoCopy.string("Welcome back") }
  var subtitle: String {
    self == .register
      ? EchoCopy.string("A better place to talk starts here.") : EchoCopy.string("Sign in and pick up where you left off.")
  }
}

struct EchoAuthScreen: View {
  let mode: EchoAuthMode
  let model: EchoAuthenticationModel
  let onBack: () -> Void
  @State private var username = ""
  @State private var email = ""
  @State private var displayName = ""
  @State private var password = ""
  @State private var confirmPassword = ""
  @State private var mfaCode = ""

  private var isRegistration: Bool { mode == .register }
  private var canSubmit: Bool {
    EchoAuthenticationModel.canSubmitCredentials(
      isRegistration: isRegistration,
      username: username,
      password: password,
      email: email,
      confirmPassword: confirmPassword
    )
  }

  var body: some View {
    GeometryReader { proxy in
      ScrollView(showsIndicators: false) {
        VStack(spacing: 0) {
          HStack {
            Button(action: {
              if model.isMfaPending {
                model.cancelMfa()
                mfaCode = ""
              } else {
                onBack()
              }
            }) {
              Image(systemName: "chevron.left")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.82))
                .frame(width: 38, height: 38)
                .background(.white.opacity(0.07), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
              model.isMfaPending
                ? EchoCopy.string("Cancel verification")
                : EchoCopy.string("Back")
            )
            Spacer()
            EchoPageTrack(mode: mode)
          }
          .padding(.top, 22)

          if model.isMfaPending {
            mfaContent(proxy: proxy)
          } else {
            signInContent(proxy: proxy)
          }
        }
        .padding(.horizontal, 28)
        .frame(minHeight: proxy.size.height)
      }
      .safeAreaPadding(.top, 12)
      .safeAreaPadding(.bottom, 12)
    }
    .background(Color.clear)
  }

  @ViewBuilder
  private func mfaContent(proxy: GeometryProxy) -> some View {
    VStack(spacing: 0) {
      VStack(spacing: 0) {
        EchoCopy.text("Verify it’s you")
          .font(.system(size: 28, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
        Text(
          model.pendingMfaUsername.map { EchoCopy.format("Enter a code for %@.", $0) }
            ?? EchoCopy.string("Enter a code from your authenticator app, or a recovery code.")
        )
        .font(.system(size: 14, weight: .regular))
        .foregroundStyle(.white.opacity(0.60))
        .multilineTextAlignment(.center)
        .padding(.top, 8)
      }
      .padding(.top, 64)

      EchoAuthField(title: EchoCopy.string("Authentication or recovery code"), text: $mfaCode, isSecure: false)
        .padding(.top, 30)

      Button {
        Task { _ = await model.completeMfa(code: mfaCode) }
      } label: {
        EchoCopy.text("Verify")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 52)
      }
      .buttonStyle(EchoPrimaryButtonStyle())
      .accessibilityLabel(EchoCopy.string("Verify"))
      .disabled(mfaCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isWorking)
      .opacity(mfaCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
      .padding(.top, 18)
      .padding(.bottom, max(28, proxy.safeAreaInsets.bottom + 18))
    }
  }

  @ViewBuilder
  private func signInContent(proxy: GeometryProxy) -> some View {
    VStack(spacing: 0) {
      VStack(spacing: 0) {
        Text(mode.title)
          .font(.system(size: 28, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
        Text(mode.subtitle)
          .font(.system(size: 14, weight: .regular))
          .foregroundStyle(.white.opacity(0.60))
          .multilineTextAlignment(.center)
          .padding(.top, 8)
      }
      .padding(.top, 64)

      HStack(spacing: 12) {
        EchoQuickAuthButton(provider: .apple) { Task { await model.continueWith(.apple) } }
        EchoQuickAuthButton(provider: .google) { Task { await model.continueWith(.google) } }
      }
      .padding(.top, 30)

      HStack(spacing: 12) {
        Rectangle().fill(.white.opacity(0.10)).frame(height: 1)
        EchoCopy.text("or").font(.system(size: 12, weight: .medium)).foregroundStyle(
          .white.opacity(0.38))
        Rectangle().fill(.white.opacity(0.10)).frame(height: 1)
      }
      .padding(.top, 24)

      VStack(spacing: 11) {
        EchoAuthField(
          title: isRegistration ? EchoCopy.string("Username") : EchoCopy.string("Username or email"), text: $username,
          isSecure: false)
        if isRegistration {
          EchoAuthField(title: EchoCopy.string("Email"), text: $email, isSecure: false, isEmail: true)
          EchoAuthField(title: EchoCopy.string("Display name"), text: $displayName, isSecure: false)
        }
        EchoAuthField(title: EchoCopy.string("Password"), text: $password, isSecure: true)
        if isRegistration {
          EchoAuthField(title: EchoCopy.string("Confirm password"), text: $confirmPassword, isSecure: true)
        }
      }
      .padding(.top, 20)

      Button {
        submit()
      } label: {
        Text(isRegistration ? EchoCopy.string("Create account") : EchoCopy.string("Log in"))
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 52)
      }
      .buttonStyle(EchoPrimaryButtonStyle())
      .accessibilityLabel(
        isRegistration ? EchoCopy.string("Create account") : EchoCopy.string("Log in")
      )
      .disabled(!canSubmit || model.isWorking)
      .opacity(canSubmit ? 1 : 0.45)
      .padding(.top, 18)

      if !isRegistration {
        Button {
          Task { _ = await model.signInWithPasskey(username: username) }
        } label: {
          Label(EchoCopy.string("Sign in with Passkey"), systemImage: "person.badge.key.fill")
            .font(.system(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.92))
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(
              .white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Sign in with Passkey"))
        .disabled(model.isWorking)
        .padding(.top, 12)
      }

      Color.clear.frame(height: max(28, proxy.safeAreaInsets.bottom + 18))
    }
  }

  private func submit() {
    Task {
      if isRegistration {
        _ = await model.register(
          username: username, email: email, password: password, displayName: displayName)
      } else {
        _ = await model.signIn(username: username, password: password)
      }
    }
  }
}

private struct EchoPageTrack: View {
  let mode: EchoAuthMode
  var body: some View {
    HStack(spacing: 5) {
      Capsule().fill(.white.opacity(0.20)).frame(width: 22, height: 3)
      Capsule().fill(
        mode == .signIn ? EchoTheme.Color.signInBlue : .white.opacity(0.20)
      ).frame(width: 22, height: 3)
      Capsule().fill(
        mode == .register ? EchoTheme.Color.violetDeep : .white.opacity(0.20)
      ).frame(width: 22, height: 3)
    }
    .accessibilityHidden(true)
  }
}

private struct EchoAuthField: View {
  let title: String
  @Binding var text: String
  let isSecure: Bool
  var isEmail = false
  var body: some View {
    Group {
      if isSecure {
        SecureField(title, text: $text)
      } else {
        TextField(title, text: $text).echoAuthenticationTextEntry(isEmail: isEmail)
      }
    }
    .font(.system(size: 15, weight: .regular)).foregroundStyle(.white).tint(.white).textFieldStyle(
      .plain
    )
    .padding(.horizontal, 17).frame(maxWidth: .infinity, minHeight: 51)
    .background(.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous).fill(
        LinearGradient(
          colors: [.white.opacity(0.05), .clear], startPoint: .topLeading, endPoint: .bottomTrailing
        )
      ).allowsHitTesting(false)
    }
  }
}

private struct EchoQuickAuthButton: View {
  let provider: SocialProvider
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 9) {
        if provider == .apple {
          Image(systemName: "apple.logo").font(.system(size: 16, weight: .medium))
        } else {
          EchoCopy.text("G").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(
            EchoTheme.Color.authAccentBlue)
        }
        Text(provider.rawValue).font(.system(size: 14, weight: .medium, design: .rounded))
      }
      .foregroundStyle(.white.opacity(0.90)).frame(maxWidth: .infinity, minHeight: 48)
      .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 15, style: .continuous).fill(
          provider == .apple
            ? .white.opacity(0.08) : EchoTheme.Color.authAccentBlueDeep.opacity(0.14))
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.format("Continue with %@", provider.rawValue))
  }
}

private struct EchoPrimaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.headline.weight(.semibold)).foregroundStyle(.white).frame(
      maxWidth: .infinity, minHeight: 54
    )
    .background(
      LinearGradient(
        colors: [
          EchoTheme.Color.authGradientBlue.opacity(0.78),
          EchoTheme.Color.violetRich.opacity(0.74),
        ], startPoint: .leading, endPoint: .trailing),
      in: RoundedRectangle(cornerRadius: 18, style: .continuous)
    )
    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.24)))
    .shadow(color: .indigo.opacity(0.24), radius: 16, y: 8).opacity(
      configuration.isPressed ? 0.78 : 1)
  }
}

extension View {
  @ViewBuilder
  fileprivate func echoAuthenticationTextEntry(isEmail: Bool = false) -> some View {
    #if os(iOS)
      textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(
        isEmail ? .emailAddress : .default)
    #else
      self
    #endif
  }
}
