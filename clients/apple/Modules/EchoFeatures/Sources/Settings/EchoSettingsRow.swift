import EchoDomain
import SwiftUI

enum EchoSettingsRoute: String, CaseIterable, Hashable, Identifiable {
  case account = "Account"
  case friends = "Friends"
  case notifications = "Notifications"
  case sounds = "Sounds"
  case dataPrivacy = "Data & Privacy"
  case discord = "Discord"
  case google = "Google"
  case youtube = "YouTube"
  case style = "Style"
  case accessibility = "Accessibility"
  case voiceVideo = "Voice & Video"
  case timeLanguage = "Time & Language"
  case advanced = "Advanced"
  case echoPlus = "Echo+"
  case subscriptions = "Subscriptions"
  case termsPolicies = "Terms & policies"
  case reportAbuse = "Report abuse"
  case formattingGuide = "Formatting guide"

  var id: Self { self }
  var title: String { EchoCopy.string(key: rawValue) }

  /// Stable API provider id for external OAuth routes (never localized title).
  var externalProviderID: String? {
    switch self {
    case .discord: "discord"
    case .google: "google"
    case .youtube: "youtube"
    default: nil
    }
  }
}

struct EchoSettingsSection: Identifiable {
  let title: String
  let rows: [EchoSettingsRow]
  var id: String { title }
}

struct EchoSettingsRow: Identifiable {
  let route: EchoSettingsRoute
  let subtitle: String
  let icon: String
  let tint: Color
  var id: EchoSettingsRoute { route }
  var title: String { route.title }
}

struct EchoSettingsRowView: View {
  let row: EchoSettingsRow
  let baseURL: URL
  let accessToken: String
  let profile: EchoUserProfile?
  let onSignOut: () -> Void

  var body: some View {
    NavigationLink {
      EchoSettingDetailView(
        route: row.route, icon: row.icon, tint: row.tint, baseURL: baseURL,
        accessToken: accessToken, onSignOut: onSignOut)
    } label: {
      HStack(spacing: 13) {
        EchoSettingsBrandIcon(row: row)
          .frame(width: 34, height: 34)
          .background(
            row.tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(row.title).font(.system(size: 15, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.92))
          Text(row.subtitle).font(.system(size: 12, design: .rounded)).foregroundStyle(
            .white.opacity(0.42)
          ).lineLimit(1)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(
          .white.opacity(0.28))
      }.padding(.horizontal, 14).padding(.vertical, 12)
    }
    .buttonStyle(EchoSettingsRowButtonStyle(tint: row.tint))
  }
}

private struct EchoSettingsBrandIcon: View {
  let row: EchoSettingsRow

  var body: some View {
    Group {
      switch row.route {
      case .discord:
        Image("Discord", bundle: .module)
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .padding(8)
          .foregroundStyle(row.tint)
      case .google:
        Image("Google", bundle: .module)
          .resizable()
          .scaledToFit()
          .padding(8)
      default:
        Image(systemName: row.icon)
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(row.tint)
      }
    }
  }
}

private struct EchoSettingsRowButtonStyle: ButtonStyle {
  let tint: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        tint.opacity(configuration.isPressed ? 0.13 : 0),
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(tint.opacity(configuration.isPressed ? 0.30 : 0), lineWidth: 1)
      }
      .shadow(color: tint.opacity(configuration.isPressed ? 0.20 : 0), radius: 12)
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
  }
}
