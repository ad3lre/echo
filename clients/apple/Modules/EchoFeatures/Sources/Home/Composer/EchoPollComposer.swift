import EchoNetworking
import SwiftUI

struct EchoPollComposerSheet: View {
  let onCreate: (EchoOutgoingPoll) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var draft = EchoComposerPollDraft()
  @State private var emojiPickerOptionID: UUID?

  private let timeLimits: [(minutes: Int?, label: String)] = [
    (nil, "No time limit"),
    (5, "5 minutes"),
    (15, "15 minutes"),
    (30, "30 minutes"),
    (60, "1 hour"),
    (1_440, "1 day"),
    (4_320, "3 days"),
    (10_080, "1 week"),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      EchoCopy.text("Create Poll")
        .font(.system(size: 22, weight: .bold, design: .rounded))
      EchoCopy.text("Ask a question and add options for others to vote on.")
        .font(.system(size: 14, design: .rounded))
        .foregroundStyle(.white.opacity(0.48))
        .padding(.top, 4)

      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          fieldLabel("Question")
          TextField(EchoCopy.string("What do you want to ask?"), text: $draft.question)
            .textFieldStyle(.plain)
            .font(.system(size: 15, design: .rounded))
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(fieldFill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
              RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(.white.opacity(0.08), lineWidth: 1)
            }

          HStack {
            fieldLabel("Options")
            Spacer()
            if draft.options.count < 10 {
              Button(EchoCopy.string("+ Add option")) {
                draft.options.append(EchoComposerPollOptionDraft())
              }
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(accent)
            }
          }

          VStack(spacing: 8) {
            ForEach($draft.options) { $option in
              HStack(spacing: 8) {
                Button {
                  emojiPickerOptionID = option.id
                } label: {
                  Text(option.emoji.isEmpty ? "😀" : option.emoji)
                    .font(.system(size: 18))
                    .frame(width: 38, height: 38)
                    .background(
                      .white.opacity(0.05),
                      in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                    )
                    .overlay {
                      RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .stroke(.white.opacity(0.08), lineWidth: 1)
                    }
                    .opacity(option.emoji.isEmpty ? 0.45 : 1)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                  option.emoji.isEmpty ? EchoCopy.string("Add option emoji") : EchoCopy.string("Change option emoji"))

                TextField(EchoCopy.format("Option %@", String(draft.options.firstIndex(where: { $0.id == option.id }).map { $0 + 1 } ?? 1)),
                  text: $option.text
                )
                .textFieldStyle(.plain)
                .font(.system(size: 15, design: .rounded))
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                  RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(.white.opacity(0.08), lineWidth: 1)
                }

                if draft.options.count > 2 {
                  Button {
                    draft.options.removeAll { $0.id == option.id }
                  } label: {
                    Image(systemName: "xmark")
                      .font(.system(size: 12, weight: .bold))
                      .foregroundStyle(.white.opacity(0.42))
                      .frame(width: 28, height: 28)
                  }
                  .buttonStyle(.plain)
                  .accessibilityLabel(EchoCopy.string("Remove option"))
                }
              }
            }
          }

          Text(EchoCopy.format("%@/10 options • At least 2 required", String(draft.options.count)))
            .font(.system(size: 12, design: .rounded))
            .foregroundStyle(.white.opacity(0.38))

          Button {
            draft.anonymous.toggle()
          } label: {
            HStack(alignment: .center, spacing: 12) {
              Image(systemName: "eye.slash")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.white.opacity(0.42))
                .frame(width: 36, height: 36)
              VStack(alignment: .leading, spacing: 2) {
                EchoCopy.text("Anonymous voting")
                  .font(.system(size: 14, weight: .medium, design: .rounded))
                EchoCopy.text("Voters’ names stay private; only vote counts are visible to others.")
                  .font(.system(size: 12, design: .rounded))
                  .foregroundStyle(.white.opacity(0.42))
                  .fixedSize(horizontal: false, vertical: true)
              }
              Spacer(minLength: 8)
              Image(systemName: draft.anonymous ? "checkmark.square.fill" : "square")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(draft.anonymous ? accent : .white.opacity(0.35))
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)

          fieldLabel("Time limit")
          Picker("Time limit", selection: $draft.durationMinutes) {
            ForEach(timeLimits, id: \.label) { limit in
              Text(limit.label).tag(limit.minutes)
            }
          }
          .pickerStyle(.menu)
          .tint(.white.opacity(0.86))
        }
        .padding(.top, 22)
      }

      HStack(spacing: 8) {
        Spacer()
        Button(EchoCopy.string("Cancel")) { dismiss() }
          .font(.system(size: 14, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.55))
          .padding(.horizontal, 14)
          .padding(.vertical, 9)
        Button(EchoCopy.string("Create Poll")) {
          guard let poll = draft.outgoingPoll else { return }
          onCreate(poll)
          dismiss()
        }
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(
          draft.isValid ? accent : accent.opacity(0.35), in: RoundedRectangle(cornerRadius: 10)
        )
        .disabled(!draft.isValid)
      }
      .padding(.top, 18)
    }
    .padding(22)
    .frame(maxWidth: 440)
    .background(
      EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 18)
    )
    .preferredColorScheme(.dark)
    .sheet(
      item: Binding(
        get: { emojiPickerOptionID.map(EmojiPickerTarget.init) },
        set: { emojiPickerOptionID = $0?.id }
      )
    ) { target in
      EchoPollOptionEmojiPicker(
        current: draft.options.first { $0.id == target.id }?.emoji ?? ""
      ) { emoji in
        if let index = draft.options.firstIndex(where: { $0.id == target.id }) {
          draft.options[index].emoji = emoji
        }
        emojiPickerOptionID = nil
      }
      #if os(iOS)
        .presentationDetents([.height(280)])
      #endif
    }
  }

  private var accent: Color { EchoTheme.Color.indigoVivid }
  private var fieldFill: Color { Color.white.opacity(0.045) }

  private func fieldLabel(_ title: String) -> some View {
    Text(title.uppercased())
      .font(.system(size: 11, weight: .semibold, design: .rounded))
      .tracking(0.8)
      .foregroundStyle(.white.opacity(0.42))
  }
}

private struct EmojiPickerTarget: Identifiable {
  let id: UUID
}

private struct EchoPollOptionEmojiPicker: View {
  let current: String
  let onChoose: (String) -> Void

  private let emojis = Array(
    "😀 😃 😄 😁 😆 😂 😊 😇 🙂 😉 😍 🥰 😘 😎 🤩 🥳 😏 😔 😢 😭 😤 😡 🤯 🤔 🫡 ❤️ 💜 💙 🔥 ✨ ✅ ❌ 👍 👎 🎉 💯 👀 🙌 🙏"
      .split(separator: " ").map(String.init))

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        EchoCopy.text("Option emoji")
          .font(.system(size: 16, weight: .semibold, design: .rounded))
        Spacer()
        if !current.isEmpty {
          Button(EchoCopy.string("Remove")) { onChoose("") }
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.55))
        }
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
        ForEach(emojis, id: \.self) { emoji in
          Button {
            onChoose(emoji)
          } label: {
            Text(emoji)
              .font(.system(size: 22))
              .frame(width: 34, height: 34)
              .background(
                current == emoji ? Color.indigo.opacity(0.28) : .clear,
                in: RoundedRectangle(cornerRadius: 8))
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(18)
    .preferredColorScheme(.dark)
  }
}
