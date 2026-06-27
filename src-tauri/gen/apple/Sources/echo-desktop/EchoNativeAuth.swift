import UIKit
import Security
import WebKit

// MARK: - Keychain Helper

final class EchoKeychain {
    static let service = "com.echo.ios.auth"
    static let sessionAccount = "session_memory"
    // Must match `KEYCHAIN_REFRESH_ACCOUNT` in src-tauri/src/ios_auth.rs so the
    // WebView's `bootstrapNativeBearerSessionFromKeychain()` (via the Rust
    // `ios_auth_get_refresh_token` command) can read the token native login wrote.
    static let refreshAccount = "refresh_token"

    static func readSession() -> [String: Any]? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: sessionAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json
    }

    static func hasStoredSession() -> Bool {
        return readSession() != nil
    }

    /// Upsert raw bytes for an account under the shared Echo service.
    @discardableResult
    static func write(account: String, data: Data) -> Bool {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        // Delete-then-add keeps parity with the Rust `security-framework` writer.
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = data
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    /// Persist the refresh token so the WebView can mint an access token via `/auth/refresh`.
    @discardableResult
    static func writeRefreshToken(_ token: String) -> Bool {
        guard let data = token.data(using: .utf8) else { return false }
        return write(account: refreshAccount, data: data)
    }

    /// Persist a session-memory snapshot so the *next* launch can show the
    /// "Opening Echo…" splash (restore path) instead of the login screen.
    /// Shape mirrors `StoredSessionMemory` in src-tauri/src/ios_auth.rs (camelCase).
    @discardableResult
    static func writeSessionMemory(from user: [String: Any], apiBase: String?) -> Bool {
        // Build a JSON-valid dictionary: only insert present String values (a Swift
        // Optional wrapped in Any is not a valid JSONSerialization value).
        var memory: [String: Any] = [
            "isGuest": user["isGuest"] as? Bool ?? false,
            "lastVerifiedAt": Int(Date().timeIntervalSince1970 * 1000)
        ]
        if let userId = user["id"] as? String { memory["userId"] = userId }
        if let displayName = user["displayName"] as? String { memory["displayName"] = displayName }
        if let username = user["username"] as? String { memory["username"] = username }
        if let pfp = user["pfp"] as? String { memory["pfp"] = pfp }
        if let apiBase = apiBase, !apiBase.isEmpty { memory["apiBase"] = apiBase }
        guard
            JSONSerialization.isValidJSONObject(memory),
            let data = try? JSONSerialization.data(withJSONObject: memory)
        else { return false }
        return write(account: sessionAccount, data: data)
    }
}

// MARK: - Native Auth Overlay

@objc public class EchoNativeAuthOverlay: NSObject {

    private static var overlayWindow: UIWindow?
    private static var loginVC: EchoLoginViewController?
    /// Configured prod API base (from the Rust shell). Stored for the session-memory
    /// snapshot; the bridge falls back to https://chat-echo.com when empty.
    static var apiBaseValue: String = ""

    /// Show the persistent splash overlay that covers the webview during boot.
    @objc public static func showSplashOverlay() {
        DispatchQueue.main.async {
            guard overlayWindow == nil else { return }
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }

            let window = UIWindow(windowScene: scene)
            window.windowLevel = .alert + 1
            window.backgroundColor = .clear

            let splashVC = EchoSplashViewController()
            window.rootViewController = splashVC
            window.makeKeyAndVisible()
            overlayWindow = window
        }
    }

    /// Transition from splash to native login screen.
    @objc public static func showLoginOverlay() {
        DispatchQueue.main.async {
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }

            if overlayWindow == nil {
                let window = UIWindow(windowScene: scene)
                window.windowLevel = .alert + 1
                window.backgroundColor = .clear
                window.makeKeyAndVisible()
                overlayWindow = window
            }

            let vc = EchoLoginViewController()
            loginVC = vc
            // Native auth succeeded: persist the refresh token (so the WebView's
            // `bootstrapNativeBearerSessionFromKeychain()` can restore) + a session
            // snapshot for the next launch. Returns false when the server did not
            // mint bearer tokens (AUTH_NATIVE_BEARER off) so the VC can surface an error.
            vc.onLoginComplete = { userData in
                guard
                    let auth = userData["auth"] as? [String: Any],
                    let refresh = auth["refreshToken"] as? String,
                    !refresh.isEmpty
                else {
                    return false
                }
                EchoKeychain.writeRefreshToken(refresh)
                if let user = userData["user"] as? [String: Any] {
                    EchoKeychain.writeSessionMemory(from: user, apiBase: apiBaseValue)
                }
                // Hold a splash over the WebView while JS exchanges the token; the
                // overlay is dismissed from Rust (`ios_auth_session_restored`).
                EchoNativeAuthOverlay.transitionToSplash(message: "Opening Echo…")
                return true
            }

            if overlayWindow?.rootViewController != nil {
                UIView.transition(with: overlayWindow!, duration: 0.3, options: .transitionCrossDissolve) {
                    self.overlayWindow?.rootViewController = vc
                }
            } else {
                overlayWindow?.rootViewController = vc
            }
        }
    }

    /// Swap the current overlay back to the splash screen (e.g. after a native
    /// login, while the WebView restores the session behind it).
    static func transitionToSplash(message: String) {
        DispatchQueue.main.async {
            guard let window = overlayWindow else { return }
            let splashVC = EchoSplashViewController()
            splashVC.initialStatus = message
            loginVC = nil
            UIView.transition(with: window, duration: 0.25, options: .transitionCrossDissolve) {
                window.rootViewController = splashVC
            }
        }
    }

    /// Dismiss the overlay with a smooth fade-out.
    @objc public static func dismissOverlay() {
        DispatchQueue.main.async {
            guard let window = overlayWindow else { return }
            UIView.animate(withDuration: 0.35, delay: 0, options: .curveEaseOut, animations: {
                window.alpha = 0
            }) { _ in
                window.isHidden = true
                window.rootViewController = nil
                overlayWindow = nil
                loginVC = nil
            }
        }
    }

    /// Called on app launch to determine boot path.
    /// - Shows a branded splash immediately (covers the WebView's white load).
    /// - If no stored session exists, transitions to the native login screen.
    /// When a session *does* exist the splash stays up until the WebView restores
    /// it and Rust calls `dismissOverlay()` via `ios_auth_session_restored`.
    @objc public static func performBootCheck() {
        showSplashOverlay()
        if !EchoKeychain.hasStoredSession() {
            showLoginOverlay()
        }
    }
}

