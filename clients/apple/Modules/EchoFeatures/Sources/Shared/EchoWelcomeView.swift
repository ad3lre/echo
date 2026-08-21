import SwiftUI

struct EchoWelcomeView: View {
  @Binding var showingEntryActions: Bool
  var unlockTitle: String? = nil
  var onUnlock: (() -> Void)? = nil
  let onSelect: (EchoAuthPage) -> Void

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        EchoConversationStack()
          .position(x: proxy.size.width * 0.52, y: proxy.size.height * 0.34)

        VStack(spacing: 0) {
          EchoLaunchWordmark()
          EchoCopy.text("A better place to talk.")
            .font(.system(size: 14, weight: .regular, design: .default))
            .foregroundStyle(.white.opacity(0.72))
            .padding(.top, 7)
        }
        .position(x: proxy.size.width * 0.50, y: proxy.size.height * 0.60)

        if showingEntryActions {
          VStack(spacing: 10) {
            if let unlockTitle, let onUnlock {
              EchoEntryAction(
                title: unlockTitle, tint: EchoTheme.Color.entryUnlock,
                action: onUnlock
              )
            }
            EchoEntryAction(title: EchoCopy.string("Log in"), tint: EchoTheme.Color.entryLogin) {
              onSelect(.signIn)
            }
            EchoEntryAction(title: EchoCopy.string("Register"), tint: EchoTheme.Color.violetEntry) {
              onSelect(.register)
            }
          }
          .transition(.opacity.combined(with: .move(edge: .bottom)))
          .position(x: proxy.size.width * 0.50, y: proxy.size.height - 116)
        }

        EchoLightSource()
          .position(
            x: proxy.size.width * 0.50,
            y: proxy.size.height - max(20, proxy.safeAreaInsets.bottom * 0.35)
          )
      }
      .contentShape(Rectangle())
      .simultaneousGesture(
        TapGesture().onEnded {
          guard !showingEntryActions else { return }
          withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) {
            showingEntryActions = true
          }
        }, including: .all)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .safeAreaPadding(.top, 12)
    .safeAreaPadding(.bottom, 12)
  }
}

struct EchoLaunchWordmark: View {
  var body: some View {
    Image("EchoLaunchWordmark", bundle: .main)
      .resizable()
      .scaledToFit()
      .frame(width: 240, height: 80)
      .accessibilityLabel(EchoCopy.string("Echo"))
  }
}

private struct EchoEntryAction: View {
  let title: String
  let tint: Color
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 15, weight: .medium, design: .rounded))
        .foregroundStyle(.white.opacity(0.94))
        .frame(width: 176, height: 44)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(
              LinearGradient(
                colors: [tint.opacity(0.30), tint.opacity(0.10)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: tint.opacity(0.20), radius: 16, y: 6)
    }
    .buttonStyle(.plain)
  }
}
