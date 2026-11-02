import EchoDomain
import SwiftUI

/// Web `ServerSettingsTicketsSection` — ticket intake config (`/servers/:id/ticket-config`).
struct EchoServerSettingsTicketsPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  @State private var config = EchoTicketConfig()
  @State private var loading = true
  @State private var loadFailed = false
  @State private var saving = false
  @State private var savedFlash = false

  private struct ChannelCategory: Identifiable {
    let id: String
    let name: String
  }

  private var textChannels: [EchoGuildChannel] {
    model.channels(for: server.id).filter(\.isTextLike)
  }

  private var channelCategories: [ChannelCategory] {
    var seen = Set<String>()
    var out: [ChannelCategory] = []
    for channel in model.channels(for: server.id) where !channel.categoryID.isEmpty {
      if seen.insert(channel.categoryID).inserted {
        out.append(ChannelCategory(id: channel.categoryID, name: channel.categoryName))
      }
    }
    return out
  }

  private var assignableRoles: [EchoServerRole] {
    model.roles(for: server.id).filter { !$0.isEveryone }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if loading {
        ProgressView()
      } else {
        if loadFailed {
          HStack {
            Text(EchoCopy.string("Echo couldn’t load ticket settings."))
              .font(.system(size: 13))
              .foregroundStyle(EchoTheme.Color.mentionPing)
            Spacer()
            EchoSettingsSecondaryButton(title: EchoCopy.string("Retry")) {
              Task { await reload() }
            }
          }
          .echoSettingsCard()
        }

        EchoSettingsToggleRow(
          title: EchoCopy.string("Enable tickets"),
          subtitle: EchoCopy.string(
            "Members open private support channels from a ticket panel."),
          isOn: $config.enabled)

        if config.enabled {
          intakeSection
          handlerRolesSection
          limitsSection
          categoriesSection
          fieldsSection
        }

        HStack {
          if savedFlash {
            EchoSettingsStatusLine(message: EchoCopy.string("Saved"))
          }
          Spacer()
          EchoDesktopPrimaryButton(
            title: saving ? EchoCopy.string("Saving…") : EchoCopy.string("Save Changes"),
            enabled: !saving
          ) {
            Task { await save() }
          }
        }
      }
    }
    .task { await reload() }
  }

  // MARK: - Sections

  private var intakeSection: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Channels"),
        subtitle: EchoCopy.string(
          "New tickets are created under the ticket category; the panel channel hosts the open-ticket button."
        ))

      EchoSettingsPickerField(
        title: EchoCopy.string("Ticket category"),
        selection: Binding(
          get: { config.ticketCategoryID ?? "" },
          set: { config.ticketCategoryID = $0.isEmpty ? nil : $0 }),
        options: [("", EchoCopy.string("Select a category"))]
          + channelCategories.map { ($0.id, $0.name) }
      )

      EchoSettingsPickerField(
        title: EchoCopy.string("Panel channel"),
        selection: Binding(
          get: { config.panelChannelID ?? "" },
          set: { config.panelChannelID = $0.isEmpty ? nil : $0 }),
        options: [("", EchoCopy.string("Select a channel"))]
          + textChannels.map { ($0.id, "#" + $0.name) }
      )
      if textChannels.isEmpty {
        Text(EchoCopy.string("Create a text channel first."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }

      EchoSettingsPickerField(
        title: EchoCopy.string("Log channel"),
        selection: Binding(
          get: { config.logChannelID ?? "" },
          set: { config.logChannelID = $0.isEmpty ? nil : $0 }),
        options: [("", EchoCopy.string("None"))]
          + textChannels.map { ($0.id, "#" + $0.name) }
      )

      EchoDesktopLabeledField(title: EchoCopy.string("Greeting message"), minHeight: 88) {
        TextField(
          EchoCopy.string("Thanks for opening a ticket. A team member will be with you shortly."),
          text: $config.greetingMessage,
          axis: .vertical
        )
        .lineLimit(3...6)
      }
    }
  }

  private var handlerRolesSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Handler roles"),
        subtitle: EchoCopy.string("Roles that can see and manage every ticket."))
      if assignableRoles.isEmpty {
        Text(EchoCopy.string("No roles available."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      } else {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(assignableRoles) { role in
            Toggle(
              isOn: Binding(
                get: { config.handlerRoleIDs.contains(role.id) },
                set: { on in
                  if on {
                    if !config.handlerRoleIDs.contains(role.id) {
                      config.handlerRoleIDs.append(role.id)
                    }
                  } else {
                    config.handlerRoleIDs.removeAll { $0 == role.id }
                  }
                })
            ) {
              Text(role.name)
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(EchoTheme.Color.fg)
            }
            .toggleStyle(.switch)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
          }
        }
        .padding(.vertical, 4)
        .background(
          EchoTheme.Color.ink(0.035),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
    }
  }

  private var limitsSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoSettingsSectionHeading(title: EchoCopy.string("Limits"))
      EchoDesktopLabeledField(title: EchoCopy.string("Max open tickets per member")) {
        TextField(
          EchoCopy.string("Max open tickets"), value: $config.maxOpenPerUser, format: .number)
      }
    }
  }

  private var categoriesSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Ticket categories"),
        subtitle: EchoCopy.string("Let members pick a topic when opening a ticket."))
      EchoSettingsToggleRow(
        title: EchoCopy.string("Require a category"),
        isOn: $config.requireCategory)
      ForEach($config.ticketCategories) { $category in
        HStack(spacing: 8) {
          TextField(EchoCopy.string("Emoji"), text: $category.emoji)
            .textFieldStyle(.plain)
            .frame(width: 56)
            .padding(.horizontal, 10)
            .frame(height: 38)
            .background(
              EchoTheme.Color.elevatedMid,
              in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          TextField(EchoCopy.string("Category name"), text: $category.name)
            .textFieldStyle(.plain)
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(
              EchoTheme.Color.elevatedMid,
              in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          EchoSettingsDangerButton(title: EchoCopy.string("Remove")) {
            config.ticketCategories.removeAll { $0.id == category.id }
          }
        }
      }
      EchoSettingsSecondaryButton(title: EchoCopy.string("Add category")) {
        config.ticketCategories.append(EchoTicketCategory())
      }
    }
  }

  private var fieldsSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Custom fields"),
        subtitle: EchoCopy.string("Extra questions shown on the ticket form."))
      ForEach($config.formFields) { $field in
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 8) {
            TextField(EchoCopy.string("Field label"), text: $field.label)
              .textFieldStyle(.plain)
              .padding(.horizontal, 12)
              .frame(height: 38)
              .background(
                EchoTheme.Color.elevatedMid,
                in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            EchoSettingsDropdown(
              selection: $field.type,
              options: [
                ("text", EchoCopy.string("Short text")),
                ("textarea", EchoCopy.string("Long text")),
                ("select", EchoCopy.string("Dropdown")),
              ]
            )
            .frame(width: 150)
          }
          if field.type == "select" {
            TextField(
              EchoCopy.string("Options, comma separated"),
              text: Binding(
                get: { field.options.joined(separator: ", ") },
                set: { text in
                  field.options =
                    text.split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                })
            )
            .textFieldStyle(.plain)
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(
              EchoTheme.Color.elevatedMid,
              in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          }
          HStack {
            Toggle(EchoCopy.string("Required"), isOn: $field.required)
              .toggleStyle(.switch)
              .font(.system(size: 13, weight: .medium))
            Spacer()
            EchoSettingsDangerButton(title: EchoCopy.string("Remove")) {
              config.formFields.removeAll { $0.id == field.id }
            }
          }
        }
        .echoSettingsCard(padding: 12)
      }
      EchoSettingsSecondaryButton(title: EchoCopy.string("Add field")) {
        config.formFields.append(EchoTicketFormField())
      }
    }
  }

  // MARK: - Networking

  private func reload() async {
    loading = true
    loadFailed = false
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      config = try await model.client.loadTicketConfig(serverID: server.id, accessToken: token)
    } catch {
      loadFailed = true
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load ticket settings."))
    }
  }

  private func save() async {
    localError = nil
    savedFlash = false
    saving = true
    defer { saving = false }
    var next = config
    next.ticketCategories = next.ticketCategories.filter {
      !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    next.formFields = next.formFields.filter {
      !$0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    do {
      let token = try await model.auth.ensureAccessToken()
      config = try await model.client.saveTicketConfig(
        serverID: server.id, config: next, accessToken: token)
      savedFlash = true
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save ticket settings."))
    }
  }
}
