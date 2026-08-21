import Foundation
import Testing

@testable import EchoFeatures

struct EchoLocaleGlossaryTests {
  @Test func spanishGlossaryKeepsCriticalAuthAndChromeVerbs() throws {
    let catalog = try loadCatalog()
    let expectations: [String: String] = [
      "Log in": "Iniciar sesión",
      "Create account": "Crear cuenta",
      "Close": "Cerrar",
      "Send message": "Enviar mensaje",
      "Settings": "Ajustes",
      "Back": "Atrás",
      "Cancel": "Cancelar",
      "Log out": "Cerrar sesión",
      "Continue with %@": "Continuar con %@",
      "Command Return to send": "Comando Retorno para enviar",
    ]
    for (key, expected) in expectations {
      let es = try spanish(for: key, in: catalog)
      #expect(es == expected, "\(key) should be “\(expected)”, got “\(es)”")
    }
  }

  @Test func everyCatalogKeyHasEnglishAndSpanish() throws {
    let catalog = try loadCatalog()
    let strings = try #require(catalog["strings"] as? [String: Any])
    #expect(strings.count >= 400)
    for (key, value) in strings {
      let entry = try #require(value as? [String: Any])
      let locs = try #require(entry["localizations"] as? [String: Any])
      let en = ((locs["en"] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
      let es = ((locs["es"] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
      #expect(en?.isEmpty == false, "missing en for \(key)")
      #expect(es?.isEmpty == false, "missing es for \(key)")
    }
  }

  private func loadCatalog() throws -> [String: Any] {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Modules/EchoFeatures/Resources/Localizable.xcstrings")
    let data = try Data(contentsOf: url)
    return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  private func spanish(for key: String, in catalog: [String: Any]) throws -> String {
    let strings = try #require(catalog["strings"] as? [String: Any])
    let entry = try #require(strings[key] as? [String: Any])
    let locs = try #require(entry["localizations"] as? [String: Any])
    let unit = try #require((locs["es"] as? [String: Any])?["stringUnit"] as? [String: Any])
    return try #require(unit["value"] as? String)
  }
}
