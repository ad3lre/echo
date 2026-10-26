import EchoNetworking
import SwiftUI

/// Contextual Trust & Safety report sheet (message or user) for App Review 1.2.
struct EchoSafetyReportSheet: View {
  enum Target: Equatable {
    case message(messageID: String, channelID: String, authorName: String)
    case user(userID: String, displayName: String)
  }

  let target: Target
  let accessToken: String
  let baseURL: URL
  var onFinished: (() -> Void)? = nil

  @Environment(\.dismiss) private var dismiss
  @State private var category = "spam"
  @State private var details = ""
  @State private var isSubmitting = false
  @State private var submitted = false
  @State private var error: String?

  private let categories: [(id: String, label: String, hint: String)] = [
    ("spam", "Spam", "Unwanted ads, scams, or repetitive messages"),
    ("harassment", "Harassment or bullying", "Bullying, threats, or targeted abuse"),
    ("hate", "Hate speech", "Attacks based on identity or protected traits"),
    ("sexual", "Sexual content", "NSFW content shared without consent"),
    ("violence", "Violence or threats", "Threats of harm or glorifying violence"),
    ("impersonation", "Impersonation", "Pretending to be someone else"),
    ("other", "Other", "Something else not listed above"),
  ]

  private var title: String {
    switch target {
    case .message: EchoCopy.string("Report message")
    case .user: EchoCopy.string("Report user")
    }
  }

  private var subtitle: String {
    switch target {
    case .message(_, _, let authorName):
      EchoCopy.format("You are reporting a message from %@.", authorName)
    case .user(_, let displayName):
      EchoCopy.format("You are reporting %@. Our team reviews every submission.", displayName)
    }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text(subtitle)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        Section(EchoCopy.string("Category")) {
          Picker(EchoCopy.string("Category"), selection: $category) {
            ForEach(categories, id: \.id) { item in
              Text(EchoCopy.string(key: item.label)).tag(item.id)
            }
          }
          if let hint = categories.first(where: { $0.id == category })?.hint {
            Text(EchoCopy.string(key: hint))
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }

        Section(EchoCopy.string("Details")) {
          TextField(EchoCopy.string("What happened? (optional)"), text: $details, axis: .vertical)
            .lineLimit(3...6)
        }

        if let error {
          Section {
            Text(error).font(.footnote).foregroundStyle(.red)
          }
        }

        Section {
          Button {
            submit()
          } label: {
            HStack {
              Spacer()
              if isSubmitting {
                ProgressView()
              } else {
                Text(
                  submitted
                    ? EchoCopy.string("Report sent") : EchoCopy.string("Send report")
                )
                .fontWeight(.semibold)
              }
              Spacer()
            }
          }
          .disabled(isSubmitting || submitted)
        }
      }
      .navigationTitle(title)
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Cancel")) { dismiss() }
            .disabled(isSubmitting)
        }
      }
    }
  }

  private func submit() {
    error = nil
    isSubmitting = true
    Task {
      do {
        let client = EchoSettingsClient(baseURL: baseURL)
        switch target {
        case .message(let messageID, let channelID, _):
          try await client.reportMessage(
            messageID: messageID,
            channelID: channelID,
            category: category,
            reason: details,
            accessToken: accessToken
          )
        case .user(let userID, _):
          try await client.reportUser(
            targetUserID: userID,
            category: category,
            reason: details,
            accessToken: accessToken
          )
        }
        await MainActor.run {
          isSubmitting = false
          submitted = true
        }
        try? await Task.sleep(for: .milliseconds(700))
        await MainActor.run {
          onFinished?()
          dismiss()
        }
      } catch {
        await MainActor.run {
          isSubmitting = false
          self.error = error.localizedDescription
        }
      }
    }
  }
}