// MARK: - C entry points (called from the Rust shell over FFI)

/// Configure the API base + run the boot check. Invoked once from Tauri `setup`.
@_cdecl("echo_ios_boot")
public func echo_ios_boot(_ apiBase: UnsafePointer<CChar>?) {
    let base = apiBase.map { String(cString: $0) } ?? ""
    EchoNativeAuthOverlay.apiBaseValue = base
    EchoNativeAuthBridge.shared.configure(apiBase: base)
    EchoPushDelegateProxy.install()
    EchoNativeAuthOverlay.performBootCheck()
}

/// Dismiss the overlay (WebView has adopted the session).
@_cdecl("echo_ios_dismiss_overlay")
public func echo_ios_dismiss_overlay() {
    EchoNativeAuthOverlay.dismissOverlay()
}

/// (Re)show the native login screen (session restore failed / logout).
@_cdecl("echo_ios_show_login")
public func echo_ios_show_login() {
    EchoNativeAuthOverlay.showLoginOverlay()
}

// MARK: - Splash Screen (shown during session check)

final class EchoSplashViewController: UIViewController {

    private let logoImageView = UIImageView()
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    /// Optional status text shown on first load (set before presentation).
    var initialStatus: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = EchoColors.background

        logoImageView.image = UIImage(named: "LaunchLogo")
        logoImageView.contentMode = .scaleAspectFit
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(logoImageView)

        statusLabel.text = initialStatus ?? "Opening Echo…"
        statusLabel.textColor = EchoColors.textSecondary
        statusLabel.font = .systemFont(ofSize: 15, weight: .medium)
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        spinner.color = EchoColors.textSecondary
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        view.addSubview(spinner)

        NSLayoutConstraint.activate([
            logoImageView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            logoImageView.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -40),
            logoImageView.widthAnchor.constraint(equalToConstant: 120),
            logoImageView.heightAnchor.constraint(equalToConstant: 120),

            statusLabel.topAnchor.constraint(equalTo: logoImageView.bottomAnchor, constant: 24),
            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            spinner.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    func updateStatus(_ text: String) {
        statusLabel.text = text
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return EchoColors.isDark ? .lightContent : .darkContent
    }
}

// MARK: - Native Login Screen
//
// Multi-step auth flow that mirrors the web mobile experience
// (frontend/src/features/auth/MobileAuthExperience.vue): a branded welcome page
// (brand hero → OAuth row → "Sign in with Echo" → "Create an account") that
// slides to dedicated login / register / forgot pages, over a gradient + blurred
// Echo glyph background. Passwordless is auto-presented on the welcome page when
// a passkey already exists for this RP (see autoPresentPasskeyIfAvailable).

final class EchoLoginViewController: UIViewController {

    private enum Page { case welcome, login, register, forgot }
    private enum NavDirection { case forward, back }

    private static let supportEmail = "support@app-echo.net"
    private static let signInUnavailableMessage =
        "Sign-in isn't available right now. Please try again."

    // Branded background (gradient glow + blurred glyph + bottom fade).
    private let bgGradientView = UIView()
    private let bgGlowLayer = CAGradientLayer()
    private let bgLogoView = UIImageView()
    private let bgShadowView = UIView()
    private let bgShadowLayer = CAGradientLayer()

    // Host that holds the current page; pages slide in/out of it.
    private let pageHost = UIView()
    private var currentPage: Page = .welcome
    private var currentPageView: UIView?

    // One spinner that dims the active page while a request is in flight.
    private let loadingSpinner = UIActivityIndicatorView(style: .large)

    // Per-page controls (reassigned every time a page is built).
    private weak var activeScroll: UIScrollView?
    private weak var errorLabel: UILabel?
    private weak var loginIdentField: EchoTextField?
    private weak var loginPasswordField: EchoTextField?
    private weak var registerEmailField: EchoTextField?
    private weak var registerUsernameField: EchoTextField?
    private weak var registerDisplayField: EchoTextField?
    private weak var registerPasswordField: EchoTextField?
    private weak var registerStrengthTrack: UIView?
    private weak var registerStrengthFill: UIView?
    private weak var registerStrengthWidth: NSLayoutConstraint?
    private weak var registerStrengthLabel: UILabel?
    private weak var forgotEmailField: EchoTextField?
    private weak var forgotSuccessLabel: UILabel?

    private var isLoading = false { didSet { updateLoadingState() } }
    private var didAutoAttemptPasskey = false

    /// Invoked after native login returns a session. Persists the bearer refresh
    /// token to the Keychain and returns `true` on success; `false` means the
    /// server did not mint bearer tokens (so the VC should surface an error).
    var onLoginComplete: (([String: Any]) -> Bool)?

    private lazy var blurredGlyph: UIImage? = {
        guard let base = UIImage(named: "LaunchLogo") else { return nil }
        return Self.gaussianBlurred(base, radius: 22)
    }()

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = EchoColors.background
        setupBackground()
        setupPageHost()
        setupLoadingSpinner()
        setupKeyboardObservers()
        refreshGradientColors()
        show(.welcome, direction: .forward, animated: false)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        autoPresentPasskeyIfAvailable()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        bgGlowLayer.frame = bgGradientView.bounds
        bgShadowLayer.frame = bgShadowView.bounds
        layoutBackgroundGlyph()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        if previous?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            refreshGradientColors()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return EchoColors.isDark ? .lightContent : .darkContent
    }

