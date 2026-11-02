import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Member-facing ticket intake for one server (web `useServerTicketsStore` load + submit).
/// Staff controls (assign / close / list) are not part of this model.
@MainActor
@Observable
final class EchoTicketIntakeModel {
  let serverID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var config: EchoTicketConfig?
  private(set) var isSubmitting = false
  var errorMessage: String?

  var subject = ""
  var categoryID: String?
  var answers: [String: String] = [:]

  /// Last known config per server so re-opening the panel channel doesn't flash.
  private static var configCache: [String: EchoTicketConfig] = [:]

  init(serverID: String, baseURL: URL, auth: EchoAuthenticationModel) {
    self.serverID = serverID
    self.client = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
    self.config = Self.configCache[serverID]
  }

  /// Panel card shows only in the configured panel channel while tickets are enabled.
  func showsPanel(in channelID: String) -> Bool {
    guard let config, config.enabled else { return false }
    let panel = config.panelChannelID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return !panel.isEmpty && panel == channelID
  }

  func loadConfig() async {
    do {
      let token = try await auth.ensureAccessToken()
      let loaded = try await client.loadTicketConfig(serverID: serverID, accessToken: token)
      Self.configCache[serverID] = loaded
      config = loaded
    } catch {
      // Intake stays hidden when config can't load; nothing to surface in the chat.
    }
  }

  func resetForm() {
    subject = ""
    categoryID = nil
    answers = [:]
    errorMessage = nil
  }

  /// Returns the created ticket, or `nil` after setting `errorMessage`.
  func submit() async -> EchoTicket? {
    guard !isSubmitting else { return nil }
    if let problem = validationMessage() {
      errorMessage = problem
      return nil
    }
    isSubmitting = true
    errorMessage = nil
    defer { isSubmitting = false }
    let filled = answers.compactMapValues { value -> String? in
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.createTicket(
        serverID: serverID,
        subject: subject,
        category: categoryID,
        answers: filled,
        accessToken: token)
    } catch {
      errorMessage = Self.message(for: error, maxOpen: config?.maxOpenPerUser ?? 0)
      return nil
    }
  }

  private func validationMessage() -> String? {
    if subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return EchoCopy.string("Add a subject for your ticket.")
    }
    guard let config else { return nil }
    if config.requireCategory, (categoryID ?? "").isEmpty {
      return EchoCopy.string("Choose a category for your ticket.")
    }
    for field in config.formFields where field.required {
      let value = answers[field.id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if value.isEmpty {
        return EchoCopy.format("“%@” is required.", field.label)
      }
    }
    return nil
  }

  /// Server reasons come back as the error message (`TICKET_CREATE_FAILED`).
  static func message(for error: Error, maxOpen: Int) -> String {
    guard case EchoHomeClientError.server(let status, _, let raw) = error else {
      return EchoCopy.string("Echo couldn’t create your ticket.")
    }
    let reason = raw?.lowercased() ?? ""
    if reason.contains("disabled") {
      return EchoCopy.string("Tickets are turned off on this server.")
    }
    if reason.contains("max_open") || status == 429 {
      return maxOpen > 0
        ? EchoCopy.format("You already have %lld open tickets. Close one to open another.", maxOpen)
        : EchoCopy.string("You already have too many open tickets.")
    }
    if reason.contains("category") && status == 400 {
      return EchoCopy.string("Choose a valid category for your ticket.")
    }
    return EchoCopy.string("Echo couldn’t create your ticket.")
  }
}
