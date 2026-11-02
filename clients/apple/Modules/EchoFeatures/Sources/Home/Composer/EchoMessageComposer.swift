import EchoDomain
import EchoNetworking
import SwiftUI
import UniformTypeIdentifiers

#if os(iOS)
  import UIKit
#endif

private enum EchoComposerControlIcon: Equatable {
  case attachment
  case emoji
}

struct EchoMessageComposer: View {
  let baseURL: URL
  let accessToken: String
  let placeholder: String
  /// Conversation / channel id for per-channel draft persistence (`echo-composer-drafts-v1`).
  var channelID: String = ""
  /// Guild id enables stickers in the expression picker (nil for DMs).
  var serverID: String? = nil
  /// Mention catalog, slowmode bypass, and media / poll gates for this channel.
  var access = EchoComposerAccess()
  /// Guild channel slowmode interval (0 = off) and when the user last posted here.
  var slowmodeSeconds = 0
  var lastSentAt: Date? = nil
  /// Guild channel default message prefix (`messageFormatTemplate` / hard flag).
  var messageFormatTemplate = ""
  var messageFormatHard = false
  var onComposerTextChange: ((String) -> Void)? = nil
  @Binding var replyTo: EchoMessageReplyTo?
  /// When set, send becomes “save edit” for this message id.
  @Binding var editingMessage: EchoMessage?
  let onSend: @MainActor (EchoComposerSubmission) async throws -> Void
  var onEdit: (@MainActor (String, EchoOutgoingRichContent) async throws -> Void)? = nil
  /// Bottom chrome height changed (panel / keyboard-adjacent) — stick timeline.
  var onBottomChromeChange: (() -> Void)? = nil
  /// Composer text field focus — arms first-tap keyboard rejection in the thread.
  var onEditingFocusChange: ((Bool) -> Void)? = nil

