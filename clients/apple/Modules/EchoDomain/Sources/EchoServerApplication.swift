import Foundation

/// Question kinds accepted by `application_form` (web `EchoApplicationQuestionType`).
public enum EchoApplicationQuestionKind: String, CaseIterable, Sendable {
  case short, long, single, multi, attachment

  public var isChoice: Bool { self == .single || self == .multi }
}

/// One join-application question (web `EchoApplicationQuestionDto`).
public struct EchoApplicationQuestion: Identifiable, Equatable, Sendable {
  public static let maxOptions = 25
  public static let maxQuestions = 25
  public static let shortCap = 500
  public static let longCap = 4000

  public var id: String
  public var kind: EchoApplicationQuestionKind
  public var label: String
  public var required: Bool
  public var options: [String]
  public var placeholder: String
  public var maxLength: Int?
  public var maxBytes: Int?

  public init(
    id: String,
    kind: EchoApplicationQuestionKind,
    label: String = "",
    required: Bool = true,
    options: [String] = [],
    placeholder: String = "",
    maxLength: Int? = nil,
    maxBytes: Int? = nil
  ) {
    self.id = id
    self.kind = kind
    self.label = label
    self.required = required
    self.options = options
    self.placeholder = placeholder
    self.maxLength = maxLength
    self.maxBytes = maxBytes
  }

  /// Fresh question with a stable id (`^[a-zA-Z0-9_-]{8,64}$` on the server).
  public static func blank(_ kind: EchoApplicationQuestionKind) -> EchoApplicationQuestion {
    EchoApplicationQuestion(
      id: UUID().uuidString.lowercased(),
      kind: kind,
      options: kind.isChoice ? [""] : [],
      maxLength: kind == .short ? shortCap : (kind == .long ? longCap : nil)
    )
  }

  /// Max characters a member may type for text questions.
  public var characterCap: Int {
    min(kind == .short ? Self.shortCap : Self.longCap, maxLength ?? .max)
  }
}

public enum EchoApplicationFormIssue: Equatable, Sendable {
  case tooManyQuestions, emptyLabel, noOptions, tooManyOptions, duplicateOptions
}

/// Versioned list of questions (web `EchoApplicationFormDto`).
public struct EchoApplicationForm: Equatable, Sendable {
  public var version: Int
  public var questions: [EchoApplicationQuestion]

  public init(version: Int = 1, questions: [EchoApplicationQuestion] = []) {
    self.version = version
    self.questions = questions
  }

  /// Mirrors web `validateFormForSave` plus the server's 25-question cap.
  public func firstIssue() -> EchoApplicationFormIssue? {
    if questions.count > EchoApplicationQuestion.maxQuestions { return .tooManyQuestions }
    for question in questions {
      if question.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .emptyLabel
      }
      guard question.kind.isChoice else { continue }
      let options = question.options
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      if options.isEmpty { return .noOptions }
      if options.count > EchoApplicationQuestion.maxOptions { return .tooManyOptions }
      if Set(options.map { $0.lowercased() }).count != options.count { return .duplicateOptions }
    }
    return nil
  }
}

/// Server + form needed to show the member-facing application modal.
public struct EchoJoinApplicationContext: Identifiable, Equatable, Sendable {
  public enum Source: String, Sendable { case invite, directory }

  public var id: String { serverID }
  public let serverID: String
  public let serverName: String
  public let iconURL: String?
  public let source: Source
  public let inviteToken: String?
  public let form: EchoApplicationForm

  public init(
    serverID: String, serverName: String, iconURL: String?, source: Source,
    inviteToken: String?, form: EchoApplicationForm
  ) {
    self.serverID = serverID
    self.serverName = serverName
    self.iconURL = iconURL
    self.source = source
    self.inviteToken = inviteToken
    self.form = form
  }
}

/// An uploaded join-application attachment (web `EchoApplicationAttachmentAnswerDto`).
public struct EchoApplicationUpload: Equatable, Sendable {
  public let name: String
  public let key: String
  public let url: String
  public let size: Int?
  public let contentType: String?

  public init(name: String, key: String, url: String, size: Int? = nil, contentType: String? = nil) {
    self.name = name
    self.key = key
    self.url = url
    self.size = size
    self.contentType = contentType
  }
}

/// A submitted or stored answer value.
public enum EchoApplicationAnswer: Equatable, Sendable {
  case text(String)
  case list([String])
  case file(EchoApplicationUpload)
}

/// Row from `GET /servers/:id/applications`.
public struct EchoServerApplication: Identifiable, Equatable, Sendable {
  public let id: String
  public let userID: String
  public let status: String
  public let source: String
  public let createdAt: String
  public let answers: [String: EchoApplicationAnswer]

  public init(
    id: String, userID: String, status: String, source: String, createdAt: String,
    answers: [String: EchoApplicationAnswer]
  ) {
    self.id = id
    self.userID = userID
    self.status = status
    self.source = source
    self.createdAt = createdAt
    self.answers = answers
  }
}
