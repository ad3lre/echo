import Foundation
import Testing

@testable import EchoFeatures

struct EchoMediaDiskCacheTests {
  @Test func canonicalURLStripsEphemeralSigningQueryItems() {
    let signed = URL(
      string: "https://chat-echo.com/v1/o/avatars/u1.png?t=abc.def.ghi&x=1")!
    let publicURL = URL(string: "https://chat-echo.com/v1/o/avatars/u1.png?x=1")!
    #expect(
      echoCanonicalMediaURLString(for: signed) == echoCanonicalMediaURLString(for: publicURL))
    #expect(echoStableMediaCacheKey(for: signed) == echoStableMediaCacheKey(for: publicURL))
  }

  @Test func canonicalURLStripsAmzQueryItems() {
    let a = URL(
      string:
        "https://cdn.example/obj.png?X-Amz-Signature=sig&X-Amz-Expires=900&response-content-type=image%2Fpng"
    )!
    let b = URL(
      string: "https://cdn.example/obj.png?response-content-type=image%2Fpng")!
    #expect(echoStableMediaCacheKey(for: a) == echoStableMediaCacheKey(for: b))
  }

  @Test func diskCacheSurvivesMemoryClearAndResign() async throws {
    let publicURL = URL(
      string: "https://chat-echo.com/v1/o/test-avatar-\(UUID().uuidString).png")!
    let signedA = URL(string: publicURL.absoluteString + "?t=token-one")!
    let signedB = URL(string: publicURL.absoluteString + "?t=token-two")!
    let bytes = Data("echo-avatar-fixture".utf8)

    let cache = EchoImageDataCache.shared
    await cache.seed(bytes, for: signedA)
    #expect(await cache.hasData(for: publicURL))

    await cache.clearMemory(for: signedA)
    #expect(await cache.hasData(for: signedB))

    let restored = try await cache.data(for: signedB)
    #expect(restored == bytes)

    await cache.remove(for: publicURL)
    #expect(!(await cache.hasData(for: publicURL)))
  }
}
