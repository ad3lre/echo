import EchoDomain
import EchoNetworking
import SwiftUI

/// Full-screen inbox for relationship requests and personal notes.
/// Request previews are intentionally visible on this first screen; only the
/// overflow view expands into a separate list when real server rows arrive.
struct EchoInboxView: View {
  let personalNotes: EchoDirectMessage?
  let baseURL: URL
  let accessToken: String
  let userID: String
  @Environment(\.dismiss) private var dismiss
  @State private var incomingFriendRequests: [EchoIncomingFriendRequest] = []
  @State private var isLoadingFriendRequests = true
  @State private var friendRequestError: String?
  @State private var respondingRequestIDs = Set<String>()
  @State private var showingFindPeople = false

  private var settingsClient: EchoSettingsClient { EchoSettingsClient(baseURL: baseURL) }

  init(
    personalNotes: EchoDirectMessage?,
    baseURL: URL,
    accessToken: String,
    userID: String
  ) {
    self.personalNotes = personalNotes
    self.baseURL = baseURL
    self.accessToken = accessToken
    self.userID = userID
  }

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 24) {
          EchoInboxIntro()

          VStack(alignment: .leading, spacing: 9) {
            Text("YOUR SPACE")
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .tracking(2.2)
              .foregroundStyle(.white.opacity(0.38))
              .padding(.leading, 3)

            Group {
              if let personalNotes {
                NavigationLink {
                  EchoConversationView(
                    conversation: personalNotes,
                    baseURL: baseURL,
                    userID: userID
                  )
                } label: {
                  EchoPersonalNotesRow(hasConversation: true)
                }
                .buttonStyle(.plain)
              } else {
                NavigationLink {
                  EchoPersonalNotesView()
                } label: {
                  EchoPersonalNotesRow(hasConversation: false)
                }
                .buttonStyle(.plain)
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

          EchoInboxFindPeopleSection {
            showingFindPeople = true
          }

          EchoInboxFriendRequestSection(
            requests: incomingFriendRequests,
            baseURL: baseURL,
            accessToken: accessToken,
            isLoading: isLoadingFriendRequests,
            errorMessage: friendRequestError,
            respondingRequestIDs: respondingRequestIDs,
            onAccept: { respond(to: $0, accepting: true) },
            onDecline: { respond(to: $0, accepting: false) },
            onRetry: { Task { await loadFriendRequests() } }
          )

          EchoInboxRequestSection(
            title: "MESSAGE REQUESTS",
            systemName: "bubble.left.and.bubble.right",
            tint: Color(red: 0.63, green: 0.34, blue: 1.0),
            preview: .empty(
              title: "No message requests",
              subtitle: "Pending conversations will appear here."
            )
          )

        }
        .padding(.horizontal, 20)
        .padding(.top, 26)
        .padding(.bottom, 30)
      }
      .background(EchoInboxBackground().ignoresSafeArea())
      .navigationTitle("Inbox")
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(action: { dismiss() }) {
            Image(systemName: "arrow.left")
              .font(.system(size: 17, weight: .semibold))
          }
          .accessibilityLabel("Close inbox")
        }
      }
    }
    .preferredColorScheme(.dark)
    .task { await loadFriendRequests() }
    #if os(iOS)
      .fullScreenCover(isPresented: $showingFindPeople) {
        EchoAddFriendView(baseURL: baseURL, accessToken: accessToken)
      }
    #else
      .sheet(isPresented: $showingFindPeople) {
        EchoAddFriendView(baseURL: baseURL, accessToken: accessToken)
      }
    #endif
  }

  private func loadFriendRequests() async {
    isLoadingFriendRequests = true
    friendRequestError = nil
    defer { isLoadingFriendRequests = false }
    do {
      incomingFriendRequests = try await settingsClient.loadIncomingFriendRequests(
        accessToken: accessToken)
    } catch {
      friendRequestError = error.localizedDescription
    }
  }

  private func respond(to request: EchoIncomingFriendRequest, accepting: Bool) {
    guard respondingRequestIDs.insert(request.id).inserted else { return }
    Task {
      defer { respondingRequestIDs.remove(request.id) }
      do {
        if accepting {
          try await settingsClient.acceptFriendRequest(
            peerID: request.sender.id, accessToken: accessToken)
        } else {
          try await settingsClient.declineFriendRequest(
            peerID: request.sender.id, accessToken: accessToken)
        }
        incomingFriendRequests.removeAll { $0.id == request.id }
      } catch {
        friendRequestError = error.localizedDescription
      }
    }
  }
}

