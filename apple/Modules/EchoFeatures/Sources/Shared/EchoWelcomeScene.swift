import SceneKit
import SwiftUI

#if os(iOS)
  import UIKit
#elseif os(macOS)
  import AppKit
#endif

struct EchoLightSource: View {
  var body: some View {
    ZStack(alignment: .bottom) {
      Ellipse()
        .fill(
          RadialGradient(
            colors: [
              Color.white.opacity(0.42),
              Color(red: 0.20, green: 0.62, blue: 1.0).opacity(0.42),
              Color(red: 0.04, green: 0.24, blue: 0.98).opacity(0.18),
              .clear,
            ],
            center: UnitPoint(x: 0.5, y: 0.82),
            startRadius: 0,
            endRadius: 92
          )
        )
        .frame(width: 190, height: 112)
        .blur(radius: 19)
        .offset(y: 0)

      Ellipse()
        .fill(
          RadialGradient(
            colors: [
              Color.white.opacity(0.62),
              Color(red: 0.38, green: 0.78, blue: 1.0).opacity(0.52),
              Color(red: 0.04, green: 0.30, blue: 1.0).opacity(0.16),
              .clear,
            ],
            center: UnitPoint(x: 0.5, y: 0.92),
            startRadius: 0,
            endRadius: 58
          )
        )
        .frame(width: 112, height: 62)
        .blur(radius: 11)
        .offset(y: 0)

      Capsule()
        .fill(
          LinearGradient(
            colors: [
              Color.white.opacity(0.24),
              Color(red: 0.28, green: 0.70, blue: 1.0).opacity(0.16),
              .clear,
            ],
            startPoint: .bottom,
            endPoint: .top
          )
        )
        .frame(width: 8, height: 62)
        .blur(radius: 7)
        .offset(y: 0)
    }
    .frame(width: 190, height: 140)
    .accessibilityHidden(true)
  }
}

struct EchoConversationStack: View {
  var body: some View {
    ZStack {
      EchoConversationCard(variant: .quiet)
        .rotationEffect(.degrees(-10))
        .offset(x: -7, y: -86)
      EchoConversationCard(variant: .active)
        .rotationEffect(.degrees(-7))
        .offset(x: 0, y: -14)
      EchoConversationCard(variant: .muted)
        .rotationEffect(.degrees(3))
        .offset(x: -9, y: 85)
    }
    .frame(width: 205, height: 270)
  }
}

private struct EchoConversationCard: View {
  enum Variant { case quiet, active, muted }
  let variant: Variant

  var body: some View {
    Echo3DCardView(variant: variant)
      .frame(width: cardWidth, height: cardHeight)
      .accessibilityHidden(true)
  }

  private var cardWidth: CGFloat {
    switch variant {
    case .quiet: 142
    case .active: 174
    case .muted: 174
    }
  }
  private var cardHeight: CGFloat {
    switch variant {
    case .quiet: 72
    case .active: 72
    case .muted: 72
    }
  }
}

private struct Echo3DCardView: View {
  let variant: EchoConversationCard.Variant

  var body: some View {
    #if os(iOS)
      Echo3DCardRepresentable(variant: variant)
    #elseif os(macOS)
      Echo3DCardRepresentable(variant: variant)
    #else
      Color.clear
    #endif
  }
}

#if os(iOS)
  private struct Echo3DCardRepresentable: UIViewRepresentable {
    let variant: EchoConversationCard.Variant

    func makeUIView(context: Context) -> SCNView {
      let view = SCNView()
      view.scene = Echo3DCardScene.make(variant: variant)
      view.backgroundColor = .clear
      #if os(iOS)
        view.isOpaque = false
      #endif
      view.allowsCameraControl = false
      view.autoenablesDefaultLighting = false
      view.antialiasingMode = .multisampling4X
      #if os(iOS)
        view.contentMode = .scaleAspectFill
      #endif
      return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
      // The variant is immutable for this representable. Replacing the scene
      // here would rebuild geometry and trigger Metal shader work whenever
      // an unrelated SwiftUI state change recomposes the welcome screen.
    }
  }
