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

  var title: String { self == .register ? "Create your Echo" : "Welcome back" }
  var subtitle: String {
    self == .register
      ? "A better place to talk starts here." : "Sign in and pick up where you left off."
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
    let hasIdentity =
      !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    return isRegistration
      ? hasIdentity && !email.isEmpty && password == confirmPassword : hasIdentity
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
        Text("Verify it’s you")
          .font(.system(size: 28, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
        Text(
          model.pendingMfaUsername.map { "Enter a code for \($0)." }
            ?? "Enter a code from your authenticator app, or a recovery code."
        )
        .font(.system(size: 14, weight: .regular))
        .foregroundStyle(.white.opacity(0.60))
        .multilineTextAlignment(.center)
        .padding(.top, 8)
      }
      .padding(.top, 64)

      EchoAuthField(title: "Authentication or recovery code", text: $mfaCode, isSecure: false)
        .padding(.top, 30)

      Button {
        Task { _ = await model.completeMfa(code: mfaCode) }
      } label: {
        Text("Verify")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 52)
      }
      .buttonStyle(EchoPrimaryButtonStyle())
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
        Text("or").font(.system(size: 12, weight: .medium)).foregroundStyle(
          .white.opacity(0.38))
        Rectangle().fill(.white.opacity(0.10)).frame(height: 1)
      }
      .padding(.top, 24)

      VStack(spacing: 11) {
        EchoAuthField(
          title: isRegistration ? "Username" : "Username or email", text: $username,
          isSecure: false)
        if isRegistration {
          EchoAuthField(title: "Email", text: $email, isSecure: false, isEmail: true)
          EchoAuthField(title: "Display name", text: $displayName, isSecure: false)
        }
        EchoAuthField(title: "Password", text: $password, isSecure: true)
        if isRegistration {
          EchoAuthField(title: "Confirm password", text: $confirmPassword, isSecure: true)
        }
      }
      .padding(.top, 20)

      Button {
        submit()
      } label: {
        Text(isRegistration ? "Create account" : "Log in")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 52)
      }
      .buttonStyle(EchoPrimaryButtonStyle())
      .disabled(!canSubmit || model.isWorking)
      .opacity(canSubmit ? 1 : 0.45)
      .padding(.top, 18)

      if !isRegistration {
        Button {
          Task { _ = await model.signInWithPasskey(username: username) }
        } label: {
          Label("Sign in with Passkey", systemImage: "person.badge.key.fill")
            .font(.system(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.92))
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(
              .white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
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
        mode == .signIn ? Color(red: 0.10, green: 0.44, blue: 1.0) : .white.opacity(0.20)
      ).frame(width: 22, height: 3)
      Capsule().fill(
        mode == .register ? Color(red: 0.44, green: 0.30, blue: 1.0) : .white.opacity(0.20)
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
          Text("G").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(
            Color(red: 0.35, green: 0.60, blue: 1.0))
        }
        Text(provider.rawValue).font(.system(size: 14, weight: .medium, design: .rounded))
      }
      .foregroundStyle(.white.opacity(0.90)).frame(maxWidth: .infinity, minHeight: 48)
      .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 15, style: .continuous).fill(
          provider == .apple
            ? .white.opacity(0.08) : Color(red: 0.16, green: 0.30, blue: 0.72).opacity(0.14))
      }
    }
    .buttonStyle(.plain)
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
          Color(red: 0.31, green: 0.40, blue: 1.0).opacity(0.78),
          Color(red: 0.57, green: 0.28, blue: 0.96).opacity(0.74),
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
