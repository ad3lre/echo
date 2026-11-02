import EchoDomain
import SwiftUI

struct EchoCreateChannelModal: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  var onClose: () -> Void

  @State private var name = ""
  @State private var type = EchoCreatableChannelType.text
  @State private var categoryID = ""
  @State private var busy = false

  private var categories: [(id: String, name: String)] {
    var seen = Set<String>()
    var out: [(id: String, name: String)] = []
    for channel in model.channels(for: server.id) {
      let id = channel.categoryID.trimmingCharacters(in: .whitespacesAndNewlines)
      let title = channel.categoryName.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, seen.insert(id).inserted else { continue }
      out.append((id, title.isEmpty ? EchoCopy.string("Uncategorized") : title))
    }
    return out
  }

  private var canCreate: Bool {
    !busy && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    EchoGuildDesktopModal(maxWidth: 440, onClose: onClose) {
      VStack(alignment: .leading, spacing: 18) {
        header(EchoCopy.string("Create Channel"))
        EchoDesktopLabeledField(title: EchoCopy.string("Channel name")) {
          TextField(EchoCopy.string("Channel name"), text: $name)
        }
        VStack(alignment: .leading, spacing: 7) {
          Text(EchoCopy.string("Type").uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.8)
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
            ForEach(EchoCreatableChannelType.available) { typeChip($0) }
          }
        }
        if !categories.isEmpty {
          VStack(alignment: .leading, spacing: 7) {
            Text(EchoCopy.string("Category").uppercased())
              .font(.system(size: 11, weight: .bold))
              .tracking(1.8)
              .foregroundStyle(EchoTheme.Color.ink(0.42))
            VStack(spacing: 4) {
              ForEach(categories, id: \.id) { row in
                categoryRow(row)
              }
            }
          }
        }
        if let error = model.actionErrorMessage {
          Text(error)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.mentionPing)
        }
        HStack {
          Spacer()
          EchoDesktopGhostButton(title: EchoCopy.string("Cancel"), action: onClose)
          EchoDesktopPrimaryButton(title: EchoCopy.string("Create"), enabled: canCreate) {
            Task { await create() }
          }
        }
      }
      .overlay(alignment: .topTrailing) {
        EchoGuildModalCloseButton(action: onClose)
          .offset(x: 4, y: -4)
      }
    }
    .onAppear {
      if categoryID.isEmpty { categoryID = categories.first?.id ?? "" }
    }
  }

  private func header(_ title: String) -> some View {
    Text(title)
      .font(.system(size: 20, weight: .bold))
      .foregroundStyle(EchoTheme.Color.fg)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.trailing, 28)
  }

  private func typeChip(_ option: EchoCreatableChannelType) -> some View {
    let selected = type == option
    return Button {
      type = option
    } label: {
      HStack(spacing: 8) {
        Image(systemName: option.icon)
          .font(.system(size: 13, weight: .semibold))
        Text(option.title)
          .font(.system(size: 14, weight: .semibold))
      }
      .foregroundStyle(selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.55))
      .frame(maxWidth: .infinity)
      .frame(height: 40)
      .background(
        selected
          ? EchoTheme.Color.signInBlue.opacity(0.16)
          : EchoTheme.Color.elevatedMid,
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(
            selected ? EchoTheme.Color.signInBlue.opacity(0.35) : EchoTheme.Color.ink(0.10),
            lineWidth: 1
          )
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(option.title)
    .accessibilityHint(option.subtitle)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private func categoryRow(_ row: (id: String, name: String)) -> some View {
    let selected = categoryID == row.id
    return Button {
      categoryID = row.id
    } label: {
      HStack {
        Text(row.name)
          .font(.system(size: 14, weight: selected ? .semibold : .medium))
          .foregroundStyle(EchoTheme.Color.fg)
        Spacer()
        if selected {
          Image(systemName: "checkmark")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(EchoTheme.Color.signInBlue)
        }
      }
      .padding(.horizontal, 12)
      .frame(height: 36)
      .background(
        selected ? EchoTheme.Color.ink(0.08) : Color.clear,
        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func create() async {
    busy = true
    if await model.createChannel(server, name: name, type: type.rawValue, categoryID: categoryID) {
      onClose()
    }
    busy = false
  }
}

struct EchoCreateCategoryModal: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  var onClose: () -> Void

  @State private var name = ""
  @State private var busy = false

  private var canCreate: Bool {
    !busy && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    EchoGuildDesktopModal(maxWidth: 420, onClose: onClose) {
      VStack(alignment: .leading, spacing: 18) {
        Text(EchoCopy.string("Create Category"))
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
          .padding(.trailing, 28)
        EchoDesktopLabeledField(title: EchoCopy.string("Category name")) {
          TextField(EchoCopy.string("Category name"), text: $name)
        }
        if let error = model.actionErrorMessage {
          Text(error)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.mentionPing)
        }
        HStack {
          Spacer()
          EchoDesktopGhostButton(title: EchoCopy.string("Cancel"), action: onClose)
          EchoDesktopPrimaryButton(title: EchoCopy.string("Create"), enabled: canCreate) {
            Task {
              busy = true
              if await model.createCategory(server, name: name) { onClose() }
              busy = false
            }
          }
        }
      }
      .overlay(alignment: .topTrailing) {
        EchoGuildModalCloseButton(action: onClose)
          .offset(x: 4, y: -4)
      }
    }
  }
}
