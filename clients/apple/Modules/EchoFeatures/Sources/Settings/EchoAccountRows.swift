import EchoNetworking
import SwiftUI

struct EchoSettingValueRow: View {
  let title: String
  let value: String
  let icon: String
  let tint: Color
  let statusIcon: String?
  let statusTint: Color
  let action: () -> Void

  init(
    title: String, value: String, icon: String, tint: Color, statusIcon: String? = nil,
    statusTint: Color = .secondary, action: @escaping () -> Void
  ) {
    self.title = title
    self.value = value
    self.icon = icon
    self.tint = tint
    self.statusIcon = statusIcon
    self.statusTint = statusTint
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(tint)
          .frame(width: 36, height: 36)
          .background(
            tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(title).font(.system(size: 15, weight: .semibold, design: .rounded))
          Text(value)
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        if let statusIcon {
          Image(systemName: statusIcon)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(statusTint)
            .accessibilityLabel(statusIcon == "checkmark.seal.fill" ? EchoCopy.string("Verified") : EchoCopy.string("Not verified"))
        }
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(tint.opacity(0.72))
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint(EchoCopy.format("Opens %@ editor", title))
  }
}

struct EchoSessionRow: View {
  let session: EchoAuthSession
  let onRevoke: () -> Void

  private var deviceName: String {
    let userAgent = session.userAgent ?? ""
    if userAgent.localizedCaseInsensitiveContains("CFNetwork") {
      #if os(iOS)
        return "Echo on iPhone"
      #else
        return "Echo on Mac"
      #endif
    }
    return userAgent.isEmpty ? EchoCopy.string("Echo device") : userAgent
  }

  private var detail: String {
    var parts = [session.location ?? EchoCopy.string("Unknown location")]
    if session.isCurrentSession == true {
      parts.append("Current session")
    } else if session.sessionIDs.count > 1 {
      parts.append("\(session.sessionIDs.count) sessions")
    }
    return parts.joined(separator: "  •  ")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 11) {
      HStack(spacing: 12) {
        Image(
          systemName: session.userAgent?.localizedCaseInsensitiveContains("mac") == true
            ? "laptopcomputer" : "iphone"
        )
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(.blue)
        .frame(width: 36, height: 36)
        .background(.blue.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(deviceName)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.92))
            .lineLimit(1)
          Text(detail)
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.white.opacity(0.48))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      Button(role: .destructive, action: onRevoke) {
        Label(
          session.sessionIDs.count > 1
            ? EchoCopy.format("Revoke all %lld sessions", session.sessionIDs.count) : EchoCopy.string("Revoke session"),
          systemImage: "rectangle.portrait.and.arrow.right"
        )
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .frame(maxWidth: .infinity, minHeight: 34)
        .background(
          .red.opacity(0.11), in: RoundedRectangle(cornerRadius: 11, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: 11, style: .continuous)
            .stroke(.red.opacity(0.20), lineWidth: 1)
        }
      }
      .buttonStyle(.plain)
    }
  }
}

struct EchoPasskeyRow: View {
  let passkey: EchoPasskeyCredential
  let onRename: () -> Void
  let onRemove: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 11) {
      HStack(spacing: 12) {
        Image(systemName: "person.badge.key.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.purple)
          .frame(width: 36, height: 36)
          .background(
            .purple.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text(passkey.label)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundStyle(.white.opacity(0.92))
          Text(passkey.createdAt)
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.white.opacity(0.48))
        }
        Spacer(minLength: 0)
      }
      HStack(spacing: 10) {
        EchoCompactAction(title: EchoCopy.string("Rename"), icon: "pencil", tint: .purple, action: onRename)
        EchoCompactAction(title: EchoCopy.string("Remove"), icon: "trash", tint: .red, action: onRemove)
      }
    }
  }
}

struct EchoCompactAction: View {
  let title: String
  let icon: String
  let tint: Color
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: icon)
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .frame(maxWidth: .infinity, minHeight: 34)
        .foregroundStyle(tint)
        .background(tint.opacity(0.11), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 11, style: .continuous)
            .stroke(tint.opacity(0.20), lineWidth: 1)
        }
    }
    .buttonStyle(.plain)
  }
}
