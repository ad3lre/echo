import EchoDomain
import SwiftUI

/// Web `ForwardMessageModal`: search, then pick a DM or server text channel.
struct EchoForwardPickerSheet: View {
  let model: EchoForwardModel
  let baseURL: URL
  var accessToken: String? = nil
  let onClose: () -> Void

  @State private var query = ""
  @State private var sent = false

  private var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      header
      TextField(EchoCopy.string("Search people, servers, channels…"), text: $query)
        .textFieldStyle(.plain)
        .font(.system(size: 14))
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(
          EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      Text(verbatim: model.source.forwardContentPreview)
        .font(.system(size: 12, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .lineLimit(2)
      if let error = model.errorMessage {
        Text(error).font(.system(size: 12)).foregroundStyle(EchoTheme.Color.mentionPing)
      }
      destinations
    }
    .padding(20)
    #if os(macOS)
      .frame(width: 440, height: 560)
    #endif
    .background(EchoTheme.Color.elevatedDeep.ignoresSafeArea())
    .overlay { if sent { sentOverlay } }
    .task { await model.load() }
  }

  private var header: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 3) {
        Text(EchoCopy.string("Forward message"))
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(EchoCopy.string("Send to a DM or channel"))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
      }
      Spacer(minLength: 8)
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
  }

  @ViewBuilder
  private var destinations: some View {
    let dms = model.directMessages(matching: trimmedQuery)
    let servers = model.servers.filter { !model.channels(in: $0, matching: trimmedQuery).isEmpty }
    if model.isLoading && dms.isEmpty && servers.isEmpty {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if dms.isEmpty && servers.isEmpty {
      Text(
        trimmedQuery.isEmpty
          ? EchoCopy.string("There is nowhere else to forward this message.")
          : EchoCopy.format("No results for “%@”", trimmedQuery)
      )
      .font(.system(size: 13)).foregroundStyle(EchoTheme.Color.ink(0.5))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 2) {
          if !dms.isEmpty {
            sectionTitle(EchoCopy.string("Direct messages"))
            ForEach(dms) { dm in dmRow(dm) }
          }
          ForEach(servers) { server in
            sectionTitle(server.name)
            ForEach(model.channels(in: server, matching: trimmedQuery)) { channel in
              row(title: "#\(channel.name)", symbol: "number", avatar: nil, seed: channel.id) {
                pick(channel.id)
              }
            }
          }
        }
      }
    }
  }

  private func dmRow(_ dm: EchoDirectMessage) -> some View {
    row(
      title: dm.displayName, symbol: nil, avatar: dm.avatarURL ?? dm.avatarURLs.first,
      seed: dm.peerUserID ?? dm.channelID
    ) { pick(dm.channelID) }
  }

  private func row(
    title: String, symbol: String?, avatar: String?, seed: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 10) {
        if let symbol {
          Image(systemName: symbol)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .frame(width: 28, height: 28)
            .background(EchoTheme.Color.ink(0.07), in: Circle())
        } else {
          EchoMediaImage(source: avatar, baseURL: baseURL, accessToken: accessToken) {
            EchoGeneratedAvatar(name: title, seed: seed)
          }
          .clipShape(Circle())
          .frame(width: 28, height: 28)
        }
        Text(verbatim: title)
          .font(.system(size: 15, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.92))
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(model.isSending)
  }

  private func sectionTitle(_ title: String) -> some View {
    Text(verbatim: title.uppercased())
      .font(.system(size: 11, weight: .semibold, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.4))
      .padding(.horizontal, 10)
      .padding(.top, 10)
  }

  private var sentOverlay: some View {
    VStack(spacing: 8) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 44))
        .foregroundStyle(EchoTheme.Color.presenceOnline)
      Text(EchoCopy.string("Forwarded"))
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.fg)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(EchoTheme.Color.elevatedDeep.opacity(0.92))
  }

  private func pick(_ channelID: String) {
    Task {
      guard await model.forward(to: channelID) else { return }
      sent = true
      try? await Task.sleep(nanoseconds: 450_000_000)
      onClose()
    }
  }
}

extension View {
  /// Presents the forward picker while `model` is set (web `ForwardMessageModal`).
  func echoForwardSheet(
    model: Binding<EchoForwardModel?>, baseURL: URL, accessToken: String
  ) -> some View {
    sheet(item: model) { forward in
      EchoForwardPickerSheet(
        model: forward, baseURL: baseURL, accessToken: accessToken,
        onClose: { model.wrappedValue = nil })
    }
  }
}
