import SwiftUI

/// Web member-popout / expanded-profile private Note field (viewer-local).
struct EchoProfileNoteEditor: View {
  let userID: String
  /// Compact popout uses a denser layout (web maxlength 256 UI; storage still 512).
  var compact = false
  /// When embedded under an outer `profileSection` title, hide the local label.
  var showsLabel = true
  var store: EchoProfileNotesStore = .shared

  @State private var draft = ""
  @FocusState private var focused: Bool

  private var fieldMax: Int { compact ? 256 : EchoProfileNotesStore.maxLength }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 6 : 10) {
      if showsLabel {
        Text(EchoCopy.string("Note").uppercased())
          .font(.system(size: compact ? 10 : 11, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.4))
          .tracking(compact ? 1.6 : 0.8)
      }

      TextField(EchoCopy.string("+"), text: $draft, axis: .vertical)
        .font(.system(size: compact ? 12 : 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.78))
        .lineLimit(compact ? 1...4 : 1...8)
        .textFieldStyle(.plain)
        .focused($focused)
        .onChange(of: draft) { _, next in
          let capped = String(next.prefix(fieldMax))
          if capped != next { draft = capped }
        }
        .onChange(of: focused) { _, isFocused in
          if !isFocused { commit() }
        }
        .onAppear { draft = store.note(for: userID) }
        .onChange(of: userID) { _, _ in
          draft = store.note(for: userID)
        }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(EchoCopy.string("Note"))
  }

  private func commit() {
    let toSave = String(draft.prefix(fieldMax))
    store.setNote(toSave, for: userID)
    draft = store.note(for: userID)
  }
}
