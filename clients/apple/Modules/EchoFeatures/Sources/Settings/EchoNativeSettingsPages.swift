import EchoNetworking
import SwiftUI

struct EchoMembershipSettingsView: View {
  let accessToken: String
  let baseURL: URL
  @State private var cycle = "monthly"
  @State private var isSaving = false
  @State private var saved = false
  @State private var error: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: EchoCopy.string("Echo+")) {
        EchoCopy.text(
          "Echo+ is the membership layer for people who want more room to make Echo theirs."
        )
        .foregroundStyle(.secondary)
        ForEach(
          [
            ("sparkles", "More personalization"), ("bolt.fill", "Priority feature access"),
            ("heart.fill", "Support independent Echo development"),
          ], id: \.1
        ) { icon, text in
          Label(text, systemImage: icon).foregroundStyle(EchoTheme.Color.ink(0.86))
        }
      }
      EchoDetailSection(title: EchoCopy.string("Early access")) {
        EchoCopy.text(
          "Subscriptions are being introduced in stages. Register your preference and Echo will keep it with your account."
        )
        .font(.footnote).foregroundStyle(.secondary)
        Picker("Billing preference", selection: $cycle) {
          EchoCopy.text("Monthly").tag("monthly")
          EchoCopy.text("Yearly").tag("yearly")
        }.pickerStyle(.segmented)
        EchoSettingAction(
          title: isSaving
            ? EchoCopy.string("Saving…")
            : saved ? EchoCopy.string("Preference saved") : EchoCopy.string("Join the Echo+ list"),
          subtitle: EchoCopy.string("We’ll notify you when your plan is available"),
          icon: saved ? "checkmark.circle.fill" : "sparkles", tint: .purple
        ) { save() }.disabled(isSaving || saved)
        if let error { Text(error).font(.footnote).foregroundStyle(.red) }
      }
    }
  }

  private func save() {
    isSaving = true
    error = nil
    Task {
      do {
        try await EchoSettingsClient(baseURL: baseURL).registerEchoPlusInterest(
          billingCycle: cycle, accessToken: accessToken)
        await MainActor.run {
          isSaving = false
          saved = true
        }
      } catch {
        await MainActor.run {
          isSaving = false
          self.error = error.localizedDescription
        }
      }
    }
  }
}

struct EchoLegalSettingsView: View {
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: EchoCopy.string("On the web")) {
        EchoCopy.text(
          "Full legal documents live on the Echo marketing site. Opening a row launches it in your browser."
        )
        .font(.footnote)
        .foregroundStyle(.secondary)
        ForEach(EchoMarketingSite.legalLinks, id: \.url) { link in
          EchoSettingAction(
            title: link.title,
            subtitle: link.subtitle,
            icon: link.icon,
            tint: .indigo
          ) {
            openURL(link.url)
          }
        }
      }
    }
  }
}

struct EchoFormattingGuideView: View {
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: EchoCopy.string("On the web")) {
        EchoCopy.text(
          "The formatting guide on the Echo marketing site covers Markdown and math the same way chat does."
        )
        .font(.footnote)
        .foregroundStyle(.secondary)
        ForEach(EchoMarketingSite.formattingLinks, id: \.url) { link in
          EchoSettingAction(
            title: link.title,
            subtitle: link.subtitle,
            icon: link.icon,
            tint: .teal
          ) {
            openURL(link.url)
          }
        }
      }
    }
  }
}

struct EchoReportAbuseView: View {
  let accessToken: String
  let baseURL: URL
  @State private var targetType: ReportTargetType = .user
  @State private var targetUserID = ""
  @State private var messageID = ""
  @State private var channelID = ""
  @State private var category = "other"
  @State private var details = ""
  @State private var isSubmitting = false
  @State private var submitted = false
  @State private var error: String?

  private enum ReportTargetType: String, CaseIterable, Identifiable {
    case user
    case message
    var id: String { rawValue }
    var label: String {
      switch self {
      case .user: EchoCopy.string("User")
      case .message: EchoCopy.string("Message")
      }
    }
  }

