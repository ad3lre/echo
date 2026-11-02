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

  @AppStorage(EchoDisplayPreferences.Keys.theme) private var theme = "amoled"
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

  @AppStorage(EchoAppLocale.storageKey) private var localeIdentifier = "en-US"

  @State private var displayPrefs = EchoDisplayPreferences()
  @State private var authPage: EchoAuthPage = .welcome
  #if os(macOS)
    @State private var mediaViewerHost = EchoMediaViewerHost()
  #endif

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
        EchoMainShellView(
          baseURL: model.apiBaseURL,
          userID: session.userID ?? ""
        ) {
          Task {
            let pushToken = await EchoPushRegistration.shared.stop()
            await model.signOut(pushDeviceToken: pushToken)
          }
        }
        .task(id: session.accessToken) {
          EchoChatMediaRetentionTouch.configure(auth: model, baseURL: model.apiBaseURL)
          await EchoCallRingtoneStore.shared.refreshCustoms(
            baseURL: model.apiBaseURL, auth: model)
          await EchoPushRegistration.shared.start(
            baseURL: model.apiBaseURL, accessToken: session.accessToken)
          await syncLocaleFromProfile(accessToken: session.accessToken)
        }
        .task(id: session.refreshToken) {
          await runProactiveTokenRefresh()
        }
      } else {
        authFlow
      }
    }
    #if os(macOS)
      .overlay {
        if let session = mediaViewerHost.session, let baseURL = mediaViewerHost.baseURL {
          EchoMediaViewer(
            session: session, baseURL: baseURL, accessToken: mediaViewerHost.accessToken
          ) {
            mediaViewerHost.session = nil
          }
        }
      }
      .environment(mediaViewerHost)
    #endif
    .onChange(of: model.activeSession?.userID, initial: true) { _, userID in
      let account = userID.map { "\(model.apiBaseURL.absoluteString)|\($0)" }
      EchoSoundPlayback.activate(accountID: account)
      EchoCustomEmojiCatalog.shared.activate(accountID: account)
      Task { await EchoMediaCaches.clear() }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // iPhone owns the full screen behind status / home indicator. macOS must
    // respect the title-bar safe area so profile banners aren’t clipped.
    #if os(iOS)
      .ignoresSafeArea(.container, edges: .all)
    #endif
    .echoApplyLiveAppearance(displayPrefs, systemScheme: colorScheme)
    .echoRespectReducedMotion()
    // Environment must wrap modifiers that read `EchoDisplayPreferences`
    // (glass / reduce-motion); applying it earlier crashes on launch.
    .environment(displayPrefs)
    .environment(\.locale, EchoAppLocale.swiftUILocale(from: localeIdentifier))
    .task {
      EchoDisplayPreferences.registerBundledFontsIfNeeded()
      EchoNetworkPath.startMonitoring()
      await EchoPendingPushCleanup.retry()
      await model.restoreStoredSessionIfNeeded()
    }
    #if os(iOS)
      .statusBarHidden(true)
      .persistentSystemOverlays(.hidden)
    #endif
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      EchoNetworkPath.startMonitoring()
    }
    .echoRetryOnNetworkRecovery {
      Task {
        await EchoPendingPushCleanup.retry()
        await model.retryAfterNetworkRecovery()
      }
    }
    .alert(
      EchoCopy.string("Couldn’t continue"),
      isPresented: Binding(
        get: { model.errorMessage != nil }, set: { if !$0 { model.dismissError() } })
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) { model.dismissError() }
      if model.canRetryConnectivityRestore {
        Button(EchoCopy.string("Try again")) {
          Task {
            await EchoPendingPushCleanup.retry()
            await model.retryAfterNetworkRecovery()
          }
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
          unlockTitle: {
            let requireUnlock = UserDefaults.standard.bool(
              forKey: EchoAuthenticationModel.requireSessionUnlockKey)
            guard requireUnlock, model.hasStoredSession else { return nil }
            return EchoCopy.format("Unlock with %@", model.biometricLabel)
          }(),
          onUnlock: {
            let requireUnlock = UserDefaults.standard.bool(
              forKey: EchoAuthenticationModel.requireSessionUnlockKey)
            guard requireUnlock, model.hasStoredSession else { return nil }
            return {
              Task { await model.restoreStoredSessionIfNeeded() }
            }
          }()
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
    animateAuth { authPage = .welcome }
  }

  private func animateAuth(_ updates: () -> Void) {
    if displayPrefs.prefersReducedMotion {
      updates()
    } else {
      withAnimation(.easeInOut(duration: 0.28), updates)
    }
  }

  /// Apply the auth-profile locale so in-app language matches the server after sign-in.
  private func syncLocaleFromProfile(accessToken: String) async {
    do {
      let client = EchoSettingsClient(baseURL: model.apiBaseURL)
      let identity = try await client.loadAccountIdentity(accessToken: accessToken)
      guard let value = identity.locale,
        EchoAppLocale.supportedIdentifiers.contains(value)
      else { return }
      localeIdentifier = value
    } catch {
      // Non-fatal: keep the locally stored language preference.
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
      do {
        _ = try await model.ensureAccessToken(forceRefresh: true)
      } catch {
        guard !Task.isCancelled, model.activeSession?.refreshToken == session.refreshToken else {
          return
        }
        do { try await Task.sleep(for: .seconds(5)) } catch { return }
      }
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
