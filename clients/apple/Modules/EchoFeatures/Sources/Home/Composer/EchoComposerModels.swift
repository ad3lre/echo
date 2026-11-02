import EchoDomain
import EchoNetworking
import Foundation
import Observation

struct EchoComposerAsset: Identifiable, Equatable, Sendable {
  let id: UUID
  let data: Data
  let filename: String
  let mimeType: String
  let kind: String
  /// PHAsset local identifier when this draft came from the in-composer photo grid.
  let sourcePhotoID: String?
  /// Web pending-media spoiler flag (`MessageAttachmentPayload.spoiler`).
  var spoiler: Bool

  init(
    id: UUID = UUID(),
    data: Data,
    filename: String,
    mimeType: String,
    kind: String,
    sourcePhotoID: String? = nil,
    spoiler: Bool = false
  ) {
    self.id = id
    self.data = data
    self.filename = filename
    self.mimeType = mimeType
    self.kind = kind
    self.sourcePhotoID = sourcePhotoID
    self.spoiler = spoiler
  }

  var isVisual: Bool {
    kind == "image" || kind == "video" || mimeType.hasPrefix("image/")
      || mimeType.hasPrefix("video/")
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
  /// Spoiler flag for the selected GIF (EchoGIF itself is immutable).
  let gifSpoiler: Bool
  let poll: EchoOutgoingPoll?
  let replyTo: EchoMessageReplyTo?
  /// Guild library sticker — sent over the socket (`stickerIds`), never REST.
  let sticker: EchoServerSticker?
  /// Picked `@user` / `@role` / `@everyone` / `#channel` spans — the server trusts only these.
  let mentions: [EchoMessageMention]
  /// v2 doc when the body carries image slots / button rows (slash-command blocks).
  let contentJSON: EchoJSONValue?

  init(
    text: String,
    assets: [EchoComposerAsset],
    gif: EchoGIF?,
    poll: EchoOutgoingPoll?,
    replyTo: EchoMessageReplyTo? = nil,
    sticker: EchoServerSticker? = nil,
    mentions: [EchoMessageMention] = [],
    contentJSON: EchoJSONValue? = nil,
    gifSpoiler: Bool = false
  ) {
    self.mentions = mentions
    self.contentJSON = contentJSON
    self.text = text
    self.assets = assets
    self.gif = gif
    self.gifSpoiler = gifSpoiler
    self.poll = poll
    self.replyTo = replyTo
    self.sticker = sticker
  }
}

/// Per-channel facts the composer needs beyond its draft (guild caps, mention catalog).
struct EchoComposerAccess: Equatable {
  var mentionOptions: [EchoMentionOption] = []
  /// `@everyone` / `@active` rows — server still checks MENTION_EVERYONE.
  var allowBroadcastMentions = true
  /// BYPASS_SLOWMODE / MANAGE_MESSAGES / MANAGE_CHANNELS.
  var canBypassSlowmode = false
  var mediaAllowed = true
  var pollAllowed = true
  /// USE_EXTERNAL_EMOJI — custom / server emoji (web `canUseExternalEmoji`).
  var externalEmojiAllowed = true
  /// Read-only channel / communication timeout — replaces the composer with a banner.
  var sendLock: EchoComposerSendLock?
}

enum EchoComposerPanel: Equatable {
  case attachments
  case emoji
}

@MainActor
@Observable
final class EchoComposerState {
  var text = "" { didSet { revision &+= 1 } }
  var assets: [EchoComposerAsset] = [] { didSet { revision &+= 1 } }
  var selectedGIF: EchoGIF? {
    didSet {
      if selectedGIF == nil { gifSpoiler = false }
      revision &+= 1
    }
  }
  /// Spoiler for `selectedGIF` (web pending GIF spoiler).
  var gifSpoiler = false { didSet { revision &+= 1 } }
  var poll: EchoComposerPollDraft? { didSet { revision &+= 1 } }
  var replyTo: EchoMessageReplyTo? { didSet { revision &+= 1 } }
  /// Mentions picked from autocomplete / the member list; resolved against `text` on send.
  var mentionTokens: [EchoComposerMentionToken] = []
  private(set) var revision = 0
  private(set) var pendingPhotos: [String: UUID] = [:]
  var remainingCapacity: Int { max(0, 10 - assets.count - pendingPhotos.count) }
  var panel: EchoComposerPanel?
  var isSending = false
  /// Channel slowmode is counting down (`EchoSlowmodeBanner`); sending is blocked.
  var slowmodeLocked = false
  var errorMessage: String?
  /// UTF-16 offset into wire `text` for the composer caret (attachments expand to tokens).
  var tokenCaretUTF16 = 0
  /// Consumed once by `EchoInlineMarkdownEditor` after a programmatic insert.
  var pendingPreferredTokenOffset: Int?
  /// Server answered `SLOWMODE`; the countdown restarts from this instant.
  var slowmodeRejectedAt: Date?
  /// `/gif` opens the expression picker on its GIFs tab.
  var pickerStartsOnGIFs = false
  /// Active `@` / `#` trigger and `/command` trigger before the caret.
  var mentionTrigger: EchoMentionTrigger?
  var slashTrigger: (start: Int, query: String)?
  var suggestionIndex = 0
  /// Trigger start the user dismissed with Esc — stays closed until the text moves on.
  var dismissedTriggerStart: Int?

