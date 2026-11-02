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

  private var targetLabel: String {
    switch target {
    case .message(_, _, let authorName): authorName
    case .user(_, let displayName): displayName
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider().overlay(EchoTheme.Color.ink(0.08))
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 16) {
          targetCard
          categoryGrid
          VStack(alignment: .leading, spacing: 8) {
            Text(EchoCopy.string("Details"))
              .font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
              .textCase(.uppercase)
              .tracking(0.6)
            TextField(EchoCopy.string("What happened? (optional)"), text: $details, axis: .vertical)
              .font(.system(size: 14, design: .rounded))
              .lineLimit(3...6)
              .padding(12)
              .background(
                EchoTheme.Color.ink(0.06),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
              )
          }
          if let error {
            Text(error)
              .font(.system(size: 13, design: .rounded))
              .foregroundStyle(Color.red.opacity(0.9))
          }
        }
        .padding(20)
      }
      Divider().overlay(EchoTheme.Color.ink(0.08))
      footer
    }
    #if os(macOS)
      .frame(minWidth: 440, minHeight: 560)
    #endif
    .background(EchoTheme.Color.elevatedDeep)
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "shield.fill")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(Color.red.opacity(0.86))
        .frame(width: 40, height: 40)
        .background(
          Color.red.opacity(0.14),
          in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(subtitle)
          .font(.system(size: 13, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
      Spacer(minLength: 8)
      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(isSubmitting)
      .accessibilityLabel(EchoCopy.string("Cancel"))
    }
    .padding(20)
  }

  private var targetCard: some View {
    HStack(spacing: 10) {
      Text(String(targetLabel.prefix(1)).uppercased())
        .font(.system(size: 13, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.onAccent)
        .frame(width: 32, height: 32)
        .background(EchoTheme.Color.signInBlue, in: Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(
          {
            switch target {
            case .message: EchoCopy.string("Report message")
            case .user: EchoCopy.string("Report user")
            }
          }()
        )
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.42))
        .textCase(.uppercase)
        .tracking(0.8)
        Text(targetLabel)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.fg)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
    .background(
      EchoTheme.Color.ink(0.06),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
  }

  private var categoryGrid: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(EchoCopy.string("Category"))
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.45))
        .textCase(.uppercase)
        .tracking(0.6)
      VStack(spacing: 6) {
        ForEach(categories, id: \.id) { item in
          Button {
            category = item.id
          } label: {
            HStack(alignment: .top, spacing: 10) {
              Image(systemName: category == item.id ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(
                  category == item.id ? EchoTheme.Color.signInBlue : EchoTheme.Color.ink(0.28)
                )
              VStack(alignment: .leading, spacing: 2) {
                Text(EchoCopy.string(key: item.label))
                  .font(.system(size: 14, weight: .semibold, design: .rounded))
                  .foregroundStyle(EchoTheme.Color.fg)
                Text(EchoCopy.string(key: item.hint))
                  .font(.system(size: 12, design: .rounded))
                  .foregroundStyle(EchoTheme.Color.ink(0.48))
              }
              Spacer(minLength: 0)
            }
            .padding(10)
            .background(
              category == item.id
                ? EchoTheme.Color.signInBlue.opacity(0.12)
                : EchoTheme.Color.ink(0.04),
              in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private var footer: some View {
    HStack {
      Button(EchoCopy.string("Cancel")) { dismiss() }
        .buttonStyle(.plain)
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .disabled(isSubmitting)
      Spacer()
      Button(action: submit) {
        HStack(spacing: 8) {
          if isSubmitting {
            ProgressView().controlSize(.small).tint(EchoTheme.Color.onAccent)
          }
          Text(submitted ? EchoCopy.string("Report sent") : EchoCopy.string("Send report"))
            .font(.system(size: 14, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(EchoTheme.Color.onAccent)
        .padding(.horizontal, 16)
        .frame(height: 40)
        .background(
          EchoTheme.Color.signInBlue,
          in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
      }
      .buttonStyle(.plain)
      .disabled(isSubmitting || submitted)
    }
    .padding(16)
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