    // MARK: Background

    private func setupBackground() {
        bgGradientView.translatesAutoresizingMaskIntoConstraints = false
        bgGradientView.isUserInteractionEnabled = false
        bgGlowLayer.type = .radial
        bgGlowLayer.startPoint = CGPoint(x: 0.5, y: 0.0)
        bgGlowLayer.endPoint = CGPoint(x: 1.15, y: 0.8)
        bgGradientView.layer.addSublayer(bgGlowLayer)
        view.addSubview(bgGradientView)

        bgLogoView.translatesAutoresizingMaskIntoConstraints = false
        bgLogoView.isUserInteractionEnabled = false
        bgLogoView.contentMode = .scaleAspectFit
        bgLogoView.alpha = 0.16
        bgLogoView.image = blurredGlyph ?? UIImage(named: "LaunchLogo")
        view.addSubview(bgLogoView)

        bgShadowView.translatesAutoresizingMaskIntoConstraints = false
        bgShadowView.isUserInteractionEnabled = false
        bgShadowLayer.startPoint = CGPoint(x: 0.5, y: 0.5)
        bgShadowLayer.endPoint = CGPoint(x: 0.5, y: 1.0)
        bgShadowLayer.locations = [0.0, 0.75, 1.0]
        bgShadowView.layer.addSublayer(bgShadowLayer)
        view.addSubview(bgShadowView)

        NSLayoutConstraint.activate([
            bgGradientView.topAnchor.constraint(equalTo: view.topAnchor),
            bgGradientView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bgGradientView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bgGradientView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            bgShadowView.topAnchor.constraint(equalTo: view.topAnchor),
            bgShadowView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bgShadowView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bgShadowView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func refreshGradientColors() {
        let resolved = traitCollection
        let bg = EchoColors.background.resolvedColor(with: resolved)
        bgGlowLayer.colors = [
            EchoColors.accent.withAlphaComponent(0.22).cgColor,
            EchoColors.accent.withAlphaComponent(0.0).cgColor,
        ]
        bgShadowLayer.colors = [
            bg.withAlphaComponent(0.0).cgColor,
            bg.withAlphaComponent(0.85).cgColor,
            bg.cgColor,
        ]
    }

    private func layoutBackgroundGlyph() {
        let size = view.bounds.width * 1.7
        bgLogoView.transform = .identity
        bgLogoView.bounds = CGRect(x: 0, y: 0, width: size, height: size)
        bgLogoView.center = CGPoint(x: view.bounds.midX, y: view.bounds.height * 0.42)
        bgLogoView.transform = CGAffineTransform(rotationAngle: -7 * .pi / 180)
    }

    private static func gaussianBlurred(_ image: UIImage, radius: CGFloat) -> UIImage? {
        guard let ciInput = CIImage(image: image) else { return nil }
        let clamped = ciInput.clampedToExtent()
        guard let filter = CIFilter(name: "CIGaussianBlur") else { return nil }
        filter.setValue(clamped, forKey: kCIInputImageKey)
        filter.setValue(radius, forKey: kCIInputRadiusKey)
        guard let output = filter.outputImage else { return nil }
        let context = CIContext(options: nil)
        guard let cg = context.createCGImage(output, from: ciInput.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    // MARK: Page host + loading

    private func setupPageHost() {
        pageHost.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(pageHost)

        let width = pageHost.widthAnchor.constraint(equalTo: view.widthAnchor)
        width.priority = .defaultHigh

        NSLayoutConstraint.activate([
            pageHost.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            pageHost.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            pageHost.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            pageHost.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor),
            pageHost.widthAnchor.constraint(lessThanOrEqualToConstant: 460),
            width,
        ])
    }

    private func setupLoadingSpinner() {
        loadingSpinner.translatesAutoresizingMaskIntoConstraints = false
        loadingSpinner.color = EchoColors.accent
        loadingSpinner.hidesWhenStopped = true
        view.addSubview(loadingSpinner)
        NSLayoutConstraint.activate([
            loadingSpinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingSpinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func updateLoadingState() {
        pageHost.isUserInteractionEnabled = !isLoading
        UIView.animate(withDuration: 0.15) {
            self.pageHost.alpha = self.isLoading ? 0.55 : 1.0
        }
        if isLoading {
            view.endEditing(true)
            loadingSpinner.startAnimating()
        } else {
            loadingSpinner.stopAnimating()
        }
    }

    // MARK: Navigation

    private func show(_ page: Page, direction: NavDirection, animated: Bool) {
        let newView = buildPage(page)
        newView.translatesAutoresizingMaskIntoConstraints = false
        pageHost.addSubview(newView)
        NSLayoutConstraint.activate([
            newView.topAnchor.constraint(equalTo: pageHost.topAnchor),
            newView.leadingAnchor.constraint(equalTo: pageHost.leadingAnchor),
            newView.trailingAnchor.constraint(equalTo: pageHost.trailingAnchor),
            newView.bottomAnchor.constraint(equalTo: pageHost.bottomAnchor),
        ])

        let old = currentPageView
        currentPageView = newView
        currentPage = page

        guard animated, !UIAccessibility.isReduceMotionEnabled else {
            old?.removeFromSuperview()
            return
        }

        pageHost.layoutIfNeeded()
        let dx = (direction == .forward ? 1 : -1) * pageHost.bounds.width
        newView.transform = CGAffineTransform(translationX: dx, y: 0)
        newView.alpha = 0
        UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseInOut], animations: {
            newView.transform = .identity
            newView.alpha = 1
            old?.transform = CGAffineTransform(translationX: -dx * 0.5, y: 0)
            old?.alpha = 0
        }, completion: { _ in
            old?.removeFromSuperview()
        })
    }

    private func buildPage(_ page: Page) -> UIView {
        switch page {
        case .welcome: return makeWelcomePage()
        case .login: return makeLoginPage()
        case .register: return makeRegisterPage()
        case .forgot: return makeForgotPage()
        }
    }

    // MARK: Welcome page

    private func makeWelcomePage() -> UIView {
        let page = UIView()

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false

        // Hero — "Welcome back" + "to [logo] Echo"
        let title = UILabel()
        title.text = "Welcome back"
        title.font = .systemFont(ofSize: 36, weight: .heavy)
        title.textColor = EchoColors.textPrimary
        title.textAlignment = .center

        let subtitle = makeBrandSubtitle()

        let hero = UIStackView(arrangedSubviews: [title, subtitle])
        hero.axis = .vertical
        hero.alignment = .center
        hero.spacing = 8

        let error = makeErrorLabel()

        // OAuth row — Discord + Google share a single row.
        let discord = EchoOAuthButton(provider: .discord)
        discord.addAction(UIAction { [weak self] _ in self?.startOAuth("discord") }, for: .touchUpInside)
        let google = EchoOAuthButton(provider: .google)
        google.addAction(UIAction { [weak self] _ in self?.startOAuth("google") }, for: .touchUpInside)
        let oauthRow = UIStackView(arrangedSubviews: [discord, google])
        oauthRow.axis = .horizontal
        oauthRow.distribution = .fillEqually
        oauthRow.spacing = 12
        discord.heightAnchor.constraint(equalToConstant: 50).isActive = true
        google.heightAnchor.constraint(equalToConstant: 50).isActive = true

        // "Sign in with Echo" surface CTA
        let echoCta = makeEchoCtaButton()
        echoCta.addAction(UIAction { [weak self] _ in self?.show(.login, direction: .forward, animated: true) }, for: .touchUpInside)

        // "Create an account" ghost
        let create = UIButton(type: .system)
        create.setTitle("Create an account", for: .normal)
        create.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        create.setTitleColor(EchoColors.textSecondary, for: .normal)
        create.addAction(UIAction { [weak self] _ in self?.show(.register, direction: .forward, animated: true) }, for: .touchUpInside)
        create.heightAnchor.constraint(equalToConstant: 32).isActive = true

        stack.addArrangedSubview(hero)
        stack.addArrangedSubview(error)
        stack.addArrangedSubview(oauthRow)
        stack.addArrangedSubview(echoCta)
        stack.addArrangedSubview(create)
        stack.addArrangedSubview(makeWelcomeFooter())

        stack.setCustomSpacing(26, after: hero)
        stack.setCustomSpacing(10, after: error)
        stack.setCustomSpacing(12, after: oauthRow)
        stack.setCustomSpacing(6, after: echoCta)
        stack.setCustomSpacing(22, after: create)

        page.addSubview(stack)
        let top = stack.topAnchor.constraint(greaterThanOrEqualTo: page.topAnchor, constant: 12)
        top.priority = .required
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: page.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: page.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: page.trailingAnchor, constant: -24),
            top,
            stack.bottomAnchor.constraint(lessThanOrEqualTo: page.bottomAnchor, constant: -12),
        ])

        activeScroll = nil
        return page
    }

    private func makeBrandSubtitle() -> UIView {
        let to = UILabel()
        to.text = "to"
        to.font = .systemFont(ofSize: 16, weight: .medium)
        to.textColor = EchoColors.textSecondary

        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.layer.cornerRadius = 5
        logo.clipsToBounds = true
        logo.translatesAutoresizingMaskIntoConstraints = false
        logo.widthAnchor.constraint(equalToConstant: 22).isActive = true
        logo.heightAnchor.constraint(equalToConstant: 22).isActive = true

        let echo = UILabel()
        echo.text = "Echo"
        echo.font = .systemFont(ofSize: 16, weight: .semibold)
        echo.textColor = EchoColors.textSecondary

        let row = UIStackView(arrangedSubviews: [to, logo, echo])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 7
        return row
    }

    private func makeEchoCtaButton() -> UIButton {
        let button = UIButton(type: .system)
        button.backgroundColor = EchoColors.surface
        button.layer.cornerRadius = 14
        button.layer.borderWidth = 1
        button.layer.borderColor = EchoColors.fieldBorder.cgColor
        button.heightAnchor.constraint(equalToConstant: 52).isActive = true

        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.layer.cornerRadius = 5
        logo.clipsToBounds = true
        logo.translatesAutoresizingMaskIntoConstraints = false
        logo.widthAnchor.constraint(equalToConstant: 22).isActive = true
        logo.heightAnchor.constraint(equalToConstant: 22).isActive = true

        let label = UILabel()
        label.text = "Sign in with Echo"
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textColor = EchoColors.textPrimary

        let row = UIStackView(arrangedSubviews: [logo, label])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 10
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(row)
        NSLayoutConstraint.activate([
            row.centerXAnchor.constraint(equalTo: button.centerXAnchor),
            row.centerYAnchor.constraint(equalTo: button.centerYAnchor),
        ])
        return button
    }

    private func makeWelcomeFooter() -> UIView {
        let guest = UIButton(type: .system)
        guest.setTitle("Continue as guest", for: .normal)
        guest.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
        guest.setTitleColor(EchoColors.textSecondary, for: .normal)
        guest.addAction(UIAction { [weak self] _ in self?.continueAsGuest() }, for: .touchUpInside)

        let legal = UILabel()
        legal.text = "Continuing means you accept our Terms of Service and Privacy Policy."
        legal.font = .systemFont(ofSize: 12, weight: .regular)
        legal.textColor = EchoColors.textTertiary
        legal.textAlignment = .center
        legal.numberOfLines = 0

        let support = UIButton(type: .system)
        support.setTitle("Support · \(Self.supportEmail)", for: .normal)
        support.titleLabel?.font = .systemFont(ofSize: 12, weight: .regular)
        support.setTitleColor(EchoColors.textTertiary, for: .normal)
        support.addAction(UIAction { _ in
            if let url = URL(string: "mailto:\(Self.supportEmail)") {
                UIApplication.shared.open(url)
            }
        }, for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [guest, legal, support])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 6
        return stack
    }

    // MARK: Login page

    private func makeLoginPage() -> UIView {
        let (page, stack) = makeFormPage(title: "Log in", backTo: .welcome, backDirection: .back)

        let error = makeErrorLabel()

        let ident = EchoTextField(placeholder: "you@example.com")
        ident.textField.autocapitalizationType = .none
        ident.textField.autocorrectionType = .no
        ident.textField.keyboardType = .emailAddress
        ident.textField.textContentType = .username
        ident.textField.returnKeyType = .next
        loginIdentField = ident

        let password = EchoTextField(placeholder: "••••••••", isSecure: true)
        password.textField.textContentType = .password
        password.textField.returnKeyType = .go
        password.textField.addAction(UIAction { [weak self] _ in self?.submitLogin() }, for: .editingDidEndOnExit)
        loginPasswordField = password

        let forgot = UIButton(type: .system)
        forgot.setTitle("Forgot password?", for: .normal)
        forgot.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        forgot.setTitleColor(EchoColors.accent, for: .normal)
        forgot.contentHorizontalAlignment = .trailing
        forgot.addAction(UIAction { [weak self] _ in self?.show(.forgot, direction: .forward, animated: true) }, for: .touchUpInside)

        let submit = makePrimaryButton(title: "Log in")
        submit.addAction(UIAction { [weak self] _ in self?.submitLogin() }, for: .touchUpInside)

        let switchRow = makeInlinePrompt(
            muted: "New to Echo?",
            action: "Create an account"
        ) { [weak self] in self?.show(.register, direction: .forward, animated: true) }

        stack.addArrangedSubview(error)
        stack.addArrangedSubview(fieldGroup(title: "Username or email", field: ident))
        stack.addArrangedSubview(fieldGroup(title: "Password", field: password))
        stack.addArrangedSubview(forgot)
        stack.addArrangedSubview(submit)
        stack.addArrangedSubview(switchRow)
        stack.setCustomSpacing(18, after: forgot)
        return page
    }

    // MARK: Register page

    private func makeRegisterPage() -> UIView {
        let (page, stack) = makeFormPage(title: "Create account", backTo: .welcome, backDirection: .back)

        let error = makeErrorLabel()

        let email = EchoTextField(placeholder: "you@example.com")
        email.textField.autocapitalizationType = .none
        email.textField.autocorrectionType = .no
        email.textField.keyboardType = .emailAddress
        email.textField.textContentType = .emailAddress
        registerEmailField = email

        let username = EchoTextField(placeholder: "your_handle")
        username.textField.autocapitalizationType = .none
        username.textField.autocorrectionType = .no
        username.textField.textContentType = .username
        registerUsernameField = username

        let display = EchoTextField(placeholder: "How others see you")
        display.textField.textContentType = .nickname
        registerDisplayField = display

        let password = EchoTextField(placeholder: "At least 8 characters", isSecure: true)
        password.textField.textContentType = .newPassword
        password.textField.addAction(UIAction { [weak self] _ in self?.updatePasswordStrength() }, for: .editingChanged)
        registerPasswordField = password

        let submit = makePrimaryButton(title: "Create account")
        submit.addAction(UIAction { [weak self] _ in self?.submitRegister() }, for: .touchUpInside)

        let switchRow = makeInlinePrompt(
            muted: "Already have one?",
            action: "Sign in"
        ) { [weak self] in self?.show(.login, direction: .forward, animated: true) }

        let legal = UILabel()
        legal.text = "By signing up you agree to our Terms of Service and Privacy Policy."
        legal.font = .systemFont(ofSize: 12, weight: .regular)
        legal.textColor = EchoColors.textTertiary
        legal.textAlignment = .center
        legal.numberOfLines = 0

        stack.addArrangedSubview(error)
        stack.addArrangedSubview(fieldGroup(title: "Email", field: email))
        stack.addArrangedSubview(fieldGroup(title: "Username", field: username))
        stack.addArrangedSubview(fieldGroup(title: "Display name (optional)", field: display))
        stack.addArrangedSubview(fieldGroup(title: "Password", field: password))
        stack.addArrangedSubview(makeStrengthMeter())
        stack.addArrangedSubview(submit)
        stack.addArrangedSubview(switchRow)
        stack.addArrangedSubview(legal)
        return page
    }

    // MARK: Forgot page

    private func makeForgotPage() -> UIView {
        let (page, stack) = makeFormPage(title: "Forgot password", backTo: .login, backDirection: .back)

        let error = makeErrorLabel()

        let blurb = UILabel()
        blurb.text = "Enter the email on your account. We'll send a reset link if we find a match."
        blurb.font = .systemFont(ofSize: 14, weight: .regular)
        blurb.textColor = EchoColors.textSecondary
        blurb.numberOfLines = 0

        let email = EchoTextField(placeholder: "you@example.com")
        email.textField.autocapitalizationType = .none
        email.textField.autocorrectionType = .no
        email.textField.keyboardType = .emailAddress
        email.textField.textContentType = .emailAddress
        forgotEmailField = email

        let success = UILabel()
        success.font = .systemFont(ofSize: 13, weight: .medium)
        success.textColor = EchoColors.success
        success.numberOfLines = 0
        success.isHidden = true
        forgotSuccessLabel = success

        let submit = makePrimaryButton(title: "Send reset link")
        submit.addAction(UIAction { [weak self] _ in self?.submitForgot() }, for: .touchUpInside)

        stack.addArrangedSubview(error)
        stack.addArrangedSubview(blurb)
        stack.addArrangedSubview(fieldGroup(title: "Email", field: email))
        stack.addArrangedSubview(success)
        stack.addArrangedSubview(submit)
        return page
    }

    // MARK: Form scaffolding

    /// A page with a back/title header and a scrollable, top-aligned form stack.
    private func makeFormPage(title: String, backTo: Page, backDirection: NavDirection) -> (UIView, UIStackView) {
        let page = UIView()

        let back = UIButton(type: .system)
        back.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        back.tintColor = EchoColors.textPrimary
        back.translatesAutoresizingMaskIntoConstraints = false
        back.addAction(UIAction { [weak self] _ in self?.show(backTo, direction: backDirection, animated: true) }, for: .touchUpInside)

        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 17, weight: .bold)
        titleLabel.textColor = EchoColors.textPrimary
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(back)
        header.addSubview(titleLabel)
        page.addSubview(header)

        let scroll = UIScrollView()
        scroll.alwaysBounceVertical = true
        scroll.keyboardDismissMode = .interactive
        scroll.showsVerticalScrollIndicator = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        page.addSubview(scroll)
        activeScroll = scroll

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: page.topAnchor),
            header.leadingAnchor.constraint(equalTo: page.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: page.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 48),

            back.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            back.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            back.widthAnchor.constraint(equalToConstant: 40),
            back.heightAnchor.constraint(equalToConstant: 40),

            titleLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: header.centerYAnchor),

