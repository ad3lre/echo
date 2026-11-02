import Foundation

/// Bug report APIs (web `postEchoBugReport` + `uploadBugReportAttachment`).
extension EchoWorkspaceClient {
  /// Uploads one screenshot (`bug_report` presign + PUT) and returns its public https URL.
  public func uploadBugReportAttachment(
    data: Data, filename: String, mimeType: String, accessToken: String
  ) async throws -> String {
    try await uploadPresigned(
      serverID: nil, purpose: "bug_report", data: data, filename: filename,
      mimeType: mimeType, accessToken: accessToken
    ).publicURL
  }

  /// `POST /bug-reports` — the server caps the description at 8000 chars and keeps ≤8 https URLs.
  @discardableResult
  public func submitBugReport(
    description: String, attachmentURLs: [String] = [], accessToken: String
  ) async throws -> String {
    let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
      throw EchoHomeClientError.server(
        statusCode: 400, code: "INVALID_BODY",
        message: "Describe what went wrong before submitting.")
    }
    #if os(iOS)
      let platform = "ios"
    #else
      let platform = "macos"
    #endif
    #if DEBUG
      let mode = "development"
    #else
      let mode = "production"
    #endif
    let payload: [String: Any] = [
      "description": String(text.prefix(8000)),
      "client": ["userAgent": "Echo Apple (\(platform))", "mode": mode],
      "trace": ["traceTruncated": false, "entries": [Any]()],
      "attachmentUrls": attachmentURLs.filter { $0.lowercased().hasPrefix("https://") },
    ]
    let data = try await send(
      path: "/bug-reports", method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken,
      requireAuth: true)
    struct Response: Decodable { let id: String? }
    return (try? JSONDecoder().decode(Response.self, from: data))?.id ?? ""
  }
}
