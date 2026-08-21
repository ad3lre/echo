import EchoDomain
import EchoNetworking
import SwiftUI

/// Full-screen inbox for relationship requests and personal notes.
/// Request previews are intentionally visible on this first screen; only the
/// overflow view expands into a separate list when real server rows arrive.

struct EchoInboxFindPeopleSection: View {
  let onOpen: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      EchoCopy.text("ADD FRIENDS")
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .tracking(2.2)
        .foregroundStyle(.white.opacity(0.38))
        .padding(.leading, 3)

      Button(action: onOpen) {
        HStack(spacing: 13) {
          Image(systemName: "person.badge.plus")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.skyBlue)
            .frame(width: 42, height: 42)
            .background(
              EchoTheme.Color.linkBlue.opacity(0.16),
              in: RoundedRectangle(cornerRadius: 13, style: .continuous)
            )

          VStack(alignment: .leading, spacing: 3) {
            EchoCopy.text("Find your people")
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.92))
            EchoCopy.text("Search Echo by name or username and send a request")
              .font(.system(size: 13, design: .rounded))
              .foregroundStyle(.white.opacity(0.45))
              .lineLimit(2)
          }

          Spacer(minLength: 8)
          Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white.opacity(0.30))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .background(
        .white.opacity(0.055), in: RoundedRectangle(cornerRadius: 20, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(.white.opacity(0.075), lineWidth: 1)
      }
      .accessibilityHint(EchoCopy.string("Opens people search"))
    }
  }
}

struct EchoPersonalNotesRow: View {
  let hasConversation: Bool

  var body: some View {
    HStack(spacing: 13) {
      Image(systemName: "note.text")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Color.orange)
        .frame(width: 40, height: 40)
        .background(Color.orange.opacity(0.16), in: RoundedRectangle(cornerRadius: 13))

      VStack(alignment: .leading, spacing: 3) {
        EchoCopy.text("Personal notes")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.92))
        Text(
          hasConversation
            ? EchoCopy.string("Your private conversation with yourself")
            : "Keep private notes outside your conversations"
        )
        .font(.system(size: 13, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.45))
        .lineLimit(1)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(.white.opacity(0.30))
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .contentShape(Rectangle())
  }
}

struct EchoInboxIntro: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      EchoCopy.text("Keep up with what’s new")
        .font(.system(size: 25, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.95))
      EchoCopy.text("Requests and personal notes stay together here, away from your conversations.")
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.52))
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct EchoInboxRequestSection: View {
  let title: String
  let systemName: String
  let tint: Color
  let preview: EchoInboxPreview

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline) {
        Text(title)
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .tracking(2.2)
          .foregroundStyle(.white.opacity(0.38))
        Spacer(minLength: 0)
        Button(EchoCopy.string("View all")) {}
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(tint.opacity(0.95))
          .disabled(true)
          .opacity(0.42)
      }

      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 13) {
          Image(systemName: systemName)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 40, height: 40)
            .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 13))
          VStack(alignment: .leading, spacing: 3) {
            Text(preview.title)
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.92))
            Text(preview.subtitle)
              .font(.system(size: 13, weight: .regular, design: .rounded))
              .foregroundStyle(.white.opacity(0.45))
          }
          Spacer(minLength: 0)
        }
      }
      .padding(14)
      .background(
        .white.opacity(0.055), in: RoundedRectangle(cornerRadius: 20, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(.white.opacity(0.075), lineWidth: 1)
      )
    }
  }
}

