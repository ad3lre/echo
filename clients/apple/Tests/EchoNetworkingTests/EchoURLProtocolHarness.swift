import Foundation

/// Shared URLProtocol stub for Echo networking tests.
///
/// One handler covers every former per-endpoint stub class so new contract
/// tests do not grow another near-identical `URLProtocol` subclass.
final class EchoURLProtocolStub: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with _: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let handler = Self.handler else { throw URLError(.badServerResponse) }
      let (urlResponse, data) = try handler(request)
      client?.urlProtocol(self, didReceive: urlResponse, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

func echoTestSession(
  handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
) -> URLSession {
  EchoURLProtocolStub.handler = handler
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [EchoURLProtocolStub.self]
  return URLSession(configuration: configuration)
}

func echoRequestBody(_ request: URLRequest) -> Data? {
  if let body = request.httpBody { return body }
  guard let stream = request.httpBodyStream else { return nil }
  stream.open()
  defer { stream.close() }
  var data = Data()
  let bufferSize = 1024
  let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
  defer { buffer.deallocate() }
  while stream.hasBytesAvailable {
    let read = stream.read(buffer, maxLength: bufferSize)
    if read > 0 { data.append(buffer, count: read) } else { break }
  }
  return data
}

func echoHTTPResponse(url: URL, statusCode: Int, headers: [String: String]? = nil)
  -> HTTPURLResponse
{
  HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: nil, headerFields: headers)!
}
