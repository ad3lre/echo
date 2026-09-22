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
  var onComposerTextChange: ((String) -> Void)? = nil
  @Binding var replyTo: EchoMessageReplyTo?
  let onSend: @MainActor (EchoComposerSubmission) async throws -> Void

  @State private var state = EchoComposerState()
  @State private var photos = EchoComposerPhotoLibrary()
  @State private var showingFileImporter = false
  @State private var showingPoll = false
  @State private var editorHeight: CGFloat = 20
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

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

      if let replyTo {
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

      EchoComposerPendingPreview(
        assets: state.assets,
        gif: state.selectedGIF,
        baseURL: baseURL,
        accessToken: accessToken,
        onRemoveAsset: { state.removeAsset($0) },
        onRemoveGIF: { state.selectedGIF = nil }
      )

      if let panel = state.panel {
        panelView(panel)
          .frame(height: panel == .emoji ? 360 : 280)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }

      HStack(alignment: .bottom, spacing: 4) {
        composerButton(
          .attachment, selected: state.panel == .attachments,
          label: EchoCopy.string("Add attachment")
        ) {
          toggle(.attachments)
        }

        ZStack(alignment: .leading) {
          if state.text.isEmpty {
            Text(placeholder)
              .font(displayPrefs.uiFont(size: EchoTheme.Typography.composer))
              .foregroundStyle(displayPrefs.ink(0.34))
              .padding(.leading, 1)
              .lineLimit(1)
              .truncationMode(.tail)
              .allowsHitTesting(false)
          }
          EchoInlineMarkdownEditor(
            text: $state.text, height: $editorHeight, apiBaseURL: baseURL
          )
          .frame(height: editorHeight)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 8)

        composerButton(.emoji, selected: state.panel == .emoji, label: EchoCopy.string("Emoji")) {
          toggle(.emoji)
        }

        Button {
          Task { await send() }
        } label: {
          Group {
            if state.isSending {
              ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent)
            } else {
              Image(systemName: "paperplane.fill")
                .font(.system(size: 14, weight: .semibold))
                .offset(x: -1, y: 1)
            }
          }
          .foregroundStyle(state.canSend ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.30))
          .frame(width: 36, height: 36)
          .background(state.canSend ? composerAccent : EchoTheme.Color.ink(0.045), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!state.canSend)
        .keyboardShortcut(.return, modifiers: .command)
        .accessibilityLabel(EchoCopy.string("Send message"))
        .accessibilityHint(EchoCopy.string("Command Return to send"))
      }
      .padding(.horizontal, 7)
      .padding(.vertical, 7)
      .background(composerSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.085), lineWidth: 1)
      }
      .echoShadow(color: .black.opacity(0.42), radius: 18, y: 8)
    }
    .padding(.horizontal, 12)
    .padding(.top, 7)
    .padding(.bottom, 10)
    .animation(.spring(response: 0.28, dampingFraction: 0.86), value: state.panel)
    .onChange(of: state.text) { _, text in
      onComposerTextChange?(text)
    }
    .fileImporter(
      isPresented: $showingFileImporter,
      allowedContentTypes: [.item],
      allowsMultipleSelection: true,
      onCompletion: importFiles
    )
    .sheet(isPresented: $showingPoll) {
      EchoPollComposerSheet { poll in
        showingPoll = false
        state.assets.removeAll()
        state.selectedGIF = nil
        state.poll = nil
        state.panel = nil
        Task { await sendPoll(poll) }
      }
    }
  }

  private var composerSurface: Color {
    EchoTheme.Color.elevatedMid
  }

  private var composerAccent: Color {
    EchoTheme.Color.indigo
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
        .frame(width: icon == .emoji ? 36 : 32, height: 36)
        .background(selected ? composerAccent.opacity(0.72) : .clear, in: Circle())
        .contentShape(Circle())
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
    state.panel = state.panel == panel ? nil : panel
    state.errorMessage = nil
  }

  private func togglePhoto(_ item: EchoComposerPhotoLibrary.Item) {
    if state.asset(forSourcePhotoID: item.id) != nil {
      state.removeAsset(sourcePhotoID: item.id)
      #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
      #endif
      return
    }
    guard state.assets.count < 10 else {
      state.errorMessage = EchoCopy.string("You can attach up to 10 files.")
      return
    }
    Task {
      do {
        let asset = try await photos.composerAsset(for: item)
        state.poll = nil
        state.selectedGIF = nil
        state.assets.append(asset)
        #if os(iOS)
          UISelectionFeedbackGenerator().selectionChanged()
        #endif
      } catch {
        state.errorMessage = EchoCopy.string("That photo couldn’t be opened.")
      }
    }
  }

  private func importFiles(_ result: Result<[URL], Error>) {
    do {
      let urls = try result.get()
      for url in urls.prefix(10) {
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
        state.assets.append(
          EchoComposerAsset(
            data: data, filename: url.lastPathComponent, mimeType: mimeType, kind: kind))
      }
      state.poll = nil
      state.selectedGIF = nil
    } catch {
      state.errorMessage = EchoCopy.string("Those files couldn’t be opened.")
    }
  }

  @MainActor
  private func sendPoll(_ poll: EchoOutgoingPoll) async {
    state.isSending = true
    state.errorMessage = nil
    let reply = replyTo
    do {
      try await onSend(
        EchoComposerSubmission(text: "", assets: [], gif: nil, poll: poll, replyTo: reply))
      replyTo = nil
      state.replyTo = nil
    } catch {
      state.errorMessage =
        (error as? LocalizedError)?.errorDescription ?? EchoCopy.string("Poll failed to send.")
    }
    state.isSending = false
  }

  @MainActor
  private func send() async {
    guard state.canSend else { return }
    let submission = EchoComposerSubmission(
      text: state.text.trimmingCharacters(in: .whitespacesAndNewlines),
      assets: state.assets,
      gif: state.selectedGIF,
      poll: state.poll?.outgoingPoll,
      replyTo: replyTo)
    // Clear the composer immediately so image sends feel instant; upload
    // progress lives on the optimistic timeline bubble instead.
    state.reset()
    replyTo = nil
    onComposerTextChange?("")
    do {
      try await onSend(submission)
    } catch {
      state.errorMessage =
        (error as? LocalizedError)?.errorDescription ?? EchoCopy.string("Message failed to send.")
    }
  }
}

