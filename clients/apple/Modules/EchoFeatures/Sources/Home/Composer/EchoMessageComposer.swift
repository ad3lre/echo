import EchoNetworking
import SwiftUI
import UniformTypeIdentifiers

private enum EchoComposerControlIcon: Equatable {
  case attachment
  case emoji
}

struct EchoMessageComposer: View {
  let baseURL: URL
  let accessToken: String
  let placeholder: String
  var onComposerTextChange: ((String) -> Void)? = nil
  let onSend: @MainActor (EchoComposerSubmission) async throws -> Void

  @State private var state = EchoComposerState()
  @State private var photos = EchoComposerPhotoLibrary()
  @State private var showingFileImporter = false
  @State private var showingPoll = false
  @State private var editorHeight: CGFloat = 20

  var body: some View {
    @Bindable var state = state
    VStack(spacing: 9) {
      if let error = state.errorMessage {
        Text(error)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(.red.opacity(0.88))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 6)
      }

      selectionPreview

      if let panel = state.panel {
        panelView(panel)
          .frame(height: panel == .emoji ? 360 : 280)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }

      HStack(alignment: .bottom, spacing: 4) {
        composerButton(.attachment, selected: state.panel == .attachments, label: EchoCopy.string("Add attachment"))
        {
          toggle(.attachments)
        }

        ZStack(alignment: .leading) {
          if state.text.isEmpty {
            Text(placeholder)
              .font(.system(size: 16, design: .rounded))
              .foregroundStyle(.white.opacity(0.34))
              .padding(.leading, 1)
              .lineLimit(1)
              .truncationMode(.tail)
              .allowsHitTesting(false)
          }
          EchoInlineMarkdownEditor(text: $state.text, height: $editorHeight)
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
              ProgressView().controlSize(.small).tint(.white)
            } else {
              Image(systemName: "paperplane.fill")
                .font(.system(size: 14, weight: .semibold))
                .offset(x: -1, y: 1)
            }
          }
          .foregroundStyle(state.canSend ? .white : .white.opacity(0.30))
          .frame(width: 36, height: 36)
          .background(state.canSend ? composerAccent : .white.opacity(0.045), in: Circle())
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
          .stroke(.white.opacity(0.085), lineWidth: 1)
      }
      .shadow(color: .black.opacity(0.42), radius: 18, y: 8)
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
  private var selectionPreview: some View {
    if !state.assets.isEmpty || state.selectedGIF != nil {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(state.assets) { asset in
            previewChip(
              icon: asset.kind == "image" ? "photo.fill" : "doc.fill", title: asset.filename
            ) {
              state.removeAsset(asset.id)
            }
          }
          if let gif = state.selectedGIF {
            previewChip(
              icon: "sparkles.rectangle.stack", title: gif.title.isEmpty ? EchoCopy.string("GIF") : gif.title
            ) {
              state.selectedGIF = nil
            }
          }
        }
      }
    }
  }

  @ViewBuilder
  private func panelView(_ panel: EchoComposerPanel) -> some View {
    switch panel {
    case .attachments:
      EchoAttachmentPanel(
        photos: photos,
        onChoosePhoto: addPhoto,
        onChooseFiles: { showingFileImporter = true },
        onCreatePoll: { showingPoll = true })
    case .emoji:
      EchoExpressionPicker(
        baseURL: baseURL,
        accessToken: accessToken,
        photos: photos,
        onEmoji: { state.insertEmoji($0) },
        onGIF: { gif in
          state.selectedGIF = gif
          state.assets.removeAll()
          state.poll = nil
          state.panel = nil
        },
        onPhoto: addPhoto)
    }
  }

  private func composerButton(
    _ icon: EchoComposerControlIcon,
    selected: Bool,
    label: String,
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
  }

  @ViewBuilder
  private func composerIcon(_ icon: EchoComposerControlIcon, selected: Bool) -> some View {
    switch icon {
    case .attachment:
      Image(systemName: "plus")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(selected ? .white : .white.opacity(0.58))
    case .emoji:
      EchoWebEmotesIcon()
    }
  }

  private func previewChip(icon: String, title: String, remove: @escaping () -> Void) -> some View {
    HStack(spacing: 7) {
      Image(systemName: icon).foregroundStyle(EchoTheme.Color.indigoSoft)
      Text(title).lineLimit(1)
      Button(action: remove) {
        Image(systemName: "xmark.circle.fill").foregroundStyle(.white.opacity(0.42))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.format("Remove %@", title))
    }
    .font(.system(size: 12, weight: .medium, design: .rounded))
    .foregroundStyle(.white.opacity(0.82))
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .background(.white.opacity(0.065), in: Capsule())
  }

  private func toggle(_ panel: EchoComposerPanel) {
    state.panel = state.panel == panel ? nil : panel
    state.errorMessage = nil
  }

  private func addPhoto(_ item: EchoComposerPhotoLibrary.Item) {
    Task {
      do {
        let asset = try await photos.composerAsset(for: item)
        state.poll = nil
        state.selectedGIF = nil
        state.assets.append(asset)
      } catch {
        state.errorMessage = "That photo couldn’t be opened."
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
      state.errorMessage = "Those files couldn’t be opened."
    }
  }

  @MainActor
  private func sendPoll(_ poll: EchoOutgoingPoll) async {
    state.isSending = true
    state.errorMessage = nil
    do {
      try await onSend(
        EchoComposerSubmission(text: "", assets: [], gif: nil, poll: poll))
    } catch {
      state.errorMessage = (error as? LocalizedError)?.errorDescription ?? EchoCopy.string("Poll failed to send.")
    }
    state.isSending = false
  }

  @MainActor
  private func send() async {
    guard state.canSend else { return }
    state.isSending = true
    state.errorMessage = nil
    let submission = EchoComposerSubmission(
      text: state.text.trimmingCharacters(in: .whitespacesAndNewlines),
      assets: state.assets,
      gif: state.selectedGIF,
      poll: state.poll?.outgoingPoll)
    do {
      try await onSend(submission)
      state.reset()
    } catch {
      state.errorMessage = (error as? LocalizedError)?.errorDescription ?? EchoCopy.string("Message failed to send.")
    }
    state.isSending = false
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
      .background(.white.opacity(0.045), in: Capsule())
      .overlay {
        Capsule().stroke(.white.opacity(0.06), lineWidth: 1)
      }
      .padding(.bottom, 10)

      EchoComposerPhotoLibraryPane(photos: photos, onChoose: onChoosePhoto)
        .padding(6)
        .background(
          Color.black.opacity(0.22),
          in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(.white.opacity(0.05), lineWidth: 1)
        }
    }
    .padding(12)
    .background(
      EchoTheme.Color.elevatedDeep.opacity(0.98),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(.white.opacity(0.08), lineWidth: 1)
    }
    .shadow(color: .black.opacity(0.34), radius: 16, y: 7)
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
      .foregroundStyle(active ? .white : .white.opacity(0.58))
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
