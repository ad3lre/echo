import EchoDomain
import SwiftUI

/// Keys the macOS composer forwards while a suggestion popup is open.
enum EchoComposerMenuKey {
  case up, down, confirm, dismiss
}

/// `@` / `#` popup above the composer (web `MentionAutocompletePopover`).
struct EchoMentionSuggestionList: View {
  let options: [EchoMentionOption]
  let selectedIndex: Int
  let baseURL: URL
  let accessToken: String
  let onSelect: (EchoMentionOption) -> Void

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
        Button {
          onSelect(option)
        } label: {
          row(option)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
              index == selectedIndex ? EchoTheme.Color.ink(0.10) : Color.clear,
              in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option.insertText)
        .accessibilityAddTraits(index == selectedIndex ? .isSelected : [])
      }
    }
    .padding(6)
    .echoSuggestionChrome()
  }

  @ViewBuilder
  private func row(_ option: EchoMentionOption) -> some View {
    HStack(spacing: 10) {
      leading(option)
      Text(verbatim: option.kind == .channel ? "#\(option.name)" : option.name)
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundStyle(
          option.isOffline ? EchoTheme.Color.ink(0.48) : EchoTheme.Color.ink(0.92)
        )
        .lineLimit(1)
      Spacer(minLength: 0)
      if let detail = detail(option) {
        Text(detail)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .lineLimit(1)
      }
    }
  }

  @ViewBuilder
  private func leading(_ option: EchoMentionOption) -> some View {
    switch option.kind {
    case .user:
      EchoMediaImage(
        source: option.avatarURL, baseURL: baseURL, accessToken: accessToken,
        maxPixelSize: EchoAvatarPrefetcher.avatarMaxPixelSize
      ) {
        EchoGeneratedAvatar(name: option.name, seed: option.name)
      }
      .frame(width: 24, height: 24)
      .clipShape(Circle())
    case .role:
      Image(systemName: "shield.fill")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(Color(hex: option.colorHex ?? "") ?? EchoTheme.Color.ink(0.6))
        .frame(width: 24, height: 24)
    case .everyone, .active:
      Image(systemName: option.kind == .everyone ? "person.3.fill" : "bolt.fill")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.mentionPing)
        .frame(width: 24, height: 24)
    case .channel:
      Image(systemName: "number")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.62))
        .frame(width: 24, height: 24)
    }
  }

  private func detail(_ option: EchoMentionOption) -> String? {
    switch option.kind {
    case .everyone: EchoCopy.string("Notify everyone in this channel")
    case .active: EchoCopy.string("Notify members who are online")
    case .role: EchoCopy.string("Role")
    case .user: option.aliases.first(where: { $0 != option.name }).map { "@\($0)" }
    case .channel: nil
    }
  }
}

/// `/command` palette above the composer (web `SlashCommandAutocompletePopover`).
struct EchoSlashSuggestionList: View {
  let commands: [EchoSlashCommand]
  let selectedIndex: Int
  let onSelect: (EchoSlashCommand) -> Void

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView(.vertical, showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(Array(commands.enumerated()), id: \.element.id) { index, command in
            if index == 0 || commands[index - 1].group != command.group {
              Text(command.group.title)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .textCase(.uppercase)
                .foregroundStyle(EchoTheme.Color.ink(0.42))
                .padding(.horizontal, 12).padding(.top, index == 0 ? 4 : 10).padding(.bottom, 2)
            }
            Button {
              onSelect(command)
            } label: {
              HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                  Text(verbatim: "/\(command.name)")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(EchoTheme.Color.ink(0.92))
                  Text(command.detail)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(EchoTheme.Color.ink(0.5))
                    .lineLimit(1)
                }
                Spacer(minLength: 8)
                if let preview = command.preview {
                  Text(verbatim: preview)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(EchoTheme.Color.ink(0.38))
                    .lineLimit(1)
                }
              }
              .padding(.horizontal, 12).padding(.vertical, 7)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(
                index == selectedIndex ? EchoTheme.Color.ink(0.10) : Color.clear,
                in: RoundedRectangle(cornerRadius: 10, style: .continuous))
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .id(command.id)
            .accessibilityLabel("/\(command.name), \(command.label)")
          }
        }
        .padding(6)
      }
      .onChange(of: selectedIndex) { _, index in
        guard commands.indices.contains(index) else { return }
        proxy.scrollTo(commands[index].id)
      }
    }
    .frame(maxHeight: 260)
    .echoSuggestionChrome()
  }
}

extension View {
  fileprivate func echoSuggestionChrome() -> some View {
    background(
      EchoTheme.Color.elevatedDeep.opacity(0.98),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(EchoTheme.Color.ink(0.08), lineWidth: 1)
    }
    .echoShadow(color: .black.opacity(0.30), radius: 14, y: 6)
    .padding(.horizontal, 6)
  }
}
