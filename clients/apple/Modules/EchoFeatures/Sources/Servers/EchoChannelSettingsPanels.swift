import EchoDomain
import SwiftUI

/// Web channel settings → Format (default message prefix, soft vs hard enforcement).
struct EchoChannelSettingsFormatPanel: View {
  @Binding var draft: EchoChannelSettingsDraft

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(
        EchoCopy.string(
          "Text inserted at the start of every message. Soft: members can delete it. Hard: the prefix stays and is enforced when sending text."
        )
      )
      .font(.system(size: 13))
      .foregroundStyle(EchoTheme.Color.ink(0.52))
      .fixedSize(horizontal: false, vertical: true)
      VStack(alignment: .leading, spacing: 7) {
        Text(EchoCopy.string("Message format").uppercased())
          .font(.system(size: 11, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
        TextEditor(text: $draft.formatTemplate)
          .scrollContentBackground(.hidden)
          .font(.system(size: 14, design: .monospaced))
          .foregroundStyle(EchoTheme.Color.fg)
          .padding(8)
          .frame(minHeight: 110)
          .background(
            EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 10, style: .continuous)
          )
          .onChange(of: draft.formatTemplate) { _, next in
            if next.count > EchoChannelSettingsDraft.maxFormatLength {
              draft.formatTemplate = String(next.prefix(EchoChannelSettingsDraft.maxFormatLength))
            }
          }
      }
      EchoSettingsPickerField(
        title: EchoCopy.string("Enforcement"),
        selection: $draft.formatHard,
        options: [
          (false, EchoCopy.string("Soft")),
          (true, EchoCopy.string("Hard")),
        ],
        disabled: draft.formatTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      )
      Text(
        draft.formatHard
          ? EchoCopy.string("Messages without the prefix are rejected or prefixed automatically.")
          : EchoCopy.string("The prefix is a suggestion that members can remove.")
      )
      .font(.system(size: 12))
      .foregroundStyle(EchoTheme.Color.ink(0.46))
    }
  }
}

/// Web channel settings → Forum defaults (`forum_creator` tab, `forumCreatorDefaultPerms`).
struct EchoChannelSettingsForumPanel: View {
  @Binding var draft: EchoChannelSettingsDraft

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(
        EchoCopy.string(
          "Members who start a post get these extras on their own thread only. Server roles and channel permissions still apply for everything else."
        )
      )
      .font(.system(size: 14))
      .foregroundStyle(EchoTheme.Color.ink(0.52))
      .fixedSize(horizontal: false, vertical: true)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Manage post (pin, lock, archive, tags)"),
        subtitle: EchoCopy.string(
          "Lets the author change listing pin, lock, archive, and tags without Manage Channel on the post."
        ),
        isOn: $draft.forumCreatorPerms.managePostFlags)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Delete own post"),
        subtitle: EchoCopy.string("Lets the author delete the entire post channel (thread)."),
        isOn: $draft.forumCreatorPerms.deleteOwnPost)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Delete others’ messages in their post"),
        subtitle: EchoCopy.string("Like scoped message moderation inside their thread only."),
        isOn: $draft.forumCreatorPerms.moderateMessagesInOwnPost)
    }
  }
}

/// Web channel settings → Paper options (`paperCommentsEnabled` / `paperShowAuthorGutter`).
struct EchoChannelSettingsPaperPanel: View {
  @Binding var draft: EchoChannelSettingsDraft

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(EchoCopy.string("Control commenting and author markers on this paper channel."))
        .font(.system(size: 14))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
        .fixedSize(horizontal: false, vertical: true)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Allow comments"),
        subtitle: EchoCopy.string("Members with comment permission can leave margin comments."),
        isOn: $draft.paperCommentsEnabled)
      EchoSettingsToggleRow(
        title: EchoCopy.string("Show author gutter"),
        subtitle: EchoCopy.string("Show who last edited blocks in the paper editor."),
        isOn: $draft.paperShowAuthorGutter)
    }
  }
}

/// Web channel settings → Danger zone (auto-delete retention + delete channel).
struct EchoChannelSettingsDangerPanel: View {
  @Binding var draft: EchoChannelSettingsDraft
  let channel: EchoGuildChannel
  let canDelete: Bool
  var onDelete: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      Text(EchoCopy.string("Sensitive actions that permanently change or remove this channel."))
        .font(.system(size: 14))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
        .fixedSize(horizontal: false, vertical: true)
      if draft.isText { autoDelete }
      if canDelete { deleteRow }
    }
  }

  private var inheritedSeconds: Int { channel.categoryAutoDeleteAfterSeconds ?? 0 }

  private var autoDelete: some View {
    VStack(alignment: .leading, spacing: 12) {
      EchoSettingsSectionHeading(
        title: EchoCopy.string("Auto-delete messages"),
        subtitle: EchoCopy.string(
          "Messages older than this are permanently removed. Off keeps messages forever."))
      EchoSettingsToggleRow(
        title: EchoCopy.string("Sync with category"),
        subtitle: draft.autoDeleteSynced
          ? EchoCopy.format(
            "Inherited from the category: %@",
            EchoChannelSettingsDraft.retentionLabel(inheritedSeconds))
          : nil,
        isOn: $draft.autoDeleteSynced)
      EchoSettingsPickerField(
        title: EchoCopy.string("Retention"),
        selection: $draft.autoDeleteSeconds,
        options: EchoChannelSettingsDraft.retentionValues.map {
          ($0, EchoChannelSettingsDraft.retentionLabel($0))
        },
        disabled: draft.autoDeleteSynced
      )
    }
  }

  private var deleteRow: some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text(EchoCopy.string("Delete channel"))
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.mentionPing)
        Text(EchoCopy.format("Permanently delete #%@ and all of its messages.", channel.name))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      EchoSettingsDangerButton(title: EchoCopy.string("Delete channel"), action: onDelete)
    }
    .echoSettingsCard()
  }
}
