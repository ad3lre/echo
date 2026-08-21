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
  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var model: EchoInboxModel?
  @State private var showingFindPeople = false

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
            EchoCopy.text("YOUR SPACE")
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

          if let model {
            EchoInboxFriendRequestSection(
              requests: model.incomingFriendRequests,
              baseURL: baseURL,
              accessToken: accessToken,
              isLoading: model.isLoadingFriendRequests,
              errorMessage: model.friendRequestError,
              respondingRequestIDs: model.respondingRequestIDs,
              onAccept: { model.respond(to: $0, accepting: true) },
              onDecline: { model.respond(to: $0, accepting: false) },
              onRetry: { Task { await model.loadFriendRequests() } }
            )
          }

          EchoInboxRequestSection(
            title: EchoCopy.string("MESSAGE REQUESTS"),
            systemName: "bubble.left.and.bubble.right",
            tint: EchoTheme.Color.violet,
            preview: .empty(
              title: EchoCopy.string("No message requests"),
              subtitle: EchoCopy.string("Pending conversations will appear here.")
            )
          )

        }
        .padding(.horizontal, 20)
        .padding(.top, 26)
        .padding(.bottom, 30)
      }
      .background(EchoInboxBackground().ignoresSafeArea())
      .navigationTitle(EchoCopy.string("Inbox"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(action: { dismiss() }) {
            Image(systemName: "arrow.left")
              .font(.system(size: 17, weight: .semibold))
          }
          .accessibilityLabel(EchoCopy.string("Close inbox"))
        }
      }
    }
    .preferredColorScheme(.dark)
    .task {
      let inbox = model ?? EchoInboxModel(baseURL: baseURL, auth: auth)
      inbox.auth = auth
      model = inbox
      await inbox.loadFriendRequests()
    }
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
}
