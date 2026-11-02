import SwiftUI

/// Create-post sheet: title + optional body, posted as the forum post's first message.
struct EchoForumPostComposeSheet: View {
  let forumName: String
  let model: EchoForumHubModel
  var onCreated: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var title = ""
  @State private var postBody = ""

  private var canSubmit: Bool {
    !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !model.isCreating
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          TextField(EchoCopy.string("Post title"), text: $title)
            .textFieldStyle(.plain)
            .font(.system(size: 17, weight: .semibold, design: .rounded))
            .padding(12)
            .background(
              EchoTheme.Color.ink(0.07),
              in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          TextEditor(text: $postBody)
            .scrollContentBackground(.hidden)
            .font(.system(size: 15, design: .rounded))
            .frame(minHeight: 160)
            .padding(8)
            .background(
              EchoTheme.Color.ink(0.07),
              in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay(alignment: .topLeading) {
              if postBody.isEmpty {
                Text(EchoCopy.string("Write the first message…"))
                  .font(.system(size: 15, design: .rounded))
                  .foregroundStyle(EchoTheme.Color.ink(0.38))
                  .padding(.horizontal, 13)
                  .padding(.vertical, 16)
                  .allowsHitTesting(false)
              }
            }
          if let error = model.createErrorMessage {
            Text(error)
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(EchoTheme.Color.mentionPing)
          }
        }
        .padding(18)
      }
      .background(EchoConversationBackground().ignoresSafeArea())
      .navigationTitle(EchoCopy.format("New post in %@", forumName))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Cancel")) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(EchoCopy.string("Post")) { submit() }
            .disabled(!canSubmit)
        }
      }
    }
    .onAppear { model.createErrorMessage = nil }
    #if os(macOS)
      .frame(minWidth: 460, minHeight: 380)
    #endif
  }

  private func submit() {
    Task {
      guard let channelID = await model.createPost(title: title, body: postBody) else {
        return
      }
      dismiss()
      onCreated(channelID)
    }
  }
}