#elseif os(macOS)
  private struct Echo3DCardRepresentable: NSViewRepresentable {
    let variant: EchoConversationCard.Variant

    func makeNSView(context: Context) -> SCNView {
      let view = SCNView()
      view.scene = Echo3DCardScene.make(variant: variant)
      view.backgroundColor = .clear
      view.allowsCameraControl = false
      view.autoenablesDefaultLighting = false
      view.antialiasingMode = .multisampling4X
      return view
    }

    func updateNSView(_ view: SCNView, context: Context) {
      // Keep the SceneKit scene alive across SwiftUI updates; its variant is
      // fixed for the lifetime of this representable.
    }
  }
#endif

private enum Echo3DCardScene {
  static func make(variant: EchoConversationCard.Variant) -> SCNScene {
    let scene = SCNScene()
    scene.background.contents = platformClearColor
    scene.lightingEnvironment.intensity = 0.95

    let ambient = SCNLight()
    ambient.type = .ambient
    ambient.color = platformColor(red: 0.62, green: 0.72, blue: 0.92)
    ambient.intensity = 420
    let ambientNode = SCNNode()
    ambientNode.light = ambient
    scene.rootNode.addChildNode(ambientNode)

    let camera = SCNCamera()
    camera.fieldOfView = 19.5
    camera.zNear = 0.01
    camera.zFar = 100
    let cameraNode = SCNNode()
    cameraNode.camera = camera
    cameraNode.position = SCNVector3(0, 0, 3.6)
    scene.rootNode.addChildNode(cameraNode)

    let key = SCNLight()
    key.type = .directional
    key.color = platformColor(red: 0.72, green: 0.82, blue: 1.0)
    key.intensity = variant == .active ? 900 : 760
    let keyNode = SCNNode()
    keyNode.light = key
    keyNode.position = SCNVector3(-2.4, 3.2, 4.0)
    keyNode.eulerAngles = SCNVector3(-0.55, -0.35, 0)
    scene.rootNode.addChildNode(keyNode)

    let rim = SCNLight()
    rim.type = .directional
    rim.color =
      variant == .active
      ? platformColor(red: 0.04, green: 0.28, blue: 1.0)
      : platformColor(red: 0.25, green: 0.38, blue: 0.58)
    rim.intensity = variant == .active ? 180 : 110
    let rimNode = SCNNode()
    rimNode.light = rim
    rimNode.position = SCNVector3(2.3, -0.8, 2.4)
    rimNode.eulerAngles = SCNVector3(0.45, 0.55, 0)
    scene.rootNode.addChildNode(rimNode)

    let cardWidth: CGFloat = variant == .quiet ? 2.45 : 3.0
    let cardHeight: CGFloat = variant == .quiet ? 1.08 : 1.16
    let card = roundedBox(width: cardWidth, height: cardHeight, depth: 0.16, radius: 0.22)
    card.materials = cardMaterials(for: variant)
    let cardNode = SCNNode(geometry: card)
    cardNode.position = SCNVector3(0, 0, 0)
    scene.rootNode.addChildNode(cardNode)

    let avatar = SCNCylinder(radius: 0.27, height: 0.075)
    avatar.radialSegmentCount = 48
    avatar.materials = [avatarMaterial(for: variant)]
    let avatarNode = SCNNode(geometry: avatar)
    avatarNode.eulerAngles.x = .pi / 2
    avatarNode.position = SCNVector3(variant == .quiet ? -0.74 : -0.92, 0.0, 0.14)
    if variant == .active {
      let logoFace = logoAvatarFaceNode()
      // The cylinder is rotated so its axis faces the camera. Cancel
      // that rotation for the front-facing logo disk.
      logoFace.eulerAngles.x = -.pi / 2
      avatarNode.addChildNode(logoFace)
    }
    scene.rootNode.addChildNode(avatarNode)

    let firstLine = roundedBar(width: 0.82, color: lineColor(for: variant))
    firstLine.position = SCNVector3(-0.02, 0.18, 0.145)
    scene.rootNode.addChildNode(firstLine)

    let secondLine = roundedBar(width: 1.25, color: lineColor(for: variant))
    secondLine.position = SCNVector3(0.20, -0.14, 0.145)
    scene.rootNode.addChildNode(secondLine)

    if variant == .active {
      let dot = SCNSphere(radius: 0.078)
      dot.segmentCount = 32
      let dotMaterial = SCNMaterial()
      dotMaterial.lightingModel = .physicallyBased
      dotMaterial.diffuse.contents = platformColor(red: 0.02, green: 0.38, blue: 1.0)
      dotMaterial.emission.contents = platformColor(red: 0.01, green: 0.16, blue: 0.62)
      dot.materials = [dotMaterial]
      let dotNode = SCNNode(geometry: dot)
      dotNode.position = SCNVector3(1.13, 0.27, 0.17)
      scene.rootNode.addChildNode(dotNode)
    }

    return scene
  }

