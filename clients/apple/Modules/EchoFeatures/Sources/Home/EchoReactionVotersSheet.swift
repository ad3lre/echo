import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// One request to open the voters list (optionally focused on a chip's emoji).
struct EchoReactionVotersRequest: Identifiable, Equatable {
  let id = UUID()
  let initialEmoji: String?
}

/// Loads full reactor lists (web `useEchoMessageReactionsFetch`).
@MainActor
@Observable
final class EchoReactionVotersModel {
  private(set) var reactions: [EchoMessageReaction]
  private(set) var isLoading = false
  private(set) var loadFailed = false
  private let loader: EchoMessageDetailLoading
  private let channelID: String
  private let messageID: String

  init(
    reactions: [EchoMessageReaction], channelID: String, messageID: String,
    loader: EchoMessageDetailLoading
  ) {
    self.reactions = reactions
    self.channelID = channelID
    self.messageID = messageID
    self.loader = loader
  }

  /// The inline chips may omit reactor ids, so always refresh from the server.
  func load(token: String?) async {
    guard let token, !token.isEmpty else { return }
    isLoading = true
    loadFailed = false
    defer { isLoading = false }
    do {
      reactions = try await loader.loadMessageReactions(
        accessToken: token, channelID: channelID, messageID: messageID)
    } catch {
      loadFailed = true
    }
  }

  /// Web sorts voters by label; self shows as "You".
  static func voters(
    in reaction: EchoMessageReaction, currentUserID: String, resolve: (String) -> String
  ) -> [(id: String, name: String)] {
    reaction.userIDs
      .map { id in
        (
          id: id,
          name: EchoUserIdentity.matches(id, currentUserID)
            ? EchoCopy.string("You") : resolve(id)
        )
      }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  static func totalReactors(_ reactions: [EchoMessageReaction]) -> Int {
    Set(reactions.flatMap(\.userIDs)).count
  }
}

struct EchoReactionVotersSheet: View {
  let request: EchoReactionVotersRequest
  let message: EchoMessage
  let conversation: EchoDirectMessage
  let baseURL: URL
  var accessToken: String?
  let currentUserID: String
  let resolveVoterName: (String) -> String
  @State private var model: EchoReactionVotersModel
  @State private var selected: String?
  @Environment(\.dismiss) private var dismiss
  @Environment(EchoAuthenticationModel.self) private var auth

  init(
    request: EchoReactionVotersRequest, message: EchoMessage, conversation: EchoDirectMessage,
    baseURL: URL, accessToken: String?, currentUserID: String,
    resolveVoterName: @escaping (String) -> String
  ) {
    self.request = request
    self.message = message
    self.conversation = conversation
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.currentUserID = currentUserID
    self.resolveVoterName = resolveVoterName
    _model = State(
      initialValue: EchoReactionVotersModel(
        reactions: message.reactions, channelID: message.channelID, messageID: message.id,
        loader: EchoHomeClient(baseURL: baseURL)))
    _selected = State(initialValue: request.initialEmoji)
  }

  private var active: EchoMessageReaction? {
    model.reactions.first { $0.emoji == selected } ?? model.reactions.first
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      header
      summary
      tabs
      voterList
    }
    .padding(16)
    .frame(minWidth: 320, minHeight: 360, alignment: .topLeading)
    .background(EchoTheme.Color.elevatedDeep)
    .presentationDetents([.medium, .large])
    .task {
      let live = try? await auth.ensureAccessToken()
      await model.load(token: live ?? accessToken)
    }
  }

  private var header: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 2) {
        Text(EchoCopy.string("Who reacted"))
          .font(.system(size: 17, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
        let preview = message.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !preview.isEmpty {
          Text(preview).lineLimit(2).font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
        }
      }
      Spacer()
      Button(EchoCopy.string("Close")) { dismiss() }
        .buttonStyle(.plain)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.signInBlue)
    }
  }

  @ViewBuilder
  private var summary: some View {
    let people = EchoReactionVotersModel.totalReactors(model.reactions)
    HStack(spacing: 6) {
      Text(EchoCopy.format("%lld people · %lld emoji", people, model.reactions.count))
      if model.isLoading {
        Text(EchoCopy.string("Loading…"))
      } else if model.loadFailed {
        Text(EchoCopy.string("Could not load full list"))
      }
    }
    .font(.system(size: 12, weight: .medium))
    .foregroundStyle(EchoTheme.Color.ink(0.5))
  }

  private var tabs: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(model.reactions) { reaction in
          let isActive = reaction.emoji == active?.emoji
          Button {
            selected = reaction.emoji
          } label: {
            HStack(spacing: 4) {
              EchoReactionEmojiLabel(emoji: reaction.emoji, baseURL: baseURL, accessToken: accessToken)
              Text("\(reaction.count)").font(.system(size: 12, weight: .semibold, design: .rounded))
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(
              isActive ? EchoTheme.Color.indigoSoft.opacity(0.18) : EchoTheme.Color.ink(0.06),
              in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(isActive ? .isSelected : [])
        }
      }
    }
    .accessibilityLabel(EchoCopy.string("Reactors by emoji"))
  }

  @ViewBuilder
  private var voterList: some View {
    if let active {
      let rows = EchoReactionVotersModel.voters(
        in: active, currentUserID: currentUserID, resolve: resolveVoterName)
      if rows.isEmpty {
        Text(EchoCopy.string("No reactors for this emoji"))
          .font(.system(size: 13)).italic()
          .foregroundStyle(EchoTheme.Color.ink(0.45))
          .frame(maxWidth: .infinity).padding(.top, 24)
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 8) {
            ForEach(rows, id: \.id) { row in
              HStack(spacing: 10) {
                EchoMediaImage(source: avatarSource(row.id), baseURL: baseURL, accessToken: accessToken) {
                  EchoGeneratedAvatar(name: row.name, seed: row.id)
                }
                .clipShape(Circle()).frame(width: 30, height: 30)
                Text(row.name).font(.system(size: 14, weight: .medium))
                  .foregroundStyle(EchoTheme.Color.fg)
                Spacer(minLength: 0)
              }
            }
          }
        }
      }
    }
  }

  private func avatarSource(_ userID: String) -> String? {
    if EchoUserIdentity.matches(userID, conversation.peerUserID) { return conversation.avatarURL }
    if EchoUserIdentity.matches(userID, message.authorID) { return message.authorAvatarURL }
    return nil
  }
}

extension View {
  /// Presents the voters list for a message row.
  func echoReactionVotersSheet(
    item: Binding<EchoReactionVotersRequest?>, message: EchoMessage,
    conversation: EchoDirectMessage, baseURL: URL, accessToken: String?, currentUserID: String,
    resolveVoterName: @escaping (String) -> String
  ) -> some View {
    sheet(item: item) { request in
      EchoReactionVotersSheet(
        request: request, message: message, conversation: conversation, baseURL: baseURL,
        accessToken: accessToken, currentUserID: currentUserID,
        resolveVoterName: resolveVoterName)
    }
  }
}
