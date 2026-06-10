import UIKit
import AuthenticationServices
import CryptoKit
import UserNotifications

// MARK: - App delegate proxy (APNs device token)

/// Forwards `UIApplicationDelegate` push callbacks while preserving Tauri's delegate.
@objc final class EchoPushDelegateProxy: NSObject, UIApplicationDelegate {
    static let shared = EchoPushDelegateProxy()

    private weak var originalDelegate: UIApplicationDelegate?
    private let lock = NSLock()
    private var pendingToken: String?
    private var pendingError: String?
    private var tokenWaiters: [DispatchSemaphore] = []

    private static var installed = false

    /// Chain push callbacks without replacing Tauri's `UIApplicationDelegate`.
    /// Safe to call multiple times; only installs once after UIKit has started.
    @objc static func install() {
        guard !installed else { return }
        installed = true
        let proxy = EchoPushDelegateProxy.shared
        if let existing = UIApplication.shared.delegate, !(existing is EchoPushDelegateProxy) {
            proxy.originalDelegate = existing as? UIApplicationDelegate
        }
        UIApplication.shared.delegate = proxy
    }

    @objc func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if let orig = originalDelegate,
           orig.responds(to: #selector(UIApplicationDelegate.application(_:didFinishLaunchingWithOptions:))) {
            return orig.application?(application, didFinishLaunchingWithOptions: launchOptions) ?? true
        }
        return true
    }

    @objc func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        lock.lock()
        pendingToken = hex
        pendingError = nil
        let waiters = tokenWaiters
        tokenWaiters.removeAll()
        lock.unlock()
        waiters.forEach { $0.signal() }
        originalDelegate?.application?(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
    }

    @objc func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        lock.lock()
        pendingError = error.localizedDescription
        pendingToken = nil
        let waiters = tokenWaiters
        tokenWaiters.removeAll()
        lock.unlock()
        waiters.forEach { $0.signal() }
        originalDelegate?.application?(application, didFailToRegisterForRemoteNotificationsWithError: error)
    }

    /// Blocks until a token or error arrives (or `timeout` elapses).
    func waitForDeviceToken(timeout: TimeInterval) -> Result<String, Error> {
        lock.lock()
        if let token = pendingToken {
            lock.unlock()
            return .success(token)
        }
        if let err = pendingError {
            lock.unlock()
            return .failure(NSError(domain: "EchoPush", code: 1, userInfo: [NSLocalizedDescriptionKey: err]))
        }
        let sem = DispatchSemaphore(value: 0)
        tokenWaiters.append(sem)
        lock.unlock()

        let result = sem.wait(timeout: .now() + timeout)
        lock.lock()
        defer { lock.unlock() }
        if result == .timedOut {
            return .failure(NSError(domain: "EchoPush", code: 2, userInfo: [NSLocalizedDescriptionKey: "Timed out waiting for APNs device token"]))
        }
        if let token = pendingToken {
            return .success(token)
        }
        let msg = pendingError ?? "APNs registration failed"
        return .failure(NSError(domain: "EchoPush", code: 3, userInfo: [NSLocalizedDescriptionKey: msg]))
    }

}

// MARK: - Sign in with Apple

