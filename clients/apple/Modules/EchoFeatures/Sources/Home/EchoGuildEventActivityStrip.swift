import EchoDomain
import EchoNetworking
import SwiftUI

/// Horizontal “Going” events strip above the DM list (web `GuildEventActivityStrip`).
struct EchoGuildEventActivityStrip: View {
  let cards: [EchoGuildEventActivityCard]
  let baseURL: URL
  var accessToken: String? = nil
  var onOpen: (EchoGuildEventActivityCard) -> Void

  var body: some View {
    if !cards.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        Text(EchoCopy.string("Going"))
          .font(.system(size: 11, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.42))
          .textCase(.uppercase)
          .padding(.horizontal, 4)

        Group {
          if cards.count == 1, let only = cards.first {
            pill(only)
          } else {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 8) {
                ForEach(cards) { card in
                  pill(card)
                    .frame(minWidth: 260)
                }
              }
            }
          }
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(EchoCopy.string("Going events"))
    }
  }

  private func pill(_ card: EchoGuildEventActivityCard) -> some View {
    Button {
      onOpen(card)
    } label: {
      HStack(spacing: 10) {
        if let cover = card.eventImageURL, !cover.isEmpty {
          EchoMediaImage(source: cover, baseURL: baseURL, accessToken: accessToken) {
            Color.clear
          }
          .frame(width: 56, height: 44)
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }

        ZStack(alignment: .bottomTrailing) {
          EchoMediaImage(source: card.serverImageURL, baseURL: baseURL, accessToken: accessToken) {
            EchoGeneratedAvatar(name: card.serverName, seed: card.serverID)
          }
          .frame(width: 36, height: 36)
          .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

          Image(systemName: "calendar")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 16, height: 16)
            .background(EchoTheme.Color.indigoSoft, in: Circle())
            .overlay(Circle().strokeBorder(EchoTheme.Color.canvas, lineWidth: 1.5))
            .offset(x: 3, y: 3)
        }

        VStack(alignment: .leading, spacing: 2) {
          Text(card.title)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
            .lineLimit(1)
          Text(subtitle(card))
            .font(.system(size: 11, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .lineLimit(1)
          Text(EchoCopy.format("%lld going", card.goingCount))
            .font(.system(size: 10, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.4))
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        Text(EchoCopy.string("Open"))
          .font(.system(size: 10, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
          .padding(.horizontal, 8)
          .padding(.vertical, 5)
          .background(EchoTheme.Color.signInBlue.opacity(0.92), in: Capsule())
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .echoPointerHoverFill(
        hoverFill: EchoTheme.Color.ink(0.10),
        idleFill: EchoTheme.Color.ink(0.05),
        cornerRadius: 16)
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .strokeBorder(EchoTheme.Color.ink(0.08))
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.format("%@ · %@", card.title, card.serverName))
  }

  private func subtitle(_ card: EchoGuildEventActivityCard) -> String {
    var parts: [String] = [card.serverName]
    if let start = card.startDate {
      parts.append(EchoGuildEventActivityStrip.shortStartLabel(start))
    }
    if let channel = card.channelDisplayName, !channel.isEmpty {
      parts.append(channel)
    } else if let custom = card.customLocation, !custom.isEmpty {
      parts.append(custom.count > 56 ? String(custom.prefix(56)) + "…" : custom)
    }
    return parts.joined(separator: " · ")
  }

  static func shortStartLabel(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "MMM d, h:mm a"
    return formatter.string(from: date)
  }
}

/// Detail sheet for a Going-strip card (description + RSVP + open location).
struct EchoGuildEventActivityDetailSheet: View {
  let card: EchoGuildEventActivityCard
  let baseURL: URL
  var accessToken: String? = nil
  var onClose: () -> Void
  var onOpenLocation: (() -> Void)? = nil
  var onRSVPChanged: ((EchoEventRSVP) -> Void)? = nil

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var goingCount: Int
  @State private var status: EchoEventRSVP
  @State private var pending = false
  @State private var errorMessage: String?

  init(
    card: EchoGuildEventActivityCard,
    baseURL: URL,
    accessToken: String? = nil,
    initialRSVP: EchoEventRSVP? = .going,
    onClose: @escaping () -> Void,
    onOpenLocation: (() -> Void)? = nil,
    onRSVPChanged: ((EchoEventRSVP) -> Void)? = nil
  ) {
    self.card = card
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.onClose = onClose
    self.onOpenLocation = onOpenLocation
    self.onRSVPChanged = onRSVPChanged
    _goingCount = State(initialValue: card.goingCount)
    _status = State(initialValue: initialRSVP ?? .going)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          if let cover = card.eventImageURL, !cover.isEmpty {
            EchoMediaImage(source: cover, baseURL: baseURL, accessToken: accessToken) {
              Color.clear
            }
            .frame(maxWidth: .infinity)
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          }

          Text(card.title)
            .font(.system(size: 22, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)

          Text(card.serverName)
            .font(.system(size: 14, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))

          if let start = card.startDate {
            Label(
              EchoGuildEventActivityStrip.shortStartLabel(start),
              systemImage: "calendar"
            )
            .font(.system(size: 14, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.7))
          }

          if let channel = card.channelDisplayName, !channel.isEmpty {
            Label(channel, systemImage: "number")
              .font(.system(size: 14, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.7))
          } else if let custom = card.customLocation, !custom.isEmpty {
            Label(custom, systemImage: "mappin.and.ellipse")
              .font(.system(size: 14, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.7))
          }

          Text(EchoCopy.format("%lld going", goingCount))
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.5))

          if !card.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(card.description)
              .font(.system(size: 15, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.82))
          }

          HStack(spacing: 8) {
            rsvpChip(
              EchoCopy.string("Going"), active: status == .going,
              tint: EchoTheme.Color.presenceOnline
            ) { Task { await setRSVP(.going) } }
            rsvpChip(
              EchoCopy.string("Not going"), active: status == .declined,
              tint: EchoTheme.Color.mentionPing
            ) { Task { await setRSVP(.declined) } }
          }
          .disabled(pending)

          if onOpenLocation != nil,
            card.channelID != nil || !(card.customLocation ?? "").isEmpty
          {
            Button {
              onOpenLocation?()
            } label: {
              Label(EchoCopy.string("Open location"), systemImage: "arrow.up.right")
            }
            .buttonStyle(.borderedProminent)
            .tint(EchoTheme.Color.signInBlue)
          }

          if let errorMessage {
            Text(errorMessage)
              .font(.system(size: 13, design: .rounded))
              .foregroundStyle(EchoTheme.Color.mentionPing)
          }
        }
        .padding(20)
      }
      .background(EchoTheme.Color.canvas.ignoresSafeArea())
      .navigationTitle(EchoCopy.string("Event"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Close"), action: onClose)
        }
      }
    }
  }

  private func rsvpChip(
    _ title: String, active: Bool, tint: Color, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(active ? .white : EchoTheme.Color.ink(0.72))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
          active ? tint : EchoTheme.Color.ink(0.08),
          in: Capsule())
    }
    .buttonStyle(.plain)
  }

  private func setRSVP(_ next: EchoEventRSVP) async {
    guard !pending, status != next else { return }
    let previousStatus = status
    let previousCount = goingCount
    if previousStatus == .going, next != .going { goingCount = max(0, goingCount - 1) }
    if previousStatus != .going, next == .going { goingCount += 1 }
    status = next
    pending = true
    errorMessage = nil
    defer { pending = false }
    do {
      let token = try await auth.ensureAccessToken()
      try await EchoWorkspaceClient(baseURL: baseURL).setEventRSVP(
        serverID: card.serverID, eventID: card.eventID, status: next, accessToken: token)
      onRSVPChanged?(next)
      if next == .declined { onClose() }
    } catch {
      status = previousStatus
      goingCount = previousCount
      errorMessage = EchoCopy.string("Echo couldn’t update your RSVP.")
    }
  }
}
