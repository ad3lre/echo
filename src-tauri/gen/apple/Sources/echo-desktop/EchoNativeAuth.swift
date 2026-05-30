import UIKit
import Security
import WebKit

// MARK: - Keychain Helper

final class EchoKeychain {
    static let service = "com.echo.ios.auth"
    static let sessionAccount = "session_memory"

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
}

// MARK: - Native Auth Overlay

@objc public class EchoNativeAuthOverlay: NSObject {

    private static var overlayWindow: UIWindow?
    private static var loginVC: EchoLoginViewController?

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

            if overlayWindow?.rootViewController != nil {
                UIView.transition(with: overlayWindow!, duration: 0.3, options: .transitionCrossDissolve) {
                    self.overlayWindow?.rootViewController = vc
                }
            } else {
                overlayWindow?.rootViewController = vc
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
    @objc public static func performBootCheck() {
        showSplashOverlay()
    }
}

// MARK: - Splash Screen (shown during session check)

final class EchoSplashViewController: UIViewController {

    private let logoImageView = UIImageView()
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = EchoColors.background

        logoImageView.image = UIImage(named: "LaunchLogo")
        logoImageView.contentMode = .scaleAspectFit
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(logoImageView)

        statusLabel.text = "Opening Echo…"
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

final class EchoLoginViewController: UIViewController {

    private let scrollView = UIScrollView()
    private let contentView = UIView()
    private let logoImageView = UIImageView()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let emailField = EchoTextField(placeholder: "Email or username")
    private let passwordField = EchoTextField(placeholder: "Password", isSecure: true)
    private let loginButton = EchoPrimaryButton(title: "Sign In")
    private let registerButton = EchoPrimaryButton(title: "Create Account")
    private let discordButton = EchoOAuthButton(provider: .discord)
    private let googleButton = EchoOAuthButton(provider: .google)
    private let passkeyButton = EchoPrimaryButton(title: "Sign in with Face ID / Touch ID")
    private let guestButton = UIButton(type: .system)
    private let errorLabel = UILabel()
    private let forgotPasswordButton = UIButton(type: .system)
    private let dividerView = EchoDividerView(text: "or")
    private let spinner = UIActivityIndicatorView(style: .medium)

    private var isLoginMode = true
    private var isLoading = false {
        didSet { updateLoadingState() }
    }

    /// Callback invoked by Rust after native login completes.
    /// The JS bridge picks this up to call setSession.
    var onLoginComplete: (([String: Any]) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = EchoColors.background
        setupUI()
        setupKeyboardDismissal()
    }

    private func setupUI() {
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = true
        scrollView.keyboardDismissMode = .interactive
        view.addSubview(scrollView)

        contentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentView)

        // Logo
        logoImageView.image = UIImage(named: "LaunchLogo")
        logoImageView.contentMode = .scaleAspectFit
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(logoImageView)

