import Foundation

// MARK: - Events

/// `GET /servers/:id/events` management row (web `EchoServerEventManagementRow`).
public struct EchoServerEvent: Identifiable, Equatable, Sendable {
  public let id: String
  public let serverID: String
  public let title: String
  public let description: String
  public let imageURL: String
  public let startsAt: String
  public let endsAt: String
  public let timezoneLabel: String?
  public let channelID: String?
  public let channelName: String?
  public let customLocation: String?
  public let status: String
  public let maxAttendees: Int?
  public let goingCount: Int
  public let createdAt: String
  public let updatedAt: String
  public let discordScheduledEventID: String?

  public init(
    id: String,
    serverID: String = "",
    title: String,
    description: String = "",
    imageURL: String = "",
    startsAt: String,
    endsAt: String,
    timezoneLabel: String? = nil,
    channelID: String? = nil,
    channelName: String? = nil,
    customLocation: String? = nil,
    status: String = "scheduled",
    maxAttendees: Int? = nil,
    goingCount: Int = 0,
    createdAt: String = "",
    updatedAt: String = "",
    discordScheduledEventID: String? = nil
  ) {
    self.id = id
    self.serverID = serverID
    self.title = title
    self.description = description
    self.imageURL = imageURL
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.timezoneLabel = timezoneLabel
    self.channelID = channelID
    self.channelName = channelName
    self.customLocation = customLocation
    self.status = status
    self.maxAttendees = maxAttendees
    self.goingCount = goingCount
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.discordScheduledEventID = discordScheduledEventID
  }

  public var isCancelled: Bool { status == "cancelled" }

  public var hasDiscordMirror: Bool {
    !(discordScheduledEventID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
  }

  public var startDate: Date? { EchoServerSettingsDates.parse(startsAt) }
  public var endDate: Date? { EchoServerSettingsDates.parse(endsAt) }

  /// `#channel` or the custom location text, mirroring web `formatLocationSummary`.
  public var locationSummary: String {
    if let custom = customLocation?.trimmingCharacters(in: .whitespacesAndNewlines),
      !custom.isEmpty
    {
      return custom
    }
    if let name = channelName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
      return "#\(name)"
    }
    return ""
  }
}

/// Editable event fields sent on create / update.
public struct EchoServerEventDraft: Equatable, Sendable {
  public var title: String
  public var description: String
  public var imageURL: String
  public var startsAt: Date
  public var endsAt: Date
  /// Voice / stage / text channel when the location is a channel; `nil` otherwise.
  public var channelID: String?
  /// Free-form location when no channel is picked.
  public var customLocation: String?
  public var mirrorToDiscord: Bool

  public init(
    title: String = "",
    description: String = "",
    imageURL: String = "",
    startsAt: Date,
    endsAt: Date,
    channelID: String? = nil,
    customLocation: String? = nil,
    mirrorToDiscord: Bool = false
  ) {
    self.title = title
    self.description = description
    self.imageURL = imageURL
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.channelID = channelID
    self.customLocation = customLocation
    self.mirrorToDiscord = mirrorToDiscord
  }
}

public struct EchoServerEventSaveResult: Equatable, Sendable {
  public let id: String?
  /// `nil` when the server did not attempt a Discord mirror.
  public let discordMirrorOK: Bool?
  public let discordMirrorMessage: String?

  public init(id: String? = nil, discordMirrorOK: Bool? = nil, discordMirrorMessage: String? = nil)
  {
    self.id = id
    self.discordMirrorOK = discordMirrorOK
    self.discordMirrorMessage = discordMirrorMessage
  }
}

public enum EchoServerSettingsDates {
  public static func parse(_ value: String?) -> Date? {
    guard let value, !value.isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
  }

  /// UTC ISO string with milliseconds — matches `Date#toISOString()` on web.
  public static func iso(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}

// MARK: - Tickets

public struct EchoTicketFormField: Identifiable, Equatable, Sendable {
  public var id: String
  public var label: String
  /// `text`, `textarea`, or `select`.
  public var type: String
  public var placeholder: String?
  public var required: Bool
  public var options: [String]

