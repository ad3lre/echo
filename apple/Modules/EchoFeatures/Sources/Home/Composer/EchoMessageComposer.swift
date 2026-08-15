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
        composerButton(.attachment, selected: state.panel == .attachments, label: "Add attachment")
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

        composerButton(.emoji, selected: state.panel == .emoji, label: "Emoji") {
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
        .accessibilityLabel("Send message")
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
    .fileImporter(
      isPresented: $showingFileImporter,
      allowedContentTypes: [.item],
      allowsMultipleSelection: true,
      onCompletion: importFiles
    )
    .sheet(isPresented: $showingPoll) {
      EchoPollComposerSheet(initialDraft: state.poll ?? EchoComposerPollDraft()) { draft in
        state.poll = draft
        state.assets.removeAll()
        state.selectedGIF = nil
        state.panel = nil
      }
    }
  }

  private var composerSurface: Color {
    Color(red: 0.047, green: 0.051, blue: 0.067)
  }

  private var composerAccent: Color {
    Color(red: 0.32, green: 0.30, blue: 0.78)
  }

  @ViewBuilder
  private var selectionPreview: some View {
    if !state.assets.isEmpty || state.selectedGIF != nil || state.poll != nil {
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
              icon: "sparkles.rectangle.stack", title: gif.title.isEmpty ? "GIF" : gif.title
            ) {
              state.selectedGIF = nil
            }
          }
          if let poll = state.poll {
            previewChip(
              icon: "chart.bar.fill", title: poll.question.isEmpty ? "Poll draft" : poll.question
            ) {
              state.poll = nil
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
      Image(systemName: icon).foregroundStyle(Color(red: 0.52, green: 0.50, blue: 0.92))
      Text(title).lineLimit(1)
      Button(action: remove) {
        Image(systemName: "xmark.circle.fill").foregroundStyle(.white.opacity(0.42))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Remove \(title)")
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
      state.errorMessage = (error as? LocalizedError)?.errorDescription ?? "Message failed to send."
    }
    state.isSending = false
  }
}

/// Native vector counterpart of the dark-shell web Emotes asset.
/// The source SVG uses #3c3d4a chrome and #110b19 ink in a 36-point canvas.
private struct EchoWebEmotesIcon: View {
  var body: some View {
    Canvas { context, size in
      let chrome = Color(red: 60 / 255, green: 61 / 255, blue: 74 / 255)
      let ink = Color(red: 17 / 255, green: 11 / 255, blue: 25 / 255)
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

  var body: some View {
    VStack(spacing: 10) {
      HStack(spacing: 6) {
        panelAction("photo.on.rectangle.angled", "Photos") {}
        panelAction("folder", "Files", action: onChooseFiles)
        panelAction("chart.bar", "Poll", action: onCreatePoll)
        Spacer()
      }
      .padding(.horizontal, 2)

      Group {
        if photos.authorizationStatus == .denied || photos.authorizationStatus == .restricted {
          ContentUnavailableView(
            "Photos access is off",
            systemImage: "photo.badge.exclamationmark",
            description: Text("Allow Photos access in System Settings to see your library here."))
        } else if photos.isLoading {
          ProgressView("Loading photos").tint(.white.opacity(0.7))
        } else if photos.items.isEmpty {
          ContentUnavailableView("No photos", systemImage: "photo.on.rectangle")
        } else {
          ScrollView(showsIndicators: false) {
            LazyVGrid(
              columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 4), spacing: 3
            ) {
              ForEach(photos.items) { item in
                Button {
                  onChoosePhoto(item)
                } label: {
                  EchoComposerPhotoThumbnail(image: item.thumbnail)
                    .aspectRatio(1, contentMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Attach photo")
              }
            }
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .padding(10)
    .background(
      Color(red: 0.035, green: 0.038, blue: 0.052).opacity(0.98),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(.white.opacity(0.08), lineWidth: 1)
    }
    .shadow(color: .black.opacity(0.34), radius: 16, y: 7)
    .task { await photos.load() }
  }

  private func panelAction(_ icon: String, _ title: String, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      Label(title, systemImage: icon)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(.white.opacity(0.065), in: Capsule())
    }
    .buttonStyle(.plain)
    .foregroundStyle(.white.opacity(0.8))
  }
}

private struct EchoPollComposerSheet: View {
  let onSave: (EchoComposerPollDraft) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var draft: EchoComposerPollDraft

  init(initialDraft: EchoComposerPollDraft, onSave: @escaping (EchoComposerPollDraft) -> Void) {
    self.onSave = onSave
    _draft = State(initialValue: initialDraft)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Question") {
          TextField("Ask a question", text: $draft.question, axis: .vertical)
        }
        Section("Options") {
          ForEach(draft.options.indices, id: \.self) { index in
            HStack {
              TextField("Option \(index + 1)", text: $draft.options[index])
              if draft.options.count > 2 {
                Button(role: .destructive) {
                  draft.options.remove(at: index)
                } label: {
                  Image(systemName: "minus.circle.fill")
                }
                .buttonStyle(.plain)
              }
            }
          }
          if draft.options.count < 10 {
            Button("Add option", systemImage: "plus") { draft.options.append("") }
          }
        }
        Section("Settings") {
          Picker("Duration", selection: $draft.durationHours) {
            Text("1 hour").tag(Int?.some(1))
            Text("1 day").tag(Int?.some(24))
            Text("3 days").tag(Int?.some(72))
            Text("1 week").tag(Int?.some(168))
            Text("No end").tag(Int?.none)
          }
          Toggle("Anonymous votes", isOn: $draft.anonymous)
        }
      }
      .navigationTitle("Create poll")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Add") {
            onSave(draft)
            dismiss()
          }.disabled(!draft.isValid)
        }
      }
    }
    .frame(minWidth: 420, minHeight: 440)
  }
}
