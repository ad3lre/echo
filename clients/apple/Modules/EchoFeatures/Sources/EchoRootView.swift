import EchoNetworking
import SwiftUI

/// Composition root for the shared native experience.
///
/// This view owns routing and session lifecycle only; welcome, authentication,
/// and authenticated home surfaces live in their feature files.
public struct EchoRootView: View {
  @Environment(EchoAuthenticationModel.self) private var model
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.colorScheme) private var colorScheme

  @AppStorage(EchoDisplayPreferences.Keys.theme) private var theme = "dark"
  @AppStorage(EchoDisplayPreferences.Keys.syncTheme) private var syncTheme = false
  @AppStorage(EchoDisplayPreferences.Keys.density) private var density = "comfortable"
  @AppStorage(EchoDisplayPreferences.Keys.fontScale) private var fontScale = 100.0
  @AppStorage(EchoDisplayPreferences.Keys.saturateAccents) private var saturateAccents = false
  @AppStorage(EchoDisplayPreferences.Keys.reduceMotion) private var reduceMotion = false
  @AppStorage(EchoDisplayPreferences.Keys.largerText) private var largerText = false
  @AppStorage(EchoDisplayPreferences.Keys.highContrast) private var highContrast = false
  @AppStorage(EchoDisplayPreferences.Keys.messageSpacing) private var messageSpacing = true
  @AppStorage(EchoDisplayPreferences.Keys.dyslexiaFont) private var dyslexiaFont = false
  @AppStorage(EchoDisplayPreferences.Keys.solidGlass) private var solidGlass = false

  @State private var displayPrefs = EchoDisplayPreferences()
  @State private var showingEntryActions = false
  @State private var authPage: EchoAuthPage = .welcome

  public init() {}

  public var body: some View {
    @Bindable var model = model
    let _ = displayPrefs.sync(
      theme: theme,
      syncTheme: syncTheme,
      density: density,
      fontScale: fontScale,
      saturateAccents: saturateAccents,
      reduceMotion: reduceMotion,
      largerText: largerText,
      highContrast: highContrast,
      messageSpacing: messageSpacing,
      dyslexiaFont: dyslexiaFont,
      solidGlass: solidGlass
    )
    let scheme = displayPrefs.preferredColorScheme ?? colorScheme
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)

    ZStack {
      displayPrefs.launch(colorScheme: scheme).ignoresSafeArea()
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
    .echoApplyLiveAppearance(displayPrefs, systemScheme: colorScheme)
    .echoRespectReducedMotion()
    // Environment must wrap modifiers that read `EchoDisplayPreferences`
    // (glass / reduce-motion); applying it earlier crashes on launch.
    .environment(displayPrefs)
    .task {
      EchoDisplayPreferences.registerBundledFontsIfNeeded()
      EchoNetworkPath.startMonitoring()
      await model.restoreStoredSessionIfNeeded()
    }
    #if os(iOS)
      .statusBarHidden(true)
    #endif
    .persistentSystemOverlays(.hidden)
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
          animateAuth { authPage = page }
        }
      case .signIn:
        EchoAuthScreen(mode: .signIn, model: model, onBack: returnToWelcome)
      case .register:
        EchoAuthScreen(mode: .register, model: model, onBack: returnToWelcome)
      }
    }
    .animation(
      displayPrefs.prefersReducedMotion ? nil : .easeInOut(duration: 0.28),
      value: authPage
    )
  }

  private func returnToWelcome() {
    animateAuth {
      showingEntryActions = false
      authPage = .welcome
    }
  }

  private func animateAuth(_ updates: () -> Void) {
    if displayPrefs.prefersReducedMotion {
      updates()
    } else {
      withAnimation(.easeInOut(duration: 0.28), updates)
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
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        displayPrefs.launch(colorScheme: colorScheme)

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
            .font(displayPrefs.uiFont(size: 14))
            .foregroundStyle(displayPrefs.ink(0.68))
        }
        .foregroundStyle(displayPrefs.ink(0.96))
        .echoShadow(color: Color.purple.opacity(0.20), radius: 22)
      }
      .frame(width: proxy.size.width, height: proxy.size.height)
    }
    .ignoresSafeArea()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
