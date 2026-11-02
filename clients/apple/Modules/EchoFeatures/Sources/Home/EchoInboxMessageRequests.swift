import EchoDomain
import EchoNetworking
import SwiftUI

/// Inbox → MESSAGE REQUESTS (web `MessageRequestsView`): list, open, accept, ignore.
struct EchoInboxMessageRequestSection: View {
  let model: EchoInboxModel
  let baseURL: URL
  let accessToken: String
  let userID: String
  @State private var opened: EchoMessageRequest?
  private let tint = EchoTheme.Color.violet

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline) {
        EchoCopy.text("MESSAGE REQUESTS")
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .tracking(2.2)
          .foregroundStyle(EchoTheme.Color.ink(0.38))
        Spacer(minLength: 0)
        if !model.messageRequests.isEmpty {
          Text("\(model.messageRequests.count)")
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(tint)
        }
      }
      VStack(alignment: .leading, spacing: 0) { content }
        .background(
          EchoTheme.Color.ink(0.055), in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .stroke(EchoTheme.Color.ink(0.075), lineWidth: 1)
        )
    }
    .navigationDestination(item: $opened) { request in
      EchoMessageRequestDetailView(
        model: model, request: request, baseURL: baseURL, userID: userID)
    }
  }

  @ViewBuilder private var content: some View {
    if let error = model.messageRequestError, model.messageRequests.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        EchoCopy.text("Couldn’t load message requests")
          .font(.system(size: 15, weight: .semibold, design: .rounded))
        Text(error)
          .font(.system(size: 12, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
        Button(EchoCopy.string("Try again")) { Task { await model.loadMessageRequests() } }
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(tint)
      }
      .padding(16)
    } else if model.messageRequests.isEmpty {
      EchoInboxEmptyRequestRow(
        systemName: "bubble.left.and.bubble.right", tint: tint,
        title: EchoCopy.string("No message requests"),
        subtitle: EchoCopy.string("Pending conversations will appear here."))
    } else {
      ForEach(Array(model.messageRequests.enumerated()), id: \.element.id) { index, request in
        EchoInboxMessageRequestRow(
          request: request, baseURL: baseURL, accessToken: accessToken,
          isResponding: model.respondingMessageRequestIDs.contains(request.id),
          onOpen: { opened = request },
          onIgnore: { Task { await model.ignoreMessageRequest(request) } },
          onAccept: {
            Task {
              if await model.acceptMessageRequest(request) != nil { opened = request }
            }
          })
        if index < model.messageRequests.count - 1 {
          Divider().overlay(EchoTheme.Color.ink(0.07)).padding(.leading, 70)
        }
      }
    }
  }
}

struct EchoInboxMessageRequestRow: View {
  let request: EchoMessageRequest
  let baseURL: URL
  let accessToken: String
  let isResponding: Bool
  let onOpen: () -> Void
  let onIgnore: () -> Void
  let onAccept: () -> Void
  @Environment(EchoDisplayPreferences.self) private var displayPrefs

  var body: some View {
    HStack(spacing: 12) {
      Button(action: onOpen) {
        HStack(spacing: 12) {
          EchoMediaImage(
            source: request.sender?.avatarURL, baseURL: baseURL, accessToken: accessToken
          ) {
            EchoGeneratedAvatar(name: request.senderName, seed: request.fromUserID)
          }
          .frame(width: 44, height: 44)
          .clipShape(Circle())
          VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: request.senderName)
              .font(displayPrefs.uiFont(size: 15, weight: .semibold))
              .foregroundStyle(displayPrefs.ink(0.92))
              .lineLimit(1)
            Text(verbatim: request.preview)
              .font(displayPrefs.uiFont(size: 12))
              .foregroundStyle(displayPrefs.ink(0.46))
              .lineLimit(2)
          }
          Spacer(minLength: 4)
        }
        .contentShape(Rectangle())
      }
      .accessibilityLabel(EchoCopy.format("Open message request from %@", request.senderName))
      if isResponding {
        ProgressView().tint(EchoTheme.Color.ink(0.7)).frame(width: 70)
      } else {
        Button(action: onIgnore) {
          Image(systemName: "xmark")
            .frame(width: 34, height: 34)
            .background(EchoTheme.Color.ink(0.07), in: Circle())
        }
        .accessibilityLabel(EchoCopy.format("Ignore message request from %@", request.senderName))
        Button(action: onAccept) {
          Image(systemName: "checkmark")
            .fontWeight(.semibold)
            .frame(width: 34, height: 34)
            .background(EchoTheme.Color.violet.opacity(0.85), in: Circle())
        }
        .accessibilityLabel(EchoCopy.format("Accept message request from %@", request.senderName))
      }
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 14)
    .padding(.vertical, displayPrefs.densityMetrics.dmRowPaddingY)
  }
}

/// Opened request: the live conversation with an accept / ignore bar until it is resolved.
struct EchoMessageRequestDetailView: View {
  let model: EchoInboxModel
  let request: EchoMessageRequest
  let baseURL: URL
  let userID: String
  @Environment(\.dismiss) private var dismiss

  private var isPending: Bool { model.messageRequests.contains { $0.id == request.id } }

  var body: some View {
    EchoConversationView(
      conversation: request.conversation, baseURL: baseURL, userID: userID,
      onRequestExit: { dismiss() },
      threadAccessory: isPending ? AnyView(actionBar) : nil)
  }

  private var actionBar: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(EchoCopy.format("%@ wants to message you", request.senderName))
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.9))
      EchoCopy.text("Accept to start chatting, or ignore to remove this request.")
        .font(.system(size: 12, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
      HStack(spacing: 10) {
        Button {
          Task { if await model.ignoreMessageRequest(request) { dismiss() } }
        } label: {
          EchoCopy.text("Ignore").frame(maxWidth: .infinity).frame(height: 38)
            .background(EchoTheme.Color.ink(0.08), in: Capsule())
        }
        Button {
          Task { await model.acceptMessageRequest(request) }
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
