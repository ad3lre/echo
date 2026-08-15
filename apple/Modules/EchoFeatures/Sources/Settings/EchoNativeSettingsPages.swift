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
      EchoDetailSection(title: "Echo+") {
        Text("Echo+ is the membership layer for people who want more room to make Echo theirs.")
          .foregroundStyle(.secondary)
        ForEach(
          [
            ("sparkles", "More personalization"), ("bolt.fill", "Priority feature access"),
            ("heart.fill", "Support independent Echo development"),
          ], id: \.1
        ) { icon, text in
          Label(text, systemImage: icon).foregroundStyle(.white.opacity(0.86))
        }
      }
      EchoDetailSection(title: "Early access") {
        Text(
          "Subscriptions are being introduced in stages. Register your preference and Echo will keep it with your account."
        )
        .font(.footnote).foregroundStyle(.secondary)
        Picker("Billing preference", selection: $cycle) {
          Text("Monthly").tag("monthly")
          Text("Yearly").tag("yearly")
        }.pickerStyle(.segmented)
        EchoSettingAction(
          title: isSaving ? "Saving…" : saved ? "Preference saved" : "Join the Echo+ list",
          subtitle: "We’ll notify you when your plan is available",
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
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: "Terms of service") {
        Text(
          "Echo is a place to talk, create, and share responsibly. You are responsible for what you post, for protecting your account, and for respecting other people’s rights. Do not use Echo to harass, impersonate, exploit, or distribute unlawful content."
        )
      }
      EchoDetailSection(title: "Privacy") {
        Text(
          "Echo uses the information needed to provide your account, conversations, safety systems, and notifications. You control optional analytics, discoverability, read receipts, and personalized tips in Data & Privacy. You can export or delete your account there."
        )
      }
      EchoDetailSection(title: "Community guidelines") {
        Text(
          "Be human. Keep conversations consensual, avoid targeted abuse and threats, and report content that puts people at risk. Safety reports are reviewed by the Echo team and may be retained to protect the community."
        )
      }
      Text("Last updated: 2026-01-01").font(.footnote).foregroundStyle(.secondary)
    }
  }
}

struct EchoFormattingGuideView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: "Message formatting") {
        EchoMarkdownView(
          markdown:
            "# Heading\n\n**Bold**, *italic*, ~~strike~~, `inline code`\n\n- Lists\n- Quotes with >\n\n```swift\nlet hello = \"Echo\"\n```\n\nDisplay math: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$"
        )
        .font(.system(size: 15, design: .rounded))
      }
      EchoDetailSection(title: "Tips") {
        Label("Use Markdown for emphasis, lists, quotes, and code.", systemImage: "textformat")
        Label("Use $$…$$ for display math and $…$ for inline math.", systemImage: "function")
        Label("Links and mentions become interactive when sent.", systemImage: "link")
      }
    }
  }
}

struct EchoReportAbuseView: View {
  let accessToken: String
  let baseURL: URL
  @State private var target = ""
  @State private var category = "harassment"
  @State private var details = ""
  @State private var isSubmitting = false
  @State private var submitted = false
  @State private var error: String?
  private let categories = [
    ("harassment", "Harassment"), ("spam", "Spam or scams"), ("impersonation", "Impersonation"),
    ("other", "Other"),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDetailSection(title: "Report a person") {
        Text(
          "Reports are private. Include the person’s Echo username or user ID and enough context for the safety team to review it."
        )
        .font(.footnote).foregroundStyle(.secondary)
        TextField("@username or user ID", text: $target)
          .padding(12).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
        Picker("Category", selection: $category) {
          ForEach(categories, id: \.0) { Text($0.1).tag($0.0) }
        }
        TextField("What happened?", text: $details, axis: .vertical).lineLimit(4...8)
          .padding(12).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
        EchoSettingAction(
          title: isSubmitting ? "Sending…" : submitted ? "Report sent" : "Send report",
          subtitle: "Echo safety will review it",
          icon: submitted ? "checkmark.shield.fill" : "exclamationmark.shield.fill", tint: .red
        ) { submit() }
        .disabled(isSubmitting || submitted)
        if let error { Text(error).font(.footnote).foregroundStyle(.red) }
      }
    }
  }

  private func submit() {
    let id = target.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else {
      error = "Enter a username or user ID first."
      return
    }
    isSubmitting = true
    error = nil
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
  }
}