private struct EchoInboxFindPeopleSection: View {
  let onOpen: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Text("ADD FRIENDS")
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .tracking(2.2)
        .foregroundStyle(.white.opacity(0.38))
        .padding(.leading, 3)

      Button(action: onOpen) {
        HStack(spacing: 13) {
          Image(systemName: "person.badge.plus")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Color(red: 0.34, green: 0.63, blue: 1.0))
            .frame(width: 42, height: 42)
            .background(
              Color(red: 0.18, green: 0.56, blue: 1.0).opacity(0.16),
              in: RoundedRectangle(cornerRadius: 13, style: .continuous)
            )

          VStack(alignment: .leading, spacing: 3) {
            Text("Find your people")
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.92))
            Text("Search Echo by name or username and send a request")
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
      .accessibilityHint("Opens people search")
    }
  }
}

private struct EchoPersonalNotesRow: View {
  let hasConversation: Bool

  var body: some View {
    HStack(spacing: 13) {
      Image(systemName: "note.text")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Color.orange)
        .frame(width: 40, height: 40)
        .background(Color.orange.opacity(0.16), in: RoundedRectangle(cornerRadius: 13))

      VStack(alignment: .leading, spacing: 3) {
        Text("Personal notes")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.92))
        Text(
          hasConversation
            ? "Your private conversation with yourself"
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

private struct EchoInboxIntro: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Keep up with what’s new")
        .font(.system(size: 25, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.95))
      Text("Requests and personal notes stay together here, away from your conversations.")
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(.white.opacity(0.52))
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct EchoInboxRequestSection: View {
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
        Button("View all") {}
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

private struct EchoInboxFriendRequestSection: View {
  let requests: [EchoIncomingFriendRequest]
  let baseURL: URL
  var accessToken: String? = nil
  let isLoading: Bool
  let errorMessage: String?
  let respondingRequestIDs: Set<String>
  let onAccept: (EchoIncomingFriendRequest) -> Void
  let onDecline: (EchoIncomingFriendRequest) -> Void
  let onRetry: () -> Void
  private let tint = Color(red: 0.18, green: 0.56, blue: 1.0)

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline) {
        Text("FRIEND REQUESTS")
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
            Text("Loading friend requests…")
              .font(.system(size: 14, design: .rounded))
              .foregroundStyle(.white.opacity(0.52))
          }
          .padding(16)
        } else if let errorMessage, requests.isEmpty {
          VStack(alignment: .leading, spacing: 10) {
            Text("Couldn’t load friend requests")
              .font(.system(size: 15, weight: .semibold, design: .rounded))
            Text(errorMessage)
              .font(.system(size: 12, design: .rounded))
              .foregroundStyle(.white.opacity(0.48))
            Button("Try again", action: onRetry)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundStyle(tint)
          }
          .padding(16)
        } else if requests.isEmpty {
          EchoInboxEmptyRequestRow(
            systemName: "person.badge.plus",
            tint: tint,
            title: "No friend requests",
            subtitle: "New connection requests will appear here."
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

private struct EchoInboxFriendRequestRow: View {
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

private struct EchoInboxEmptyRequestRow: View {
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

private struct EchoInboxPreview {
  let title: String
  let subtitle: String

  static func empty(title: String, subtitle: String) -> Self {
    Self(title: title, subtitle: subtitle)
  }
}

private struct EchoPersonalNotesView: View {
  var body: some View {
    ContentUnavailableView(
      "No personal notes",
      systemImage: "note.text",
      description: Text("Private notes will live here when you create one.")
    )
    .foregroundStyle(.white.opacity(0.62))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(EchoInboxBackground().ignoresSafeArea())
    .navigationTitle("Personal notes")
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
  }
}

private struct EchoInboxBackground: View {
  var body: some View {
    ZStack {
      Color(red: 0.008, green: 0.010, blue: 0.016)
      RadialGradient(
        colors: [Color.indigo.opacity(0.16), .clear],
        center: UnitPoint(x: 0.88, y: 0.02),
        startRadius: 0,
        endRadius: 360
      )
    }
  }
}
