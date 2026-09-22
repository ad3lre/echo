import SwiftUI

/// Turns Foundation Markdown presentation intents into concrete fonts/colors.
/// Parent SwiftUI `.font` / `.foregroundStyle` modifiers otherwise flatten
/// bold, italic, and code in chat bubbles.
enum EchoMarkdownDisplayStyle {
  static func attributed(
    _ value: AttributedString,
    size: CGFloat = EchoTheme.Typography.messageBody,
    weight: Font.Weight = .regular,
    opacity: Double = 0.90,
    dyslexiaFont: Bool = false
  ) -> AttributedString {
    var result = value
    let baseColor = EchoTheme.Color.ink(opacity)
    for run in result.runs {
      let intent = run.inlinePresentationIntent ?? []
      let isCode = intent.contains(.code)
      let isStrong = intent.contains(.stronglyEmphasized)
      let isEmphasis = intent.contains(.emphasized)
      let isStrike = intent.contains(.strikethrough)

      if isCode {
        result[run.range].font = .system(size: max(12, size - 1), design: .monospaced)
        if result[run.range].backgroundColor == nil {
          result[run.range].backgroundColor = EchoTheme.Color.ink(0.10)
        }
      } else if isStrong {
        result[run.range].font = echoBodyFont(
          size: size, weight: .bold, dyslexia: dyslexiaFont)
      } else if isEmphasis {
        result[run.range].font = echoBodyFont(
          size: size, weight: weight, dyslexia: dyslexiaFont
        ).italic()
      } else if result[run.range].font == nil {
        result[run.range].font = echoBodyFont(
          size: size, weight: weight, dyslexia: dyslexiaFont)
      }

      if isStrike {
        result[run.range].strikethroughStyle = .single
      }

      // Preserve link / spoiler / highlight colors already set by the parser.
      if result[run.range].link != nil {
        if result[run.range].foregroundColor == nil {
          result[run.range].foregroundColor = .blue
        }
      } else if result[run.range].foregroundColor == nil {
        result[run.range].foregroundColor = baseColor
      }
    }
    return result
  }

  private static func echoBodyFont(
    size: CGFloat, weight: Font.Weight, dyslexia: Bool
  ) -> Font {
    if dyslexia {
      let name =
        weight == .bold || weight == .semibold || weight == .heavy || weight == .black
        ? "AtkinsonHyperlegible-Bold"
        : "AtkinsonHyperlegible-Regular"
      return .custom(name, size: size)
    }
    return .system(size: size, weight: weight, design: .rounded)
  }
}