            scroll.topAnchor.constraint(equalTo: header.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: page.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: page.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: page.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 18),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -18),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -24),
        ])

        return (page, stack)
    }

    private func fieldGroup(title: String, field: EchoTextField) -> UIView {
        let label = UILabel()
        label.text = title
        label.font = .systemFont(ofSize: 13, weight: .semibold)
        label.textColor = EchoColors.textSecondary

        field.heightAnchor.constraint(equalToConstant: 50).isActive = true

        let stack = UIStackView(arrangedSubviews: [label, field])
        stack.axis = .vertical
        stack.spacing = 6
        return stack
    }

    private func makeErrorLabel() -> UILabel {
        let label = UILabel()
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.textColor = EchoColors.error
        label.textAlignment = .center
        label.numberOfLines = 0
        label.isHidden = true
        errorLabel = label
        return label
    }

    private func makePrimaryButton(title: String) -> EchoPrimaryButton {
        let button = EchoPrimaryButton(title: title)
        button.heightAnchor.constraint(equalToConstant: 50).isActive = true
        return button
    }

    private func makeInlinePrompt(muted: String, action: String, handler: @escaping () -> Void) -> UIView {
        let mutedLabel = UILabel()
        mutedLabel.text = muted
        mutedLabel.font = .systemFont(ofSize: 14, weight: .regular)
        mutedLabel.textColor = EchoColors.textSecondary

        let actionButton = UIButton(type: .system)
        actionButton.setTitle(action, for: .normal)
        actionButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        actionButton.setTitleColor(EchoColors.accent, for: .normal)
        actionButton.addAction(UIAction { _ in handler() }, for: .touchUpInside)

        let row = UIStackView(arrangedSubviews: [mutedLabel, actionButton])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 6

        let center = UIStackView(arrangedSubviews: [UIView(), row, UIView()])
        center.axis = .horizontal
        center.distribution = .equalCentering
        return center
    }

    private func makeStrengthMeter() -> UIView {
        let track = UIView()
        track.backgroundColor = EchoColors.fieldBorder
        track.layer.cornerRadius = 3
        track.clipsToBounds = true
        track.translatesAutoresizingMaskIntoConstraints = false
        registerStrengthTrack = track

        let fill = UIView()
        fill.backgroundColor = EchoColors.error
        fill.layer.cornerRadius = 3
        fill.translatesAutoresizingMaskIntoConstraints = false
        track.addSubview(fill)
        registerStrengthFill = fill

        let width = fill.widthAnchor.constraint(equalToConstant: 0)
        registerStrengthWidth = width

        let label = UILabel()
        label.font = .systemFont(ofSize: 12, weight: .medium)
        label.textColor = EchoColors.textTertiary
        label.textAlignment = .right
        label.text = " "
        registerStrengthLabel = label

        NSLayoutConstraint.activate([
            track.heightAnchor.constraint(equalToConstant: 6),
            fill.leadingAnchor.constraint(equalTo: track.leadingAnchor),
            fill.topAnchor.constraint(equalTo: track.topAnchor),
            fill.bottomAnchor.constraint(equalTo: track.bottomAnchor),
            width,
        ])

        let stack = UIStackView(arrangedSubviews: [track, label])
        stack.axis = .vertical
        stack.spacing = 5
        stack.isHidden = true
        // Toggle visibility from updatePasswordStrength via the track's superview.
        return stack
    }

    private func updatePasswordStrength() {
        guard
            let fill = registerStrengthFill,
            let track = registerStrengthTrack,
            let width = registerStrengthWidth,
            let label = registerStrengthLabel
        else { return }
        // Meter stack is the track's direct superview (arranged subview parent).
        let meter = track.superview as? UIStackView
        let password = registerPasswordField?.textField.text ?? ""
        meter?.isHidden = password.isEmpty
        view.layoutIfNeeded()

        let (fraction, text, color) = Self.passwordStrength(password)
        width.constant = track.bounds.width * fraction
        label.text = text
        UIView.animate(withDuration: 0.2) {
            fill.backgroundColor = color
            track.layoutIfNeeded()
        }
    }

    private static func passwordStrength(_ password: String) -> (CGFloat, String, UIColor) {
        if password.isEmpty { return (0, " ", EchoColors.error) }
        var score = 0
        if password.count >= 8 { score += 1 }
        if password.count >= 12 { score += 1 }
        if password.range(of: "[A-Z]", options: .regularExpression) != nil &&
            password.range(of: "[a-z]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[0-9]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil { score += 1 }

        switch score {
        case 0...1: return (0.28, "Weak", UIColor(red: 0.96, green: 0.25, blue: 0.37, alpha: 1))
        case 2: return (0.5, "Fair", UIColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1))
        case 3...4: return (0.78, "Good", UIColor(red: 0.06, green: 0.72, blue: 0.51, alpha: 1))
        default: return (1.0, "Strong", UIColor(red: 0.08, green: 0.72, blue: 0.65, alpha: 1))
        }
    }

    // MARK: Passkey auto-present

    /// Auto-present the system passkey sheet **only if a credential already
    /// exists** for this RP. Uses `.preferImmediatelyAvailableCredentials` so an
    /// absent passkey fails silently (no sheet, no error) and the user just sees
    /// the welcome page — this is the "popup modal upon detection of existence"
    /// behaviour that replaces the old explicit passkey button. Fires once per
    /// appearance, and only on the welcome page.
    private func autoPresentPasskeyIfAvailable() {
        guard !didAutoAttemptPasskey, currentPage == .welcome else { return }
        didAutoAttemptPasskey = true
        guard #available(iOS 16.0, *) else { return }

        let anchor = view.window
            ?? (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.windows.first
            ?? UIWindow()

        EchoNativeAuthBridge.shared.performPasskeyLogin(
            username: nil,
            anchor: anchor,
            preferImmediatelyAvailable: true
        ) { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                switch result {
                case .success(let userData):
                    self.handleAuthSuccess(userData)
                case .failure:
                    // No passkey available, or the user dismissed the sheet —
                    // stay on the welcome page silently (do not surface an error).
                    break
                }
            }
        }
    }

    // MARK: Auth actions

    private func submitLogin() {
        clearError()
        let ident = loginIdentField?.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = loginPasswordField?.textField.text ?? ""
        guard !ident.isEmpty else { showError("Enter your username or email."); return }
        guard !password.isEmpty else { showError("Enter your password."); return }

        isLoading = true
        EchoNativeAuthBridge.shared.performLogin(
            username: ident,
            password: password,
            isRegister: false
        ) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let userData): self?.handleAuthSuccess(userData)
                case .failure(let error): self?.showError(error.localizedDescription)
                }
            }
        }
    }

    private func submitRegister() {
        clearError()
        let email = registerEmailField?.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let username = registerUsernameField?.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let display = registerDisplayField?.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = registerPasswordField?.textField.text ?? ""

        guard !username.isEmpty, !password.isEmpty else { showError("Choose a username and password."); return }
        guard email.contains("@") else { showError("Enter a valid email address."); return }
        guard password.count >= 8 else { showError("Password must be at least 8 characters."); return }

        isLoading = true
        EchoNativeAuthBridge.shared.performLogin(
            username: username,
            password: password,
            isRegister: true,
            email: email,
            displayName: display.isEmpty ? nil : display
        ) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let userData): self?.handleAuthSuccess(userData)
                case .failure(let error): self?.showError(error.localizedDescription)
                }
            }
        }
    }

    private func submitForgot() {
        clearError()
        forgotSuccessLabel?.isHidden = true
        let email = forgotEmailField?.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard email.contains("@") else { showError("Enter a valid email address."); return }

        isLoading = true
        EchoNativeAuthBridge.shared.forgotPassword(email: email) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success:
                    self?.forgotSuccessLabel?.text = "If an account exists for that email, you'll receive reset instructions."
                    self?.forgotSuccessLabel?.isHidden = false
                case .failure(let error):
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    private func startOAuth(_ provider: String) {
        clearError()
        isLoading = true
        EchoNativeAuthBridge.shared.startOAuthFlow(provider: provider) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success: break
                case .failure(let error): self?.showError(error.localizedDescription)
                }
            }
        }
    }

    private func continueAsGuest() {
        clearError()
        isLoading = true
        EchoNativeAuthBridge.shared.continueAsGuest { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let userData): self?.handleAuthSuccess(userData)
                case .failure(let error): self?.showError(error.localizedDescription)
                }
            }
        }
    }

    /// Apply a native-auth result: hand off on success, show an error otherwise.
    private func handleAuthSuccess(_ userData: [String: Any]) {
        if onLoginComplete?(userData) == true {
            // Overlay transitions to splash inside the handoff; nothing else to do.
        } else {
            showError(Self.signInUnavailableMessage)
        }
    }

    // MARK: Error display

    private func showError(_ message: String) {
        guard let label = errorLabel else { return }
        label.text = message
        label.isHidden = false
        UIView.animate(withDuration: 0.2) { self.view.layoutIfNeeded() }
    }

    private func clearError() {
        errorLabel?.isHidden = true
        errorLabel?.text = nil
    }

    // MARK: Keyboard

    private func setupKeyboardObservers() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillShow(_:)),
                                               name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillHide(_:)),
                                               name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard
            let scroll = activeScroll,
            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
        else { return }
        let inset = max(0, frame.height - view.safeAreaInsets.bottom)
        scroll.contentInset.bottom = inset
        scroll.verticalScrollIndicatorInsets.bottom = inset
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        activeScroll?.contentInset.bottom = 0
        activeScroll?.verticalScrollIndicatorInsets.bottom = 0
    }
}