@available(iOS 15.0, *)
private final class EchoAppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let rawNonce: String
    private let anchor: ASPresentationAnchor
    private let completion: (Result<[String: Any], Error>) -> Void

    init(anchor: ASPresentationAnchor, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        self.rawNonce = EchoAppleSignInCoordinator.randomNonceString()
        self.anchor = anchor
        self.completion = completion
    }

    func start() {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = EchoAppleSignInCoordinator.sha256(rawNonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            completion(.failure(NSError(domain: "EchoAppleSignIn", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid Apple credential"])))
            return
        }
        guard let tokenData = credential.identityToken, let identityToken = String(data: tokenData, encoding: .utf8), !identityToken.isEmpty else {
            completion(.failure(NSError(domain: "EchoAppleSignIn", code: 2, userInfo: [NSLocalizedDescriptionKey: "Apple did not return an identity token"])))
            return
        }

        var displayName: String?
        if let name = credential.fullName {
            let parts = [name.givenName, name.familyName].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            if !parts.isEmpty {
                displayName = parts.joined(separator: " ")
            }
        }

        var payload: [String: Any] = [
            "identityToken": identityToken,
            "nonce": rawNonce,
        ]
        if let displayName = displayName {
            payload["displayName"] = displayName
        }
        completion(.success(payload))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let ns = error as NSError
        if ns.domain == ASAuthorizationError.errorDomain, ns.code == ASAuthorizationError.canceled.rawValue {
            completion(.failure(NSError(domain: "EchoAppleSignIn", code: 3, userInfo: [NSLocalizedDescriptionKey: "apple_signin_cancelled"])))
            return
        }
        completion(.failure(error))
    }

    private static func randomNonceString(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        result.reserveCapacity(length)
        for _ in 0..<length {
            result.append(charset.randomElement()!)
        }
        return result
    }

    private static func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Sync entry points (Rust invokes via registered function pointers)

private func runOnMain<T>(_ block: @escaping () -> T) -> T {
    if Thread.isMainThread {
        return block()
    }
    var value: T!
    let sem = DispatchSemaphore(value: 0)
    DispatchQueue.main.async {
        value = block()
        sem.signal()
    }
    sem.wait()
    return value
}

private func copyCString(_ string: String) -> UnsafePointer<CChar>? {
    guard let ptr = strdup(string) else { return nil }
    return UnsafePointer(ptr)
}

@_cdecl("echo_ios_sign_in_with_apple_sync")
public func echo_ios_sign_in_with_apple_sync(
    outJson: UnsafeMutablePointer<UnsafePointer<CChar>?>,
    outError: UnsafeMutablePointer<UnsafePointer<CChar>?>
) -> Bool {
    outJson.pointee = nil
    outError.pointee = nil

    if #available(iOS 15.0, *) {
        let outcome: (ok: String?, err: String?) = runOnMain { () -> (String?, String?) in
            var coordinator: EchoAppleSignInCoordinator?
            let sem = DispatchSemaphore(value: 0)
            var encoded: String?
            var errMsg: String?

            let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
            let anchor = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first ?? UIWindow()

            let coord = EchoAppleSignInCoordinator(anchor: anchor) { result in
                switch result {
                case .success(let dict):
                    if let data = try? JSONSerialization.data(withJSONObject: dict),
                       let json = String(data: data, encoding: .utf8) {
                        encoded = json
                    } else {
                        errMsg = "Could not encode Apple credential"
                    }
                case .failure(let error):
                    errMsg = error.localizedDescription
                }
                coordinator = nil
                sem.signal()
            }
            coordinator = coord
            coord.start()
            sem.wait()
            if let json = encoded { return (json, nil) }
            return (nil, errMsg ?? "Apple sign-in failed")
        }

        if let json = outcome.ok {
            outJson.pointee = copyCString(json)
            return true
        }
        outError.pointee = copyCString(outcome.err ?? "Apple sign-in failed")
        return false
    }

    outError.pointee = copyCString("Sign in with Apple requires iOS 15 or newer")
    return false
}

@_cdecl("echo_ios_register_push_sync")
public func echo_ios_register_push_sync(
    outToken: UnsafeMutablePointer<UnsafePointer<CChar>?>,
    outError: UnsafeMutablePointer<UnsafePointer<CChar>?>
) -> Bool {
    outToken.pointee = nil
    outError.pointee = nil

    let outcome: (ok: String?, err: String?) = runOnMain { () -> (String?, String?) in
        EchoPushDelegateProxy.install()
        let sem = DispatchSemaphore(value: 0)
        var granted = false
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { ok, _ in
            granted = ok
            sem.signal()
        }
        sem.wait()
        if !granted {
            return (nil, "push_permission_denied")
        }

        UIApplication.shared.registerForRemoteNotifications()
        switch EchoPushDelegateProxy.shared.waitForDeviceToken(timeout: 30) {
        case .success(let token):
            return (token, nil)
        case .failure(let error):
            return (nil, error.localizedDescription)
        }
    }

    if let token = outcome.ok {
        outToken.pointee = copyCString(token)
        return true
    }
    outError.pointee = copyCString(outcome.err ?? "push_registration_failed")
    return false
}
