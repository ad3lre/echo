import Foundation

/// Public invite share URL helpers (web `echoInviteShareUrl.ts` + `inviteLinkParse.ts`).
public enum EchoInviteShareURL {
  /// Append `voice=<channelId>` for voice-channel-specific invite links.
  public static func appendingVoice(_ url: String, voiceChannelID: String?) -> String {
    let id = voiceChannelID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let base = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty, !base.isEmpty else { return base }
    let sep = base.contains("?") ? "&" : "?"
    let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
    return "\(base)\(sep)voice=\(encoded)"
  }

  /// Parse `voice=<channelId>` from invite share URLs or query-bearing paste.
  public static func voiceChannelID(from input: String) -> String? {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if let url = URL(string: trimmed), url.scheme != nil {
      let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
      if let voice = items?.first(where: { $0.name == "voice" })?.value?
        .trimmingCharacters(in: .whitespacesAndNewlines), !voice.isEmpty
      {
        return voice
      }
    }
    guard let qIndex = trimmed.firstIndex(of: "?") else { return nil }
    let query = String(trimmed[trimmed.index(after: qIndex)...])
    let items = URLComponents(string: "?\(query)")?.queryItems
    let voice = items?.first(where: { $0.name == "voice" })?.value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return (voice?.isEmpty == false) ? voice : nil
  }
}
