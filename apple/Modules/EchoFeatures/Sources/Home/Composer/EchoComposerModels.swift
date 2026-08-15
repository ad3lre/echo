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

struct EchoComposerPollDraft: Equatable, Sendable {
  var question = ""
  var options = ["", ""]
  var durationHours: Int? = 24
  var anonymous = false

  var isValid: Bool {
    !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && options.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count >= 2
  }

  var outgoingPoll: EchoOutgoingPoll? {
    guard isValid else { return nil }
    let endsAt = durationHours.map {
      Calendar.current.date(byAdding: .hour, value: $0, to: Date()) ?? Date()
    }.map { date in
      ISO8601DateFormatter().string(from: date)
    }
    return EchoOutgoingPoll(
      question: question.trimmingCharacters(in: .whitespacesAndNewlines),
      options: options.compactMap { option in
        let text = option.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : EchoOutgoingPoll.Option(text: text)
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