  private let categories: [(id: String, label: String, hint: String)] = [
    ("spam", "Spam", "Unwanted ads, scams, or repetitive messages"),
    ("harassment", "Harassment or bullying", "Bullying, threats, or targeted abuse"),
    ("hate", "Hate speech", "Attacks based on identity or protected traits"),
    ("sexual", "Sexual content", "NSFW content shared without consent"),
    ("violence", "Violence or threats", "Threats of harm or glorifying violence"),
    ("impersonation", "Impersonation", "Pretending to be someone else"),
    ("other", "Other", "Something else not listed above"),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: EchoCopy.string("Trust & Safety")) {
        EchoCopy.text(
          "Reports go to Echo's Trust & Safety team for review. Most reports are handled within a few business days."
        )
        .font(.footnote)
        .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 8) {
          Label(
            EchoCopy.string(
              "From a user profile — open their profile menu and choose Report"),
            systemImage: "person.crop.circle.badge.exclamationmark"
          )
          Label(
            EchoCopy.string(
              "From a message — long-press and choose Report message"),
            systemImage: "bubble.left.and.exclamationmark.bubble.right"
          )
        }
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.78))
      }

      EchoDetailSection(title: EchoCopy.string("Manual report")) {
        EchoCopy.text(
          "Use this when you have a user or message ID but cannot open those menus — for example, content shared outside Echo."
        )
        .font(.footnote)
        .foregroundStyle(.secondary)

        Picker(EchoCopy.string("Report type"), selection: $targetType) {
          ForEach(ReportTargetType.allCases) { type in
            Text(type.label).tag(type)
          }
        }
        .pickerStyle(.segmented)

        if targetType == .user {
          TextField(EchoCopy.string("@username or user ID"), text: $targetUserID)
            .padding(12)
            .background(EchoTheme.Color.ink(0.07), in: RoundedRectangle(cornerRadius: 12))
        } else {
          TextField(EchoCopy.string("Message ID"), text: $messageID)
            .padding(12)
            .background(EchoTheme.Color.ink(0.07), in: RoundedRectangle(cornerRadius: 12))
          TextField(EchoCopy.string("Channel ID"), text: $channelID)
            .padding(12)
            .background(EchoTheme.Color.ink(0.07), in: RoundedRectangle(cornerRadius: 12))
        }

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

        TextField(EchoCopy.string("What happened? (optional)"), text: $details, axis: .vertical)
          .lineLimit(4...8)
          .padding(12)
          .background(EchoTheme.Color.ink(0.07), in: RoundedRectangle(cornerRadius: 12))

        EchoSettingAction(
          title: isSubmitting
            ? EchoCopy.string("Sending…")
            : submitted ? EchoCopy.string("Report sent") : EchoCopy.string("Send report"),
          subtitle: EchoCopy.string("Echo safety will review it"),
          icon: submitted ? "checkmark.shield.fill" : "exclamationmark.shield.fill",
          tint: .red
        ) { submit() }
        .disabled(isSubmitting || submitted)
        if let error { Text(error).font(.footnote).foregroundStyle(.red) }
      }
    }
  }

  private func submit() {
    error = nil
    switch targetType {
    case .user:
      let id = targetUserID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty else {
        error = EchoCopy.string("Enter a username or user ID first.")
        return
      }
      isSubmitting = true
      Task {
        do {
          try await EchoSettingsClient(baseURL: baseURL).reportUser(
            targetUserID: id, category: category, reason: details, accessToken: accessToken)
          await MainActor.run {
            isSubmitting = false
            submitted = true
          }
        } catch {
          await MainActor.run {
            isSubmitting = false
            self.error = error.localizedDescription
          }
        }
      }
    case .message:
      let mid = messageID.trimmingCharacters(in: .whitespacesAndNewlines)
      let cid = channelID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !mid.isEmpty, !cid.isEmpty else {
        error = EchoCopy.string("Message ID and channel ID are required.")
        return
      }
      isSubmitting = true
      Task {
        do {
          try await EchoSettingsClient(baseURL: baseURL).reportMessage(
            messageID: mid, channelID: cid, category: category, reason: details,
            accessToken: accessToken)
          await MainActor.run {
            isSubmitting = false
            submitted = true
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
}

/// Canonical marketing-site destinations (https://app-echo.net).
enum EchoMarketingSite {
  struct Link: Hashable {
    let title: String
    let subtitle: String
    let icon: String
    let url: URL
  }

  static let origin = URL(string: "https://app-echo.net")!

  static let legalLinks: [Link] = [
    Link(
      title: EchoCopy.string("Terms of service"),
      subtitle: "app-echo.net/terms",
      icon: "doc.text",
      url: origin.appending(path: "terms")),
    Link(
      title: EchoCopy.string("Privacy policy"),
      subtitle: "app-echo.net/privacy",
      icon: "hand.raised",
      url: origin.appending(path: "privacy")),
    Link(
      title: EchoCopy.string("Community guidelines"),
      subtitle: "app-echo.net/community-guidelines",
      icon: "person.3",
      url: origin.appending(path: "community-guidelines")),
    Link(
      title: EchoCopy.string("Attributions"),
      subtitle: "app-echo.net/attributions",
      icon: "heart.text.square",
      url: origin.appending(path: "attributions")),
  ]

  static let formattingLinks: [Link] = [
    Link(
      title: EchoCopy.string("Message formatting"),
      subtitle: "app-echo.net/message-formatting",
      icon: "textformat",
      url: origin.appending(path: "message-formatting")),
    Link(
      title: EchoCopy.string("Math & LaTeX"),
      subtitle: "app-echo.net/message-math",
      icon: "function",
      url: origin.appending(path: "message-math")),
  ]
}
