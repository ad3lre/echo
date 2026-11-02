import EchoDomain
import Foundation

/// Admin side of join applications (web `ServerSettingsApplicationsSection`).
extension EchoServersModel {
  func loadApplicationForm(_ server: EchoServerSummary) async -> EchoApplicationForm? {
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.loadApplicationSettings(serverID: server.id, accessToken: token).form
    } catch {
      return nil
    }
  }

  func saveApplicationForm(_ server: EchoServerSummary, form: EchoApplicationForm) async -> Bool {
    actionErrorMessage = nil
    if let issue = form.firstIssue() {
      actionErrorMessage = Self.message(for: issue)
      return false
    }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.saveApplicationForm(serverID: server.id, form: form, accessToken: token)
      return true
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save the application form."))
      return false
    }
  }

  func loadPendingApplications(_ server: EchoServerSummary) async -> [EchoServerApplication]? {
    do {
      let token = try await auth.ensureAccessToken()
      return try await client.loadPendingApplications(serverID: server.id, accessToken: token)
    } catch {
      return nil
    }
  }

  func resolveApplication(
    _ server: EchoServerSummary, _ application: EchoServerApplication, approve: Bool
  ) async -> Bool {
    actionErrorMessage = nil
    do {
      let token = try await auth.ensureAccessToken()
      try await client.resolveApplication(
        serverID: server.id, applicationID: application.id, approve: approve,
        accessToken: token)
      if approve { await loadMembers(for: server.id) }
      return true
    } catch {
      actionErrorMessage = echoSettingsErrorMessage(
        error,
        fallback: approve
          ? EchoCopy.string("Echo couldn’t approve that application.")
          : EchoCopy.string("Echo couldn’t reject that application."))
      return false
    }
  }

  private static func message(for issue: EchoApplicationFormIssue) -> String {
    switch issue {
    case .tooManyQuestions: EchoCopy.string("Applications can have at most 25 questions.")
    case .emptyLabel: EchoCopy.string("Every question needs a label.")
    case .noOptions: EchoCopy.string("Choice questions need at least one option.")
    case .tooManyOptions: EchoCopy.string("Choice questions can have at most 25 options.")
    case .duplicateOptions: EchoCopy.string("Choice options must be unique.")
    }
  }
}
