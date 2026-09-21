import EchoDomain
import EchoNetworking
import SwiftUI

/// Compact filter strip for conversation search — web `from` / `mentions` / `has:` parity.
struct EchoConversationSearchFilters: View {
  @Bindable var model: EchoMessageSearchModel
  var onChange: () -> Void = {}

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        authorGroup
        filterDivider
        mentionsChip
        attachmentChip
        filterDivider
        ForEach(EchoMessageSearchHasType.allCases, id: \.self) { type in
          EchoSearchFilterChip(
            title: type.chipTitle,
            systemImage: type.systemImage,
            selected: model.hasType == type
          ) {
            model.toggleHasType(type)
            onChange()
          }
        }
        if model.hasActiveCriteria {
          filterDivider
          Button {
            model.clearFilters()
            onChange()
          } label: {
            Text(EchoCopy.string("Clear filters"))
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.55))
              .padding(.horizontal, 10)
              .frame(height: 32)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Clear filters"))
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 2)
    }
  }

  private var authorGroup: some View {
    HStack(spacing: 6) {
      EchoSearchFilterChip(
        title: EchoCopy.string("You"),
        systemImage: "person.fill",
        selected: model.authorScope == .me
      ) {
        model.setAuthorScope(.me)
        onChange()
      }
      if model.conversation.peerUserID != nil {
        EchoSearchFilterChip(
          title: peerLabel,
          systemImage: "person.crop.circle",
          selected: model.authorScope == .peer
        ) {
          model.setAuthorScope(.peer)
          onChange()
        }
      }
    }
  }

  private var mentionsChip: some View {
    EchoSearchFilterChip(
      title: EchoCopy.string("Mentions you"),
      systemImage: "at",
      selected: model.mentionsMe
    ) {
      model.toggleMentionsMe()
      onChange()
    }
  }

  private var attachmentChip: some View {
    EchoSearchFilterChip(
      title: EchoCopy.string("Files"),
      systemImage: "paperclip",
      selected: model.hasAttachment
    ) {
      model.toggleHasAttachment()
      onChange()
    }
  }

  private var peerLabel: String {
    let name = model.conversation.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    if name.isEmpty { return EchoCopy.string("Them") }
    if name.count <= 14 { return name }
    return String(name.prefix(12)) + "…"
  }

  private var filterDivider: some View {
    Capsule()
      .fill(.white.opacity(0.12))
      .frame(width: 1, height: 18)
      .padding(.horizontal, 2)
  }
}

struct EchoSearchFilterChip: View {
  let title: String
  var systemImage: String? = nil
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        if let systemImage {
          Image(systemName: systemImage)
            .font(.system(size: 11, weight: .semibold))
        }
        Text(title)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .lineLimit(1)
      }
      .foregroundStyle(selected ? .white : .white.opacity(0.72))
      .padding(.horizontal, 11)
      .frame(height: 32)
      .background(
        selected ? EchoTheme.Color.indigo.opacity(0.92) : .white.opacity(0.06),
        in: Capsule()
      )
      .overlay {
        Capsule().stroke(
          selected ? EchoTheme.Color.indigoBright.opacity(0.55) : .white.opacity(0.08),
          lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .accessibilityLabel(title)
  }
}

extension EchoMessageSearchHasType {
  var chipTitle: String {
    switch self {
    case .image: EchoCopy.string("Image")
    case .gif: EchoCopy.string("GIF")
    case .link: EchoCopy.string("Link")
    case .video: EchoCopy.string("Video")
    case .audio: EchoCopy.string("Audio")
    case .docs: EchoCopy.string("Docs")
    }
  }

  var systemImage: String {
    switch self {
    case .image: "photo"
    case .gif: "sparkles.rectangle.stack"
    case .link: "link"
    case .video: "film"
    case .audio: "waveform"
    case .docs: "doc.text"
    }
  }
}
