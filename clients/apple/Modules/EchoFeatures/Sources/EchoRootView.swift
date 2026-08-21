import EchoNetworking
import SwiftUI

/// Composition root for the shared native experience.
///
/// This view owns routing and session lifecycle only; welcome, authentication,
/// and authenticated home surfaces live in their feature files.
public struct EchoRootView: View {
  @Environment(EchoAuthenticationModel.self) private var model
  @Environment(\.scenePhase) private var scenePhase
  @State private var showingEntryActions = false
  @State private var authPage: EchoAuthPage = .welcome

  public init() {}

  public var body: some View {
    @Bindable var model = model
    ZStack {
      EchoTheme.Color.launch.ignoresSafeArea()
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
        authFlow
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
    .task {
      EchoNetworkPath.startMonitoring()
      await model.restoreStoredSessionIfNeeded()
    }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      EchoNetworkPath.startMonitoring()
    }
    .echoRetryOnNetworkRecovery {
      Task { await model.retryAfterNetworkRecovery() }
    }
    .alert(
      EchoCopy.string("Couldn’t continue"),
      isPresented: Binding(
        get: { model.errorMessage != nil }, set: { if !$0 { model.dismissError() } })
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) { model.dismissError() }
      if model.canRetryConnectivityRestore {
        Button(EchoCopy.string("Try again")) {
          Task { await model.retryAfterNetworkRecovery() }
        }
      }
    } message: {
      Text(model.errorMessage ?? "")
    }
  }

  @ViewBuilder
  private var authFlow: some View {
    Group {
      switch authPage {
      case .welcome:
        EchoWelcomeView(
          showingEntryActions: $showingEntryActions,
          unlockTitle: model.hasStoredSession
            ? EchoCopy.format("Unlock with %@", model.biometricLabel) : nil,
          onUnlock: model.hasStoredSession
            ? {
              Task { await model.restoreStoredSessionIfNeeded() }
            } : nil
        ) { page in
          withAnimation(.easeInOut(duration: 0.28)) { authPage = page }
        }
      case .signIn:
        EchoAuthScreen(mode: .signIn, model: model, onBack: returnToWelcome)
      case .register:
        EchoAuthScreen(mode: .register, model: model, onBack: returnToWelcome)
      }
    }
    .animation(.easeInOut(duration: 0.28), value: authPage)
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
        EchoTheme.Color.launch

        RadialGradient(
          colors: [
            EchoTheme.Color.launchGlowPurple.opacity(0.30),
            EchoTheme.Color.launchGlowBlue.opacity(0.16),
            .clear,
          ],
          center: UnitPoint(x: 0.50, y: 0.56),
          startRadius: 0,
          endRadius: 330
        )

        VStack(spacing: 7) {
          EchoLaunchWordmark()
          EchoCopy.text("A better place to talk.")
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
