import EchoDomain
import Foundation

extension EchoHomeClientError {
  /// `409 APPLICATION_REQUIRED` from invite / directory join (web `readApplicationRequired`).
  public var isApplicationRequired: Bool {
    guard case .server(let status, let code, _) = self else { return false }
    return status == 409 && code == "APPLICATION_REQUIRED"
  }
}

/// Create-server + join-application APIs (web `createEchoServer`, `serverApplications.ts`).
extension EchoWorkspaceClient {
  /// Pulls the token out of a pasted invite link or bare code (web `extractInviteTokenFromUserInput`).
  public static func inviteToken(from raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), url.scheme != nil else {
      return trimmed.split(separator: "/").last.map(String.init) ?? trimmed
    }
    let parts = url.pathComponents.filter { $0 != "/" }
    if let index = parts.firstIndex(of: "invite"), index + 1 < parts.count {
      return parts[index + 1]
    }
    if parts.last == "share", parts.count >= 2 { return parts[parts.count - 2] }
    return parts.last ?? trimmed
  }

  // MARK: Create server

  /// `POST /servers` — `name` is required, `iconURL` optional (data / https URL).
  public func createServer(
    name: String, iconURL: String? = nil, accessToken: String
  ) async throws -> (serverID: String, defaultChannelID: String) {
    var payload: [String: Any] = ["name": name]
    if let iconURL, !iconURL.isEmpty { payload["iconUrl"] = iconURL }
    let response: CreatedServerResponse = try await sendJSON(
      path: "/servers", method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken)
    return (response.serverId, response.defaultChannelId ?? "")
  }

  // MARK: Member side

  /// `GET /servers/:id/join-application-preview` (signed-in non-member).
  public func loadJoinApplicationForm(
    serverID: String, accessToken: String
  ) async throws -> EchoApplicationForm {
    let response: FormEnvelope = try await request(
      path: "/servers/\(Self.pathSegment(serverID))/join-application-preview",
      accessToken: accessToken)
    return response.applicationForm.domain
  }

  /// `GET /invites/:code/preview` (public) — server id, branding, and form when one is required.
  public func loadInviteApplicationContext(
    inviteToken: String
  ) async -> EchoJoinApplicationContext? {
    let path = "/invites/\(Self.pathSegment(inviteToken))/preview"
    guard let data = try? await send(
      path: path, method: "GET", body: nil, accessToken: nil, requireAuth: false),
      let preview = try? JSONDecoder().decode(InvitePreviewResponse.self, from: data),
      let serverID = preview.serverId, !serverID.isEmpty, let form = preview.applicationForm
    else { return nil }
    return EchoJoinApplicationContext(
      serverID: serverID, serverName: preview.name ?? "", iconURL: preview.iconUrl,
      source: .invite, inviteToken: inviteToken, form: form.domain)
  }

  /// Uploads a file answer (`server_application_attachment` presign + PUT) and returns the
  /// answer payload to submit. Non-members only; the server enforces plan and type limits.
  public func uploadApplicationAttachment(
    serverID: String, data: Data, filename: String, mimeType: String, maxBytes: Int?,
    accessToken: String
  ) async throws -> EchoApplicationUpload {
    if let maxBytes, data.count > maxBytes {
      throw EchoHomeClientError.server(
        statusCode: 413, code: "FILE_TOO_LARGE",
        message: "That file is larger than this question allows.")
    }
    let uploaded = try await uploadPresigned(
      serverID: serverID, purpose: "server_application_attachment", data: data,
      filename: filename, mimeType: mimeType, accessToken: accessToken)
    let name = String(filename.trimmingCharacters(in: .whitespacesAndNewlines).prefix(255))
    return EchoApplicationUpload(
      name: name.isEmpty ? "file" : name, key: uploaded.key, url: uploaded.publicURL,
      size: data.count, contentType: mimeType)
  }

  /// `POST /servers/:id/applications`.
  public func submitApplication(
    serverID: String, source: EchoJoinApplicationContext.Source, inviteToken: String?,
    answers: [String: EchoApplicationAnswer], accessToken: String
  ) async throws {
    var encoded: [String: Any] = [:]
    for (key, answer) in answers {
      switch answer {
      case .text(let value): encoded[key] = value
      case .list(let values): encoded[key] = values
      case .file(let upload):
        var file: [String: Any] = ["key": upload.key, "publicUrl": upload.url, "name": upload.name]
        if let size = upload.size { file["size"] = size }
        if let contentType = upload.contentType { file["contentType"] = contentType }
        encoded[key] = file
      }
    }
    var payload: [String: Any] = ["source": source.rawValue, "answers": encoded]
    if let inviteToken, source == .invite { payload["inviteToken"] = inviteToken }
    _ = try await send(
      path: "/servers/\(Self.pathSegment(serverID))/applications", method: "POST",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken,
      requireAuth: true)
  }

  // MARK: Admin side

  /// `GET /servers/:id/application-settings` (MANAGE_GUILD).
  public func loadApplicationSettings(
    serverID: String, accessToken: String
  ) async throws -> (enabled: Bool, form: EchoApplicationForm) {
    let response: SettingsEnvelope = try await request(
      path: "/servers/\(Self.pathSegment(serverID))/application-settings",
      accessToken: accessToken)
    return (response.applicationsEnabled, response.applicationForm.domain)
  }

  /// `PATCH /servers/:id/preferences` with `{ applicationForm }`.
  public func saveApplicationForm(
    serverID: String, form: EchoApplicationForm, accessToken: String
  ) async throws {
    let questions: [[String: Any]] = form.questions.map { question in
      var row: [String: Any] = [
        "id": question.id, "type": question.kind.rawValue,
        "label": question.label.trimmingCharacters(in: .whitespacesAndNewlines),
        "required": question.required,
      ]
      let placeholder = question.placeholder.trimmingCharacters(in: .whitespacesAndNewlines)
      if !placeholder.isEmpty { row["placeholder"] = placeholder }
      if question.kind.isChoice {
        row["options"] = question.options
          .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
      }
      if question.kind == .short || question.kind == .long {
        row["maxLength"] = question.maxLength ?? question.characterCap
      }
      if question.kind == .attachment, let maxBytes = question.maxBytes { row["maxBytes"] = maxBytes }
      return row
    }
    let payload: [String: Any] = ["applicationForm": ["version": 1, "questions": questions]]
    _ = try await send(
      path: "/servers/\(Self.pathSegment(serverID))/preferences", method: "PATCH",
      body: try JSONSerialization.data(withJSONObject: payload), accessToken: accessToken,
      requireAuth: true)
  }

  /// `GET /servers/:id/applications?status=pending`.
  public func loadPendingApplications(
    serverID: String, accessToken: String
  ) async throws -> [EchoServerApplication] {
    let response: ApplicationsEnvelope = try await request(
      path: "/servers/\(Self.pathSegment(serverID))/applications?status=pending",
      accessToken: accessToken)
    return response.applications.map(\.domain)
  }

  /// `POST /servers/:id/applications/:applicationId/approve|reject`.
  public func resolveApplication(
    serverID: String, applicationID: String, approve: Bool, note: String = "",
    accessToken: String
  ) async throws {
    let body: Data? = approve ? nil : try JSONSerialization.data(withJSONObject: ["note": note])
    _ = try await send(
      path:
        "/servers/\(Self.pathSegment(serverID))/applications/\(Self.pathSegment(applicationID))/\(approve ? "approve" : "reject")",
      method: "POST", body: body, accessToken: accessToken, requireAuth: true)
  }

  static func pathSegment(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
      .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
  }

  // MARK: Wire types

  private struct CreatedServerResponse: Decodable {
    let serverId: String
    let defaultChannelId: String?
  }

  private struct InvitePreviewResponse: Decodable {
    let name: String?
    let iconUrl: String?
    let serverId: String?
    let applicationForm: FormRow?
  }

  private struct FormEnvelope: Decodable { let applicationForm: FormRow }

  private struct SettingsEnvelope: Decodable {
    let applicationsEnabled: Bool
    let applicationForm: FormRow
  }

  private struct ApplicationsEnvelope: Decodable { let applications: [ApplicationRow] }

  private struct FormRow: Decodable {
    let version: Int?
    let questions: [QuestionRow]?

    var domain: EchoApplicationForm {
      EchoApplicationForm(
        version: max(1, version ?? 1), questions: (questions ?? []).compactMap(\.domain))
    }
  }

  private struct QuestionRow: Decodable {
    let id: String
    let type: String
    let label: String
    let required: Bool?
    let options: [String]?
    let placeholder: String?
    let maxLength: Int?
    let maxBytes: Int?

    var domain: EchoApplicationQuestion? {
      guard let kind = EchoApplicationQuestionKind(rawValue: type) else { return nil }
      return EchoApplicationQuestion(
        id: id, kind: kind, label: label, required: required ?? false,
        options: options ?? [], placeholder: placeholder ?? "", maxLength: maxLength,
        maxBytes: maxBytes)
    }
  }

  private struct ApplicationRow: Decodable {
    let id: String
    let userId: String
    let status: String
    let source: String?
    let createdAt: String?
    let answers: [String: AnswerValue]?

    var domain: EchoServerApplication {
      EchoServerApplication(
        id: id, userID: userId, status: status, source: source ?? "", createdAt: createdAt ?? "",
        answers: (answers ?? [:]).mapValues(\.domain))
    }
  }

  private enum AnswerValue: Decodable {
    case text(String)
    case list([String])
    case file(EchoApplicationUpload)

    private struct FileRow: Decodable {
      let name: String
      let publicUrl: String
      let key: String?
      let size: Int?
      let contentType: String?
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      if let text = try? container.decode(String.self) {
        self = .text(text)
      } else if let list = try? container.decode([String].self) {
        self = .list(list)
      } else if let file = try? container.decode(FileRow.self) {
        self = .file(
          EchoApplicationUpload(
            name: file.name, key: file.key ?? "", url: file.publicUrl, size: file.size,
            contentType: file.contentType))
      } else {
        self = .text("")
      }
    }

    var domain: EchoApplicationAnswer {
      switch self {
      case .text(let value): .text(value)
      case .list(let values): .list(values)
      case .file(let upload): .file(upload)
      }
    }
  }
}