  @State var state = EchoComposerState()
  @State var photos = EchoComposerPhotoLibrary()
  @State var showingFileImporter = false
  @State var showingPoll = false
  @State var editorHeight: CGFloat = EchoComposerFieldMetrics.minHeight
  @State private var seededEditID: String?
  @State private var isApplyingMessageFormat = false
  @State var isRestoringDraft = false
  @State var draftPersistTask: Task<Void, Never>?
  @State var markdownPreviewMode = EchoComposerMarkdownPreviewPreference.read()
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) var shellChrome

  var isEditing: Bool { editingMessage != nil }

  private var messageFormatKey: String {
    "\(messageFormatHard ? "1" : "0")|\(messageFormatTemplate)"
  }

  var body: some View {
    @Bindable var state = state
    VStack(spacing: 9) {
      if let error = state.errorMessage {
        Text(error)
          .font(displayPrefs.uiFont(size: 12, weight: .medium))
          .foregroundStyle(.red.opacity(0.88))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 6)
      }

      EchoSlowmodeBanner(
        state: state,
        interval: EchoSlowmode.effectiveInterval(
          slowmodeSeconds, canBypass: access.canBypassSlowmode, isEditing: isEditing),
        lastSentAt: EchoSlowmode.clockStart(
          lastSentAt: lastSentAt, serverRejectedAt: state.slowmodeRejectedAt))

      if let editing = editingMessage {
        EchoComposerEditBar(preview: editing.previewText) {
          clearEdit()
        }
        .padding(.horizontal, 6)
      } else if let replyTo {
        EchoComposerReplyBar(
          replyTo: replyTo,
          apiBaseURL: baseURL,
          accessToken: accessToken
        ) {
          self.replyTo = nil
          state.replyTo = nil
        }
        .padding(.horizontal, 6)
      }

      composerSuggestions

      EchoComposerPendingPreview(
        assets: state.assets,
        gif: state.selectedGIF,
        gifSpoiler: state.gifSpoiler,
        baseURL: baseURL,
        accessToken: accessToken,
        onRemoveAsset: { state.removeAsset($0) },
        onRemoveGIF: { state.selectedGIF = nil },
        onToggleAssetSpoiler: { state.toggleAssetSpoiler($0) },
        onToggleGIFSpoiler: { state.gifSpoiler.toggle() },
        onToggleAllSpoilers: { state.toggleAllSpoilers() },
        allSpoilers: state.allPendingSpoilers
      )

      #if os(iOS)
        if let panel = state.panel {
          panelView(panel)
            .frame(height: panel == .emoji ? 360 : 280)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
      #endif

      markdownPreviewChrome(mode: $markdownPreviewMode)
      markdownPreviewSharePreference(mode: markdownPreviewMode)

      HStack(alignment: .bottom, spacing: 4) {
        if !isEditing {
          composerButton(
            .attachment, selected: state.panel == .attachments,
            label: EchoCopy.string("Add attachment")
          ) {
            toggle(.attachments)
          }
          #if os(macOS)
            .popover(
              isPresented: Binding(
                get: { state.panel == .attachments },
                set: { state.panel = $0 ? .attachments : nil }
              )
            ) {
              panelView(.attachments)
              .frame(width: 360, height: 320)
            }
          #endif
        }

        ZStack(alignment: .topLeading) {
          if state.text.isEmpty {
            Text(placeholder)
              .font(.system(size: EchoTheme.Typography.composer))
              .foregroundStyle(displayPrefs.ink(0.34))
              .padding(.top, EchoComposerFieldMetrics.verticalInset)
              .lineLimit(1)
              .truncationMode(.tail)
              .allowsHitTesting(false)
          }
          composerMarkdownEditor
            .frame(minHeight: EchoComposerFieldMetrics.minHeight)
            .frame(height: editorHeight)
        }
        .padding(.horizontal, 7)

        composerButton(.emoji, selected: state.panel == .emoji, label: EchoCopy.string("Emoji")) {
          toggle(.emoji)
        }
        #if os(macOS)
          .popover(
            isPresented: Binding(
              get: { state.panel == .emoji },
              set: { state.panel = $0 ? .emoji : nil }
            )
          ) {
            panelView(.emoji)
            .frame(width: 380, height: 420)
          }
        #endif

        markdownPreviewToggleButton(mode: $markdownPreviewMode)

        Button {
          Task {
            if isEditing {
              await saveEdit()
            } else {
              await send()
            }
          }
        } label: {
          Group {
            if state.isSending {
              ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent)
            } else {
              Image(systemName: isEditing ? "checkmark" : "paperplane.fill")
                .font(.system(size: 14, weight: .semibold))
                .offset(x: isEditing ? 0 : -1, y: isEditing ? 0 : 1)
            }
          }
          .foregroundStyle(
            (isEditing ? canSaveEdit : state.canSend)
              ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.30)
          )
          .frame(width: 44, height: 44)
          .contentShape(Circle())
          .echoPointerHoverFill(
            isSelected: isEditing ? canSaveEdit : state.canSend,
            selectedFill: composerAccent,
            hoverFill: EchoTheme.Color.ink(0.10),
            idleFill: EchoTheme.Color.ink(0.045),
            cornerRadius: 22)
        }
        .buttonStyle(.plain)
        .disabled(isEditing ? !canSaveEdit : !state.canSend)
        .keyboardShortcut(.return, modifiers: .command)
        .accessibilityLabel(
          isEditing ? EchoCopy.string("Save edit") : EchoCopy.string("Send message")
        )
        .accessibilityHint(
          isEditing
            ? EchoCopy.string("Command Return to save")
            : EchoCopy.string("Command Return to send")
        )
      }
      .padding(.horizontal, 7)
      .padding(.vertical, 7)
      // Floating liquid glass — blur does the separation; light mode stays shadowless.
      .echoLiquidGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous), shadow: true)
    }
    // Transparent outer chrome so the conversation scrolls behind the float —
    // no solid band under the home indicator.
    .padding(.horizontal, 12)
    .padding(.top, 2)
    #if os(macOS)
      .padding(.bottom, 20)
    #else
      .padding(.bottom, 2)
    #endif
    .background(Color.clear)
    // Shorter than spring — large inset animation left rare gaps under messages.
    .animation(.easeOut(duration: 0.2), value: state.panel)
    .onAppear {
      restoreDraftIfNeeded()
      applyChannelMessageFormat()
      restoreMarkdownPreviewModeIfNeeded(mode: $markdownPreviewMode)
    }
    .onChange(of: channelID) { previous, next in
      persistDraftNow(for: previous)
      restoreDraftIfNeeded(for: next)
      applyChannelMessageFormat()
    }
    .onChange(of: messageFormatKey) { _, _ in applyChannelMessageFormat() }
    .onChange(of: state.text) { previous, text in
      restoreMarkdownPreviewModeIfNeeded(mode: $markdownPreviewMode)
      if !isApplyingMessageFormat, !isEditing,
        !messageFormatTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      {
        if messageFormatHard {
          isApplyingMessageFormat = true
          defer { isApplyingMessageFormat = false }
          if state.repairHardFormatIfNeeded(template: messageFormatTemplate) {
            onComposerTextChange?(state.text)
            refreshSuggestions()
            scheduleDraftPersist()
            return
          }
        } else if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          applyChannelMessageFormat()
        }
      }
      onComposerTextChange?(text)
      refreshSuggestions()
      scheduleDraftPersist()
      // Selected photos then started typing → tuck the plus panel away.
      if state.panel == .attachments, text != previous {
        closeAttachmentPanelIfNeeded()
      }
    }
    .onChange(of: state.mentionTokens) { _, _ in scheduleDraftPersist() }
    .onDisappear {
      persistDraftNow(for: channelID)
      draftPersistTask?.cancel()
      draftPersistTask = nil
    }
    .onChange(of: state.panel) { _, _ in
      // Let safeAreaInset settle, then ask the timeline to re-stick.
      Task { @MainActor in
        await Task.yield()
        onBottomChromeChange?()
      }
    }
    .onChange(of: state.tokenCaretUTF16) { _, _ in refreshSuggestions() }
    .onChange(of: shellChrome.pendingMentionInsert) { _, pending in
      guard let pending, !isEditing else { return }
      state.insertMention(pending.option, replacing: nil)
      shellChrome.pendingMentionInsert = nil
    }
    .onChange(of: editingMessage?.id) { _, id in
      guard let editing = editingMessage, id != nil else {
        if seededEditID != nil {
          seededEditID = nil
        }
        return
      }
      guard seededEditID != editing.id else { return }
      persistDraftNow(for: channelID)
      seededEditID = editing.id
      replyTo = nil
      state.replyTo = nil
      state.reset()
      state.text = editing.content
      state.seedMentionTokens(from: editing)
      state.panel = nil
      onComposerTextChange?(editing.content)
    }
    .fileImporter(
      isPresented: $showingFileImporter,
      allowedContentTypes: [.item],
      allowsMultipleSelection: true,
      onCompletion: importFiles
    )
    #if os(macOS)
      .onDrop(of: [.image, .fileURL], isTargeted: nil) { providers in
        Task { @MainActor in
          await ingestDropProviders(providers)
        }
        return true
      }
    #endif
    .sheet(isPresented: $showingPoll) {
      EchoPollComposerSheet { poll in
        showingPoll = false
        state.assets.removeAll()
        state.selectedGIF = nil
        state.poll = nil
        state.panel = nil
        Task { await sendPoll(poll) }
      }
      #if os(macOS)
        .presentationBackground(.clear)
      #endif
    }
  }

  private var composerAccent: Color {
    EchoTheme.Color.indigo
  }

  private var canSaveEdit: Bool {
    guard !state.isSending, let editing = editingMessage else { return false }
    let trimmed = state.text.trimmingCharacters(in: .whitespacesAndNewlines)
    return !trimmed.isEmpty && trimmed != editing.content
  }

  private func clearEdit() {
    editingMessage = nil
    seededEditID = nil
    state.reset()
    onComposerTextChange?("")
    restoreDraftIfNeeded()
    applyChannelMessageFormat()
  }

  private func applyChannelMessageFormat() {
    guard !isEditing else { return }
    let template = messageFormatTemplate
    guard !template.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || messageFormatHard
    else { return }
    isApplyingMessageFormat = true
    defer { isApplyingMessageFormat = false }
    if state.applyChannelMessageFormat(template: template, hard: messageFormatHard) {
      onComposerTextChange?(state.text)
    }
  }

  @MainActor
  private func saveEdit() async {
    guard canSaveEdit, let editing = editingMessage, let onEdit else { return }
    let rich = state.richContent(forEdit: true)
    state.isSending = true
    state.errorMessage = nil
    do {
      try await onEdit(editing.id, rich.built)
      clearEdit()
    } catch {
      state.errorMessage =
        (error as? LocalizedError)?.errorDescription
        ?? EchoCopy.string("Couldn’t save edit.")
    }
    state.isSending = false
  }

  @ViewBuilder
  private func panelView(_ panel: EchoComposerPanel) -> some View {
    switch panel {
    case .attachments:
      EchoAttachmentPanel(
        photos: photos,
        selectedPhotoIDs: state.selectedPhotoIDs,
        onChoosePhoto: togglePhoto,
        onChooseFiles: { showingFileImporter = true },
        onCreatePoll: { showingPoll = true })
    case .emoji:
      EchoExpressionPicker(
        baseURL: baseURL,
        accessToken: accessToken,
        photos: photos,
        selectedPhotoIDs: state.selectedPhotoIDs,
        serverID: serverID,
        startsOnGIFs: state.pickerStartsOnGIFs,
        onSticker: { sticker in Task { await sendSticker(sticker) } },
        onEmoji: { state.insertEmoji($0) },
        onGIF: { gif in
          state.selectedGIF = gif
          state.assets.removeAll()
          state.poll = nil
          state.panel = nil
        },
        onPhoto: togglePhoto)
    }
  }

  private func composerButton(
    _ icon: EchoComposerControlIcon,
    selected: Bool,
    label: String,
    hint: String? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      composerIcon(icon, selected: selected)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
        .echoPointerHoverFill(
          isSelected: selected,
          selectedFill: composerAccent.opacity(0.72),
          hoverFill: EchoTheme.Color.ink(0.08),
          cornerRadius: 22)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
    .accessibilityValue(selected ? EchoCopy.string("On") : EchoCopy.string("Off"))
    .accessibilityHint(hint ?? "")
  }

  @ViewBuilder
  private func composerIcon(_ icon: EchoComposerControlIcon, selected: Bool) -> some View {
    switch icon {
    case .attachment:
      Image(systemName: "plus")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(selected ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.58))
    case .emoji:
      EchoWebEmotesIcon()
    }
  }

  private func toggle(_ panel: EchoComposerPanel) {
    state.pickerStartsOnGIFs = false
    state.panel = state.panel == panel ? nil : panel
    state.errorMessage = nil
  }

  func closeAttachmentPanelIfNeeded() {
    guard state.panel == .attachments else { return }
    state.panel = nil
  }

  private func togglePhoto(_ item: EchoComposerPhotoLibrary.Item) {
    if state.asset(forSourcePhotoID: item.id) != nil {
      state.removeAsset(sourcePhotoID: item.id)
      #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
      #endif
      return
    }
    let wasPending = state.pendingPhotos[item.id] != nil
    guard let request = state.reservePhoto(item.id) else {
      if wasPending { return }
      state.errorMessage = EchoCopy.string("You can attach up to 10 files.")
      return
    }
    Task {
      do {
        let asset = try await photos.composerAsset(for: item)
        state.finishPhoto(item.id, request: request, asset: asset)
        #if os(iOS)
          UISelectionFeedbackGenerator().selectionChanged()
        #endif
      } catch {
        guard state.pendingPhotos[item.id] == request else { return }
        state.finishPhoto(item.id, request: request, asset: nil)
        state.errorMessage = EchoCopy.string("That photo couldn’t be opened.")
      }
    }
  }

  private func importFiles(_ result: Result<[URL], Error>) {
    do {
      let urls = try result.get()
      let capacity = state.remainingCapacity
      if urls.count > capacity {
        state.errorMessage = EchoCopy.string("You can attach up to 10 files.")
      }
      for url in urls.prefix(capacity) {
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        let type = UTType(filenameExtension: url.pathExtension)
        let mimeType = type?.preferredMIMEType ?? "application/octet-stream"
        let kind =
          type?.conforms(to: .image) == true
          ? "image"
          : type?.conforms(to: .movie) == true
            ? "video"
            : type?.conforms(to: .audio) == true ? "audio" : "document"
        let normalized =
          kind == "image"
          ? EchoComposerImageUploadNormalize.jpegCompatibleUpload(
            data: data, filename: url.lastPathComponent, mimeType: mimeType)
          : (data, url.lastPathComponent, mimeType)
        let (uploadData, uploadName, uploadMime) = normalized
        state.assets.append(
          EchoComposerAsset(
            data: uploadData,
            filename: uploadName,
            mimeType: uploadMime,
            kind: kind))
      }
      state.poll = nil
      state.selectedGIF = nil
    } catch {
      state.errorMessage = EchoCopy.string("Those files couldn’t be opened.")
    }
  }

  @MainActor
  private func sendPoll(_ poll: EchoOutgoingPoll) async {
    if let block = outgoingBlock(contentTypes: [.poll]) {
      state.errorMessage = EchoComposerOutgoingGate.message(for: block)
      return
    }
    state.isSending = true
    state.errorMessage = nil
    let reply = replyTo
    do {
      try await onSend(
        EchoComposerSubmission(text: "", assets: [], gif: nil, poll: poll, replyTo: reply))
      replyTo = nil
      state.replyTo = nil
    } catch {
      state.errorMessage = sendFailureMessage(error, fallback: EchoCopy.string("Poll failed to send."))
    }
    state.isSending = false
  }

  @MainActor
  private func send() async {
    guard state.canSend else { return }
    if messageFormatHard {
      _ = state.applyChannelMessageFormat(template: messageFormatTemplate, hard: true)
    }
    let rich = state.richContent()
    let hasMedia = !state.assets.isEmpty || state.selectedGIF != nil
    let types = EchoComposerOutgoingGate.contentTypes(
      text: rich.text,
      mentions: rich.built.mentions,
      hasMedia: hasMedia,
      hasPoll: state.poll?.outgoingPoll != nil)
    if let block = outgoingBlock(contentTypes: types) {
      state.errorMessage = EchoComposerOutgoingGate.message(for: block)
      return
    }
    let submission = EchoComposerSubmission(
      text: rich.text,
      assets: state.assets,
      gif: state.selectedGIF,
      poll: state.poll?.outgoingPoll,
      replyTo: replyTo,
      mentions: rich.built.mentions,
      contentJSON: rich.built.contentJSON,
      gifSpoiler: state.gifSpoiler)
    let draftText = state.text
    let draftMentions = state.mentionTokens
    let draftPoll = state.poll
    let draftGifSpoiler = state.gifSpoiler
    state.reset()
    replyTo = nil
    onComposerTextChange?("")
    clearPersistedDraft()
    applyChannelMessageFormat()
    let clearedRevision = state.revision
    do {
      try await onSend(submission)
    } catch {
      if state.revision == clearedRevision, replyTo == nil {
        state.text = draftText
        state.mentionTokens = draftMentions
        state.assets = submission.assets
        state.selectedGIF = submission.gif
        state.gifSpoiler = draftGifSpoiler
        state.poll = draftPoll
        replyTo = submission.replyTo
        state.replyTo = submission.replyTo
        onComposerTextChange?(draftText)
        scheduleDraftPersist()
      }
      state.errorMessage = sendFailureMessage(
        error, fallback: EchoCopy.string("Message failed to send."))
    }
  }

  private func outgoingBlock(contentTypes: [EchoComposerOutgoingGate.ContentType])
    -> EchoComposerOutgoingGate.BlockCode?
  {
    EchoComposerOutgoingGate.blockReason(
      canSendMessages: access.sendLock == nil,
      canCreatePolls: access.pollAllowed,
      canUploadFiles: access.mediaAllowed,
      canUseExternalEmoji: access.externalEmojiAllowed,
      canMentionEveryone: access.allowBroadcastMentions,
      contentTypes: contentTypes)
  }
}
