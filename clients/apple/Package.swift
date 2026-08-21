// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "EchoAppleModules",
  defaultLocalization: "en",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "EchoDomain", targets: ["EchoDomain"]),
    .library(name: "EchoNetworking", targets: ["EchoNetworking"]),
    .library(name: "EchoPersistence", targets: ["EchoPersistence"]),
    .library(name: "EchoFeatures", targets: ["EchoFeatures"]),
  ],
  dependencies: [
    .package(url: "https://github.com/mgriebling/SwiftMath.git", from: "1.7.3"),
    .package(url: "https://github.com/socketio/socket.io-client-swift", from: "16.1.1"),
  ],
  targets: [
    .target(name: "EchoDomain", path: "Modules/EchoDomain"),
    .target(
      name: "EchoNetworking",
      dependencies: [
        "EchoDomain",
        .product(name: "SocketIO", package: "socket.io-client-swift"),
      ],
      path: "Modules/EchoNetworking"
    ),
    .target(name: "EchoPersistence", path: "Modules/EchoPersistence"),
    .target(
      name: "EchoFeatures",
      dependencies: [
        "EchoDomain", "EchoNetworking", "EchoPersistence",
        .product(name: "SwiftMath", package: "swiftmath"),
      ],
      path: "Modules/EchoFeatures",
      resources: [.process("Resources")],
      linkerSettings: [
        .linkedFramework("ImageIO")
      ]
    ),
    .testTarget(
      name: "EchoDomainTests",
      dependencies: ["EchoDomain"],
      path: "Tests/EchoDomainTests"
    ),
    .testTarget(
      name: "EchoNetworkingTests",
      dependencies: ["EchoNetworking"],
      path: "Tests/EchoNetworkingTests"
    ),
    .testTarget(
      name: "EchoPersistenceTests",
      dependencies: ["EchoPersistence"],
      path: "Tests/EchoPersistenceTests"
    ),
    .testTarget(
      name: "EchoFeaturesTests",
      dependencies: ["EchoFeatures"],
      path: "Tests/EchoFeaturesTests"
    ),
  ]
)