  var canSend: Bool {
    !isSending && !slowmodeLocked
      && (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        || !assets.isEmpty || selectedGIF != nil || poll?.isValid == true)
  }

  func insertEmoji(_ emoji: String) {
    let insert = emoji
    guard !insert.isEmpty else { return }
    let ns = text as NSString
    let caret = min(max(0, tokenCaretUTF16), ns.length)
    text = ns.replacingCharacters(in: NSRange(location: caret, length: 0), with: insert)
    let after = caret + (insert as NSString).length
    tokenCaretUTF16 = after
    pendingPreferredTokenOffset = after
  }

  /// Text → wire body: trims, resolves picked mentions, and builds `contentJson` for rich blocks.
  /// `forEdit` always builds the v2 doc (PATCH requires `contentJson` for v2 messages).
  func richContent(forEdit: Bool = false) -> (text: String, built: EchoOutgoingRichContent) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let mentions = EchoMentionResolver.resolve(text: trimmed, tokens: mentionTokens)
    return (
      trimmed,
      EchoComposerDocBuilder.build(text: trimmed, mentions: mentions, forceDocument: forEdit)
    )
  }

  /// Edit mode: turns the message's stored spans back into picked tokens so they re-resolve
  /// (and survive the PATCH) exactly like a fresh send.
  func seedMentionTokens(from message: EchoMessage) {
    mentionTokens = EchoMentionSeeding.tokens(content: message.content, mentions: message.mentions)
  }

  /// Replaces `[start, caret)` (a typed trigger) with the picked mention + trailing space.
  func insertMention(_ option: EchoMentionOption, replacing trigger: EchoMentionTrigger?) {
    let ns = text as NSString
    let caret = min(max(0, tokenCaretUTF16), ns.length)
    var start = caret
    var end = caret
    if let trigger, trigger.start <= caret {
      start = trigger.start
      // Consume the rest of the query so a lagging caret cannot strand a letter.
      let tail = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
      while end < ns.length,
        let scalar = ns.substring(with: NSRange(location: end, length: 1)).unicodeScalars.first,
        tail.contains(scalar)
      {
        end += 1
      }
    }
    let insert = option.insertText + " "
    text = ns.replacingCharacters(in: NSRange(location: start, length: end - start), with: insert)
    mentionTokens.append(EchoComposerMentionToken(option: option))
    let after = start + (insert as NSString).length
    tokenCaretUTF16 = after
    pendingPreferredTokenOffset = after
  }

  /// True when every pending asset/GIF is marked spoiler (web `allSpoilers`).
  var allPendingSpoilers: Bool {
    let hasMedia = !assets.isEmpty || selectedGIF != nil
    guard hasMedia else { return false }
    let assetsOk = assets.allSatisfy(\.spoiler)
    let gifOk = selectedGIF == nil || gifSpoiler
    return assetsOk && gifOk
  }

  func toggleAssetSpoiler(_ id: UUID) {
    guard let i = assets.firstIndex(where: { $0.id == id }) else { return }
    assets[i].spoiler.toggle()
  }

  func toggleAllSpoilers() {
    let next = !allPendingSpoilers
    for i in assets.indices { assets[i].spoiler = next }
    if selectedGIF != nil { gifSpoiler = next }
  }

  func removeAsset(_ id: UUID) {
    assets.removeAll { $0.id == id }
  }

  func removeAsset(sourcePhotoID: String) {
    assets.removeAll { $0.sourcePhotoID == sourcePhotoID }
  }

  func asset(forSourcePhotoID id: String) -> EchoComposerAsset? {
    assets.first { $0.sourcePhotoID == id }
  }

  /// 1-based selection order for gallery badges; `nil` when not selected.
  func selectionIndex(forSourcePhotoID id: String) -> Int? {
    guard let index = assets.firstIndex(where: { $0.sourcePhotoID == id }) else { return nil }
    return index + 1
  }

  var selectedPhotoIDs: [String] {
    assets.compactMap(\.sourcePhotoID) + pendingPhotos.keys.sorted()
  }

  func reservePhoto(_ id: String) -> UUID? {
    if pendingPhotos.removeValue(forKey: id) != nil { revision &+= 1; return nil }
    guard remainingCapacity > 0 else { return nil }
    let request = UUID()
    pendingPhotos[id] = request
    revision &+= 1
    return request
  }

  func finishPhoto(_ id: String, request: UUID, asset: EchoComposerAsset?) {
    guard pendingPhotos[id] == request else { return }
    pendingPhotos[id] = nil
    if let asset, assets.count < 10 {
      poll = nil
      selectedGIF = nil
      assets.append(asset)
    }
  }

  func reset(clearReply: Bool = true) {
    pendingPhotos = [:]
    text = ""
    mentionTokens = []
    mentionTrigger = nil
    slashTrigger = nil
    suggestionIndex = 0
    dismissedTriggerStart = nil
    assets = []
    selectedGIF = nil
    gifSpoiler = false
    poll = nil
    panel = nil
    errorMessage = nil
    tokenCaretUTF16 = 0
    pendingPreferredTokenOffset = nil
    if clearReply { replyTo = nil }
  }
}