        // Title
        titleLabel.text = "Welcome to Echo"
        titleLabel.textColor = EchoColors.textPrimary
        titleLabel.font = .systemFont(ofSize: 28, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(titleLabel)

        // Subtitle
        subtitleLabel.text = "Sign in to continue"
        subtitleLabel.textColor = EchoColors.textSecondary
        subtitleLabel.font = .systemFont(ofSize: 15, weight: .regular)
        subtitleLabel.textAlignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(subtitleLabel)

        // Error label
        errorLabel.textColor = EchoColors.error
        errorLabel.font = .systemFont(ofSize: 13, weight: .medium)
        errorLabel.textAlignment = .center
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(errorLabel)

        // OAuth buttons
        discordButton.translatesAutoresizingMaskIntoConstraints = false
        discordButton.addTarget(self, action: #selector(discordTapped), for: .touchUpInside)
        contentView.addSubview(discordButton)

        googleButton.translatesAutoresizingMaskIntoConstraints = false
        googleButton.addTarget(self, action: #selector(googleTapped), for: .touchUpInside)
        contentView.addSubview(googleButton)

        // Passkey
        passkeyButton.translatesAutoresizingMaskIntoConstraints = false
        passkeyButton.setStyle(.secondary)
        passkeyButton.addTarget(self, action: #selector(passkeyTapped), for: .touchUpInside)
        contentView.addSubview(passkeyButton)

        // Divider
        dividerView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(dividerView)

        // Email field
        emailField.translatesAutoresizingMaskIntoConstraints = false
        emailField.textField.autocapitalizationType = .none
        emailField.textField.autocorrectionType = .no
        emailField.textField.keyboardType = .emailAddress
        emailField.textField.textContentType = .username
        emailField.textField.returnKeyType = .next
        contentView.addSubview(emailField)

        // Password field
        passwordField.translatesAutoresizingMaskIntoConstraints = false
        passwordField.textField.textContentType = .password
        passwordField.textField.returnKeyType = .go
        contentView.addSubview(passwordField)

        // Forgot password
        forgotPasswordButton.setTitle("Forgot password?", for: .normal)
        forgotPasswordButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .medium)
        forgotPasswordButton.setTitleColor(EchoColors.accent, for: .normal)
        forgotPasswordButton.translatesAutoresizingMaskIntoConstraints = false
        forgotPasswordButton.addTarget(self, action: #selector(forgotPasswordTapped), for: .touchUpInside)
        contentView.addSubview(forgotPasswordButton)

        // Login button
        loginButton.translatesAutoresizingMaskIntoConstraints = false
        loginButton.addTarget(self, action: #selector(loginTapped), for: .touchUpInside)
        contentView.addSubview(loginButton)

        // Register button
        registerButton.translatesAutoresizingMaskIntoConstraints = false
        registerButton.addTarget(self, action: #selector(toggleModeTapped), for: .touchUpInside)
        registerButton.setStyle(.secondary)
        contentView.addSubview(registerButton)

        // Guest button
        guestButton.setTitle("Continue as guest", for: .normal)
        guestButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
        guestButton.setTitleColor(EchoColors.textSecondary, for: .normal)
        guestButton.translatesAutoresizingMaskIntoConstraints = false
        guestButton.addTarget(self, action: #selector(guestTapped), for: .touchUpInside)
        contentView.addSubview(guestButton)

        // Spinner
        spinner.color = EchoColors.textSecondary
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.hidesWhenStopped = true
        contentView.addSubview(spinner)

        let padding: CGFloat = 24
        let fieldWidth: CGFloat = min(UIScreen.main.bounds.width - 48, 380)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),

            logoImageView.topAnchor.constraint(equalTo: contentView.safeAreaLayoutGuide.topAnchor, constant: 48),
            logoImageView.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            logoImageView.widthAnchor.constraint(equalToConstant: 80),
            logoImageView.heightAnchor.constraint(equalToConstant: 80),

            titleLabel.topAnchor.constraint(equalTo: logoImageView.bottomAnchor, constant: 20),
            titleLabel.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            subtitleLabel.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),

            errorLabel.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 16),
            errorLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: padding),
            errorLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -padding),

            discordButton.topAnchor.constraint(equalTo: errorLabel.bottomAnchor, constant: 24),
            discordButton.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            discordButton.widthAnchor.constraint(equalToConstant: fieldWidth),
            discordButton.heightAnchor.constraint(equalToConstant: 48),

            googleButton.topAnchor.constraint(equalTo: discordButton.bottomAnchor, constant: 12),
            googleButton.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            googleButton.widthAnchor.constraint(equalToConstant: fieldWidth),
            googleButton.heightAnchor.constraint(equalToConstant: 48),

            passkeyButton.topAnchor.constraint(equalTo: googleButton.bottomAnchor, constant: 12),
            passkeyButton.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            passkeyButton.widthAnchor.constraint(equalToConstant: fieldWidth),
            passkeyButton.heightAnchor.constraint(equalToConstant: 48),

            dividerView.topAnchor.constraint(equalTo: passkeyButton.bottomAnchor, constant: 20),
            dividerView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: padding),
            dividerView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -padding),

