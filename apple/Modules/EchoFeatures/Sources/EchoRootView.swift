import SwiftUI

/// Composition root for the shared native experience.
///
/// This view owns routing and session lifecycle only; welcome, authentication,
/// and authenticated home surfaces live in their feature files.
public struct EchoRootView: View {
  @Environment(EchoAuthenticationModel.self) private var model
  @State private var showingEntryActions = false
  @State private var authPage: EchoAuthPage = .welcome

  public init() {}

  public var body: some View {
    @Bindable var model = model
    ZStack {
      Color(red: 0.005, green: 0.007, blue: 0.010).ignoresSafeArea()
      if model.isRestoringSession {
        EchoSessionRestoreView()
      } else if let session = model.activeSession {
        EchoHomeView(
          baseURL: model.apiBaseURL,
          userID: session.userID ?? ""
        ) {
          Task {
            await EchoPushRegistration.shared.stop()
            await model.signOut()
          }
        }
        .task(id: session.accessToken) {
          await EchoPushRegistration.shared.start(
            baseURL: model.apiBaseURL, accessToken: session.accessToken)
        }
        .task(id: session.refreshToken) {
          await runProactiveTokenRefresh()
        }
      } else {
        TabView(selection: $authPage) {
          EchoWelcomeView(
            showingEntryActions: $showingEntryActions,
            unlockTitle: model.hasStoredSession ? "Unlock with \(model.biometricLabel)" : nil,
            onUnlock: model.hasStoredSession
              ? {
                Task { await model.restoreStoredSessionIfNeeded() }
              } : nil
          ) { page in
            withAnimation(.easeInOut(duration: 0.28)) { authPage = page }
          }
          .tag(EchoAuthPage.welcome)
          EchoAuthScreen(mode: .signIn, model: model, onBack: returnToWelcome)
            .tag(EchoAuthPage.signIn)
          EchoAuthScreen(mode: .register, model: model, onBack: returnToWelcome)
            .tag(EchoAuthPage.register)
        }
        #if os(iOS)
          .tabViewStyle(.page(indexDisplayMode: .never))
        #else
          .tabViewStyle(.automatic)
        #endif
        .animation(.easeInOut(duration: 0.28), value: authPage)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // The launch and entry surfaces own the entire window, including the
    // areas behind the status bar and home indicator. Each child adds its
    // own safe-area padding where interactive content needs it.
    .ignoresSafeArea(.container, edges: .all)
    .preferredColorScheme(.dark)
    #if os(iOS)
      .statusBarHidden(true)
    #endif
    .persistentSystemOverlays(.hidden)
    .task { await model.restoreStoredSessionIfNeeded() }
    .alert(
      "Couldn’t continue",
      isPresented: Binding(
        get: { model.errorMessage != nil }, set: { if !$0 { model.dismissError() } })
    ) {
      Button("OK", role: .cancel) { model.dismissError() }
    } message: {
      Text(model.errorMessage ?? "")
    }
  }

  private func returnToWelcome() {
    withAnimation(.easeInOut(duration: 0.28)) {
      showingEntryActions = false
      authPage = .welcome
    }
  }

  /// Sleeps until ~60s before access-token expiry, then force-refreshes in a loop.
  private func runProactiveTokenRefresh() async {
    while let session = model.activeSession {
      let refreshAt = session.issuedAt.addingTimeInterval(TimeInterval(session.expiresInSec - 60))
      let delay = max(0, refreshAt.timeIntervalSinceNow)
      do {
        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      guard model.activeSession?.refreshToken == session.refreshToken else { return }
      _ = try? await model.ensureAccessToken(forceRefresh: true)
    }
  }
}

private struct EchoSessionRestoreView: View {
  var body: some View {
    GeometryReader { proxy in
      ZStack {
        Color(red: 0.005, green: 0.007, blue: 0.010)

        RadialGradient(
          colors: [
            Color(red: 0.13, green: 0.08, blue: 0.28).opacity(0.30),
            Color(red: 0.04, green: 0.12, blue: 0.28).opacity(0.16),
            .clear,
          ],
          center: UnitPoint(x: 0.50, y: 0.56),
          startRadius: 0,
          endRadius: 330
        )

        VStack(spacing: 7) {
          EchoLaunchWordmark()
          Text("A better place to talk.")
            .font(.system(size: 14, weight: .regular, design: .default))
            .foregroundStyle(.white.opacity(0.68))
        }
        .foregroundStyle(.white.opacity(0.96))
        .shadow(color: Color.purple.opacity(0.20), radius: 22)
      }
      .frame(width: proxy.size.width, height: proxy.size.height)
    }
    .ignoresSafeArea()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
