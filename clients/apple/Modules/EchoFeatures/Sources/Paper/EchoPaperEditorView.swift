import EchoDomain
import SwiftUI

/// Basic block editor: paragraphs, headings, lists, quotes, and code; shapes/tables stay locked.
struct EchoPaperEditorView: View {
  @Bindable var edit: EchoPaperEditModel

  var body: some View {
    if edit.draft != nil {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          ForEach(blocks) { $block in
            blockRow($block)
          }
          Menu {
            blockTypeButtons { edit.draft?.append(kind: $0) }
          } label: {
            Label(EchoCopy.string("Add block"), systemImage: "plus")
          }
          .buttonStyle(.bordered)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: 760, alignment: .leading)
        .frame(maxWidth: .infinity)
      }
    } else if edit.isBusy {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private var blocks: Binding<[EchoPaperDraftBlock]> {
    Binding(
      get: { edit.draft?.blocks ?? [] },
      set: { edit.draft?.blocks = $0 })
  }

  @ViewBuilder
  private func blockRow(_ block: Binding<EchoPaperDraftBlock>) -> some View {
    let value = block.wrappedValue
    HStack(alignment: .top, spacing: 8) {
      if value.isEditable {
        VStack(alignment: .leading, spacing: 6) {
          Menu {
            blockTypeButtons { next in
              edit.draft?.convert(id: value.id, to: next)
            }
          } label: {
            Label(blockTypeTitle(value.kind), systemImage: blockTypeIcon(value.kind))
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.5))
          }
          .menuStyle(.borderlessButton)
          .fixedSize()
          TextField(value.placeholder, text: block.text, axis: .vertical)
            .textFieldStyle(.plain)
            .font(editorFont(for: value))
            .foregroundStyle(EchoTheme.Color.ink(0.92))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      } else if let node = value.node {
        VStack(alignment: .leading, spacing: 4) {
          EchoPaperBlockView(node: node)
          Label(EchoCopy.string("Not editable here"), systemImage: "lock")
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.4))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(0.8)
      }
      Spacer(minLength: 0)
      Button {
        edit.draft?.remove(id: value.id)
      } label: {
        Image(systemName: "trash")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.4))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Remove block"))
    }
  }

  @ViewBuilder
  private func blockTypeButtons(_ action: @escaping (EchoPaperDraftBlock.Kind) -> Void) -> some View
  {
    Button(EchoCopy.string("Paragraph")) { action(.paragraph) }
    Button(EchoCopy.string("Heading")) { action(.heading) }
    Button(EchoCopy.string("Bullet list")) { action(.bulletList) }
    Button(EchoCopy.string("Numbered list")) { action(.orderedList) }
    Button(EchoCopy.string("Quote")) { action(.blockquote) }
    Button(EchoCopy.string("Code")) { action(.codeBlock) }
  }

  private func blockTypeTitle(_ kind: EchoPaperDraftBlock.Kind?) -> String {
    switch kind {
    case .heading: EchoCopy.string("Heading")
    case .bulletList: EchoCopy.string("Bullet list")
    case .orderedList: EchoCopy.string("Numbered list")
    case .blockquote: EchoCopy.string("Quote")
    case .codeBlock: EchoCopy.string("Code")
    default: EchoCopy.string("Paragraph")
    }
  }

  private func blockTypeIcon(_ kind: EchoPaperDraftBlock.Kind?) -> String {
    switch kind {
    case .heading: "textformat.size"
    case .bulletList: "list.bullet"
    case .orderedList: "list.number"
    case .blockquote: "text.quote"
    case .codeBlock: "chevron.left.forwardslash.chevron.right"
    default: "paragraph"
    }
  }

  private func editorFont(for block: EchoPaperDraftBlock) -> Font {
    switch block.kind {
    case .heading:
      .system(size: 22, weight: .bold)
    case .codeBlock:
      .system(size: 14, design: .monospaced)
    case .blockquote:
      .system(size: 16).italic()
    default:
      .system(size: 16, weight: .regular)
    }
  }
}