  public init(
    id: String = UUID().uuidString,
    label: String = "",
    type: String = "textarea",
    placeholder: String? = nil,
    required: Bool = false,
    options: [String] = []
  ) {
    self.id = id
    self.label = label
    self.type = type
    self.placeholder = placeholder
    self.required = required
    self.options = options
  }
}

public struct EchoTicketCategory: Identifiable, Equatable, Sendable {
  public var id: String
  public var name: String
  public var emoji: String

  public init(id: String = UUID().uuidString, name: String = "", emoji: String = "") {
    self.id = id
    self.name = name
    self.emoji = emoji
  }
}

/// `GET/PATCH /servers/:id/ticket-config`.
public struct EchoTicketConfig: Equatable, Sendable {
  public var enabled: Bool
  public var panelChannelID: String?
  public var ticketCategoryID: String?
  public var handlerRoleIDs: [String]
  public var logChannelID: String?
  public var formFields: [EchoTicketFormField]
  public var maxOpenPerUser: Int
  public var greetingMessage: String
  public var requireCategory: Bool
  public var ticketCategories: [EchoTicketCategory]

  public init(
    enabled: Bool = false,
    panelChannelID: String? = nil,
    ticketCategoryID: String? = nil,
    handlerRoleIDs: [String] = [],
    logChannelID: String? = nil,
    formFields: [EchoTicketFormField] = [],
    maxOpenPerUser: Int = 3,
    greetingMessage: String = "",
    requireCategory: Bool = false,
    ticketCategories: [EchoTicketCategory] = []
  ) {
    self.enabled = enabled
    self.panelChannelID = panelChannelID
    self.ticketCategoryID = ticketCategoryID
    self.handlerRoleIDs = handlerRoleIDs
    self.logChannelID = logChannelID
    self.formFields = formFields
    self.maxOpenPerUser = maxOpenPerUser
    self.greetingMessage = greetingMessage
    self.requireCategory = requireCategory
    self.ticketCategories = ticketCategories
  }
}

// MARK: - Emoji & stickers

public struct EchoServerEmoji: Identifiable, Equatable, Sendable {
  public let id: String
  public var name: String
  public let animated: Bool
  public let imageURL: String
  public let useCount: Int

  public init(id: String, name: String, animated: Bool, imageURL: String, useCount: Int = 0) {
    self.id = id
    self.name = name
    self.animated = animated
    self.imageURL = imageURL
    self.useCount = useCount
  }
}

public struct EchoServerSticker: Identifiable, Equatable, Sendable {
  public let id: String
  public var name: String
  /// `png`, `apng`, `gif`, or `lottie`.
  public let format: String
  public let imageURL: String
  public let useCount: Int

  public init(id: String, name: String, format: String, imageURL: String, useCount: Int = 0) {
    self.id = id
    self.name = name
    self.format = format
    self.imageURL = imageURL
    self.useCount = useCount
  }
}

/// A pack in `GET /servers/:id/emoji-library` (stickers attached from `sticker-library`).
public struct EchoServerEmojiPack: Identifiable, Equatable, Sendable {
  public let id: String
  public var name: String
  /// `market` or `custom`.
  public let source: String
  public let marketPackID: String?
  public var description: String
  public var listedInMarket: Bool
  public var tags: [String]
  public var emojis: [EchoServerEmoji]
  public var stickers: [EchoServerSticker]

  public init(
    id: String,
    name: String,
    source: String,
    marketPackID: String? = nil,
    description: String = "",
    listedInMarket: Bool = false,
    tags: [String] = [],
    emojis: [EchoServerEmoji] = [],
    stickers: [EchoServerSticker] = []
  ) {
    self.id = id
    self.name = name
    self.source = source
    self.marketPackID = marketPackID
    self.description = description
    self.listedInMarket = listedInMarket
    self.tags = tags
    self.emojis = emojis
    self.stickers = stickers
  }

