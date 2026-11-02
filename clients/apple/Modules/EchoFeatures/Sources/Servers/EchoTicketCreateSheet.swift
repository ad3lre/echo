import EchoDomain
import SwiftUI

/// Web `TicketCreateModal` — subject, optional category chips, and server-defined form fields.
struct EchoTicketCreateSheet: View {
  @Bindable var model: EchoTicketIntakeModel
  var onCreated: (EchoTicket) -> Void

  @Environment(\.dismiss) private var dismiss

  private var config: EchoTicketConfig { model.config ?? EchoTicketConfig() }

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider().overlay(EchoTheme.Color.ink(0.08))
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 16) {
          Text(
            EchoCopy.string(
              "Describe what you need and we’ll open a private channel with the server team.")
          )
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))

          if let error = model.errorMessage {
            Text(error)
              .font(.system(size: 13, design: .rounded))
              .foregroundStyle(EchoTheme.Color.mentionPing)
          }

          field(EchoCopy.string("Subject")) {
            TextField(EchoCopy.string("What do you need help with?"), text: $model.subject)
              .textFieldStyle(.plain)
              .onChange(of: model.subject) { _, value in
                if value.count > 200 { model.subject = String(value.prefix(200)) }
              }
          }

          if !config.ticketCategories.isEmpty { categorySection }

          ForEach(config.formFields) { formField in
            dynamicField(formField)
          }
        }
        .padding(20)
      }
      Divider().overlay(EchoTheme.Color.ink(0.08))
      footer
    }
    #if os(macOS)
      .frame(minWidth: 440, minHeight: 520)
    #endif
    .background(EchoTheme.Color.elevatedDeep)
  }

  // MARK: - Chrome

  private var header: some View {
    HStack(spacing: 12) {
      Image(systemName: "ticket")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.indigoSoft)
        .frame(width: 40, height: 40)
        .background(
          EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      Text(EchoCopy.string("Create a Ticket"))
        .font(.system(size: 18, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
      Spacer(minLength: 8)
      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(model.isSubmitting)
      .accessibilityLabel(EchoCopy.string("Cancel"))
    }
    .padding(20)
  }

  private var footer: some View {
    HStack {
      Button(EchoCopy.string("Cancel")) { dismiss() }
        .buttonStyle(.plain)
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .disabled(model.isSubmitting)
      Spacer()
      Button {
        Task {
          if let ticket = await model.submit() { onCreated(ticket) }
        }
      } label: {
        HStack(spacing: 8) {
          if model.isSubmitting {
            ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent)
          }
          Text(
            model.isSubmitting
              ? EchoCopy.string("Creating…") : EchoCopy.string("Create Ticket")
          )
          .font(.system(size: 14, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(EchoTheme.Color.onAccent)
        .padding(.horizontal, 16)
        .frame(height: 40)
        .background(
          EchoTheme.Color.signInBlue,
          in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(model.isSubmitting)
    }
    .padding(16)
  }

  // MARK: - Fields

  private var categorySection: some View {
    VStack(alignment: .leading, spacing: 8) {
      label(
        config.requireCategory
          ? EchoCopy.string("Category") + " *" : EchoCopy.string("Category"))
      FlowRow(spacing: 8) {
        ForEach(config.ticketCategories) { category in
          let selected = model.categoryID == category.id
          Button {
            model.categoryID = category.id
          } label: {
            Text(
              verbatim: [category.emoji, category.name].filter { !$0.isEmpty }
                .joined(separator: " ")
            )
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(selected ? EchoTheme.Color.onAccent : EchoTheme.Color.fg)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
              selected ? EchoTheme.Color.signInBlue : EchoTheme.Color.ink(0.08), in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(selected ? .isSelected : [])
        }
      }
    }
  }

  @ViewBuilder
  private func dynamicField(_ formField: EchoTicketFormField) -> some View {
    let title = formField.required ? formField.label + " *" : formField.label
    let binding = Binding(
      get: { model.answers[formField.id] ?? "" },
      set: { model.answers[formField.id] = $0 })
    let placeholder = formField.placeholder ?? ""
    switch formField.type {
    case "select":
      VStack(alignment: .leading, spacing: 7) {
        label(title)
        EchoSettingsDropdown(
          selection: binding,
          options: [("", EchoCopy.string("Select…"))]
            + formField.options.map { ($0, $0) }
        )
      }
    case "textarea":
      field(title) {
        TextField(placeholder, text: binding, axis: .vertical)
          .textFieldStyle(.plain)
          .lineLimit(3...6)
      }
    default:
      field(title) {
        TextField(placeholder, text: binding).textFieldStyle(.plain)
      }
    }
  }

  private func field<Content: View>(
    _ title: String, @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      label(title)
      content()
        .font(.system(size: 14, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
        .padding(12)
        .background(
          EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
  }

  private func label(_ text: String) -> some View {
    Text(verbatim: text)
      .font(.system(size: 12, weight: .bold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.45))
      .textCase(.uppercase)
      .tracking(0.6)
  }
}

/// Wrapping chip row (categories can outgrow one line on phones).
private struct FlowRow: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    arrange(in: proposal.width ?? .infinity, subviews: subviews).size
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let result = arrange(in: bounds.width, subviews: subviews)
    for (index, origin) in result.origins.enumerated() {
      subviews[index].place(
        at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
        proposal: .unspecified)
    }
  }

  private func arrange(in width: CGFloat, subviews: Subviews) -> (
    size: CGSize, origins: [CGPoint]
  ) {
    var origins: [CGPoint] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var maxX: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      origins.append(CGPoint(x: x, y: y))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
      maxX = max(maxX, x - spacing)
    }
    return (CGSize(width: maxX, height: y + rowHeight), origins)
  }
}
