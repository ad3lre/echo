import EchoDomain
import EchoNetworking
import Observation
import SwiftUI

/// Member-facing upcoming events for one server (web `GuildEventActivityStrip` + RSVP).
/// Admin scheduling lives in `EchoServerSettingsEventsPanel`.
@MainActor
@Observable
final class EchoServerEventsModel {
  let serverID: String
  private let client: EchoWorkspaceClient
  private let auth: EchoAuthenticationModel

  private(set) var events: [EchoUpcomingServerEvent] = []
  private(set) var pendingEventID: String?
  var errorMessage: String?

  /// `/workspace` is rate-limited, so reuse a recent read when the channel list re-appears.
  private static var cache: [String: (at: Date, events: [EchoUpcomingServerEvent])] = [:]
  private static let cacheTTL: TimeInterval = 60

  init(serverID: String, baseURL: URL, auth: EchoAuthenticationModel) {
    self.serverID = serverID
    self.client = EchoWorkspaceClient(baseURL: baseURL)
    self.auth = auth
    if let hit = Self.cache[serverID] { events = hit.events }
  }

  func load(force: Bool = false) async {
    if !force, let hit = Self.cache[serverID], Date().timeIntervalSince(hit.at) < Self.cacheTTL {
      return
    }
    do {
      let token = try await auth.ensureAccessToken()
      let loaded = try await client.loadUpcomingEvents(serverID: serverID, accessToken: token)
      events = loaded
      Self.cache[serverID] = (Date(), loaded)
    } catch {
      // The strip is optional chrome; stay quiet when the list can't load.
    }
  }

  /// Optimistic RSVP; rolls back and surfaces `errorMessage` on failure.
  func setRSVP(_ event: EchoUpcomingServerEvent, _ status: EchoEventRSVP) async {
    guard pendingEventID == nil, event.userRSVP != status,
      let index = events.firstIndex(where: { $0.id == event.id })
    else { return }
    let previous = events
    events[index] = event.applying(status)
    pendingEventID = event.id
    errorMessage = nil
    defer { pendingEventID = nil }
    do {
      let token = try await auth.ensureAccessToken()
      try await client.setEventRSVP(
        serverID: serverID, eventID: event.id, status: status, accessToken: token)
      Self.cache[serverID] = (Date(), events)
    } catch {
      events = previous
      errorMessage = EchoCopy.string("Echo couldn’t update your RSVP.")
    }
  }
}

struct EchoServerEventsStrip: View {
  let server: EchoServerSummary
  let baseURL: URL
  /// Opens the event's channel when it points at one the member can see.
  var onOpenChannel: (String) -> Void = { _ in }

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoServerEventsModel?
  @State private var detailEvent: EchoUpcomingServerEvent?

  var body: some View {
    Group {
      if let model, !model.events.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(model.events) { event in
                card(event, model: model)
              }
            }
            .padding(.horizontal, 12)
          }
          if let error = model.errorMessage {
            Text(error)
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(EchoTheme.Color.mentionPing)
              .padding(.horizontal, 14)
          }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(EchoCopy.string("Upcoming events"))
      }
    }
    .task(id: server.id) {
      let events = EchoServerEventsModel(serverID: server.id, baseURL: baseURL, auth: auth)
      model = events
      await events.load()
    }
    .sheet(item: $detailEvent) { event in
      EchoGuildEventActivityDetailSheet(
        card: activityCard(for: event),
        baseURL: baseURL,
        accessToken: auth.activeSession?.accessToken,
        initialRSVP: event.userRSVP,
        onClose: { detailEvent = nil },
        onOpenLocation: {
          detailEvent = nil
          if let channelID = event.channelID {
            onOpenChannel(channelID)
          }
        },
        onRSVPChanged: { status in
          Task { await model?.setRSVP(event, status) }
        }
      )
    }
  }

  private func activityCard(for event: EchoUpcomingServerEvent) -> EchoGuildEventActivityCard {
    EchoGuildEventActivityCard(
      serverID: server.id,
      serverName: server.name,
      serverImageURL: server.iconURL ?? "",
      eventImageURL: nil,
      eventID: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      channelID: event.channelID,
      customLocation: event.customLocation,
      channelDisplayName: event.channelName.map { $0.hasPrefix("#") ? $0 : "#\($0)" },
      goingCount: event.goingCount)
  }

  private func card(_ event: EchoUpcomingServerEvent, model: EchoServerEventsModel) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Button {
        detailEvent = event
      } label: {
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "calendar")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(
                event.isHappeningNow
                  ? EchoTheme.Color.presenceOnline : EchoTheme.Color.indigoSoft)
            Text(event.title)
              .font(.system(size: 14, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.fg)
              .lineLimit(1)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.32))
          }
          Text(whenLabel(event))
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.6))
            .lineLimit(1)
          detailLine(event)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityHint(EchoCopy.string("Show event details"))
      HStack(spacing: 6) {
        rsvpButton(
          EchoCopy.string("Going"), "checkmark", active: event.userRSVP == .going,
          tint: EchoTheme.Color.presenceOnline
        ) { Task { await model.setRSVP(event, .going) } }
        rsvpButton(
          EchoCopy.string("Not going"), "xmark", active: event.userRSVP == .declined,
          tint: EchoTheme.Color.mentionPing
        ) { Task { await model.setRSVP(event, .declined) } }
      }
      .disabled(model.pendingEventID != nil)
    }
    .padding(10)
    .frame(width: 244, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .strokeBorder(EchoTheme.Color.ink(0.08))
    }
  }

  @ViewBuilder
  private func detailLine(_ event: EchoUpcomingServerEvent) -> some View {
    HStack(spacing: 6) {
      if event.isHappeningNow {
        Text(EchoCopy.string("Happening now"))
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.presenceOnline)
      }
      if let channelID = event.channelID, !event.locationSummary.isEmpty {
        Button(event.locationSummary) { onOpenChannel(channelID) }
          .buttonStyle(.plain)
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.indigoSoft)
          .lineLimit(1)
      } else if !event.locationSummary.isEmpty {
        Text(event.locationSummary)
          .font(.system(size: 11, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Text(EchoCopy.format("%lld going", event.goingCount))
        .font(.system(size: 11, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
    }
  }

  private func rsvpButton(
    _ title: String, _ symbol: String, active: Bool, tint: Color, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(title, systemImage: symbol)
        .labelStyle(.titleAndIcon)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .foregroundStyle(active ? Color.white : EchoTheme.Color.ink(0.7))
        .frame(maxWidth: .infinity)
        .frame(height: 28)
        .background(
          active ? tint.opacity(0.85) : EchoTheme.Color.ink(0.07),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(active ? .isSelected : [])
  }

  private func whenLabel(_ event: EchoUpcomingServerEvent) -> String {
    guard let start = event.startDate else { return event.startsAt }
    return start.formatted(date: .abbreviated, time: .shortened)
  }
}