  public var isCustom: Bool { source == "custom" }
  public var expressionCount: Int { emojis.count + stickers.count }
}

/// `GET /emoji-market/packs` row.
public struct EchoEmojiMarketPack: Identifiable, Equatable, Sendable {
  public let id: String
  public let name: String
  public let description: String
  public let authorServerName: String?
  public let totalUseCount: Int
  public let tags: [String]
  public let emojiCount: Int
  public let previewEmojiURL: String?
  public let previewURLs: [String]

  public init(
    id: String,
    name: String,
    description: String = "",
    authorServerName: String? = nil,
    totalUseCount: Int = 0,
    tags: [String] = [],
    emojiCount: Int = 0,
    previewEmojiURL: String? = nil,
    previewURLs: [String] = []
  ) {
    self.id = id
    self.name = name
    self.description = description
    self.authorServerName = authorServerName
    self.totalUseCount = totalUseCount
    self.tags = tags
    self.emojiCount = emojiCount
    self.previewEmojiURL = previewEmojiURL
    self.previewURLs = previewURLs
  }
}

// MARK: - Discord

/// `GET /servers/:id/discord-import` state.
public struct EchoDiscordImportState: Equatable, Sendable {
  public let sourceLabel: String
  public let metadataImported: Bool
  public let rolesImported: Bool
  public let membersImported: Bool
  public let channelsImported: Bool
  public let metadataImportedAt: String?
  public let rolesImportedAt: String?
  public let membersImportedAt: String?
  public let channelsImportedAt: String?
  public let roleCount: Int
  public let categoryCount: Int
  public let channelCount: Int
  public let userMapEntryCount: Int
  public let warnings: [String]
  public let lastError: String
  public let nextStep: String?

  public init(
    sourceLabel: String = "",
    metadataImported: Bool = false,
    rolesImported: Bool = false,
    membersImported: Bool = false,
    channelsImported: Bool = false,
    metadataImportedAt: String? = nil,
    rolesImportedAt: String? = nil,
    membersImportedAt: String? = nil,
    channelsImportedAt: String? = nil,
    roleCount: Int = 0,
    categoryCount: Int = 0,
    channelCount: Int = 0,
    userMapEntryCount: Int = 0,
    warnings: [String] = [],
    lastError: String = "",
    nextStep: String? = nil
  ) {
    self.sourceLabel = sourceLabel
    self.metadataImported = metadataImported
    self.rolesImported = rolesImported
    self.membersImported = membersImported
    self.channelsImported = channelsImported
    self.metadataImportedAt = metadataImportedAt
    self.rolesImportedAt = rolesImportedAt
    self.membersImportedAt = membersImportedAt
    self.channelsImportedAt = channelsImportedAt
    self.roleCount = roleCount
    self.categoryCount = categoryCount
    self.channelCount = channelCount
    self.userMapEntryCount = userMapEntryCount
    self.warnings = warnings
    self.lastError = lastError
    self.nextStep = nextStep
  }
}

/// `GET/PUT /servers/:id/channels/:cid/discord-bridge`.
public struct EchoDiscordBridgeState: Equatable, Sendable {
  public var inboundEnabled: Bool
  public var outboundEnabled: Bool
  public var hasWebhook: Bool
  public var discordGuildID: String
  public var discordChannelID: String
  /// True once any link (guild/channel/webhook) is stored for the channel.
  public var hasBridge: Bool

  public init(
    inboundEnabled: Bool = false, outboundEnabled: Bool = false, hasWebhook: Bool = false,
    discordGuildID: String = "", discordChannelID: String = "", hasBridge: Bool = false
  ) {
    self.inboundEnabled = inboundEnabled
    self.outboundEnabled = outboundEnabled
    self.hasWebhook = hasWebhook
    self.discordGuildID = discordGuildID
    self.discordChannelID = discordChannelID
    self.hasBridge = hasBridge || hasWebhook
  }
}