// MARK: - Custom UI Components

final class EchoTextField: UIView {
    let textField = UITextField()
    private let containerView = UIView()

    init(placeholder: String, isSecure: Bool = false) {
        super.init(frame: .zero)

        containerView.backgroundColor = EchoColors.fieldBackground
        containerView.layer.cornerRadius = 12
        containerView.layer.borderWidth = 1
        containerView.layer.borderColor = EchoColors.fieldBorder.cgColor
        containerView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(containerView)

        textField.placeholder = placeholder
        textField.textColor = EchoColors.textPrimary
        textField.font = .systemFont(ofSize: 16)
        textField.isSecureTextEntry = isSecure
        textField.translatesAutoresizingMaskIntoConstraints = false
        textField.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: EchoColors.textTertiary]
        )
        containerView.addSubview(textField)

        NSLayoutConstraint.activate([
            containerView.topAnchor.constraint(equalTo: topAnchor),
            containerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            containerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            containerView.bottomAnchor.constraint(equalTo: bottomAnchor),

            textField.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 4),
            textField.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            textField.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            textField.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -4),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }
}

final class EchoPrimaryButton: UIButton {
    enum Style { case primary, secondary }

    init(title: String) {
        super.init(frame: .zero)
        setTitle(title, for: .normal)
        titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        layer.cornerRadius = 12
        setStyle(.primary)
    }

