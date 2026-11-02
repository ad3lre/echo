import SwiftUI

/// One sidebar entry of a tabbed settings modal.
struct EchoSettingsTabItem<ID: Hashable>: Identifiable {
  let id: ID
  let title: String
  let copy: String
  let icon: String
  var isDanger = false
}

/// Web `ServerSettingsModal` chrome (sidebar + titled detail + change bar), shared by channel and
/// category settings. macOS gets the sidebar; iOS gets a chip row so phones keep full width.
struct EchoSettingsTabsModal<Tab: Hashable, Content: View>: View {
  let kicker: String
  let title: String
  let subtitle: String
  let tabs: [EchoSettingsTabItem<Tab>]
  @Binding var selection: Tab
  var isDirty = false
  var canSave = true
  var isSaving = false
  var errorMessage: String?
  var statusMessage: String?
  var onSave: () -> Void
  var onDiscard: () -> Void
  var onClose: () -> Void
  @ViewBuilder var content: () -> Content

  private var active: EchoSettingsTabItem<Tab>? {
    tabs.first { $0.id == selection } ?? tabs.first
  }

  var body: some View {
    #if os(macOS)
      HStack(spacing: 0) {
        sidebar
          .frame(width: 248)
          .frame(maxHeight: .infinity)
        Rectangle().fill(EchoTheme.Color.ink(0.08)).frame(width: 1)
        detail.frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .background(EchoTheme.Color.canvas)
    #else
      VStack(spacing: 0) {
        compactHeader
        compactTabs
        detail
      }
      .background(EchoTheme.Color.canvas.ignoresSafeArea())
    #endif
  }

  // MARK: - macOS sidebar

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 6) {
        Text(kicker)
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .textCase(.uppercase)
        Text(title)
          .font(.system(size: 24, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(2)
        Text(subtitle)
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.horizontal, 20)
      .padding(.top, 22)
      .padding(.bottom, 18)
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(tabs) { item in sidebarItem(item) }
        }
        .padding(.bottom, 24)
      }
    }
    .background(EchoTheme.Color.ink(0.03))
  }

  private func sidebarItem(_ item: EchoSettingsTabItem<Tab>) -> some View {
    let selected = item.id == selection
    let tint = item.isDanger ? EchoTheme.Color.mentionPing : EchoTheme.Color.fg
    return Button {
      selection = item.id
    } label: {
      HStack(spacing: 10) {
        Image(systemName: item.icon)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(selected || item.isDanger ? tint : EchoTheme.Color.ink(0.48))
          .frame(width: 18)
        Text(item.title)
          .font(.system(size: 13.5, weight: selected ? .semibold : .medium))
          .foregroundStyle(selected || item.isDanger ? tint : EchoTheme.Color.ink(0.58))
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(
        selected ? EchoTheme.Color.signInBlue.opacity(0.16) : Color.clear,
        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 8)
  }

  // MARK: - iOS chrome

  private var compactHeader: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(kicker)
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.6)
          .foregroundStyle(EchoTheme.Color.ink(0.46))
          .textCase(.uppercase)
        Text(title)
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      EchoDesktopGhostButton(title: EchoCopy.string("Close"), action: onClose)
    }
    .padding(.horizontal, 18)
    .padding(.top, 16)
    .padding(.bottom, 8)
  }

  private var compactTabs: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(tabs) { item in
          let selected = item.id == selection
          Button {
            selection = item.id
          } label: {
            Text(item.title)
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(
                item.isDanger
                  ? EchoTheme.Color.mentionPing
                  : (selected ? EchoTheme.Color.fg : EchoTheme.Color.ink(0.58))
              )
              .padding(.horizontal, 12)
              .frame(height: 32)
              .background(
                selected ? EchoTheme.Color.signInBlue.opacity(0.18) : EchoTheme.Color.ink(0.05),
                in: Capsule())
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 18)
    }
    .padding(.bottom, 8)
  }

  // MARK: - Detail

  private var detail: some View {
    VStack(alignment: .leading, spacing: 0) {
      #if os(macOS)
        detailHeader
      #endif
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          if let errorMessage {
            Text(errorMessage)
              .font(.system(size: 13))
              .foregroundStyle(EchoTheme.Color.mentionPing)
              .fixedSize(horizontal: false, vertical: true)
          }
          if let statusMessage {
            EchoSettingsStatusLine(message: statusMessage)
          }
          content()
        }
        .padding(.horizontal, horizontalInset)
        .padding(.top, topInset)
        .padding(.bottom, 36)
        .frame(maxWidth: 820, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      if isDirty { changeBar }
    }
  }

  private var horizontalInset: CGFloat {
    #if os(macOS)
      32
    #else
      18
    #endif
  }

  private var topInset: CGFloat {
    #if os(macOS)
      0
    #else
      6
    #endif
  }

  private var detailHeader: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        Text(kicker)
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.8)
          .foregroundStyle(EchoTheme.Color.ink(0.42))
          .textCase(.uppercase)
        HStack(spacing: 12) {
          Image(systemName: active?.icon ?? "gearshape")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.62))
          Text(active?.title ?? "")
            .font(.system(size: 28, weight: .bold))
            .foregroundStyle(EchoTheme.Color.fg)
        }
        Text(active?.copy ?? "")
          .font(.system(size: 14))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 12)
      EchoDesktopGhostButton(title: EchoCopy.string("Close"), action: onClose)
    }
    .padding(.horizontal, 32)
    .padding(.top, 22)
    .padding(.bottom, 18)
  }

  private var changeBar: some View {
    HStack(spacing: 10) {
      Text(EchoCopy.string("Changes apply when you save."))
        .font(.system(size: 13))
        .foregroundStyle(EchoTheme.Color.ink(0.52))
      Spacer(minLength: 8)
      EchoDesktopGhostButton(title: EchoCopy.string("Discard"), action: onDiscard)
        .disabled(isSaving)
      EchoDesktopPrimaryButton(
        title: isSaving ? EchoCopy.string("Saving…") : EchoCopy.string("Save changes"),
        enabled: canSave && !isSaving,
        action: onSave)
    }
    .padding(.horizontal, horizontalInset)
    .padding(.vertical, 12)
    .background(EchoTheme.Color.ink(0.04))
    .overlay(alignment: .top) {
      Rectangle().fill(EchoTheme.Color.ink(0.08)).frame(height: 1)
    }
  }
}