  private static func roundedBar(width: CGFloat, color: Any) -> SCNNode {
    let geometry = roundedBox(width: width, height: 0.105, depth: 0.045, radius: 0.0525)
    let material = SCNMaterial()
    material.lightingModel = .physicallyBased
    material.diffuse.contents = color
    material.roughness.contents = 0.28
    material.metalness.contents = 0.08
    geometry.materials = [material]
    return SCNNode(geometry: geometry)
  }

  #if os(iOS)
    private static func echoLogoImage() -> UIImage? {
      guard let url = Bundle.module.url(forResource: "EchoLogo", withExtension: "png") else {
        return nil
      }
      return UIImage(contentsOfFile: url.path)
    }
  #else
    private static func echoLogoImage() -> NSImage? {
      guard let url = Bundle.module.url(forResource: "EchoLogo", withExtension: "png") else {
        return nil
      }
      return NSImage(contentsOf: url)
    }
  #endif

  /// A circular, textured front face. Using a disk mesh (rather than a
  /// cylinder's implicit UVs) keeps the logo upright and clips the square
  /// source image exactly to the profile-picture circle.
  private static func logoAvatarFaceNode() -> SCNNode {
    let radius: CGFloat = 0.267
    let segments = 64
    var vertices = [vector(x: 0, y: 0, z: 0.041)]
    var textureCoordinates = [CGPoint(x: 0.5, y: 0.5)]

    for index in 0...segments {
      let angle = (CGFloat(index) / CGFloat(segments)) * 2 * .pi
      let x = cos(angle) * radius
      let y = sin(angle) * radius
      vertices.append(vector(x: x, y: y, z: 0.041))
      textureCoordinates.append(CGPoint(x: 0.5 + 0.5 * cos(angle), y: 0.5 - 0.5 * sin(angle)))
    }

    var indices: [UInt32] = []
    for index in 0..<segments {
      indices += [0, UInt32(index + 1), UInt32(index + 2)]
    }

    let source = SCNGeometrySource(vertices: vertices)
    let uvSource = SCNGeometrySource(textureCoordinates: textureCoordinates)
    let element = SCNGeometryElement(
      data: Data(bytes: indices, count: indices.count * MemoryLayout<UInt32>.size),
      primitiveType: .triangles,
      primitiveCount: indices.count / 3,
      bytesPerIndex: MemoryLayout<UInt32>.size
    )
    let geometry = SCNGeometry(sources: [source, uvSource], elements: [element])
    let material = SCNMaterial()
    material.lightingModel = .constant
    material.isDoubleSided = true
    if let logo = echoLogoImage() {
      material.diffuse.contents = logo
    }
    geometry.materials = [material]
    return SCNNode(geometry: geometry)
  }