    required init?(coder: NSCoder) { fatalError() }

    func setStyle(_ style: Style) {
        switch style {
        case .primary:
            backgroundColor = EchoColors.accent
            setTitleColor(.white, for: .normal)
        case .secondary:
            backgroundColor = EchoColors.fieldBackground
            setTitleColor(EchoColors.accent, for: .normal)
            layer.borderWidth = 1
            layer.borderColor = EchoColors.fieldBorder.cgColor
        }
    }
}

enum OAuthProvider {
    case discord, google

    /// Compact label used now that Discord + Google share a single row.
    var shortTitle: String {
        switch self {
        case .discord: return "Discord"
        case .google: return "Google"
        }
    }

    /// Asset-catalog imageset name (brand SVGs imported under Assets.xcassets).
    var assetName: String {
        switch self {
        case .discord: return "DiscordLogo"
        case .google: return "GoogleLogo"
        }
    }

    /// Single-color marks (Discord) are tinted to the button's text color; the
    /// multicolor Google "G" must render with its original colors.
    var tintsLogo: Bool {
        switch self {
        case .discord: return true
        case .google: return false
        }
    }

    var color: UIColor {
        switch self {
        case .discord: return UIColor(red: 88/255, green: 101/255, blue: 242/255, alpha: 1)
        case .google: return .white
        }
    }

