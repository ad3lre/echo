import Foundation

/// Discord-style media collage layout for images/GIFs in one message.
///
/// Mirrors `clients/web/.../messageMediaCollage.ts`:
/// - 1 item → single cell, image shown whole (`contain`)
/// - 2–4 items → collage grid, each cell cropped (`cover`)
/// - 5+ items → 3 images + 4th overflow cell badged `+N` (`N = total - 3`)
enum EchoMediaCollageFit: Equatable, Sendable {
  case contain
  case cover
}

struct EchoMediaCollageCellPlan: Equatable, Sendable {
  /// Index into the source image list.
  let sourceIndex: Int
  /// Zero-based grid origin.
  let column: Int
  let row: Int
  let columnSpan: Int
  let rowSpan: Int
  let fit: EchoMediaCollageFit
  /// When > 0, render a dimmed "+N" badge over this cell.
  let overflowCount: Int
}

struct EchoMediaCollagePlan: Equatable, Sendable {
  let columnCount: Int
  let rowCount: Int
  let cells: [EchoMediaCollageCellPlan]

  /// How many cells are ever rendered (3 images + 1 overflow, or up to 4 images).
  static let maxCells = 4

  static func plan(itemCount: Int) -> EchoMediaCollagePlan? {
    guard itemCount > 0 else { return nil }

    if itemCount == 1 {
      return EchoMediaCollagePlan(
        columnCount: 1,
        rowCount: 1,
        cells: [
          EchoMediaCollageCellPlan(
            sourceIndex: 0, column: 0, row: 0, columnSpan: 1, rowSpan: 1,
            fit: .contain, overflowCount: 0)
        ])
    }

    if itemCount == 2 {
      return EchoMediaCollagePlan(
        columnCount: 2,
        rowCount: 1,
        cells: (0..<2).map { i in
          EchoMediaCollageCellPlan(
            sourceIndex: i, column: i, row: 0, columnSpan: 1, rowSpan: 1,
            fit: .cover, overflowCount: 0)
        })
    }

    if itemCount == 3 {
      // One tall image on the left, two stacked on the right.
      return EchoMediaCollagePlan(
        columnCount: 2,
        rowCount: 2,
        cells: [
          EchoMediaCollageCellPlan(
            sourceIndex: 0, column: 0, row: 0, columnSpan: 1, rowSpan: 2,
            fit: .cover, overflowCount: 0),
          EchoMediaCollageCellPlan(
            sourceIndex: 1, column: 1, row: 0, columnSpan: 1, rowSpan: 1,
            fit: .cover, overflowCount: 0),
          EchoMediaCollageCellPlan(
            sourceIndex: 2, column: 1, row: 1, columnSpan: 1, rowSpan: 1,
            fit: .cover, overflowCount: 0),
        ])
    }

    // 4 → 2×2 all visible. 5+ → 3 images + 4th cell badged "+N".
    let positions = [
      (0, 0), (1, 0), (0, 1), (1, 1),
    ]
    let cells = positions.enumerated().map { i, pos in
      EchoMediaCollageCellPlan(
        sourceIndex: i,
        column: pos.0,
        row: pos.1,
        columnSpan: 1,
        rowSpan: 1,
        fit: .cover,
        overflowCount: itemCount > Self.maxCells && i == 3 ? itemCount - 3 : 0)
    }
    return EchoMediaCollagePlan(columnCount: 2, rowCount: 2, cells: cells)
  }
}
