import EchoDomain
import SwiftUI

/// Shown above the thread inside a ticket channel. Renders nothing elsewhere.
/// Handlers get status / assign / close; the ticket author may only close.
struct EchoTicketControlsCard: View {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
  let userID: String
  let servers: EchoServersModel
  let baseURL: URL
  /// Called after the ticket (and its channel) was deleted.
  var onDeleted: () -> Void = {}

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoTicketControlsModel?
  @State private var confirmingDelete = false

  var body: some View {
    Group {
      if let model, let ticket = model.ticket, model.isHandler || model.isAuthor {
        card(ticket, model: model)
      }
    }
    .task(id: channel.id) {
      let controls = EchoTicketControlsModel(
        server: server, channel: channel, userID: userID, servers: servers,
        baseURL: baseURL, auth: auth)
      model = controls
      await controls.load()
    }
  }

  private func card(_ ticket: EchoTicket, model: EchoTicketControlsModel) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      header(ticket)
      if let assignee = ticket.assignedTo {
        Label(
          EchoCopy.format("Assigned to %@", model.displayName(for: assignee)),
          systemImage: "person.fill.checkmark"
        )
        .font(.system(size: 12, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
      }
      if ticket.status == .closed {
        Text(EchoCopy.string("This ticket is closed."))
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
      } else {
        actions(ticket, model: model)
      }
      if let error = model.errorMessage {
        Text(error)
          .font(.system(size: 12, design: .rounded))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.08))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .disabled(model.isUpdating)
    .alert(EchoCopy.string("Delete this ticket?"), isPresented: $confirmingDelete) {
      Button(EchoCopy.string("Delete"), role: .destructive) {
        Task { if await model.delete() { onDeleted() } }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: {
      Text(EchoCopy.string("The ticket channel and its messages will be removed."))
    }
  }

  private func header(_ ticket: EchoTicket) -> some View {
    HStack(spacing: 8) {
      HStack(spacing: 5) {
        Circle().fill(Self.color(ticket.status)).frame(width: 8, height: 8)
        Text(Self.label(ticket.status))
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.8))
      }
      .padding(.horizontal, 9)
      .padding(.vertical, 4)
      .background(EchoTheme.Color.ink(0.07), in: Capsule())
      Text(ticket.subject)
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }

  private func actions(_ ticket: EchoTicket, model: EchoTicketControlsModel) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        if model.isHandler {
          if ticket.status == .open {
            EchoSettingsSecondaryButton(title: EchoCopy.string("Mark in progress")) {
              Task { await model.setStatus(.inProgress) }
            }
          }
          if ticket.status != .resolved {
            EchoSettingsSecondaryButton(title: EchoCopy.string("Resolve")) {
              Task { await model.setStatus(.resolved) }
            }
          }
          assignMenu(ticket, model: model)
        }
        EchoSettingsSecondaryButton(title: EchoCopy.string("Close ticket")) {
          Task { await model.setStatus(.closed) }
        }
        if model.canManageTickets {
          EchoSettingsDangerButton(title: EchoCopy.string("Delete")) { confirmingDelete = true }
        }
      }
    }
  }

  private func assignMenu(_ ticket: EchoTicket, model: EchoTicketControlsModel) -> some View {
    Menu {
      if !EchoUserIdentity.matches(ticket.assignedTo, userID) {
        Button(EchoCopy.string("Assign to me")) { Task { await model.assign(to: userID) } }
      }
      ForEach(model.assignableMembers) { member in
        Button(member.name) { Task { await model.assign(to: member.userID) } }
      }
      if ticket.assignedTo != nil {
        Button(EchoCopy.string("Unassign"), role: .destructive) {
          Task { await model.assign(to: nil) }
        }
      }
    } label: {
      Text(EchoCopy.string("Assign"))
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.75))
        .padding(.horizontal, 12)
        .frame(height: 32)
        .background(
          EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .menuStyle(.button)
    .buttonStyle(.plain)
  }

  static func label(_ status: EchoTicketStatus) -> String {
    switch status {
    case .open: EchoCopy.string("Open")
    case .inProgress: EchoCopy.string("In progress")
    case .resolved: EchoCopy.string("Resolved")
    case .closed: EchoCopy.string("Closed")
    }
  }

  /// Web `TicketControlsPanel` status dot colours.
  static func color(_ status: EchoTicketStatus) -> Color {
    switch status {
    case .open: EchoTheme.Color.presenceOnline
    case .inProgress: Color.orange
    case .resolved: EchoTheme.Color.signInBlue
    case .closed: EchoTheme.Color.ink(0.45)
    }
  }
}