    var textColor: UIColor {
        switch self {
        case .discord: return .white
        case .google: return UIColor(red: 0.26, green: 0.26, blue: 0.26, alpha: 1)
        }
    }
}

final class EchoOAuthButton: UIButton {
    init(provider: OAuthProvider) {
        super.init(frame: .zero)
        backgroundColor = provider.color
        layer.cornerRadius = 12
        if provider == .google {
            layer.borderWidth = 1
            layer.borderColor = UIColor(red: 0.85, green: 0.85, blue: 0.85, alpha: 1).cgColor
        }

        // Brand logo + short label, laid out centered. The stack is
        // non-interactive so taps fall through to the button target.
        let logo = UIImageView()
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        if provider.tintsLogo {
            logo.image = UIImage(named: provider.assetName)?.withRenderingMode(.alwaysTemplate)
            logo.tintColor = provider.textColor
        } else {
            logo.image = UIImage(named: provider.assetName)
        }

        let label = UILabel()
        label.text = provider.shortTitle
        label.font = .systemFont(ofSize: 15, weight: .semibold)
        label.textColor = provider.textColor

        let stack = UIStackView(arrangedSubviews: [logo, label])
        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 8
        stack.isUserInteractionEnabled = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 18),
            logo.heightAnchor.constraint(equalToConstant: 18),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }
}

