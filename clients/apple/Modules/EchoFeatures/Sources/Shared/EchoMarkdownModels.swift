import Foundation
import SwiftUI

enum EchoMarkdownBlock: Sendable {
  case paragraph(String)
  case heading(level: Int, text: String)
  case quote(text: String, alert: EchoMarkdownAlert?)
  case unordered(items: [String])
  case ordered(start: Int, items: [String])
  case code(language: String?, text: String)
  case table(headers: [String], rows: [[String]])
  case image(alt: String, url: URL)
  case math(source: String, display: Bool)
  case footnoteReference(label: String, number: Int)
  case footnoteDefinition(label: String, text: String)
  case rawHTML(String)
  case rule
}

enum EchoMarkdownAlert: String, Sendable {
  case note
  case tip
  case important
  case warning
  case caution

  var tint: Color {
    switch self {
    case .note: .blue
    case .tip: .green
    case .important: .purple
    case .warning: .orange
    case .caution: .red
    }
  }

  var title: String { rawValue.uppercased() }

  var systemImage: String {
    switch self {
    case .note: "info.circle.fill"
    case .tip: "lightbulb.fill"
    case .important: "exclamationmark.circle.fill"
    case .warning: "exclamationmark.triangle.fill"
    case .caution: "xmark.octagon.fill"
    }
  }
}
