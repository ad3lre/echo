import EchoDomain
import SwiftUI

/// Web `ServerSettingsApplicationsSection` — edit the join form and review the waitlist.
struct EchoServerSettingsApplicationsPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  @State private var form = EchoApplicationForm()
  @State private var loading = true
  @State private var loadFailed = false
  @State private var saving = false
  @State private var savedFlash = false
  @State private var pending: [EchoServerApplication] = []
  @State private var expandedID: String?
  @State private var busyID: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Application form"),
        subtitle: EchoCopy.string("Questions people answer before they can join."))
      if loading {
        ProgressView()
      } else {
        if loadFailed {
          EchoSettingsStatusLine(
            message: EchoCopy.string("Echo couldn’t load the application form."), isError: true)
        }
        ForEach($form.questions) { $question in
          questionCard($question)
        }
        addRow
        HStack {
          if savedFlash { EchoSettingsStatusLine(message: EchoCopy.string("Saved")) }
          Spacer()
          EchoDesktopPrimaryButton(
            title: EchoCopy.string("Save form"), enabled: !saving && !loadFailed
          ) { Task { await save() } }
        }
        waitlist
      }
    }
    .task(id: server.id) { await reload() }
  }

  // MARK: Form builder

  private var addRow: some View {
    HStack(spacing: 8) {
      addButton(EchoCopy.string("Short answer"), .short)
      addButton(EchoCopy.string("Paragraph"), .long)
      addButton(EchoCopy.string("Single choice"), .single)
      addButton(EchoCopy.string("Multiple choice"), .multi)
    }
    .disabled(form.questions.count >= EchoApplicationQuestion.maxQuestions)
  }

  private func addButton(_ title: String, _ kind: EchoApplicationQuestionKind) -> some View {
    EchoSettingsSecondaryButton(title: title) {
      form.questions.append(.blank(kind))
    }
  }

  private func questionCard(_ question: Binding<EchoApplicationQuestion>) -> some View {
    let value = question.wrappedValue
    return VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(kindTitle(value.kind).uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        Spacer()
        iconButton("chevron.up") { move(value.id, by: -1) }
        iconButton("chevron.down") { move(value.id, by: 1) }
        iconButton("trash") { form.questions.removeAll { $0.id == value.id } }
      }
      EchoDesktopLabeledField(title: EchoCopy.string("Question")) {
        TextField(EchoCopy.string("Question"), text: question.label)
      }
      if value.kind == .short || value.kind == .long {
        EchoDesktopLabeledField(title: EchoCopy.string("Placeholder")) {
          TextField(EchoCopy.string("Placeholder"), text: question.placeholder)
        }
      }
      if value.kind.isChoice { optionsEditor(question) }
      Toggle(EchoCopy.string("Required"), isOn: question.required)
        .toggleStyle(.switch)
        .font(.system(size: 13, weight: .medium))
    }
    .echoSettingsCard()
  }

  private func optionsEditor(_ question: Binding<EchoApplicationQuestion>) -> some View {
    let count = question.wrappedValue.options.count
    return VStack(alignment: .leading, spacing: 6) {
      ForEach(0..<count, id: \.self) { index in
        HStack {
          EchoDesktopLabeledField(title: EchoCopy.format("Option %lld", Int64(index + 1))) {
            TextField(
              EchoCopy.string("Option"),
              text: Binding(
                get: { index < question.wrappedValue.options.count ? question.wrappedValue.options[index] : "" },
                set: { if index < question.wrappedValue.options.count { question.wrappedValue.options[index] = $0 } }
              ))
          }
          iconButton("minus.circle") {
            if question.wrappedValue.options.count > 1 { question.wrappedValue.options.remove(at: index) }
          }
        }
      }
      EchoSettingsSecondaryButton(
        title: EchoCopy.string("Add option"),
        disabled: count >= EchoApplicationQuestion.maxOptions
      ) { question.wrappedValue.options.append("") }
    }
  }

  private func iconButton(_ symbol: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.6))
        .frame(width: 28, height: 28)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func kindTitle(_ kind: EchoApplicationQuestionKind) -> String {
    switch kind {
    case .short: EchoCopy.string("Short answer")
    case .long: EchoCopy.string("Paragraph")
    case .single: EchoCopy.string("Single choice")
    case .multi: EchoCopy.string("Multiple choice")
    case .attachment: EchoCopy.string("File upload")
    }
  }

  private func move(_ id: String, by delta: Int) {
    guard let index = form.questions.firstIndex(where: { $0.id == id }) else { return }
    let target = index + delta
    guard form.questions.indices.contains(target) else { return }
    form.questions.swapAt(index, target)
  }

  // MARK: Waitlist

  private var waitlist: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Waitlist"),
        subtitle: EchoCopy.string("Approve or reject people waiting to join."))
      if pending.isEmpty {
        Text(EchoCopy.string("No pending applications."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
      ForEach(pending) { application in
        applicationRow(application)
      }
    }
    .padding(.top, 8)
  }

  private func applicationRow(_ application: EchoServerApplication) -> some View {
    let expanded = expandedID == application.id
    let busy = busyID != nil
    return VStack(alignment: .leading, spacing: 10) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(EchoCopy.format("User %@", application.userID))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(verbatim: [application.source, application.createdAt].joined(separator: " · "))
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
        }
        Spacer()
        EchoSettingsSecondaryButton(
          title: expanded ? EchoCopy.string("Hide answers") : EchoCopy.string("View answers")
        ) { expandedID = expanded ? nil : application.id }
        EchoSettingsSecondaryButton(title: EchoCopy.string("Approve"), disabled: busy) {
          Task { await resolve(application, approve: true) }
        }
        EchoSettingsDangerButton(title: EchoCopy.string("Reject"), disabled: busy) {
          Task { await resolve(application, approve: false) }
        }
      }
      if expanded { answers(application) }
    }
    .echoSettingsCard()
  }

  private func answers(_ application: EchoServerApplication) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(application.answers.keys.sorted(), id: \.self) { key in
        VStack(alignment: .leading, spacing: 2) {
          Text(form.questions.first { $0.id == key }?.label ?? key)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(display(application.answers[key]))
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.62))
            .textSelection(.enabled)
        }
      }
    }
  }

  private func display(_ answer: EchoApplicationAnswer?) -> String {
    switch answer {
    case .text(let value): value
    case .list(let values): values.joined(separator: ", ")
    case .file(let upload): "\(upload.name) — \(upload.url)"
    case nil: ""
    }
  }

  // MARK: Actions

  private func reload() async {
    loading = true
    async let loadedForm = model.loadApplicationForm(server)
    async let loadedPending = model.loadPendingApplications(server)
    if let next = await loadedForm {
      form = next
      loadFailed = false
    } else {
      loadFailed = true
    }
    pending = await loadedPending ?? []
    loading = false
  }

  private func save() async {
    saving = true
    savedFlash = false
    localError = nil
    if await model.saveApplicationForm(server, form: form) {
      savedFlash = true
      if let next = await model.loadApplicationForm(server) { form = next }
    } else {
      localError = model.actionErrorMessage
    }
    saving = false
  }

  private func resolve(_ application: EchoServerApplication, approve: Bool) async {
    busyID = application.id
    localError = nil
    if await model.resolveApplication(server, application, approve: approve) {
      pending.removeAll { $0.id == application.id }
    } else {
      localError = model.actionErrorMessage
    }
    busyID = nil
  }
}
