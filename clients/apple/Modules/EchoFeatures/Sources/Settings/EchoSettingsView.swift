import EchoDomain
import SwiftUI

struct EchoSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  let baseURL: URL
  let accessToken: String
  let profile: EchoUserProfile?
  let onSignOut: () -> Void
  @State private var searchText = ""
  @FocusState private var searchFocused: Bool

  private let sections: [EchoSettingsSection] = [
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
      ]),
    .init(
      title: EchoCopy.string("App"),
      rows: [
        .init(
          route: .style, subtitle: EchoCopy.string("Tune Echo’s look and spacing"), icon: "paintbrush.fill",
          tint: .cyan),
        .init(
          route: .accessibility, subtitle: EchoCopy.string("Readability, motion, and interaction"),
          icon: "figure.wave", tint: .green),
        .init(
          route: .voiceVideo, subtitle: EchoCopy.string("Devices and call behavior"), icon: "video.fill",
          tint: .purple),
        .init(
          route: .timeLanguage, subtitle: EchoCopy.string("Language, region, and timestamps"), icon: "globe",
          tint: .mint),
        .init(
          route: .advanced, subtitle: EchoCopy.string("Optional developer controls"), icon: "slider.horizontal.3",
          tint: .gray),
      ]),
    .init(
      title: EchoCopy.string("External apps"),
      rows: [
        .init(
          route: .discord, subtitle: EchoCopy.string("Link Discord for profile and identity import"), icon: "link",
          tint: .indigo),
        .init(
          route: .google, subtitle: EchoCopy.string("Link Google for sign-in and YouTube"), icon: "g.circle.fill",
          tint: .blue),
        .init(
          route: .youtube, subtitle: EchoCopy.string("Connect a channel for live broadcasts"),
          icon: "play.rectangle.fill", tint: .red),
      ]),
    .init(
      title: EchoCopy.string("Payment"),
      rows: [
        .init(
          route: .echoPlus, subtitle: EchoCopy.string("Membership benefits and perks"), icon: "sparkles",
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
          route: .termsPolicies, subtitle: EchoCopy.string("Privacy, terms, and community guidelines"),
          icon: "doc.text.fill", tint: .gray),
        .init(
          route: .reportAbuse, subtitle: EchoCopy.string("Report spam, harassment, or violations"),
          icon: "exclamationmark.shield.fill", tint: .red),
        .init(
          route: .formattingGuide, subtitle: EchoCopy.string("How Echo formats messages"), icon: "textformat",
          tint: .cyan),
      ]),
  ]

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(spacing: 0) {
          EchoSettingsHeader(
            profile: profile,
            baseURL: baseURL,
            accessToken: accessToken,
            searchText: $searchText,
            searchFocused: $searchFocused,
            onDone: { dismiss() }
          )

          VStack(alignment: .leading, spacing: 26) {
            if filteredSections.isEmpty {
              EchoSettingsEmptyState(query: searchText) {
                searchText = ""
                searchFocused = false
              }
            } else {
              ForEach(filteredSections) { section in
                VStack(alignment: .leading, spacing: 9) {
                  Text(section.title.uppercased()).font(
                    .system(size: 11, weight: .medium, design: .rounded)
                  ).tracking(1.6).foregroundStyle(.white.opacity(0.38)).padding(.horizontal, 24)
                  VStack(spacing: 1) {
                    ForEach(section.rows) { row in
                      EchoSettingsRowView(
                        row: row, baseURL: baseURL, accessToken: accessToken, profile: profile,
                        onSignOut: onSignOut)
                    }
                  }
                  .padding(.vertical, 5)
                  .padding(.horizontal, 6)
                  .background(
                    .ultraThinMaterial.opacity(0.72),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous)
                  )
                  .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(
                      .white.opacity(0.075))
                  )
                  .padding(.horizontal, 12)
                }
              }
            }
          }
          .padding(.top, 18)
          .padding(.bottom, 30)
        }
      }
      #if os(iOS)
        .scrollDismissesKeyboard(.immediately)
      #endif
      .background(EchoSettingsBackdrop().ignoresSafeArea())
      .scrollContentBackground(.hidden)
      navigationTitle(EchoCopy.string(""))
      .navigationBarBackButtonHidden(true)
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
      #endif
    }
    .preferredColorScheme(.dark)
  }

  private var filteredSections: [EchoSettingsSection] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return sections }
    return sections.compactMap { section in
      let rows = section.rows.filter {
        $0.title.localizedCaseInsensitiveContains(query)
          || $0.subtitle.localizedCaseInsensitiveContains(query)
      }
      return rows.isEmpty ? nil : EchoSettingsSection(title: section.title, rows: rows)
    }
  }
}

