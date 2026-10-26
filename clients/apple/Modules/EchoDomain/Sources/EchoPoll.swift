import Foundation

public struct EchoPollOption: Codable, Equatable, Sendable, Identifiable {
  public let id: String
  public let text: String
  public let emoji: String?
  public let votes: Int
  public let voterIDs: [String]

  public init(
    id: String,
    text: String,
    emoji: String? = nil,
    votes: Int = 0,
    voterIDs: [String] = []
  ) {
    self.id = id
    self.text = text
    self.emoji = emoji
    self.votes = votes
    self.voterIDs = voterIDs
  }

  enum CodingKeys: String, CodingKey {
    case id, text, emoji, votes
    case voterIDs = "voterIds"
  }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    text = try values.decode(String.self, forKey: .text)
    emoji = try values.decodeIfPresent(String.self, forKey: .emoji)
    votes = try values.decodeIfPresent(Int.self, forKey: .votes) ?? 0
    voterIDs = try values.decodeIfPresent([String].self, forKey: .voterIDs) ?? []
  }
}

public struct EchoPoll: Codable, Equatable, Sendable {
  public let question: String
  public let options: [EchoPollOption]
  public let endsAt: String?
  public let anonymous: Bool

  public init(
    question: String,
    options: [EchoPollOption],
    endsAt: String? = nil,
    anonymous: Bool = false
  ) {
    self.question = question
    self.options = options
    self.endsAt = endsAt
    self.anonymous = anonymous
  }

  enum CodingKeys: String, CodingKey { case question, options, endsAt, anonymous }

  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    question = try values.decode(String.self, forKey: .question)
    options = try values.decode([EchoPollOption].self, forKey: .options)
    endsAt = try values.decodeIfPresent(String.self, forKey: .endsAt)
    anonymous = try values.decodeIfPresent(Bool.self, forKey: .anonymous) ?? false
  }

  public var totalVotes: Int {
    options.reduce(0) { $0 + $1.votes }
  }

  public var hasEnded: Bool {
    guard let endsAt, let end = Self.parseDate(endsAt) else { return false }
    return end.timeIntervalSinceNow <= 0
  }

  public func hasVoted(userID: String) -> Bool {
    options.contains { $0.voterIDs.contains(userID) }
  }

  public func isSelected(optionID: String, userID: String) -> Bool {
    options.first { $0.id == optionID }?.voterIDs.contains(userID) == true
  }

  public func applyingVote(userID: String, optionID: String) -> EchoPoll {
    guard options.contains(where: { $0.id == optionID }), !hasEnded else { return self }
    let nextOptions = options.map { option -> EchoPollOption in
      let votedHere = option.voterIDs.contains(userID)
      if option.id == optionID {
        guard !votedHere else { return option }
        return EchoPollOption(
          id: option.id, text: option.text, emoji: option.emoji,
          votes: option.votes + 1, voterIDs: option.voterIDs + [userID])
      }
      guard votedHere else { return option }
      return EchoPollOption(
        id: option.id, text: option.text, emoji: option.emoji,
        votes: max(0, option.votes - 1),
        voterIDs: option.voterIDs.filter { $0 != userID })
    }
    return EchoPoll(
      question: question, options: nextOptions, endsAt: endsAt, anonymous: anonymous)
  }

  public static func parseDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    let basic = ISO8601DateFormatter()
    basic.formatOptions = [.withInternetDateTime]
    return basic.date(from: value)
  }
}

/// Local outbound delivery for optimistic sends (never decoded from the API).