            emailField.topAnchor.constraint(equalTo: dividerView.bottomAnchor, constant: 20),
            emailField.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            emailField.widthAnchor.constraint(equalToConstant: fieldWidth),
            emailField.heightAnchor.constraint(equalToConstant: 48),

            passwordField.topAnchor.constraint(equalTo: emailField.bottomAnchor, constant: 12),
            passwordField.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            passwordField.widthAnchor.constraint(equalToConstant: fieldWidth),
            passwordField.heightAnchor.constraint(equalToConstant: 48),

            forgotPasswordButton.topAnchor.constraint(equalTo: passwordField.bottomAnchor, constant: 8),
            forgotPasswordButton.trailingAnchor.constraint(equalTo: passwordField.trailingAnchor),

            loginButton.topAnchor.constraint(equalTo: forgotPasswordButton.bottomAnchor, constant: 16),
            loginButton.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            loginButton.widthAnchor.constraint(equalToConstant: fieldWidth),
            loginButton.heightAnchor.constraint(equalToConstant: 48),

            registerButton.topAnchor.constraint(equalTo: loginButton.bottomAnchor, constant: 12),
            registerButton.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            registerButton.widthAnchor.constraint(equalToConstant: fieldWidth),
            registerButton.heightAnchor.constraint(equalToConstant: 48),

            guestButton.topAnchor.constraint(equalTo: registerButton.bottomAnchor, constant: 20),
            guestButton.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),

            spinner.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: guestButton.bottomAnchor, constant: 16),

