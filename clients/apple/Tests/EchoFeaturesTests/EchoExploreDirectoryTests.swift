import EchoDomain
import Testing

@testable import EchoFeatures

@Suite("EchoExploreDirectory")
struct EchoExploreDirectoryTests {
  @Test("recommended matches web: voice, then chat, then profile, then API order")
  func recommendedSortParity() {
    let rows = EchoExploreDirectory.listedServers(
      from: [
        directory(
          id: "quiet",
          name: "Quiet complete",
          banner: "https://example.com/b.png",
          description: "Has both",
          lastVoice: "2026-01-01T00:00:00.000Z",
          lastChat: "2026-05-01T00:00:00.000Z"
        ),
        directory(
          id: "live",
          name: "Live VC",
          lastVoice: "2026-05-20T00:00:00.000Z",
          lastChat: "2026-01-01T00:00:00.000Z"
        ),
        directory(
          id: "chatty",
          name: "Chatty bare",
          lastChat: "2026-05-22T00:00:00.000Z"
        ),
        directory(
          id: "fuller",
          name: "Same chat fuller",
          banner: "https://example.com/b2.png",
          description: "Also both",
          lastChat: "2026-05-22T00:00:00.000Z"
        ),
      ],
      joinedIDs: []
    )

    let sorted = EchoExploreDirectory.sort(
      rows,
      mode: .recommended,
      alphabeticalDescending: false,
      catalogCount: rows.count
    )
    #expect(sorted.map(\.name) == [
      "Live VC",
      "Quiet complete",
      "Same chat fuller",
      "Chatty bare",
    ])
  }

  @Test("recommended does not float idle alphabetical shells above live activity")
  func recommendedDoesNotPreferIdleAlpha() {
    let rows = EchoExploreDirectory.listedServers(
      from: [
        directory(id: "a", name: "Big goon cheeks cave"),
        directory(id: "b", name: "ClumsyFarts"),
        directory(id: "c", name: "Doggo Server"),
        directory(
          id: "hot",
          name: "16P",
          lastVoice: "2026-10-18T14:02:59.952Z",
          lastChat: "2026-06-16T19:09:34.846Z"
        ),
      ],
      joinedIDs: []
    )
    let sorted = EchoExploreDirectory.recommended(rows)
    #expect(sorted.first?.name == "16P")
    #expect(sorted.map(\.name).prefix(3) != ["Big goon cheeks cave", "ClumsyFarts", "Doggo Server"])
  }

  private func directory(
    id: String,
    name: String,
    banner: String? = nil,
    description: String? = nil,
    lastVoice: String? = nil,
    lastChat: String? = nil
  ) -> EchoDirectoryServer {
    EchoDirectoryServer(
      id: id,
      name: name,
      bannerURL: banner,
      description: description,
      lastVoiceActivityAt: lastVoice,
      lastChatActivityAt: lastChat
    )
  }
}
