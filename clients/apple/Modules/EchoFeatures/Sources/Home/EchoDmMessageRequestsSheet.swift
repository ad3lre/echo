import EchoDomain
import SwiftUI

/// Messages-rail message requests (web `DMPanel` request popout / `MessageRequestsView`).
/// Hosted as the Home split detail on desktop / iPad, or as a sheet on compact phone.
struct EchoDmMessageRequestsView: View {
  let model: EchoHomeModel
  let baseURL: URL
  let accessToken: String
  let userID: String
  let onOpen: (EchoMessageRequest) -> Void
  var onClose: (() -> Void)? = nil
  @State private var searchText = ""

  private var filtered: [EchoMessageRequest] {
    EchoMessageRequestListFilter.filtered(model.messageRequests, query: searchText)
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      Group {
        if let error = model.messageRequestError, model.messageRequests.isEmpty {
          ContentUnavailableView {
            Label(
              EchoCopy.string("Couldn’t load message requests"),
              systemImage: "exclamationmark.bubble")
          } description: {
            Text(error)
          } actions: {
            Button(EchoCopy.string("Try again")) {
              Task { await model.loadMessageRequests() }
            }
          }
        } else if model.messageRequests.isEmpty {
          ContentUnavailableView(
            EchoCopy.string("No message requests"),
            systemImage: "bubble.left.and.bubble.right",
            description: Text(EchoCopy.string("Pending conversations will appear here.")))
        } else if filtered.isEmpty {
          ContentUnavailableView.search(text: searchText)
        } else {
          List {
            ForEach(filtered) { request in
              EchoInboxMessageRequestRow(
                request: request,
                baseURL: baseURL,
                accessToken: accessToken,
                isResponding: model.respondingMessageRequestIDs.contains(request.id),
                onOpen: { onOpen(request) },
                onIgnore: {
                  Task {
                    if await model.ignoreMessageRequest(request) {
                      if model.messageRequests.isEmpty { onClose?() }
                    }
                  }
                },
                onAccept: {
                  Task {
                    if let conversation = await model.acceptMessageRequest(request) {
                      onOpen(
                        EchoMessageRequest(
                          id: request.id, channelID: conversation.channelID,
                          fromUserID: conversation.peerUserID ?? request.fromUserID,
                          preview: request.preview, sender: request.sender))
                    }
                  }
                }
              )
              .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
              .listRowBackground(Color.clear)
            }
          }
          .listStyle(.plain)
        }
      }
    }
    .background(EchoHomeBackground().ignoresSafeArea())
    .searchable(
      text: $searchText,
      prompt: EchoCopy.string("Search requests")
    )
    .task { await model.loadMessageRequests() }
  }

  private var header: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 3) {
        Text(EchoCopy.string("Message requests"))
          .font(.system(size: 22, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(EchoCopy.string("Pending conversations"))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
      Spacer(minLength: 8)
      if let onClose {
        Button(action: onClose) {
          Image(systemName: "xmark")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 28, height: 28)
            .background(EchoTheme.Color.ink(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Close"))
      }
    }
    .padding(.horizontal, 20)
    .padding(.top, 18)
    .padding(.bottom, 12)
  }
}

/// Compact-phone sheet wrapper around ``EchoDmMessageRequestsView``.
struct EchoDmMessageRequestsSheet: View {
  let model: EchoHomeModel
  let baseURL: URL
  let accessToken: String
  let userID: String
  let onOpen: (EchoMessageRequest) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    EchoDmMessageRequestsView(
      model: model, baseURL: baseURL, accessToken: accessToken, userID: userID,
      onOpen: {
        onOpen($0)
        dismiss()
      },
      onClose: { dismiss() }
    )
    #if os(macOS)
      .frame(minWidth: 420, minHeight: 480)
    #endif
  }
}

/// Accept / ignore bar for a pending request opened from the Messages rail.
struct EchoHomeMessageRequestActionBar: View {
  let model: EchoHomeModel
  let request: EchoMessageRequest
  let onResolved: () -> Void

  private var isPending: Bool {
    model.messageRequests.contains { $0.id == request.id }
  }

  var body: some View {
    if isPending {
      VStack(alignment: .leading, spacing: 10) {
        Text(EchoCopy.format("%@ wants to message you", request.senderName))
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.9))
        EchoCopy.text("Accept to start chatting, or ignore to remove this request.")
          .font(.system(size: 12, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
        HStack(spacing: 10) {
          Button {
            Task {
              if await model.ignoreMessageRequest(request) { onResolved() }
            }
          } label: {
            EchoCopy.text("Ignore").frame(maxWidth: .infinity).frame(height: 38)
              .background(EchoTheme.Color.ink(0.08), in: Capsule())
          }
          Button {
            Task { _ = await model.acceptMessageRequest(request) }
          } label: {
            EchoCopy.text("Accept").frame(maxWidth: .infinity).frame(height: 38)
              .foregroundStyle(EchoTheme.Color.onAccent)
              .background(EchoTheme.Color.violet, in: Capsule())
          }
        }
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .buttonStyle(.plain)
        .disabled(model.respondingMessageRequestIDs.contains(request.id))
      }
      .padding(14)
      .background(EchoTheme.Color.ink(0.055))
    }
  }
}
