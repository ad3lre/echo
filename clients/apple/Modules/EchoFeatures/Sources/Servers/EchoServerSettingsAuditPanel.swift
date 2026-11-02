import EchoDomain
import SwiftUI

/// Web `ServerSettingsAuditLogSection` — filtered audit log (tab / time / actor).
struct EchoServerSettingsAuditPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  @Binding var localError: String?

  @State private var entries: [EchoAuditLogEntry] = []
  @State private var actorCatalog: [(id: String, label: String)] = []
  @State private var loading = false
  @State private var tab: EchoAuditLogFormatting.Tab = .all
  @State private var time: EchoAuditLogFormatting.TimeWindow = .all
  @State private var actorID = ""

  private var filtered: [EchoAuditLogEntry] {
    EchoAuditLogFormatting.filtered(entries, tab: tab, time: time, actorID: actorID)
  }

  private var filtersActive: Bool {
    tab != .all || time != .all || !actorID.isEmpty
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      filterBar
      if loading {
        ProgressView()
      } else if filtered.isEmpty {
        Text(
          entries.isEmpty
            ? EchoCopy.string("No audit log entries yet.")
            : EchoCopy.string("No audit entries match these filters.")
        )
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      } else {
        ForEach(filtered) { entry in
          entryRow(entry)
        }
      }
    }
    .task { await reload(actorID: nil, refreshCatalog: true) }
    .onChange(of: actorID) { _, next in
      Task { await reload(actorID: next.isEmpty ? nil : next, refreshCatalog: false) }
    }
  }

  private var filterBar: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 10) {
        EchoSettingsDropdown(
          selection: $tab,
          options: EchoAuditLogFormatting.Tab.allCases.map { ($0, $0.label) })
        EchoSettingsDropdown(
          selection: $time,
          options: EchoAuditLogFormatting.TimeWindow.allCases.map { ($0, $0.label) })
      }
      HStack(spacing: 10) {
        EchoSettingsDropdown(
          selection: $actorID,
          options: [("", EchoCopy.string("All actors"))]
            + actorCatalog.map { ($0.id, $0.label) },
          searchable: true,
          placeholder: EchoCopy.string("All actors"))
        if filtersActive {
          Button(EchoCopy.string("Clear filters")) {
            tab = .all
            time = .all
            actorID = ""
          }
          .buttonStyle(.plain)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.signInBlue)
        }
      }
    }
  }

  private func entryRow(_ entry: EchoAuditLogEntry) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(entry.action)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        Spacer()
        Text(entry.createdAt)
          .font(.system(size: 11).monospacedDigit())
          .foregroundStyle(EchoTheme.Color.ink(0.42))
      }
      Text(
        EchoCopy.format(
          "%@ · %@ %@",
          entry.actorLabel.isEmpty ? EchoCopy.string("Unknown") : entry.actorLabel,
          entry.targetType,
          entry.targetID
        )
      )
      .font(.system(size: 12))
      .foregroundStyle(EchoTheme.Color.ink(0.5))
    }
    .padding(12)
    .background(
      EchoTheme.Color.ink(0.035),
      in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
  }

  private func reload(actorID: String?, refreshCatalog: Bool) async {
    loading = true
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      let next = try await model.client.loadAuditLog(
        serverID: server.id, accessToken: token, actorID: actorID)
      entries = next
      if refreshCatalog || actorCatalog.isEmpty {
        actorCatalog = EchoAuditLogFormatting.actorCatalog(from: next)
      }
    } catch {
      localError = EchoCopy.string("Echo couldn’t load the audit log.")
    }
  }
}
