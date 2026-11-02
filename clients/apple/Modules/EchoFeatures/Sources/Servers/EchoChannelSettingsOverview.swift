import EchoDomain
import SwiftUI

/// Web channel settings → Overview (name, icon, category, slowmode, NSFW, voice options).
struct EchoChannelSettingsOverviewPanel: View {
  @Binding var draft: EchoChannelSettingsDraft
  let initialCategoryID: String
  let channel: EchoGuildChannel
  let categories: [EchoGuildCategory]
  let baseURL: URL

  private static let quickEmoji = [
    "💬", "📢", "🔥", "🎮", "🎵", "📚", "💡", "❓", "🎉", "📷", "🛠️", "⭐", "🎙️", "🔊", "🤖", "📌",
  ]

  private enum IconTab: String, CaseIterable, Identifiable {
    case icons, emoji
    var id: String { rawValue }
  }

  @State private var customEmoji = ""
  @State private var iconTab = IconTab.icons

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      nameAndIcon
      categoryField
      if draft.isText { slowmodeField }
      EchoSettingsToggleRow(
        title: EchoCopy.string("Age-restricted channel"),
        subtitle: EchoCopy.string("Members must confirm they are 18+ before viewing this channel."),
        isOn: $draft.nsfw)
      if draft.isVoice { voiceOptions }
    }
  }

  // MARK: - Name + icon

  private var previewChannel: EchoGuildChannel {
    EchoGuildChannel(
      id: channel.id, name: draft.name, type: channel.type,
      iconKey: draft.iconKey.isEmpty ? nil : draft.iconKey)
  }

  private var nameAndIcon: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoDesktopLabeledField(title: EchoCopy.string("Channel name")) {
        HStack(spacing: 10) {
          EchoChannelIcon(channel: previewChannel, baseURL: baseURL, size: 20)
          TextField(EchoCopy.string("channel-name"), text: $draft.name)
            .onChange(of: draft.name) { _, next in
              if next.count > EchoChannelSettingsDraft.maxNameLength {
                draft.name = String(next.prefix(EchoChannelSettingsDraft.maxNameLength))
              }
            }
        }
      }
      VStack(alignment: .leading, spacing: 8) {
        Text(EchoCopy.string("Icon").uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        Picker(EchoCopy.string("Icon"), selection: $iconTab) {
          Text(EchoCopy.string("Icons")).tag(IconTab.icons)
          Text(EchoCopy.string("Emoji")).tag(IconTab.emoji)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        switch iconTab {
        case .icons:
          EchoAppIconPickerGrid(selectedKey: draft.iconKey) { key in
            draft.iconKey = key
            customEmoji = ""
          }
        case .emoji:
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
              ForEach(Self.quickEmoji, id: \.self) { glyph in
                emojiChip(glyph)
              }
            }
          }
          TextField(EchoCopy.string("Any emoji"), text: $customEmoji)
            .textFieldStyle(.plain)
            .font(.system(size: 14))
            .padding(.horizontal, 10)
            .frame(width: 130, height: 34)
            .background(
              EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .onChange(of: customEmoji) { _, next in applyCustomEmoji(next) }
        }
        if !draft.iconKey.isEmpty {
          EchoSettingsSecondaryButton(title: EchoCopy.string("Use default icon")) {
            draft.iconKey = ""
            customEmoji = ""
          }
        }
      }
    }
  }

  private func emojiChip(_ glyph: String) -> some View {
    let selected = draft.iconKey == "emoji:\(glyph)"
    return Button {
      draft.iconKey = "emoji:\(glyph)"
    } label: {
      Text(glyph)
        .font(.system(size: 18))
        .frame(width: 34, height: 34)
        .background(
          selected ? EchoTheme.Color.signInBlue.opacity(0.22) : EchoTheme.Color.ink(0.05),
          in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(glyph)
  }

  /// Keeps the first emoji grapheme typed into the free-form field.
  private func applyCustomEmoji(_ raw: String) {
    guard let first = raw.first(where: Self.isEmojiGlyph) else { return }
    let glyph = String(first)
    draft.iconKey = "emoji:\(glyph)"
    if customEmoji != glyph { customEmoji = glyph }
  }

  private static func isEmojiGlyph(_ character: Character) -> Bool {
    character.unicodeScalars.contains { scalar in
      scalar.properties.isEmojiPresentation || (scalar.properties.isEmoji && scalar.value > 0x238C)
    }
  }

  // MARK: - Category / slowmode

  private var movingBetweenCategories: Bool {
    !initialCategoryID.isEmpty && !draft.categoryID.isEmpty && draft.categoryID != initialCategoryID
  }

  private var categoryField: some View {
    VStack(alignment: .leading, spacing: 12) {
      EchoSettingsPickerField(
        title: EchoCopy.string("Category"),
        selection: $draft.categoryID,
        options: {
          var opts: [(String, String)] = [("", EchoCopy.string("No category"))]
          opts += categories.map { ($0.id, $0.name) }
          if !draft.categoryID.isEmpty,
            !categories.contains(where: { $0.id == draft.categoryID })
          {
            opts.append((draft.categoryID, channel.categoryName))
          }
          return opts
        }()
      )
      if movingBetweenCategories {
        EchoSettingsPickerField(
          title: EchoCopy.string("Permissions when moving"),
          selection: $draft.moveMode,
          options: [
            ("keep", EchoCopy.string("Keep channel permissions")),
            ("sync", EchoCopy.string("Sync with new category")),
          ]
        )
        Text(
          draft.moveMode == "sync"
            ? EchoCopy.string("Channel overwrites are cleared so permissions inherit from the new category.")
            : EchoCopy.string("This channel’s permission rows stay unchanged when it moves.")
        )
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
      }
    }
  }

  private var slowmodeField: some View {
    VStack(alignment: .leading, spacing: 6) {
      EchoSettingsPickerField(
        title: EchoCopy.string("Slowmode"),
        selection: $draft.slowmodeSeconds,
        options: slowmodeOptions.map { ($0, EchoChannelSettingsDraft.slowmodeLabel($0)) }
      )
      Text(EchoCopy.string("Members wait this long between messages. Moderators are exempt."))
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
    }
  }

  private var slowmodeOptions: [Int] {
    var values = EchoChannelSettingsDraft.slowmodeValues
    if !values.contains(draft.slowmodeSeconds) { values.append(draft.slowmodeSeconds) }
    return values
  }

  // MARK: - Voice

  private var voiceOptions: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(EchoCopy.string("User limit").uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.8)
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          Spacer()
          Text(
            draft.userLimit == 0
              ? EchoCopy.string("Unlimited") : EchoCopy.format("%d users", draft.userLimit)
          )
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.7))
        }
        Slider(
          value: Binding(
            get: { Double(draft.userLimit) },
            set: { draft.userLimit = Int($0.rounded()) }),
          in: 0...Double(EchoChannelSettingsDraft.userLimitMax), step: 1)
      }
      .echoSettingsCard()
      VStack(alignment: .leading, spacing: 10) {
        EchoSettingsToggleRow(
          title: EchoCopy.string("Use server default bitrate"),
          subtitle: EchoCopy.format(
            "Voice quality from %d to %d kbps.",
            EchoChannelSettingsDraft.bitrateKbpsRange.lowerBound,
            EchoChannelSettingsDraft.bitrateKbpsRange.upperBound),
          isOn: $draft.useDefaultBitrate)
        if !draft.useDefaultBitrate {
          HStack(spacing: 12) {
            Slider(
              value: Binding(
                get: { Double(draft.bitrateKbps) },
                set: { draft.bitrateKbps = Int($0.rounded()) }),
              in: Double(EchoChannelSettingsDraft.bitrateKbpsRange.lowerBound)...Double(
                EchoChannelSettingsDraft.bitrateKbpsRange.upperBound),
              step: 1)
            Text(EchoCopy.format("%d kbps", draft.bitrateKbps))
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.7))
              .frame(width: 72, alignment: .trailing)
          }
          .echoSettingsCard()
        }
      }
      EchoSettingsToggleRow(
        title: EchoCopy.string("End-to-end encryption"),
        subtitle: EchoCopy.string(
          "Voice media is encrypted so only participants can hear it. Takes effect for new sessions."),
        isOn: $draft.voiceE2ee)
    }
  }
}
