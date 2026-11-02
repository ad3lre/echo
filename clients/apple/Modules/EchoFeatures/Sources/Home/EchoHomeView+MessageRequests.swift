import EchoDomain
import SwiftUI

extension EchoHomeView {
  var hasUnreadDirectMessages: Bool {
    attention.snapshot.channelAttention.values.contains {
      $0.kind?.lowercased() == "dm" && $0.unreadCount > 0
    }
  }

  func markAllDirectMessagesRead() {
    if consumeSearchKeyboardTap() { return }
    Task {
      _ = await EchoServerMarkRead.markAllDMs(
        baseURL: baseURL, auth: auth, userID: userID)
    }
  }

  func openMessageRequest(_ request: EchoMessageRequest) {
    showingFriends = false
    showingInbox = false
    showingMessageRequests = false
    selectedMessageRequest = request
    selectedConversation = request.conversation
  }

  func clearMessageRequestIfNeeded(for conversation: EchoDirectMessage?) {
    guard let selectedMessageRequest else { return }
    guard conversation?.channelID != selectedMessageRequest.channelID else { return }
    self.selectedMessageRequest = nil
  }

  func messageRequestThreadAccessory(
    homeModel: EchoHomeModel, conversation: EchoDirectMessage
  ) -> AnyView? {
    guard let request = selectedMessageRequest,
      request.channelID == conversation.channelID,
      homeModel.messageRequests.contains(where: { $0.id == request.id })
    else { return nil }
    return AnyView(
      EchoHomeMessageRequestActionBar(
        model: homeModel, request: request,
        onResolved: {
          selectedMessageRequest = nil
          selectedConversation = nil
        }))
  }

  @ViewBuilder
  var homeMessageRequestsDetail: some View {
    if let homeModel {
      EchoDmMessageRequestsView(
        model: homeModel,
        baseURL: baseURL,
        accessToken: sheetAccessToken.isEmpty ? liveMediaAccessToken : sheetAccessToken,
        userID: userID,
        onOpen: { openMessageRequest($0) },
        onClose: shellChrome.layout.usesSplitChrome
          ? nil
          : {
            showingMessageRequests = false
          }
      )
      .environment(auth)
    } else {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  func messageRequestsPresentation(homeModel: EchoHomeModel) -> some ViewModifier {
    EchoHomeMessageRequestsPresentation(
      isPresented: $showingMessageRequests,
      usesSplitChrome: shellChrome.layout.usesSplitChrome,
      selectedChannelID: selectedConversation?.channelID,
      model: homeModel,
      baseURL: baseURL,
      accessToken: sheetAccessToken.isEmpty ? liveMediaAccessToken : sheetAccessToken,
      userID: userID,
      onOpen: { openMessageRequest($0) },
      onConversationChange: { clearMessageRequestIfNeeded(for: selectedConversation) }
    )
  }
}

private struct EchoHomeMessageRequestsPresentation: ViewModifier {
  @Binding var isPresented: Bool
  var usesSplitChrome: Bool
  var selectedChannelID: String?
  let model: EchoHomeModel
  let baseURL: URL
  let accessToken: String
  let userID: String
  let onOpen: (EchoMessageRequest) -> Void
  let onConversationChange: () -> Void

  func body(content: Content) -> some View {
    content
      .background {
        // Split layouts host the list in the detail pane; compact phone keeps a sheet.
        if !usesSplitChrome {
          Color.clear
            .frame(width: 0, height: 0)
            .sheet(isPresented: $isPresented) {
              EchoDmMessageRequestsSheet(
                model: model, baseURL: baseURL, accessToken: accessToken, userID: userID,
                onOpen: onOpen)
            }
        }
      }
      .onChange(of: selectedChannelID) { _, _ in onConversationChange() }
      .onChange(of: model.messageRequests.count) { _, count in
        if count == 0 { isPresented = false }
      }
  }
}
