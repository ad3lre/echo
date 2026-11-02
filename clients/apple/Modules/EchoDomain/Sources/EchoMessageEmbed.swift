import Foundation

/// Wire `embeds[]` (contracts `Embed`): Tenor/Giphy GIFs plus link-preview cards.
public struct EchoMessageEmbed: Codable, Equatable, Sendable {
  public struct Media: Codable, Equatable, Sendable {
    public let url: String
    public let width: Int?
    public let height: Int?

    public init(url: String, width: Int? = nil, height: Int? = nil) {
      self.url = url
      self.width = width
      self.height = height
    }
  }

  public struct Footer: Codable, Equatable, Sendable {
    public let text: String
    public let iconURL: String?

    enum CodingKeys: String, CodingKey {
      case text
      case iconURL = "icon_url"
    }

    public init(text: String, iconURL: String? = nil) {
      self.text = text
      self.iconURL = iconURL
    }
  }

  public struct Author: Codable, Equatable, Sendable {
    public let name: String
    public let url: String?
    public let iconURL: String?

    enum CodingKeys: String, CodingKey {
      case name, url
      case iconURL = "icon_url"
    }

    public init(name: String, url: String? = nil, iconURL: String? = nil) {
      self.name = name
      self.url = url
      self.iconURL = iconURL
    }
  }

  public struct Field: Codable, Equatable, Sendable {
    public let name: String
    public let value: String
    public let inline: Bool

    enum CodingKeys: String, CodingKey { case name, value, inline }

    public init(name: String, value: String, inline: Bool = false) {
      self.name = name
      self.value = value
      self.inline = inline
    }

    public init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      name = try values.decode(String.self, forKey: .name)
      value = try values.decode(String.self, forKey: .value)
      inline = try values.decodeIfPresent(Bool.self, forKey: .inline) ?? false
    }
  }

  public struct Video: Codable, Equatable, Sendable {
    public let kind: String
    public let embedURL: String

    enum CodingKeys: String, CodingKey {
      case kind
      case embedURL = "embedUrl"
    }

    public init(kind: String, embedURL: String) {
      self.kind = kind
      self.embedURL = embedURL
    }
  }

  /// In-app jump preview for pasted message links (web renders these separately).
  public struct Jump: Codable, Equatable, Sendable {
    public let channelID: String
    public let messageID: String

    public init(channelID: String, messageID: String) {
      self.channelID = channelID
      self.messageID = messageID
    }

    enum CodingKeys: String, CodingKey {
      case channelID = "channelId"
      case messageID = "messageId"
    }
  }

  public let url: String?
  public let title: String?
  public let description: String?
  public let provider: String?
  /// RGB integer accent (`0xRRGGBB`); nil → host-based default.
  public let color: Int?
  public let timestamp: String?
  public let footer: Footer?
  public let author: Author?
  public let fields: [Field]
  public let video: Video?
  public let jump: Jump?
  /// `not_found` | `forbidden` | `invalid_link` | `embed_links_denied` | `network_error`.
  public let jumpError: String?
  public let image: Media?
  public let thumbnail: Media?

  enum CodingKeys: String, CodingKey {
    case url, title, description, provider, color, timestamp, footer, author, fields, video
    case jump = "echoJump"
    case jumpError = "echoJumpError"
    case image, thumbnail
  }

  public init(
    url: String? = nil,
    title: String? = nil,
    description: String? = nil,
    provider: String? = nil,
    color: Int? = nil,
    timestamp: String? = nil,
    footer: Footer? = nil,
    author: Author? = nil,
    fields: [Field] = [],
    video: Video? = nil,
    jump: Jump? = nil,
    jumpError: String? = nil,
    image: Media? = nil,
    thumbnail: Media? = nil
  ) {
    self.url = url
    self.title = title
    self.description = description
    self.provider = provider
    self.color = color
    self.timestamp = timestamp
    self.footer = footer
    self.author = author
    self.fields = fields
    self.video = video
    self.jump = jump
    self.jumpError = jumpError
    self.image = image
    self.thumbnail = thumbnail
  }

  /// Lenient: one malformed optional sub-object must not drop the whole message page.
  public init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    url = try? values.decodeIfPresent(String.self, forKey: .url)
    title = try? values.decodeIfPresent(String.self, forKey: .title)
    description = try? values.decodeIfPresent(String.self, forKey: .description)
    provider = try? values.decodeIfPresent(String.self, forKey: .provider)
    color = (try? values.decodeIfPresent(Int.self, forKey: .color)) ?? nil
    timestamp = try? values.decodeIfPresent(String.self, forKey: .timestamp)
    footer = (try? values.decodeIfPresent(Footer.self, forKey: .footer)) ?? nil
    author = (try? values.decodeIfPresent(Author.self, forKey: .author)) ?? nil
    fields = (try? values.decodeIfPresent([Field].self, forKey: .fields)) ?? []
    video = (try? values.decodeIfPresent(Video.self, forKey: .video)) ?? nil
    jump = (try? values.decodeIfPresent(Jump.self, forKey: .jump)) ?? nil
    jumpError = (try? values.decodeIfPresent(String.self, forKey: .jumpError)) ?? nil
    image = (try? values.decodeIfPresent(Media.self, forKey: .image)) ?? nil
    thumbnail = (try? values.decodeIfPresent(Media.self, forKey: .thumbnail)) ?? nil
  }
}