private struct EchoSettingsHeader: View {
  let profile: EchoUserProfile?
  let baseURL: URL
  var accessToken: String? = nil
  @Binding var searchText: String
  @FocusState.Binding var searchFocused: Bool
  let onDone: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      EchoSettingsHero(
        profile: profile, baseURL: baseURL, accessToken: accessToken, onDone: onDone)

      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.white.opacity(0.42))
        TextField(EchoCopy.string("Search settings"), text: $searchText)
          .font(.system(size: 15, design: .rounded))
          .foregroundStyle(.white)
          .tint(.white)
          .textFieldStyle(.plain)
          .focused($searchFocused)
          .submitLabel(.search)
          .accessibilityLabel(EchoCopy.string("Search Echo settings"))
        if !searchText.isEmpty {
          Button {
            searchText = ""
            searchFocused = true
          } label: {
            Image(systemName: "xmark.circle.fill")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white.opacity(0.42))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Clear settings search"))
        }
      }
      .padding(.horizontal, 15)
      .frame(height: 48)
      .background(.white.opacity(0.075), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(.white.opacity(0.10))
      }
      .padding(.horizontal, 18)
    }
    .padding(.top, topPadding)
    .padding(.bottom, 16)
  }

  private var topPadding: CGFloat {
    #if os(iOS)
      36
    #else
      14
    #endif
  }
}

private struct EchoSettingsEmptyState: View {
  let query: String
  let onClear: () -> Void

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "sparkle.magnifyingglass")
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(.cyan)
        .frame(width: 52, height: 52)
        .background(.cyan.opacity(0.13), in: Circle())
      EchoCopy.text("No settings found")
        .font(.system(size: 17, weight: .bold, design: .rounded))
      Text(EchoCopy.format("Echo couldn’t find anything matching “%@”", query))
        .font(.system(size: 13, design: .rounded))
        .foregroundStyle(.white.opacity(0.48))
        .multilineTextAlignment(.center)
      Button(EchoCopy.string("Clear search"), action: onClear)
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(.cyan)
        .padding(.horizontal, 16)
        .frame(minHeight: 38)
        .background(.cyan.opacity(0.11), in: Capsule())
        .overlay { Capsule().stroke(.cyan.opacity(0.25), lineWidth: 1) }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 34)
    .padding(.horizontal, 20)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(.white.opacity(0.09), lineWidth: 1)
    }
    .padding(.horizontal, 18)
  }
}

private struct EchoSettingsHero: View {
  let profile: EchoUserProfile?
  let baseURL: URL
  var accessToken: String? = nil
  let onDone: () -> Void

  var body: some View {
    HStack(spacing: 14) {
      if let profile {
        EchoMediaImage(
          source: profile.avatarURL, baseURL: baseURL, accessToken: accessToken
        ) {
          EchoGeneratedAvatar(name: profile.name, seed: profile.name)
        }
        .frame(width: 52, height: 52)
        .clipShape(Circle())
      } else {
        Image(systemName: "gearshape.fill")
          .font(.system(size: 21, weight: .semibold))
          .foregroundStyle(.white.opacity(0.9))
          .frame(width: 52, height: 52)
          .background(.white.opacity(0.10), in: Circle())
      }
      VStack(alignment: .leading, spacing: 4) {
        EchoCopy.text("Settings")
          .font(.system(size: 31, weight: .bold, design: .rounded))
        Text(profile.map { EchoCopy.format("Tune Echo for %@.", $0.name) } ?? EchoCopy.string("Make Echo feel like yours."))
          .font(.system(size: 14, design: .rounded))
          .foregroundStyle(.white.opacity(0.48))
      }
      Spacer(minLength: 0)
      Button(EchoCopy.string("Done"), action: onDone)
        .font(.system(size: 16, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.88))
        .padding(.horizontal, 18)
        .frame(height: 42)
        .background(.white.opacity(0.075), in: Capsule())
        .overlay {
          Capsule().stroke(.white.opacity(0.10), lineWidth: 1)
        }
    }
    .padding(.horizontal, 22)
  }
}

struct EchoSettingsBackdrop: View {
  var body: some View {
    ZStack {
      EchoTheme.Color.canvas
      RadialGradient(
        colors: [Color.indigo.opacity(0.20), .clear],
        center: .topTrailing,
        startRadius: 20,
        endRadius: 360
      )
      RadialGradient(
        colors: [Color.purple.opacity(0.10), .clear],
        center: .bottomLeading,
        startRadius: 10,
        endRadius: 300
      )
    }
  }
}
