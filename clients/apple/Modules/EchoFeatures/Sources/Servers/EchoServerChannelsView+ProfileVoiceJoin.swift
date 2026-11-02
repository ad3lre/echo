import SwiftUI

extension EchoServerChannelsView {
  func bindProfileVoiceJoinObservers() -> some View {
    EmptyView()
      .onChange(of: shellChrome.pendingProfileVoiceJoin?.channelID) { _, _ in
        Task { await consumeProfileVoiceJoinIfReady() }
      }
      .onChange(of: selectedGuildChat?.channel.id) { _, _ in
        Task { await consumeProfileVoiceJoinIfReady() }
      }
      .onChange(of: voiceSession?.phase) { _, _ in
        Task { await consumeProfileVoiceJoinIfReady() }
      }
      .task {
        await consumeProfileVoiceJoinIfReady()
      }
  }

  /// After profile Join: voice surface auto-connects; then apply the peer’s activity phase.
  func consumeProfileVoiceJoinIfReady() async {
    guard let join = shellChrome.pendingProfileVoiceJoin,
      join.serverID == server.id,
      join.channelID == selectedGuildChat?.channel.id,
      let voiceSession,
      voiceSession.joinedChannelID == join.channelID,
      voiceSession.phase == .active
    else { return }
    if let phase = join.vcActivityPhase {
      EchoVcActivityJoin.applyUiPhase(phase, session: voiceSession)
    }
    shellChrome.pendingProfileVoiceJoin = nil
  }
}
