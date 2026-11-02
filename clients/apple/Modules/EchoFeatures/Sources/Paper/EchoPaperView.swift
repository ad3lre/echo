import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Loads the single document behind a paper channel; basic edits go through `EchoPaperEditModel`.
@MainActor
@Observable
final class EchoPaperModel {
  let channelID: String
  let client: EchoWorkspaceClient
  let auth: EchoAuthenticationModel

  private(set) var document: EchoPaperDocument?
  private(set) var isLoading = false
  private(set) var errorMessage: String?

  init(channelID: String, client: EchoWorkspaceClient, auth: EchoAuthenticationModel) {
    self.channelID = channelID
    self.client = client
    self.auth = auth
  }

  func reload() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let token = try await auth.ensureAccessToken()
      document = try await client.fetchPaperDocument(channelID: channelID, accessToken: token)
    } catch {
      errorMessage = EchoCopy.string("Echo couldn’t load this paper.")
    }
  }

  /// Adopts the document returned by a successful save.
  func adopt(_ saved: EchoPaperDocument) { document = saved }
}

struct EchoPaperView: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let model: EchoPaperModel
  /// Server members keyed by user id — resolves author gutter avatars / names.
  var membersByID: [String: EchoServerMember] = [:]
  var baseURL: URL? = nil
  var onRequestExit: (() -> Void)? = nil
  @State private var edit: EchoPaperEditModel?
  @State private var share: EchoPaperShareModel?
  @State private var comments: EchoPaperCommentsModel?
  @State private var showingShare = false
  @State private var showingComments = false

  private var commentsEnabled: Bool {
    let doc = model.document
    return doc?.paperCommentsEnabled != false
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      if let message = edit?.errorMessage {
        Text(message)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.mentionPing)
          .padding(.horizontal, 16)
          .padding(.bottom, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      documentAndComments
    }
    .background(EchoConversationBackground().ignoresSafeArea())
    .task(id: channel.id) {
      await model.reload()
      syncCommentsCapabilities()
    }
    .onChange(of: model.document?.revision) { _, _ in syncCommentsCapabilities() }
    .sheet(isPresented: $showingShare) {
      if let share { EchoPaperShareSheet(model: share) }
    }
    #if os(iOS)
      .sheet(isPresented: $showingComments) {
        if let comments {
          EchoPaperCommentsPanel(model: comments) { showingComments = false }
            .presentationDetents([.medium, .large])
        }
      }
    #endif
    .alert(
      EchoCopy.string("Paper changed elsewhere"),
      isPresented: Binding(
        get: { edit?.showsConflict == true }, set: { edit?.showsConflict = $0 })
    ) {
      Button(EchoCopy.string("Reload latest"), role: .destructive) {
        Task { _ = await edit?.load() }
      }
      Button(EchoCopy.string("Keep my edits and retry")) { Task { await retryOnLatest() } }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(
        EchoCopy.string(
          "Someone saved a newer version. Reload to discard your edits, or keep them and save over the latest."
        ))
    }
  }

  private var header: some View {
    HStack(spacing: 10) {
      if let onRequestExit {
        Button(action: onRequestExit) {
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.72))
            .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Show channels"))
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(channel.name)
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.96))
          .lineLimit(1)
        Text(server.name)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      if edit == nil {
        if commentsEnabled {
          Button { openComments() } label: {
            Image(systemName: showingComments ? "text.bubble.fill" : "text.bubble")
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(
                showingComments ? EchoTheme.Color.indigoSoft : EchoTheme.Color.ink(0.72)
              )
              .frame(width: 34, height: 34)
              .background(EchoTheme.Color.ink(0.08), in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Comments"))
        }
        Button { openShare() } label: {
          Image(systemName: "square.and.arrow.up")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.72))
            .frame(width: 34, height: 34)
            .background(EchoTheme.Color.ink(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Share paper"))
      }
      editControls
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .padding(.bottom, 10)
  }

  @ViewBuilder
  private var editControls: some View {
    if let edit {
      if edit.isBusy { ProgressView().controlSize(.small) }
      Button(EchoCopy.string("Cancel")) { self.edit = nil }
        .buttonStyle(.bordered)
        .disabled(edit.isBusy)
      Button(EchoCopy.string("Save")) { Task { await save() } }
        .buttonStyle(.borderedProminent)
        .disabled(edit.isBusy || !edit.isDirty)
    } else if model.document?.canAuthorPaper == true {
      Button {
        Task { await beginEditing() }
      } label: {
        Label(EchoCopy.string("Edit"), systemImage: "pencil")
      }
      .buttonStyle(.bordered)
    }
  }

  @ViewBuilder
  private var documentAndComments: some View {
    #if os(macOS)
      HStack(spacing: 0) {
        documentBody
        if showingComments, let comments {
          Divider()
          EchoPaperCommentsPanel(model: comments) { showingComments = false }
            .frame(width: 320)
        }
      }
    #else
      documentBody
    #endif
  }

  @ViewBuilder
  private var documentBody: some View {
    if let edit {
      EchoPaperEditorView(edit: edit)
    } else if let document = model.document {
      ScrollView {
        EchoPaperReadDocument(
          document: document,
          membersByID: membersByID,
          baseURL: baseURL ?? model.client.baseURL,
          accessToken: model.auth.activeSession?.accessToken
        )
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: 760, alignment: .leading)
        .frame(maxWidth: .infinity)
      }
      .refreshable { await model.reload() }
    } else if let error = model.errorMessage {
      VStack(spacing: 12) {
        Text(error)
          .font(.system(size: 15, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.8))
        Button(EchoCopy.string("Try again")) { Task { await model.reload() } }
          .buttonStyle(.bordered)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func openShare() {
    if share == nil {
      share = EchoPaperShareModel(
        channelID: channel.id, serverID: server.id, client: model.client, auth: model.auth)
    }
    showingShare = true
  }

  private func openComments() {
    ensureCommentsModel()
    #if os(macOS)
      showingComments.toggle()
    #else
      showingComments = true
    #endif
  }

  private func ensureCommentsModel() {
    if comments == nil {
      comments = EchoPaperCommentsModel(
        channelID: channel.id, client: model.client, auth: model.auth)
    }
    syncCommentsCapabilities()
  }

  private func syncCommentsCapabilities() {
    comments?.adoptCapabilities(from: model.document)
  }

  private func beginEditing() async {
    let next = EchoPaperEditModel(
      channelID: channel.id, client: model.client, auth: model.auth)
    edit = next
    _ = await next.load()
  }

  private func save() async {
    guard let edit, let saved = await edit.save() else { return }
    finish(saved)
  }

  private func retryOnLatest() async {
    guard let edit, let saved = await edit.retryOnLatest() else { return }
    finish(saved)
  }

  private func finish(_ saved: EchoPaperDocument) {
    model.adopt(saved)
    syncCommentsCapabilities()
    edit = nil
  }
}

/// Owns the per-channel paper model so it survives parent re-renders.
struct EchoPaperHost: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let servers: EchoServersModel
  var onRequestExit: (() -> Void)? = nil
  @State private var paper: EchoPaperModel?

  var body: some View {
    Group {
      if let paper {
        EchoPaperView(
          server: server,
          channel: channel,
          model: paper,
          membersByID: memberLookup,
          baseURL: servers.client.baseURL,
          onRequestExit: onRequestExit)
      } else {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .onAppear {
      if paper == nil {
        paper = EchoPaperModel(
          channelID: channel.id, client: servers.client, auth: servers.auth)
      }
      if servers.members(for: server.id).isEmpty {
        Task { await servers.loadMembers(for: server.id) }
      }
    }
  }

  private var memberLookup: [String: EchoServerMember] {
    var map: [String: EchoServerMember] = [:]
    for member in servers.members(for: server.id) { map[member.userID] = member }
    return map
  }
}
