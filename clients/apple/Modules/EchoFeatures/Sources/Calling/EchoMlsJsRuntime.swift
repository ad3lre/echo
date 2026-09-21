import EchoNetworking
import Foundation
import Security
import WebKit

/// Runs the bundled ts-mls prepare script inside an offscreen WKWebView so we
/// get WebCrypto (X25519 / Ed25519) — bare JSContext has none on Apple platforms.
@MainActor
final class EchoMlsJsRuntime: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
  static let shared = EchoMlsJsRuntime()

  private var webView: WKWebView?
  private var ready = false
  private var readyWaiters: [CheckedContinuation<Void, Error>] = []
  private var prepareWaiters: [UUID: CheckedContinuation<EchoVoiceE2EEPrepareResult, Error>] = [:]
  private var jsonWaiters: [UUID: CheckedContinuation<String?, Error>] = [:]
  private var bootedBaseURL: URL?

  func prepareDM(
    channelID: String,
    accessToken: String,
    viewerUserID: String,
    deviceID: String,
    peerUserID: String?,
    baseURL: URL
  ) async throws -> EchoVoiceE2EEPrepareResult {
    try await ensureReady(baseURL: baseURL)
    let authorized = [viewerUserID, peerUserID].compactMap {
      $0?.trimmingCharacters(in: .whitespacesAndNewlines)
    }.filter { !$0.isEmpty }
    let input: [String: Any] = [
      "channelId": channelID,
      "token": accessToken,
      "viewerUserId": viewerUserID,
      "deviceId": deviceID,
      "authorizedUserIds": authorized,
    ]
    let inputData = try JSONSerialization.data(withJSONObject: input)
    let inputJSON = String(data: inputData, encoding: .utf8) ?? "{}"
    let requestID = UUID()

    return try await withCheckedThrowingContinuation { continuation in
      prepareWaiters[requestID] = continuation
      evaluate(
        """
        (async function() {
          try {
            const result = await new Promise((resolve, reject) => {
              __echoMlsPrepareDm(\(Self.jsStringLiteral(inputJSON)), (err, json) => {
                if (err) reject(new Error(String(err)));
                else resolve(json);
              });
            });
            window.webkit.messageHandlers.echoMls.postMessage({
              type: 'prepareResult',
              id: '\(requestID.uuidString)',
              result: result
            });
          } catch (e) {
            window.webkit.messageHandlers.echoMls.postMessage({
              type: 'prepareResult',
              id: '\(requestID.uuidString)',
              error: String(e && e.message ? e.message : e)
            });
          }
        })();
        """)
    }
  }

  /// Pull MLS delivery-log updates for the active call; returns new media keys
  /// when the epoch advanced.
  func syncActive() async throws -> EchoCallMediaEncryption? {
    try await invokeJSON("__echoMlsSync")
  }

  func reconcileActive() async throws -> EchoCallMediaEncryption? {
    try await invokeJSON("__echoMlsReconcile")
  }

  func stopActive() async {
    _ = try? await invokeJSON("__echoMlsStop")
  }

  private func invokeJSON(_ globalName: String) async throws -> EchoCallMediaEncryption? {
    guard ready else { return nil }
    let requestID = UUID()
    let json: String? = try await withCheckedThrowingContinuation { continuation in
      jsonWaiters[requestID] = continuation
      evaluate(
        """
        (async function() {
          try {
            const result = await new Promise((resolve, reject) => {
              \(globalName)(function(err, json) {
                if (err) reject(new Error(String(err)));
                else resolve(json);
              });
            });
            window.webkit.messageHandlers.echoMls.postMessage({
              type: 'jsonResult',
              id: '\(requestID.uuidString)',
              result: result
            });
          } catch (e) {
            window.webkit.messageHandlers.echoMls.postMessage({
              type: 'jsonResult',
              id: '\(requestID.uuidString)',
              error: String(e && e.message ? e.message : e)
            });
          }
        })();
        """)
    }
    guard let json, json != "null",
      let data = json.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return try Self.parseEncryption(payload)
  }

  private func ensureReady(baseURL: URL) async throws {
    if ready, bootedBaseURL == baseURL { return }
    if webView == nil || bootedBaseURL != baseURL {
      ready = false
    }
    try bootWebView(baseURL: baseURL)
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      if ready {
        continuation.resume()
      } else {
        readyWaiters.append(continuation)
      }
    }
  }

  private func bootWebView(baseURL: URL) throws {
    guard
      let url = Bundle.module.url(forResource: "EchoMlsBridge", withExtension: "js"),
      let source = try? String(contentsOf: url, encoding: .utf8)
    else {
      throw EchoCallTransportError.encryptedMediaUnavailable
    }

    if let existing = webView {
      existing.configuration.userContentController.removeScriptMessageHandler(forName: "echoMls")
      existing.navigationDelegate = nil
      webView = nil
    }

    let controller = WKUserContentController()
    controller.add(self, name: "echoMls")
    let config = WKWebViewConfiguration()
    config.userContentController = controller
    let view = WKWebView(frame: .zero, configuration: config)
    view.navigationDelegate = self
    webView = view
    bootedBaseURL = baseURL

    let echoBase = baseURL.appendingPathComponent("api/v1/echo").absoluteString
    let seedJSON = EchoMlsJS.objectLiteral(EchoMlsKeychain.allEntries())
    let html = """
      <!doctype html><html><head><meta charset="utf-8"></head><body><script>
      \(EchoMlsJsSupport.textEncoderPolyfill)
      (function() {
        var seed = \(seedJSON);
        try {
          for (var k in seed) {
            if (Object.prototype.hasOwnProperty.call(seed, k) && seed[k] != null) {
              localStorage.setItem(k, String(seed[k]));
            }
          }
        } catch (e) {}
      })();
      globalThis.__echoMlsHost = {
        storageGet: function(key) { return localStorage.getItem(key); },
        storageSet: function(key, value) {
          localStorage.setItem(key, String(value));
          window.webkit.messageHandlers.echoMls.postMessage({type:'storageSet', key:key, value:String(value)});
        },
        storageRemove: function(key) {
          localStorage.removeItem(key);
          window.webkit.messageHandlers.echoMls.postMessage({type:'storageRemove', key:key});
        },
        storageKeysWithPrefix: function(prefix) {
          var out = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) out.push(k);
          }
          return out;
        },
        fetch: function(method, path, token, body) {
          return new Promise(function(resolve, reject) {
            var id = String(Date.now()) + Math.random();
            window.__echoMlsFetchWaiters = window.__echoMlsFetchWaiters || {};
            window.__echoMlsFetchWaiters[id] = { resolve: resolve, reject: reject };
            window.webkit.messageHandlers.echoMls.postMessage({
              type:'fetch', id:id, method:method, path:path, token:token, body:body || null,
              echoBase: \(EchoMlsJS.stringLiteral(echoBase))
            });
          });
        }
      };
      \(source)
      window.webkit.messageHandlers.echoMls.postMessage({ type: 'ready' });
      </script></body></html>
      """
    view.loadHTMLString(html, baseURL: baseURL)
  }

  private func evaluate(_ script: String) {
    webView?.evaluateJavaScript(script) { _, error in
      if let error {
        // Continuations are failed via messageHandlers; log-only here.
        _ = error
      }
    }
  }

  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
      return
    }
    switch type {
    case "ready":
      ready = true
      let waiters = readyWaiters
      readyWaiters = []
      waiters.forEach { $0.resume() }
    case "storageSet":
      if let key = body["key"] as? String, let value = body["value"] as? String {
        EchoMlsKeychain.set(key, value: value)
      }
    case "storageRemove":
      if let key = body["key"] as? String { EchoMlsKeychain.remove(key) }
    case "fetch":
      handleFetch(body)
    case "prepareResult":
      handlePrepareResult(body)
    case "jsonResult":
      handleJSONResult(body)
    default:
      break
    }
  }

  private func handleFetch(_ body: [String: Any]) {
    guard let id = body["id"] as? String,
      let method = body["method"] as? String,
      let path = body["path"] as? String,
      let token = body["token"] as? String,
      let echoBase = body["echoBase"] as? String,
      let base = URL(string: echoBase)
    else { return }
    let requestBody = body["body"] as? String
    Task {
      do {
        let (status, text) = try await Self.http(
          base: base, method: method, path: path, token: token, body: requestBody)
        let script = """
          (function(){
            var w = (window.__echoMlsFetchWaiters || {})[\(Self.jsStringLiteral(id))];
            if (!w) return;
            delete window.__echoMlsFetchWaiters[\(Self.jsStringLiteral(id))];
            w.resolve({ status: \(status), bodyText: \(Self.jsStringLiteral(text)) });
          })();
          """
        await MainActor.run { webView?.evaluateJavaScript(script, completionHandler: nil) }
      } catch {
        let script = """
          (function(){
            var w = (window.__echoMlsFetchWaiters || {})[\(Self.jsStringLiteral(id))];
            if (!w) return;
            delete window.__echoMlsFetchWaiters[\(Self.jsStringLiteral(id))];
            w.reject(new Error(\(Self.jsStringLiteral(error.localizedDescription))));
          })();
          """
        await MainActor.run { webView?.evaluateJavaScript(script, completionHandler: nil) }
      }
    }
  }

  private func handlePrepareResult(_ body: [String: Any]) {
    guard let idString = body["id"] as? String, let id = UUID(uuidString: idString) else { return }
    if let error = body["error"] as? String {
      failPrepare(id: id, message: error)
      return
    }
    guard let json = body["result"] as? String,
      let data = json.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let waiter = prepareWaiters.removeValue(forKey: id)
    else {
      failPrepare(id: id, message: "Invalid MLS prepare result")
      return
    }
    do {
      let deviceID = (payload["deviceId"] as? String) ?? ""
      waiter.resume(returning: try Self.parsePrepareResult(payload, deviceID: deviceID))
    } catch {
      waiter.resume(throwing: error)
    }
  }

  private func handleJSONResult(_ body: [String: Any]) {
    guard let idString = body["id"] as? String, let id = UUID(uuidString: idString),
      let waiter = jsonWaiters.removeValue(forKey: id)
    else { return }
    if let error = body["error"] as? String {
      waiter.resume(
        throwing: NSError(
          domain: "EchoMls", code: 1, userInfo: [NSLocalizedDescriptionKey: error]))
      return
    }
    waiter.resume(returning: body["result"] as? String)
  }

  private func failPrepare(id: UUID, message: String) {
    guard let waiter = prepareWaiters.removeValue(forKey: id) else { return }
    waiter.resume(
      throwing: NSError(
        domain: "EchoMls", code: 1,
        userInfo: [NSLocalizedDescriptionKey: EchoMlsJS.userFacingError(message)]))
  }

  private static func http(
    base: URL, method: String, path: String, token: String, body: String?
  ) async throws -> (Int, String) {
    // Paths from mlsGroupClient are root-absolute (`/e2ee/...`). Joining with
    // `URL(string:relativeTo:)` would replace `/api/v1/echo` and hit the SPA
    // HTML document — which then fails as `JSON Parse error: Unrecognized token '<'`.
    guard let url = EchoMlsJS.echoAPIURL(base: base, path: path) else {
      throw EchoHomeClientError.invalidResponse
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("ios", forHTTPHeaderField: "X-Echo-Client")
    if let body {
      request.httpBody = Data(body.utf8)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let (data, response) = try await EchoHTTPClient.data(
      for: request, session: EchoHTTPClient.session)
    return (
      (response as? HTTPURLResponse)?.statusCode ?? 0, String(data: data, encoding: .utf8) ?? ""
    )
  }

  private static func parsePrepareResult(_ payload: [String: Any], deviceID: String) throws
    -> EchoVoiceE2EEPrepareResult
  {
    let encryption = try parseEncryption(payload)
    let resolvedDevice =
      (payload["deviceId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    return EchoVoiceE2EEPrepareResult(
      encryption: encryption,
      deviceID: (resolvedDevice?.isEmpty == false) ? resolvedDevice : deviceID)
  }

  private static func parseEncryption(_ payload: [String: Any]) throws -> EchoCallMediaEncryption {
    let keyIndex = payload["keyIndex"] as? Int ?? 0
    let keysObject = payload["senderKeys"] as? [String: String] ?? [:]
    var senderKeys: [String: Data] = [:]
    for (identity, b64) in keysObject {
      guard let data = Data(base64Encoded: b64), !data.isEmpty else { continue }
      senderKeys[identity] = data
    }
    guard !senderKeys.isEmpty else { throw EchoCallTransportError.encryptedMediaUnavailable }
    return EchoCallMediaEncryption(keyIndex: keyIndex, senderKeys: senderKeys)
  }

  private static func jsStringLiteral(_ value: String) -> String {
    EchoMlsJS.stringLiteral(value)
  }
}

/// JSON helpers for embedding values into the MLS WKWebView bootstrap script.
enum EchoMlsJS {
  /// Escapes `value` as a JS string literal (including surrounding quotes).
  ///
  /// Do **not** pass a bare `String` to `JSONSerialization.data(withJSONObject:)` —
  /// Foundation raises an uncaught `NSException` (`Invalid top-level type in JSON
  /// write`) that Swift `try` / `try?` cannot catch. That abort is what killed
  /// Echo when a call started MLS prepare (`Echo-2026-09-20-233546.ips`).
  /// `JSONEncoder` encodes a `String` as a JSON string fragment safely.
  static func stringLiteral(_ value: String) -> String {
    guard let data = try? JSONEncoder().encode(value),
      let encoded = String(data: data, encoding: .utf8)
    else { return "\"\"" }
    return encoded
  }

  /// Encode a JSON-object dictionary for embedding in bootstrap JS.
  /// Returns `"{}"` when the value is not a valid JSON object.
  static func objectLiteral(_ value: [String: String]) -> String {
    guard JSONSerialization.isValidJSONObject(value),
      let data = try? JSONSerialization.data(withJSONObject: value),
      let encoded = String(data: data, encoding: .utf8)
    else { return "{}" }
    return encoded
  }

  /// Join `path` under the Echo API base without RFC absolute-path replacement.
  ///
  /// Root-absolute paths like `/e2ee/...` must not use `URL(string:relativeTo:)`
  /// against `…/api/v1/echo` — that replaces the API prefix and returns SPA HTML.
  static func echoAPIURL(base: URL, path: String) -> URL? {
    let relative = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard !relative.isEmpty else { return base }
    var baseString = base.absoluteString
    if !baseString.hasSuffix("/") { baseString += "/" }
    guard let baseWithSlash = URL(string: baseString) else { return nil }
    return URL(string: relative, relativeTo: baseWithSlash)?.absoluteURL
  }

  /// Drop JS stacks / HTML snippets from user-visible call errors.
  static func userFacingError(_ message: String) -> String {
    let firstLine =
      message.split(whereSeparator: \.isNewline).first.map(String.init)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? message
    if firstLine.localizedCaseInsensitiveContains("Unrecognized token")
      || firstLine.localizedCaseInsensitiveContains("JSON Parse")
    {
      return "Couldn’t prepare encrypted call. Please try again."
    }
    if firstLine.count > 180 {
      return String(firstLine.prefix(180)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return firstLine.isEmpty ? "Couldn’t prepare encrypted call." : firstLine
  }
}

enum EchoMlsJsSupport {
  static let textEncoderPolyfill = """
    (function() {
      if (typeof TextEncoder === 'undefined') {
        globalThis.TextEncoder = function TextEncoder() {};
        TextEncoder.prototype.encode = function(str) {
          str = String(str == null ? '' : str);
          var utf8 = unescape(encodeURIComponent(str));
          var out = new Uint8Array(utf8.length);
          for (var i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i);
          return out;
        };
      }
      if (typeof TextDecoder === 'undefined') {
        globalThis.TextDecoder = function TextDecoder() {};
        TextDecoder.prototype.decode = function(bytes) {
          bytes = bytes || new Uint8Array();
          var binary = '';
          for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          try { return decodeURIComponent(escape(binary)); }
          catch (e) { return binary; }
        };
      }
    })();
    """
}

enum EchoMlsKeychain {
  private static let service = "com.echo.mls.kv"

  static func get(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func set(_ key: String, value: String) {
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(add as CFDictionary, nil)
  }

  static func remove(_ key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
  }

  static func allEntries() -> [String: String] {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecReturnAttributes as String: true,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitAll,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let rows = item as? [[String: Any]] else { return [:] }
    var out: [String: String] = [:]
    for row in rows {
      guard let account = row[kSecAttrAccount as String] as? String,
        let data = row[kSecValueData as String] as? Data,
        let value = String(data: data, encoding: .utf8)
      else { continue }
      out[account] = value
    }
    return out
  }

  static func deviceID(forUserID userID: String) -> String {
    let key = "echo_mls_device_id:\(userID)"
    if let existing = get(key), !existing.isEmpty { return existing }
    let id = UUID().uuidString.lowercased()
    set(key, value: id)
    return id
  }
}
