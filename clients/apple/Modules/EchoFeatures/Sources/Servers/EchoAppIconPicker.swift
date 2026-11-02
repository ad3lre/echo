import SwiftUI

/// One browsable row from the synced web icon catalog (`echo-icon-filename-map.json`).
struct EchoAppIconCatalogEntry: Identifiable, Hashable, Sendable {
  /// Web `iconKey` / catalog filename (prefer `*.svg`).
  var id: String
  var label: String
  var assetName: String
}

extension EchoIconCatalog {
  /// Deduped catalog rows for pickers (web `getAllIconCatalogEntries`).
  static let browseEntries: [EchoAppIconCatalogEntry] = {
    var preferredKeyByAsset: [String: String] = [:]
    for (filename, asset) in mapEntries {
      let key = preferredIconKey(filename)
      if let existing = preferredKeyByAsset[asset] {
        let existingIsSvg = existing.lowercased().hasSuffix(".svg")
        let nextIsSvg = key.lowercased().hasSuffix(".svg")
        if !existingIsSvg, nextIsSvg { preferredKeyByAsset[asset] = key }
      } else {
        preferredKeyByAsset[asset] = key
      }
    }
    return preferredKeyByAsset.map { asset, key in
      EchoAppIconCatalogEntry(id: key, label: humanLabel(for: key), assetName: asset)
    }
    .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
  }()

  static func searchBrowseEntries(_ query: String, limit: Int = 200) -> [EchoAppIconCatalogEntry]
  {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let source = browseEntries
    if needle.isEmpty { return Array(source.prefix(limit)) }
    return Array(
      source.filter {
        $0.label.lowercased().contains(needle) || $0.id.lowercased().contains(needle)
      }.prefix(limit))
  }

  private static var mapEntries: [String: String] {
    guard let url = Bundle.module.url(forResource: "echo-icon-filename-map", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    else { return [:] }
    return decoded
  }

  private static func preferredIconKey(_ filename: String) -> String {
    let raw = filename.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.lowercased().hasSuffix(".svg") { return raw }
    return raw.isEmpty ? raw : "\(raw).svg"
  }

  private static func humanLabel(for iconKey: String) -> String {
    let stem = iconKey.replacingOccurrences(of: ".svg", with: "", options: .caseInsensitive)
    return stem
      .replacingOccurrences(of: "[-_]+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .capitalized
  }
}

/// Compact searchable grid of bundled app icons (web `AppIconPickerPanel`).
struct EchoAppIconPickerGrid: View {
  var selectedKey: String?
  var onPick: (String) -> Void

  @State private var query = ""

  private var hits: [EchoAppIconCatalogEntry] {
    EchoIconCatalog.searchBrowseEntries(query)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      TextField(EchoCopy.string("Search icons"), text: $query)
        .textFieldStyle(.plain)
        .font(.system(size: 13))
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
          EchoTheme.Color.ink(0.06),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      ScrollView {
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: 44), spacing: 8)],
          spacing: 8
        ) {
          ForEach(hits) { entry in
            Button {
              onPick(entry.id)
            } label: {
              Image(entry.assetName, bundle: .module)
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .foregroundStyle(EchoTheme.Color.ink(0.78))
                .padding(8)
                .frame(width: 44, height: 44)
                .background(
                  selected(entry.id)
                    ? EchoTheme.Color.signInBlue.opacity(0.22)
                    : EchoTheme.Color.ink(0.05),
                  in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                )
            }
            .buttonStyle(.plain)
            .help(entry.label)
            .accessibilityLabel(entry.label)
          }
        }
      }
      .frame(maxHeight: 220)
      if hits.isEmpty {
        Text(EchoCopy.string("No icons match."))
          .font(.system(size: 12))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
      }
    }
  }

  private func selected(_ key: String) -> Bool {
    guard let selectedKey else { return false }
    let a = selectedKey.lowercased()
    let b = key.lowercased()
    return a == b || a + ".svg" == b || a == b.replacingOccurrences(of: ".svg", with: "")
  }
}
