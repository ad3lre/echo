import EchoDomain
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

/// Pasteboard writes shared by message menu actions.
enum EchoClipboard {
  static func copy(_ string: String) {
    #if os(iOS)
      UIPasteboard.general.string = string
    #else
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(string, forType: .string)
    #endif
  }

  @discardableResult
  static func copy(imageData data: Data) -> Bool {
    #if os(iOS)
      guard let image = UIImage(data: data) else { return false }
      UIPasteboard.general.image = image
      return true
    #else
      guard let image = NSImage(data: data) else { return false }
      NSPasteboard.general.clearContents()
      return NSPasteboard.general.writeObjects([image])
    #endif
  }
}

/// Pure helpers behind the fuller message menu (web `MessageBubble` copy actions).
enum EchoMessageMenuSupport {
  /// Web `useMessageLink`: `<origin>/channels/<channelId>/<messageId>`.
  static func messageLink(channelID: String, messageID: String, origin: URL) -> String? {
    let channel = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
    let message = messageID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !channel.isEmpty, !message.isEmpty, let scheme = origin.scheme, let host = origin.host
    else { return nil }
    let port = origin.port.map { ":\($0)" } ?? ""
    return "\(scheme)://\(host)\(port)/channels/\(channel)/\(message)"
  }

  /// First image-like attachment (including inline GIF tiles) a user can copy.
  static func copyableImage(in attachments: [EchoMessageAttachment]) -> EchoMessageAttachment? {
    attachments.first { $0.isImage }
  }

  /// "Copy as written": the stored markdown, not the display-stripped text.
  static func rawContent(_ message: EchoMessage) -> String {
    message.content.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Mention target for the composer (`@Name`) — the message author, never yourself.
  static func mentionTarget(message: EchoMessage, conversation: EchoDirectMessage)
    -> (userID: String, name: String, username: String?)?
  {
    guard !message.isCurrentUser, !message.isSystemMessage else { return nil }
    let userID = message.authorID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !userID.isEmpty else { return nil }
    let isPeer = EchoUserIdentity.matches(message.authorID, conversation.peerUserID)
    let name = (message.authorDisplayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let resolved = name.isEmpty ? (isPeer ? conversation.displayName : "") : name
    guard !resolved.isEmpty else { return nil }
    return (userID, resolved, isPeer ? conversation.username : nil)
  }

  /// Web `copyAuthorUsername` — display name (peer DM falls back to conversation title).
  static func authorUsernameToCopy(message: EchoMessage, conversation: EchoDirectMessage)
    -> String?
  {
    guard !message.isSystemMessage else { return nil }
    let name = (message.authorDisplayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if !name.isEmpty { return name }
    guard EchoUserIdentity.matches(message.authorID, conversation.peerUserID) else { return nil }
    let display = conversation.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    return display.isEmpty ? nil : display
  }
}

/// Additive context-menu items; `EchoMessageRow` embeds this once.
struct EchoMessageMenuExtras: View {
  let message: EchoMessage
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String?
  let attachments: [EchoMessageAttachment]
  var onViewReactions: (() -> Void)?
  var onViewProfile: (() -> Void)?
  /// Explicit — macOS `contextMenu` trees do not inherit `@Environment(EchoShellChrome)`.
  let shellChrome: EchoShellChrome
  @Environment(EchoAuthenticationModel.self) private var auth

  var body: some View {
    if EchoMessageMenuSupport.copyableImage(in: attachments) != nil {
      Button {
        Task { await copyImage() }
      } label: {
        Label(EchoCopy.string("Copy image"), systemImage: "photo.on.rectangle")
      }
    }
    if !EchoMessageMenuSupport.rawContent(message).isEmpty {
      Button {
        EchoClipboard.copy(message.content)
      } label: {
        Label(EchoCopy.string("Copy as written"), systemImage: "text.quote")
      }
    }
    if let username = EchoMessageMenuSupport.authorUsernameToCopy(
      message: message, conversation: conversation)
    {
      Button {
        EchoClipboard.copy(username)
      } label: {
        Label(EchoCopy.string("Copy username"), systemImage: "person.text.rectangle")
      }
    }
    if let link = EchoMessageMenuSupport.messageLink(
      channelID: message.channelID, messageID: message.id, origin: baseURL)
    {
      Button {
        EchoClipboard.copy(link)
      } label: {
        Label(EchoCopy.string("Copy message link"), systemImage: "link")
      }
    }
    if !message.reactions.isEmpty, let onViewReactions {
      Button(action: onViewReactions) {
        Label(EchoCopy.string("View reactions"), systemImage: "face.smiling")
      }
    }
    if let onViewProfile {
      Button(action: onViewProfile) {
        Label(EchoCopy.string("View profile"), systemImage: "person.crop.circle")
      }
    }
    if let target = EchoMessageMenuSupport.mentionTarget(message: message, conversation: conversation)
    {
      Button {
        shellChrome.requestMentionInsert(
          userID: target.userID, name: target.name, username: target.username)
      } label: {
        Label(EchoCopy.string("Mention author"), systemImage: "at")
      }
    }
    Menu {
      idButton(EchoCopy.string("Copy message ID"), message.id)
      idButton(EchoCopy.string("Copy author ID"), message.authorID)
      idButton(EchoCopy.string("Copy channel ID"), message.channelID)
      if let quoted = message.replyTo?.messageID {
        idButton(EchoCopy.string("Copy quoted message ID"), quoted)
      }
    } label: {
      Label(EchoCopy.string("Copy IDs"), systemImage: "number")
    }
  }

  @ViewBuilder
  private func idButton(_ title: String, _ value: String) -> some View {
    if !value.trimmingCharacters(in: .whitespaces).isEmpty {
      Button(title) { EchoClipboard.copy(value) }
    }
  }

  private func copyImage() async {
    guard let attachment = EchoMessageMenuSupport.copyableImage(in: attachments),
      let url = await EchoMediaURLResolver.resolve(
        source: attachment.url, baseURL: baseURL, storageKey: attachment.storageKey,
        accessToken: accessToken, auth: auth),
      let (data, _) = try? await URLSession.shared.data(from: url)
    else { return }
    EchoClipboard.copy(imageData: data)
  }
}
