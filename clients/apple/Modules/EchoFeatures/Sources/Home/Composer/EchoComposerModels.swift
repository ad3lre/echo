import EchoNetworking
import Foundation
import Observation

struct EchoComposerAsset: Identifiable, Equatable, Sendable {
  let id: UUID
  let data: Data
  let filename: String
  let mimeType: String
  let kind: String

  init(
    id: UUID = UUID(),
    data: Data,
    filename: String,
    mimeType: String,
    kind: String
  ) {
    self.id = id
    self.data = data
    self.filename = filename
    self.mimeType = mimeType
    self.kind = kind
  }
}

struct EchoComposerPollOptionDraft: Identifiable, Equatable, Sendable {
  let id: UUID
  var text: String
  var emoji: String

  init(id: UUID = UUID(), text: String = "", emoji: String = "") {
    self.id = id
    self.text = text
    self.emoji = emoji
  }
}

struct EchoComposerPollDraft: Equatable, Sendable {
  var question = ""
  var options = [EchoComposerPollOptionDraft(), EchoComposerPollOptionDraft()]
  /// Minutes until the poll closes. `nil` means no time limit.
  var durationMinutes: Int? = nil
  var anonymous = false

  var filledOptions: [EchoComposerPollOptionDraft] {
    options.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  var isValid: Bool {
    !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filledOptions.count >= 2
  }

  var outgoingPoll: EchoOutgoingPoll? {
    guard isValid else { return nil }
    let endsAt = durationMinutes.flatMap { minutes -> String? in
      guard minutes > 0 else { return nil }
      let date = Date().addingTimeInterval(TimeInterval(minutes * 60))
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      return formatter.string(from: date)
    }
    return EchoOutgoingPoll(
      question: question.trimmingCharacters(in: .whitespacesAndNewlines),
      options: filledOptions.map { option in
        let emoji = option.emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        return EchoOutgoingPoll.Option(
          text: option.text.trimmingCharacters(in: .whitespacesAndNewlines),
          emoji: emoji.isEmpty ? nil : emoji)
      },
      endsAt: endsAt,
      anonymous: anonymous)
  }
}

struct EchoComposerSubmission: Sendable {
  let text: String
  let assets: [EchoComposerAsset]
  let gif: EchoGIF?
  let poll: EchoOutgoingPoll?
}

enum EchoComposerPanel: Equatable {
  case attachments
  case emoji
}

@MainActor
@Observable
final class EchoComposerState {
  var text = ""
  var assets: [EchoComposerAsset] = []
  var selectedGIF: EchoGIF?
  var poll: EchoComposerPollDraft?
  var panel: EchoComposerPanel?
  var isSending = false
  var errorMessage: String?

  var canSend: Bool {
    !isSending
      && (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        || !assets.isEmpty || selectedGIF != nil || poll?.isValid == true)
  }

  func insertEmoji(_ emoji: String) {
    text.append(emoji)
  }

  func removeAsset(_ id: UUID) {
    assets.removeAll { $0.id == id }
  }

  func reset() {
    text = ""
    assets = []
    selectedGIF = nil
    poll = nil
    panel = nil
    errorMessage = nil
  }
}
