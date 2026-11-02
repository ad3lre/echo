import SwiftUI

extension EchoFullProfilePage {
  var compactSafetyMenu: some View {
    Menu {
      Button {
        showingReportSheet = true
      } label: {
        Label(EchoCopy.string("Report user"), systemImage: "exclamationmark.bubble")
      }
      if model.blockStatusLoaded {
        if model.isBlocked {
          Button {
            showingBlockConfirmation = true
          } label: {
            Label(EchoCopy.string("Unblock user"), systemImage: "hand.raised.slash")
          }
          .disabled(model.isUpdatingBlock)
        } else {
          Button(role: .destructive) {
            showingBlockConfirmation = true
          } label: {
            Label(EchoCopy.string("Block user"), systemImage: "hand.raised")
          }
          .disabled(model.isUpdatingBlock)
        }
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .frame(width: 40, height: 40)
        .background(
          EchoTheme.Color.ink(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(EchoCopy.string("More options"))
  }

  @ViewBuilder
  var safetyActions: some View {
    VStack(alignment: .leading, spacing: 10) {
      Button {
        showingReportSheet = true
      } label: {
        safetyRow(
          title: EchoCopy.string("Report user"),
          systemImage: "exclamationmark.bubble",
          destructive: false
        )
      }
      .buttonStyle(.plain)

      if model.blockStatusLoaded {
        Button {
          showingBlockConfirmation = true
        } label: {
          safetyRow(
            title: model.isBlocked
              ? EchoCopy.string("Unblock user") : EchoCopy.string("Block user"),
            systemImage: model.isBlocked ? "hand.raised.slash" : "hand.raised",
            destructive: !model.isBlocked
          )
        }
        .buttonStyle(.plain)
        .disabled(model.isUpdatingBlock)
      }
    }
  }

  func safetyRow(title: String, systemImage: String, destructive: Bool) -> some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .font(.system(size: 14, weight: .semibold))
        .frame(width: 22)
      Text(title)
        .font(.system(size: 15, weight: .semibold, design: .rounded))
      Spacer(minLength: 8)
    }
    .foregroundStyle(destructive ? Color.red.opacity(0.92) : EchoTheme.Color.ink(0.88))
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}