// MARK: - Colors (matching Echo theme)

struct EchoColors {
    static var isDark: Bool {
        if #available(iOS 13.0, *) {
            return UITraitCollection.current.userInterfaceStyle == .dark
        }
        return false
    }

    // Light: #E6EBF4 → rgb(230, 235, 244), Dark: #0D0812 → rgb(13, 8, 18)
    static var background: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 0.051, green: 0.031, blue: 0.071, alpha: 1)
                : UIColor(red: 0.902, green: 0.922, blue: 0.957, alpha: 1)
        }
    }

    // #6366F1
    static var accent: UIColor {
        return UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1)
    }

    /// Slightly-raised panel color used for cards/CTAs (mirrors web `--surface`).
    static var surface: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 0.118, green: 0.098, blue: 0.157, alpha: 1)
                : UIColor(red: 0.973, green: 0.980, blue: 1.0, alpha: 1)
        }
    }

    static var textPrimary: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(white: 0.95, alpha: 1)
                : UIColor(white: 0.1, alpha: 1)
        }
    }

    static var textSecondary: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(white: 0.6, alpha: 1)
                : UIColor(white: 0.45, alpha: 1)
        }
    }

    static var textTertiary: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(white: 0.4, alpha: 1)
                : UIColor(white: 0.6, alpha: 1)
        }
    }

    static var fieldBackground: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 0.1, green: 0.08, blue: 0.14, alpha: 1)
                : UIColor(white: 1, alpha: 1)
        }
    }

    static var fieldBorder: UIColor {
        return UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(white: 0.2, alpha: 1)
                : UIColor(white: 0.82, alpha: 1)
        }
    }

    static var error: UIColor {
        return UIColor(red: 239/255, green: 68/255, blue: 68/255, alpha: 1)
    }

    static var success: UIColor {
        return UIColor(red: 34/255, green: 197/255, blue: 94/255, alpha: 1)
    }
}
