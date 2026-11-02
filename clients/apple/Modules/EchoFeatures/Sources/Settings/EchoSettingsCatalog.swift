import SwiftUI

/// Shared settings section inventory for iPhone list and Mac sidebar.
enum EchoSettingsCatalog {
  static var sections: [EchoSettingsSection] {
    [
      .init(
        title: EchoCopy.string("User"),
        rows: [
          .init(
            route: .account, subtitle: EchoCopy.string("Sign-in details, security, and sessions"),
            icon: "person.badge.key.fill", tint: .purple),
          .init(
            route: .friends, subtitle: EchoCopy.string("Friend and message request preferences"),
            icon: "person.2.fill", tint: .blue),
          .init(
            route: .notifications, subtitle: EchoCopy.string("Alerts, badges, sounds, and mentions"),
            icon: "bell.fill", tint: .orange),
          .init(
            route: .sounds, subtitle: EchoCopy.string("Master audio and per-sound controls"),
            icon: "speaker.wave.2.fill", tint: .pink),
          .init(
            route: .dataPrivacy, subtitle: EchoCopy.string("Export your account data"),
            icon: "hand.raised.fill", tint: .green),
          .init(
            route: .encryptionDevices,
            subtitle: EchoCopy.string("Review and revoke encrypted devices"),
            icon: "lock.shield.fill", tint: .teal),
        ]),
      .init(
        title: EchoCopy.string("App"),
        rows: {
          var rows: [EchoSettingsRow] = [
            .init(
              route: .style, subtitle: EchoCopy.string("Tune Echo’s look and spacing"),
              icon: "paintbrush.fill",
              tint: .cyan),
            .init(
              route: .accessibility, subtitle: EchoCopy.string("Readability, motion, and interaction"),
              icon: "figure.wave", tint: .green),
            .init(
              route: .voiceVideo, subtitle: EchoCopy.string("Devices and call behavior"),
              icon: "video.fill",
              tint: .purple),
            .init(
              route: .timeLanguage, subtitle: EchoCopy.string("Language, region, and timestamps"),
              icon: "globe",
              tint: .mint),
          ]
          #if os(macOS)
            rows.append(
              .init(
                route: .keybinds, subtitle: EchoCopy.string("Keyboard shortcuts for Echo"),
                icon: "keyboard.fill", tint: .indigo))
          #endif
          rows.append(
            .init(
              route: .advanced, subtitle: EchoCopy.string("Optional developer controls"),
              icon: "slider.horizontal.3",
              tint: .gray))
          return rows
        }()),
      .init(
        title: EchoCopy.string("External apps"),
        rows: {
          var rows: [EchoSettingsRow] = [
            .init(
              route: .discord,
              subtitle: EchoCopy.string("Link Discord for profile and identity import"),
              icon: "link",
              tint: EchoTheme.Color.avatarFallback)
          ]
          #if !os(iOS)
            rows.append(
              contentsOf: [
                .init(
                  route: .google, subtitle: EchoCopy.string("Link Google for sign-in and YouTube"),
                  icon: "g.circle.fill",
                  tint: .blue),
                .init(
                  route: .youtube, subtitle: EchoCopy.string("Connect a channel for live broadcasts"),
                  icon: "play.rectangle.fill", tint: .red),
              ])
          #endif
          return rows
        }()),
      .init(
        title: EchoCopy.string("Payment"),
        rows: [
          .init(
            route: .echoPlus, subtitle: EchoCopy.string("Membership benefits and perks"),
            icon: "sparkles",
            tint: .purple
          ),
          .init(
            route: .subscriptions, subtitle: EchoCopy.string("Plans, renewals, and invoices"),
            icon: "creditcard.fill", tint: .blue),
        ]),
      .init(
        title: EchoCopy.string("Legal"),
        rows: [
          .init(
            route: .termsPolicies,
            subtitle: EchoCopy.string("Privacy, terms, and community guidelines"),
            icon: "doc.text.fill", tint: .gray),
          .init(
            route: .reportAbuse, subtitle: EchoCopy.string("Report spam, harassment, or violations"),
            icon: "exclamationmark.shield.fill", tint: .red),
          .init(
            route: .formattingGuide, subtitle: EchoCopy.string("How Echo formats messages"),
            icon: "textformat",
            tint: .cyan),
        ]),
    ]
  }
}