            guestButton.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -48),
        ])

        updateModeUI()
    }

    private func updateModeUI() {
        if isLoginMode {
            subtitleLabel.text = "Sign in to continue"
            loginButton.setTitle("Sign In", for: .normal)
            registerButton.setTitle("Create Account", for: .normal)
            forgotPasswordButton.isHidden = false
            passwordField.textField.textContentType = .password
        } else {
            subtitleLabel.text = "Create your account"
            loginButton.setTitle("Create Account", for: .normal)
            registerButton.setTitle("Sign In Instead", for: .normal)
            forgotPasswordButton.isHidden = true
            passwordField.textField.textContentType = .newPassword
        }
    }

    private func updateLoadingState() {
        loginButton.isEnabled = !isLoading
        registerButton.isEnabled = !isLoading
        discordButton.isEnabled = !isLoading
        googleButton.isEnabled = !isLoading
        passkeyButton.isEnabled = !isLoading
        guestButton.isEnabled = !isLoading
        emailField.textField.isEnabled = !isLoading

        if isLoading {
            spinner.startAnimating()
            loginButton.alpha = 0.6
        } else {
            spinner.stopAnimating()
            loginButton.alpha = 1.0
        }
    }

    private func showError(_ message: String) {
        errorLabel.text = message
        errorLabel.isHidden = false
        UIView.animate(withDuration: 0.2) {
            self.view.layoutIfNeeded()
        }
    }

    private func clearError() {
        errorLabel.isHidden = true
        errorLabel.text = nil
    }

    private func setupKeyboardDismissal() {
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
        guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        scrollView.contentInset.bottom = frame.height
        scrollView.verticalScrollIndicatorInsets.bottom = frame.height
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        scrollView.contentInset.bottom = 0
        scrollView.verticalScrollIndicatorInsets.bottom = 0
    }

    // MARK: - Actions

    @objc private func loginTapped() {
        clearError()
        let email = emailField.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = passwordField.textField.text ?? ""

        guard !email.isEmpty else {
            showError("Please enter your email or username")
            return
        }
        guard !password.isEmpty else {
            showError("Please enter your password")
            return
        }

        isLoading = true
        dismissKeyboard()

        EchoNativeAuthBridge.shared.performLogin(
            username: email,
            password: password,
            isRegister: !isLoginMode
        ) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let userData):
                    self?.onLoginComplete?(userData)
                    EchoNativeAuthOverlay.dismissOverlay()
                case .failure(let error):
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    @objc private func toggleModeTapped() {
        isLoginMode.toggle()
        clearError()
        updateModeUI()
    }

    @objc private func discordTapped() {
        clearError()
        isLoading = true
        EchoNativeAuthBridge.shared.startOAuthFlow(provider: "discord") { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success:
                    break
                case .failure(let error):
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    @objc private func googleTapped() {
        clearError()
        isLoading = true
        EchoNativeAuthBridge.shared.startOAuthFlow(provider: "google") { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success:
                    break
                case .failure(let error):
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    @objc private func passkeyTapped() {
        clearError()
        isLoading = true
        dismissKeyboard()
        let raw = emailField.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        EchoNativeAuthBridge.shared.performPasskeyLogin(
            username: raw.isEmpty ? nil : raw,
            anchor: view.window ?? (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.windows.first ?? UIWindow()
        ) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let userData):
                    self?.onLoginComplete?(userData)
                    EchoNativeAuthOverlay.dismissOverlay()
                case .failure(let error):
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    @objc private func guestTapped() {
        clearError()
        isLoading = true
        EchoNativeAuthBridge.shared.continueAsGuest { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let userData):
                    self?.onLoginComplete?(userData)
                    EchoNativeAuthOverlay.dismissOverlay()
                case .failure(let error):
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    @objc private func forgotPasswordTapped() {
        clearError()
        let email = emailField.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !email.isEmpty else {
            showError("Enter your email above, then tap Forgot password")
            return
        }

        isLoading = true
        EchoNativeAuthBridge.shared.forgotPassword(email: email) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success:
                    self?.showError("Check your email for a reset link")
                    self?.errorLabel.textColor = EchoColors.success
                case .failure(let error):
                    self?.errorLabel.textColor = EchoColors.error
                    self?.showError(error.localizedDescription)
                }
            }
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return EchoColors.isDark ? .lightContent : .darkContent
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

    var title: String {
        switch self {
        case .discord: return "Continue with Discord"
        case .google: return "Continue with Google"
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
        setTitle(provider.title, for: .normal)
        titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        backgroundColor = provider.color
        setTitleColor(provider.textColor, for: .normal)
        layer.cornerRadius = 12
        if provider == .google {
            layer.borderWidth = 1
            layer.borderColor = UIColor(red: 0.85, green: 0.85, blue: 0.85, alpha: 1).cgColor
        }
    }

    required init?(coder: NSCoder) { fatalError() }
}

final class EchoDividerView: UIView {
    init(text: String) {
        super.init(frame: .zero)

        let leftLine = UIView()
        leftLine.backgroundColor = EchoColors.fieldBorder
        leftLine.translatesAutoresizingMaskIntoConstraints = false
        addSubview(leftLine)

        let label = UILabel()
        label.text = text
        label.textColor = EchoColors.textTertiary
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)

        let rightLine = UIView()
        rightLine.backgroundColor = EchoColors.fieldBorder
        rightLine.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rightLine)

        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 20),

            leftLine.leadingAnchor.constraint(equalTo: leadingAnchor),
            leftLine.trailingAnchor.constraint(equalTo: label.leadingAnchor, constant: -12),
            leftLine.centerYAnchor.constraint(equalTo: centerYAnchor),
            leftLine.heightAnchor.constraint(equalToConstant: 1),

            label.centerXAnchor.constraint(equalTo: centerXAnchor),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),

            rightLine.leadingAnchor.constraint(equalTo: label.trailingAnchor, constant: 12),
            rightLine.trailingAnchor.constraint(equalTo: trailingAnchor),
            rightLine.centerYAnchor.constraint(equalTo: centerYAnchor),
            rightLine.heightAnchor.constraint(equalToConstant: 1),
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
