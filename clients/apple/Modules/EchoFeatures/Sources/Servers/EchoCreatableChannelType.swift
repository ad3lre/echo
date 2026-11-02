import Foundation

/// Channel types `POST /servers/:id/channels` accepts from the create modal
/// (web `CreateChannelModal` — text, forum, paper, voice, stage).
enum EchoCreatableChannelType: String, CaseIterable, Identifiable {
  case text, forum, paper, voice, stage

  var id: String { rawValue }

  var icon: String {
    switch self {
    case .text: "number"
    case .forum: "bubble.left.and.bubble.right"
    case .paper: "doc.text"
    case .voice: "speaker.wave.2"
    case .stage: "person.wave.2"
    }
  }

  var title: String {
    switch self {
    case .text: EchoCopy.string("Text")
    case .forum: EchoCopy.string("Forum")
    case .paper: EchoCopy.string("Paper")
    case .voice: EchoCopy.string("Voice")
    case .stage: EchoCopy.string("Stage")
    }
  }

  var subtitle: String {
    switch self {
    case .text: EchoCopy.string("Messages, images, and GIFs")
    case .forum: EchoCopy.string("Organized posts and threads")
    case .paper: EchoCopy.string("Collaborative documents")
    case .voice: EchoCopy.string("Talk, video, and screen share")
    case .stage: EchoCopy.string("Speakers and an audience")
    }
  }

  /// Web `isExperimentalChannelTypeEnabled`: paper and stage ship behind one gate.
  var isExperimental: Bool { self == .paper || self == .stage }

  /// Types shown in the picker. Mirrors web `ENABLE_EXPERIMENTAL_PAPER` (off) + dev-only build.
  static var available: [EchoCreatableChannelType] {
    allCases.filter { !$0.isExperimental || EchoExperimentalChannels.isEnabled }
  }
}

/// Native counterpart of web `paperFeatureToggle.ts`: `import.meta.env.DEV && ENABLE_EXPERIMENTAL_PAPER`.
/// Flip `enableExperimentalPaper` together with the web constant; release builds never expose it.
enum EchoExperimentalChannels {
  static let enableExperimentalPaper = false

  static var isEnabled: Bool {
    #if DEBUG
      enableExperimentalPaper
    #else
      false
    #endif
  }
}
