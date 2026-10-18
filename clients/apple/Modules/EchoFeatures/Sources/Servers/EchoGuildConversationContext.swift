import EchoDomain
import Foundation

/// Guild channel context for the shared conversation surface.
struct EchoGuildConversationContext: Equatable {
  let server: EchoServerSummary
  let channel: EchoGuildChannel
}