/// Native vector counterpart of the dark-shell web Emotes asset.
/// The source SVG uses #3c3d4a chrome and #110b19 ink in a 36-point canvas.
private struct EchoWebEmotesIcon: View {
  var body: some View {
    Canvas { context, size in
      let chrome = EchoTheme.Color.composerChrome
      let ink = EchoTheme.Color.composerInk
      let scale = min(size.width, size.height) / 36
      let origin = CGPoint(
        x: (size.width - 36 * scale) / 2,
        y: (size.height - 36 * scale) / 2)
      func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: origin.x + x * scale, y: origin.y + y * scale)
      }

      let face = Path(
        ellipseIn: CGRect(
          x: origin.x + 4 * scale, y: origin.y + 3.5 * scale,
          width: 28 * scale, height: 28 * scale))
      context.fill(face, with: .color(chrome))

      var leftEye = Path()
      leftEye.move(to: point(11.7, 14.5))
      leftEye.addCurve(
        to: point(16.2, 14.5),
        control1: point(12.8, 11.6),
        control2: point(15.1, 11.6))
      var rightEye = Path()
      rightEye.move(to: point(19.8, 14.5))
      rightEye.addCurve(
        to: point(24.3, 14.5),
        control1: point(20.9, 11.6),
        control2: point(23.2, 11.6))
      var smile = Path()
      smile.move(to: point(11.8, 20.3))
      smile.addCurve(
        to: point(24.2, 20.3),
        control1: point(15.2, 24.3),
        control2: point(20.8, 24.3))
      let stroke = StrokeStyle(lineWidth: 1.7 * scale, lineCap: .butt, lineJoin: .round)
      context.stroke(leftEye, with: .color(ink), style: stroke)
      context.stroke(rightEye, with: .color(ink), style: stroke)
      context.stroke(smile, with: .color(ink), style: stroke)
    }
    .frame(width: 24, height: 24)
  }
}

private struct EchoAttachmentPanel: View {
  @Bindable var photos: EchoComposerPhotoLibrary
  var selectedPhotoIDs: [String]
  let onChoosePhoto: (EchoComposerPhotoLibrary.Item) -> Void
  let onChooseFiles: () -> Void
  let onCreatePoll: () -> Void

  private let accent = EchoTheme.Color.indigo

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 3) {
        panelChip("photo.on.rectangle.angled", "Photos", active: true)
        panelChip("folder", "Files", action: onChooseFiles)
        panelChip("chart.bar", "Poll", action: onCreatePoll)
      }
      .padding(4)
      .background(EchoTheme.Color.ink(0.045), in: Capsule())
      .overlay {
        Capsule().stroke(EchoTheme.Color.ink(0.06), lineWidth: 1)
      }
      .padding(.bottom, 10)

      EchoComposerPhotoLibraryPane(
        photos: photos, selectedPhotoIDs: selectedPhotoIDs, onChoose: onChoosePhoto
      )
      .padding(6)
      .background(
        Color.black.opacity(0.22),
        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(EchoTheme.Color.ink(0.05), lineWidth: 1)
      }
    }
    .padding(12)
    .background(
      EchoTheme.Color.elevatedDeep.opacity(0.98),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(EchoTheme.Color.ink(0.08), lineWidth: 1)
    }
    .echoShadow(color: .black.opacity(0.34), radius: 16, y: 7)
  }

  private func panelChip(
    _ icon: String, _ title: String, active: Bool = false, action: @escaping () -> Void = {}
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Image(systemName: icon)
          .font(.system(size: 12, weight: .semibold))
        Text(title)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .lineLimit(1)
          .minimumScaleFactor(0.85)
      }
      .foregroundStyle(active ? EchoTheme.Color.onAccent : EchoTheme.Color.ink(0.58))
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
      .background(active ? accent : .clear, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(active ? .isSelected : [])
    .accessibilityLabel(title)
  }
}