struct EchoInboxFriendRequestSection: View {
  let requests: [EchoIncomingFriendRequest]
  let baseURL: URL
  var accessToken: String? = nil
  let isLoading: Bool
  let errorMessage: String?
  let respondingRequestIDs: Set<String>
  let onAccept: (EchoIncomingFriendRequest) -> Void
  let onDecline: (EchoIncomingFriendRequest) -> Void
  let onRetry: () -> Void
  private let tint = EchoTheme.Color.linkBlue

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline) {
        EchoCopy.text("FRIEND REQUESTS")
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .tracking(2.2)
          .foregroundStyle(.white.opacity(0.38))
        Spacer(minLength: 0)
        if !requests.isEmpty {
          Text("\(requests.count)")
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
        }
      }

      VStack(alignment: .leading, spacing: 0) {
        if isLoading && requests.isEmpty {
          HStack(spacing: 12) {
            ProgressView().tint(tint)
            EchoCopy.text("Loading friend requests…")
              .font(.system(size: 14, design: .rounded))
              .foregroundStyle(.white.opacity(0.52))
          }
          .padding(16)
        } else if let errorMessage, requests.isEmpty {
          VStack(alignment: .leading, spacing: 10) {
            EchoCopy.text("Couldn’t load friend requests")
              .font(.system(size: 15, weight: .semibold, design: .rounded))
            Text(errorMessage)
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(.white.opacity(0.48))
            Button(EchoCopy.string("Try again"), action: onRetry)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundStyle(tint)
          }
          .padding(16)
        } else if requests.isEmpty {
          EchoInboxEmptyRequestRow(
            systemName: "person.badge.plus",
            tint: tint,
            title: EchoCopy.string("No friend requests"),
            subtitle: EchoCopy.string("New connection requests will appear here.")
          )
        } else {
          ForEach(Array(requests.enumerated()), id: \.element.id) { index, request in
            EchoInboxFriendRequestRow(
              request: request,
              baseURL: baseURL,
              accessToken: accessToken,
              isResponding: respondingRequestIDs.contains(request.id),
              onAccept: { onAccept(request) },
              onDecline: { onDecline(request) }
            )
            if index < requests.count - 1 {
              Divider().overlay(.white.opacity(0.07)).padding(.leading, 70)
            }
          }
        }
      }
      .background(
        .white.opacity(0.055), in: RoundedRectangle(cornerRadius: 20, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(.white.opacity(0.075), lineWidth: 1)
      )
    }
  }
}

struct EchoInboxFriendRequestRow: View {
  let request: EchoIncomingFriendRequest
  let baseURL: URL
  var accessToken: String? = nil
  let isResponding: Bool
  let onAccept: () -> Void
  let onDecline: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      EchoMediaImage(
        source: request.sender.avatarURL, baseURL: baseURL, accessToken: accessToken
      ) {
        EchoGeneratedAvatar(name: request.sender.name, seed: request.sender.id)
      }
      .frame(width: 44, height: 44)
      .clipShape(Circle())

      VStack(alignment: .leading, spacing: 3) {
        Text(request.sender.name)
          .font(.system(size: 15, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.92))
          .lineLimit(1)
        Text("@\(request.sender.username)")
          .font(.system(size: 12, design: .rounded))
          .foregroundStyle(.white.opacity(0.46))
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      if isResponding {
        ProgressView().tint(.white.opacity(0.7)).frame(width: 70)
      } else {
        Button(action: onDecline) {
          Image(systemName: "xmark")
            .frame(width: 34, height: 34)
            .background(.white.opacity(0.07), in: Circle())
        }
        .accessibilityLabel("Decline request from \(request.sender.name)")
        Button(action: onAccept) {
          Image(systemName: "checkmark")
            .fontWeight(.semibold)
            .frame(width: 34, height: 34)
            .background(Color.blue.opacity(0.85), in: Circle())
        }
        .accessibilityLabel("Accept request from \(request.sender.name)")
      }
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }
}

struct EchoInboxEmptyRequestRow: View {
  let systemName: String
  let tint: Color
  let title: String
  let subtitle: String

  var body: some View {
    HStack(spacing: 13) {
      Image(systemName: systemName)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 40, height: 40)
        .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 13))
      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.92))
        Text(subtitle)
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(.white.opacity(0.45))
      }
      Spacer(minLength: 0)
    }
    .padding(14)
  }
}

struct EchoInboxPreview {
  let title: String
  let subtitle: String

  static func empty(title: String, subtitle: String) -> Self {
    Self(title: title, subtitle: subtitle)
  }
}

struct EchoPersonalNotesView: View {
  var body: some View {
    ContentUnavailableView(EchoCopy.string("No personal notes"),
      systemImage: "note.text",
      description: EchoCopy.text("Private notes will live here when you create one.")
    )
    .foregroundStyle(.white.opacity(0.62))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(EchoInboxBackground().ignoresSafeArea())
    navigationTitle(EchoCopy.string("Personal notes"))
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
  }
}

struct EchoInboxBackground: View {
  var body: some View {
    ZStack {
      EchoTheme.Color.canvas
      RadialGradient(
        colors: [Color.indigo.opacity(0.16), .clear],
        center: UnitPoint(x: 0.88, y: 0.02),
        startRadius: 0,
        endRadius: 360
      )
    }
  }
}
