import Foundation

enum EchoCallPhase: Equatable {
  case idle
  case incoming
  case dialing
  case connecting
  case active
  case reconnecting
  case ending
  case failed
}

let echoCallRingTimeoutNanoseconds: UInt64 = 180_000_000_000
