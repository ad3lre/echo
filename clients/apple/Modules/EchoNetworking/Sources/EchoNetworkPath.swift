import Foundation
import Network

/// Posts when the device path becomes usable after an outage so UI can retry.
public enum EchoNetworkPath {
  public static let becameAvailable = Notification.Name("EchoNetworkBecameAvailable")

  public static func startMonitoring() {
    Monitor.shared.start()
  }

  private final class Monitor: @unchecked Sendable {
    static let shared = Monitor()
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "echo.network-path")
    private let lock = NSLock()
    private var started = false
    private var wasSatisfied = true

    func start() {
      lock.lock()
      let shouldStart = !started
      if shouldStart { started = true }
      lock.unlock()
      guard shouldStart else { return }
      monitor.pathUpdateHandler = { [weak self] path in
        self?.handle(path)
      }
      monitor.start(queue: queue)
    }

    private func handle(_ path: NWPath) {
      let satisfied = path.status == .satisfied
      lock.lock()
      let recovered = satisfied && !wasSatisfied
      wasSatisfied = satisfied
      lock.unlock()
      guard recovered else { return }
      NotificationCenter.default.post(name: EchoNetworkPath.becameAvailable, object: nil)
    }
  }
}
