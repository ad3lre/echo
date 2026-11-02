import EchoDomain
import SwiftUI

/// Web `ServerApplicationModal` — member answers the join form (`POST /servers/:id/applications`).
struct EchoServerApplicationModal: View {
  let context: EchoJoinApplicationContext
  /// Returns `nil` on success, otherwise a message to show inline.
  var onSubmit: ([String: EchoApplicationAnswer]) async -> String?
  /// Uploads a picked file for an `attachment` question; throws with a user-facing message.
  var onUploadFile: (EchoApplicationQuestion, EchoPickedFile) async throws -> EchoApplicationUpload
  var onClose: () -> Void

  @State private var text: [String: String] = [:]
  @State private var picked: [String: Set<String>] = [:]
  @State private var uploads: [String: EchoApplicationUpload] = [:]
  @State private var uploading: Set<String> = []
  @State private var busy = false
  @State private var errorMessage: String?

  private var questions: [EchoApplicationQuestion] { context.form.questions }

  private var answers: [String: EchoApplicationAnswer] {
    var out: [String: EchoApplicationAnswer] = [:]
    for question in questions {
      switch question.kind {
      case .short, .long, .single:
        let value = (text[question.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty { out[question.id] = .text(String(value.prefix(question.characterCap))) }
      case .multi:
        let chosen = question.options.filter { picked[question.id]?.contains($0) == true }
        if !chosen.isEmpty { out[question.id] = .list(chosen) }
      case .attachment:
        if let upload = uploads[question.id] { out[question.id] = .file(upload) }
      }
    }
    return out
  }

  private var isComplete: Bool {
    let given = answers
    return uploading.isEmpty && questions.allSatisfy { !$0.required || given[$0.id] != nil }
  }

  var body: some View {
    EchoGuildDesktopModal(maxWidth: 520, onClose: onClose) {
      VStack(alignment: .leading, spacing: 16) {
        VStack(alignment: .leading, spacing: 4) {
          Text(EchoCopy.format("Apply to %@", context.serverName))
            .font(.system(size: 20, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(EchoCopy.string("This server reviews new members. Answer below to join the waitlist."))
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
        .padding(.trailing, 28)

        ScrollView(showsIndicators: false) {
          VStack(alignment: .leading, spacing: 16) {
            ForEach(questions) { question in questionView(question) }
          }
        }
        .frame(maxHeight: 360)

        if let errorMessage {
          Text(errorMessage)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.mentionPing)
        }
        HStack {
          Spacer()
          EchoDesktopGhostButton(title: EchoCopy.string("Cancel"), action: onClose)
          EchoDesktopPrimaryButton(
            title: busy ? EchoCopy.string("Sending…") : EchoCopy.string("Submit application"),
            enabled: isComplete && !busy
          ) { Task { await submit() } }
        }
      }
      .overlay(alignment: .topTrailing) {
        EchoGuildModalCloseButton(action: onClose).offset(x: 4, y: -4)
      }
    }
  }

  @ViewBuilder
  private func questionView(_ question: EchoApplicationQuestion) -> some View {
    let title = question.required ? question.label : "\(question.label) (\(EchoCopy.string("optional")))"
    switch question.kind {
    case .short:
      EchoDesktopLabeledField(title: title) {
        TextField(
          question.placeholder.isEmpty ? question.label : question.placeholder,
          text: binding(question.id))
      }
    case .long:
      EchoDesktopLabeledField(title: title, minHeight: 88) {
        TextField(
          question.placeholder.isEmpty ? question.label : question.placeholder,
          text: binding(question.id), axis: .vertical
        )
        .lineLimit(3...8)
      }
    case .single, .multi:
      VStack(alignment: .leading, spacing: 7) {
        Text(title.uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        ForEach(question.options, id: \.self) { option in
          optionRow(question, option: option)
        }
      }
    case .attachment:
      EchoApplicationFileField(
        question: question, title: title, current: uploads[question.id],
        isUploading: uploading.contains(question.id),
        onPick: { file in await upload(file, for: question) },
        onClear: { uploads[question.id] = nil })
    }
  }

  private func optionRow(_ question: EchoApplicationQuestion, option: String) -> some View {
    let selected =
      question.kind == .single
      ? text[question.id] == option : picked[question.id]?.contains(option) == true
    return Button {
      if question.kind == .single {
        text[question.id] = option
      } else if selected {
        picked[question.id, default: []].remove(option)
      } else {
        picked[question.id, default: []].insert(option)
      }
    } label: {
      HStack {
        Text(option)
          .font(.system(size: 14, weight: selected ? .semibold : .medium))
          .foregroundStyle(EchoTheme.Color.fg)
        Spacer()
        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(selected ? EchoTheme.Color.signInBlue : EchoTheme.Color.ink(0.3))
      }
      .padding(.horizontal, 12)
      .frame(height: 38)
      .background(
        selected ? EchoTheme.Color.signInBlue.opacity(0.14) : EchoTheme.Color.elevatedMid,
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func binding(_ id: String) -> Binding<String> {
    Binding(get: { text[id] ?? "" }, set: { text[id] = $0 })
  }

  private func upload(_ file: EchoPickedFile, for question: EchoApplicationQuestion) async -> String? {
    uploading.insert(question.id)
    defer { uploading.remove(question.id) }
    do {
      uploads[question.id] = try await onUploadFile(question, file)
      return nil
    } catch {
      return echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t upload that file."))
    }
  }

  private func submit() async {
    busy = true
    errorMessage = nil
    errorMessage = await onSubmit(answers)
    busy = false
  }
}

extension EchoServerApplicationModal {
  /// Explore-hosted modal: submit, upload, and close all route through the model.
  init(context: EchoJoinApplicationContext, model: EchoExploreModel) {
    self.init(
      context: context,
      onSubmit: { await model.submitApplication(context, answers: $0) },
      onUploadFile: { try await model.uploadApplicationFile(context, question: $0, file: $1) },
      onClose: { model.applicationContext = nil })
  }
}
