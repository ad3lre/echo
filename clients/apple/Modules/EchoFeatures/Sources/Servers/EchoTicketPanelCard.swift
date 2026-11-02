import EchoDomain
import SwiftUI

/// Web `TicketWidget` — shown above the thread in the configured ticket panel channel.
/// Renders nothing for every other channel or while tickets are disabled.
struct EchoTicketPanelCard: View {
  let server: EchoServerSummary
  let channelID: String
  let baseURL: URL
  /// Called after the server accepts the ticket; host navigates to `ticket.channelID`.
  var onTicketCreated: (EchoTicket) -> Void

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoTicketIntakeModel?
  @State private var showingCreate = false

  var body: some View {
    Group {
      if let model, model.showsPanel(in: channelID), let config = model.config {
        card(config)
          .sheet(isPresented: $showingCreate) {
            EchoTicketCreateSheet(model: model) { ticket in
              showingCreate = false
              onTicketCreated(ticket)
            }
          }
      }
    }
    .task(id: server.id) {
      let intake = EchoTicketIntakeModel(serverID: server.id, baseURL: baseURL, auth: auth)
      model = intake
      await intake.loadConfig()
    }
  }

  private func card(_ config: EchoTicketConfig) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: "ticket")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.indigoSoft)
          .frame(width: 40, height: 40)
          .background(
            EchoTheme.Color.ink(0.06),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(EchoCopy.string("Need help?"))
            .font(.system(size: 16, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
          Text(EchoCopy.string("Open a private ticket and a staff member will assist you."))
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      if !config.ticketCategories.isEmpty {
        categoryTags(config.ticketCategories)
      }
      EchoDesktopPrimaryButton(title: EchoCopy.string("Create Ticket")) {
        model?.resetForm()
        showingCreate = true
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.05),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.08))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
  }

  private func categoryTags(_ categories: [EchoTicketCategory]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(categories) { category in
          Text(verbatim: [category.emoji, category.name].filter { !$0.isEmpty }.joined(separator: " "))
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.6))
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(EchoTheme.Color.ink(0.06), in: Capsule())
        }
      }
    }
  }
}