  /// A real extruded rounded rectangle. This keeps the silhouette curved while
  /// retaining front, back, and side faces for SceneKit lighting.
  private static func roundedBox(width: CGFloat, height: CGFloat, depth: CGFloat, radius: CGFloat)
    -> SCNGeometry
  {
    let segmentsPerCorner = 12
    let halfWidth = width / 2
    let halfHeight = height / 2
    let r = min(radius, min(halfWidth, halfHeight))
    let corners: [(CGFloat, CGFloat, CGFloat)] = [
      (halfWidth - r, halfHeight - r, 0),
      (-halfWidth + r, halfHeight - r, .pi / 2),
      (-halfWidth + r, -halfHeight + r, .pi),
      (halfWidth - r, -halfHeight + r, 3 * .pi / 2),
    ]
    var perimeter: [SCNVector3] = []
    for (cx, cy, startAngle) in corners {
      for step in 0...segmentsPerCorner {
        let angle = startAngle + CGFloat(step) * (.pi / 2 / CGFloat(segmentsPerCorner))
        perimeter.append(vector(x: cx + r * cos(angle), y: cy + r * sin(angle), z: 0))
      }
    }

    let count = perimeter.count
    var vertices: [SCNVector3] = [vector(x: 0, y: 0, z: depth / 2)]
    vertices += perimeter.map { vector(x: CGFloat($0.x), y: CGFloat($0.y), z: depth / 2) }
    vertices.append(vector(x: 0, y: 0, z: -depth / 2))
    vertices += perimeter.map { vector(x: CGFloat($0.x), y: CGFloat($0.y), z: -depth / 2) }

    let backCenter = count + 1
    let backStart = backCenter + 1
    var indices: [UInt32] = []
    for index in 0..<count {
      let next = (index + 1) % count
      indices += [0, UInt32(index + 1), UInt32(next + 1)]
      indices += [UInt32(backCenter), UInt32(backStart + next), UInt32(backStart + index)]
      indices += [UInt32(index + 1), UInt32(backStart + index), UInt32(backStart + next)]
      indices += [UInt32(index + 1), UInt32(backStart + next), UInt32(next + 1)]
    }
    let source = SCNGeometrySource(vertices: vertices)
    let element = SCNGeometryElement(
      data: Data(bytes: indices, count: indices.count * MemoryLayout<UInt32>.size),
      primitiveType: .triangles, primitiveCount: indices.count / 3,
      bytesPerIndex: MemoryLayout<UInt32>.size)
    return SCNGeometry(sources: [source], elements: [element])
  }

  private static func vector(x: CGFloat, y: CGFloat, z: CGFloat) -> SCNVector3 {
    #if os(iOS)
      SCNVector3(Float(x), Float(y), Float(z))
    #else
      SCNVector3(x, y, z)
    #endif
  }

  private static func cardMaterials(for variant: EchoConversationCard.Variant) -> [SCNMaterial] {
    let material = SCNMaterial()
    material.lightingModel = .physicallyBased
    material.diffuse.contents = cardColor(for: variant)
    material.emission.contents = cardColor(for: variant)
    material.specular.contents = platformColor(red: 0.34, green: 0.44, blue: 0.62)
    material.roughness.contents = 0.42
    material.metalness.contents = 0.10
    material.transparency = variant == .active ? 1.0 : 0.96
    material.fresnelExponent = 1.6
    return [material]
  }

  private static func avatarMaterial(for variant: EchoConversationCard.Variant) -> SCNMaterial {
    let material = SCNMaterial()
    material.lightingModel = .physicallyBased
    material.diffuse.contents = avatarColor(for: variant)
    material.specular.contents = platformColor(red: 0.72, green: 0.82, blue: 1.0)
    material.roughness.contents = 0.18
    material.metalness.contents = 0.08
    return material
  }

  private static func cardColor(for variant: EchoConversationCard.Variant) -> Any {
    switch variant {
    case .quiet: platformColor(red: 0.060, green: 0.085, blue: 0.13)
    case .active: platformColor(red: 0.025, green: 0.12, blue: 0.38)
    case .muted: platformColor(red: 0.050, green: 0.065, blue: 0.095)
    }
  }

  private static func avatarColor(for variant: EchoConversationCard.Variant) -> Any {
    switch variant {
    case .quiet: platformColor(red: 0.32, green: 0.40, blue: 0.55)
    case .active: platformColor(red: 0.02, green: 0.38, blue: 1.0)
    case .muted: platformColor(red: 0.42, green: 0.46, blue: 0.48)
    }
  }

  private static func lineColor(for variant: EchoConversationCard.Variant) -> Any {
    switch variant {
    case .quiet: platformColor(red: 0.42, green: 0.48, blue: 0.60)
    case .active: platformColor(red: 0.06, green: 0.42, blue: 1.0)
    case .muted: platformColor(red: 0.46, green: 0.49, blue: 0.52)
    }
  }
}

#if os(iOS)
  private let platformClearColor: UIColor = .clear
  private func platformColor(red: CGFloat, green: CGFloat, blue: CGFloat) -> UIColor {
    UIColor(red: red, green: green, blue: blue, alpha: 1)
  }
#elseif os(macOS)
  private let platformClearColor: NSColor = .clear
  private func platformColor(red: CGFloat, green: CGFloat, blue: CGFloat) -> NSColor {
    NSColor(calibratedRed: red, green: green, blue: blue, alpha: 1)
  }
#endif
