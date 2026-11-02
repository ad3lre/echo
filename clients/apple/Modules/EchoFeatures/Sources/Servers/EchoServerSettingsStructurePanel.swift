import EchoDomain
import SwiftUI

/// Web `ServerSettingsStructureSection` — drag-by-handle reorder + nudge arrows.
struct EchoServerSettingsStructurePanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  var baseURL: URL? = nil
  var accessToken: String? = nil
  @Binding var localError: String?

  @State private var busyID: String?
  @State private var dragging: DragKind?
  @State private var dropLine: DropLine?

  private enum DragKind: Equatable {
    case category(String)
    case channel(String)
  }

  private struct DropLine: Equatable {
    enum Kind: Equatable {
      case category
      case channel(bucketKey: String)
    }
    let kind: Kind
    /// Insert before this index in the destination list; `count` = append.
    let index: Int
  }

  private struct CategoryBucket: Identifiable {
    let id: String
    let name: String
    let position: Int
    let channels: [EchoGuildChannel]
    var isUncategorized: Bool { id == Self.uncategorizedID }
    static let uncategorizedID = "__none__"
  }

  private var buckets: [CategoryBucket] {
    let channels = model.channels(for: server.id).filter(\.isListable)
    var order: [String] = []
    var map: [String: (name: String, position: Int, channels: [EchoGuildChannel])] = [:]
    for channel in channels {
      let catID =
        channel.categoryID.isEmpty ? CategoryBucket.uncategorizedID : channel.categoryID
      if map[catID] == nil {
        order.append(catID)
        map[catID] = (
          name: channel.categoryName.isEmpty
            ? EchoCopy.string("Uncategorized") : channel.categoryName,
          position: channel.categoryPosition,
          channels: []
        )
      }
      map[catID]?.channels.append(channel)
    }
    // Always keep an Uncategorized bucket so channels can be dragged out of categories.
    if map[CategoryBucket.uncategorizedID] == nil {
      order.insert(CategoryBucket.uncategorizedID, at: 0)
      map[CategoryBucket.uncategorizedID] = (
        name: EchoCopy.string("Uncategorized"),
        position: -1,
        channels: []
      )
    }
    return order.compactMap { id in
      guard var bucket = map[id] else { return nil }
      bucket.channels.sort {
        if $0.position != $1.position { return $0.position < $1.position }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }
      return CategoryBucket(
        id: id, name: bucket.name, position: bucket.position, channels: bucket.channels)
    }
    .sorted {
      if $0.isUncategorized != $1.isUncategorized { return $0.isUncategorized }
      if $0.position != $1.position { return $0.position < $1.position }
      return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
  }

  /// Real categories only — matches web `realCategoryIds` (excludes uncategorized).
  private var realCategories: [CategoryBucket] {
    buckets.filter { !$0.isUncategorized }
  }

  private var namedChannelSections: [CategoryBucket] {
    buckets.filter { !$0.isUncategorized }
  }

  private var uncategorizedBucket: CategoryBucket? {
    buckets.first(where: \.isUncategorized)
  }

  private var isBusy: Bool { busyID != nil }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(
        EchoCopy.string(
          "Drag the grip on a row to reorder. You can also use the arrows."
        )
      )
      .font(.system(size: 13))
      .foregroundStyle(EchoTheme.Color.ink(0.5))

      if realCategories.count > 1 {
        categoryOrderSection
      }

      ForEach(Array(namedChannelSections.enumerated()), id: \.element.id) { index, bucket in
        channelSection(bucket, accentIndex: index)
      }

      if let uncategorizedBucket {
        channelSection(uncategorizedBucket, accentIndex: namedChannelSections.count)
      }
    }
    .task {
      if model.channels(for: server.id).isEmpty {
        await model.loadChannels(for: server.id)
      }
    }
  }

  // MARK: - Category order

  private var categoryOrderSection: some View {
    EchoSettingsPanel(
      title: EchoCopy.string("Category order"),
      subtitle: EchoCopy.string("Drag categories to change their order in the channel list.")
    ) {
      VStack(alignment: .leading, spacing: 2) {
        ForEach(Array(realCategories.enumerated()), id: \.element.id) { index, bucket in
          dropIndicator(
            active: dropLine?.kind == .category && dropLine?.index == index
          )
          categoryOrderRow(bucket, index: index)
        }
        dropIndicator(
          active: dropLine?.kind == .category && dropLine?.index == realCategories.count
        )
        Color.clear
          .frame(height: dragging != nil ? 10 : 0)
          .dropDestination(for: String.self) { items, _ in
            commitCategoryDrop(items: items, insertBeforeIndex: realCategories.count)
          } isTargeted: { hovering in
            updateCategoryDropTarget(hovering: hovering, index: realCategories.count)
          }
      }
    }
  }

  private func categoryOrderRow(_ bucket: CategoryBucket, index: Int) -> some View {
    let dragToken = "cat:\(bucket.id)"
    return HStack(spacing: 10) {
      dragHandle(token: dragToken, enabled: !isBusy) {
        dragging = .category(bucket.id)
      }
      Text("\(index + 1)")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .frame(minWidth: 22)
        .padding(.horizontal, 4)
        .padding(.vertical, 3)
        .background(
          EchoTheme.Color.ink(0.06),
          in: RoundedRectangle(cornerRadius: 6, style: .continuous)
        )
      Text(bucket.name)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 8)
      Text(
        EchoCopy.format(
          "%d channels",
          bucket.channels.count
        )
      )
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(EchoTheme.Color.ink(0.42))
      .textCase(.uppercase)
      nudgeButtons(
        canUp: index > 0,
        canDown: index < realCategories.count - 1,
        busy: busyID == bucket.id
      ) { delta in
        Task { await nudgeCategory(bucket.id, by: delta) }
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      dragging == .category(bucket.id)
        ? EchoTheme.Color.ink(0.06) : Color.clear,
      in: RoundedRectangle(cornerRadius: 10, style: .continuous)
    )
    .opacity(isBusy && busyID != bucket.id ? 0.55 : 1)
    .dropDestination(for: String.self) { items, _ in
      commitCategoryDrop(items: items, insertBeforeIndex: index)
    } isTargeted: { hovering in
      updateCategoryDropTarget(hovering: hovering, index: index)
    }
  }

  // MARK: - Channel sections

  private func channelSection(_ bucket: CategoryBucket, accentIndex: Int) -> some View {
    EchoSettingsPanel {
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 8) {
          if !bucket.isUncategorized {
            Text("\(realCategories.firstIndex(where: { $0.id == bucket.id }).map { $0 + 1 } ?? 1)")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.5))
              .frame(minWidth: 22)
              .padding(.horizontal, 4)
              .padding(.vertical, 3)
              .background(
                EchoTheme.Color.ink(0.08),
                in: RoundedRectangle(cornerRadius: 6, style: .continuous)
              )
          }
          Text(bucket.name.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(1.4)
            .foregroundStyle(EchoTheme.Color.ink(0.55))
          Spacer(minLength: 8)
          Text(EchoCopy.format("%d channels", bucket.channels.count))
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
            .textCase(.uppercase)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(categoryAccent(accentIndex), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

        if bucket.channels.isEmpty {
          Text(EchoCopy.string("No channels in this category."))
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.45))
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .dropDestination(for: String.self) { items, _ in
              commitChannelDrop(
                items: items, bucket: bucket, insertBeforeIndex: 0)
            } isTargeted: { hovering in
              updateChannelDropTarget(
                hovering: hovering, bucketKey: bucket.id, index: 0)
            }
        } else {
          VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(bucket.channels.enumerated()), id: \.element.id) {
              chIndex, channel in
              dropIndicator(
                active: dropLine?.kind == .channel(bucketKey: bucket.id)
                  && dropLine?.index == chIndex
              )
              channelRow(channel, in: bucket, index: chIndex)
            }
            dropIndicator(
              active: dropLine?.kind == .channel(bucketKey: bucket.id)
                && dropLine?.index == bucket.channels.count
            )
            Color.clear
              .frame(height: dragging != nil ? 10 : 0)
              .dropDestination(for: String.self) { items, _ in
                commitChannelDrop(
                  items: items, bucket: bucket,
                  insertBeforeIndex: bucket.channels.count)
              } isTargeted: { hovering in
                updateChannelDropTarget(
                  hovering: hovering, bucketKey: bucket.id,
                  index: bucket.channels.count)
              }
          }
        }
      }
    }
  }

  private func channelRow(
    _ channel: EchoGuildChannel, in bucket: CategoryBucket, index: Int
  ) -> some View {
    let dragToken = "ch:\(channel.id)"
    return HStack(spacing: 10) {
      dragHandle(token: dragToken, enabled: !isBusy) {
        dragging = .channel(channel.id)
      }
      channelGlyph(channel)
      Text(channel.name)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(EchoTheme.Color.fg)
        .lineLimit(1)
      Spacer(minLength: 8)
      nudgeButtons(
        canUp: index > 0,
        canDown: index < bucket.channels.count - 1,
        busy: busyID == channel.id
      ) { delta in
        Task { await nudgeChannel(channel, in: bucket, by: delta) }
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      dragging == .channel(channel.id)
        ? EchoTheme.Color.ink(0.06) : EchoTheme.Color.ink(0.025),
      in: RoundedRectangle(cornerRadius: 8, style: .continuous)
    )
    .opacity(isBusy && busyID != channel.id ? 0.55 : 1)
    .dropDestination(for: String.self) { items, _ in
      commitChannelDrop(items: items, bucket: bucket, insertBeforeIndex: index)
    } isTargeted: { hovering in
      updateChannelDropTarget(hovering: hovering, bucketKey: bucket.id, index: index)
    }
  }

  // MARK: - Shared chrome

  private func dragHandle(token: String, enabled: Bool, onStart: @escaping () -> Void)
    -> some View
  {
    Image(systemName: "line.3.horizontal")
      .font(.system(size: 12, weight: .bold))
      .foregroundStyle(EchoTheme.Color.ink(enabled ? 0.45 : 0.22))
      .frame(width: 20, height: 28)
      .contentShape(Rectangle())
      .opacity(enabled ? 1 : 0.35)
      .draggable(token) {
        onStart()
        return Text(EchoCopy.string("Moving…"))
          .font(.system(size: 12, weight: .semibold))
          .padding(8)
      }
      .help(EchoCopy.string("Drag to reorder"))
      .allowsHitTesting(enabled)
  }

  private func channelGlyph(_ channel: EchoGuildChannel) -> some View {
    Group {
      if let baseURL {
        EchoChannelIcon(
          channel: channel, baseURL: baseURL, accessToken: accessToken, size: 16)
      } else {
        Image(systemName: channel.isVoiceLike ? "speaker.wave.2" : "number")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }
    }
    .frame(width: 16, height: 16)
  }

  private func dropIndicator(active: Bool) -> some View {
    Rectangle()
      .fill(EchoTheme.Color.signInBlue)
      .frame(height: active ? 2 : 0)
      .padding(.horizontal, 4)
      .opacity(active ? 1 : 0)
  }

  private func categoryAccent(_ index: Int) -> Color {
    let accents: [Color] = [
      Color.purple.opacity(0.12),
      Color.cyan.opacity(0.12),
      Color.green.opacity(0.12),
      Color.orange.opacity(0.12),
    ]
    return accents[index % accents.count]
  }

  private func nudgeButtons(
    canUp: Bool, canDown: Bool, busy: Bool, action: @escaping (Int) -> Void
  ) -> some View {
    HStack(spacing: 4) {
      Button { action(-1) } label: {
        Image(systemName: "chevron.up")
          .font(.system(size: 11, weight: .bold))
          .frame(width: 24, height: 24)
      }
      .disabled(!canUp || busy)
      Button { action(1) } label: {
        Image(systemName: "chevron.down")
          .font(.system(size: 11, weight: .bold))
          .frame(width: 24, height: 24)
      }
      .disabled(!canDown || busy)
    }
    .buttonStyle(.plain)
    .foregroundStyle(EchoTheme.Color.ink(0.55))
  }

  // MARK: - Drop targeting

  private func updateCategoryDropTarget(hovering: Bool, index: Int) {
    if hovering, case .category = dragging {
      dropLine = DropLine(kind: .category, index: index)
    } else if dropLine?.kind == .category, dropLine?.index == index {
      dropLine = nil
    }
  }

  private func updateChannelDropTarget(hovering: Bool, bucketKey: String, index: Int) {
    if hovering, case .channel = dragging {
      dropLine = DropLine(kind: .channel(bucketKey: bucketKey), index: index)
    } else if dropLine?.kind == .channel(bucketKey: bucketKey), dropLine?.index == index {
      dropLine = nil
    }
  }

  private func commitCategoryDrop(items: [String], insertBeforeIndex: Int) -> Bool {
    defer {
      dragging = nil
      dropLine = nil
    }
    guard let token = items.first, let id = parseCategoryID(token) else { return false }
    let ids = realCategories.map(\.id)
    guard
      let sibling = Self.reorderInsertIndex(
        orderedIDs: ids, draggedID: id,
        insertBeforeID: insertBeforeIndex < ids.count ? ids[insertBeforeIndex] : nil)
    else { return false }
    Task { await moveCategory(id, siblingIndex: sibling) }
    return true
  }

  private func commitChannelDrop(
    items: [String], bucket: CategoryBucket, insertBeforeIndex: Int
  ) -> Bool {
    defer {
      dragging = nil
      dropLine = nil
    }
    guard let token = items.first, let id = parseChannelID(token) else { return false }
    let ids = bucket.channels.map(\.id)
    guard
      let sibling = Self.reorderInsertIndex(
        orderedIDs: ids, draggedID: id,
        insertBeforeID: insertBeforeIndex < ids.count ? ids[insertBeforeIndex] : nil)
    else { return false }
    Task {
      await moveChannel(
        id: id,
        targetCategoryID: bucket.isUncategorized ? nil : bucket.id,
        siblingIndex: sibling
      )
    }
    return true
  }

  private func parseChannelID(_ token: String) -> String? {
    if token.hasPrefix("ch:") { return String(token.dropFirst(3)) }
    // Fallback: bare id from older transfer
    if !token.hasPrefix("cat:") { return token }
    return nil
  }

  private func parseCategoryID(_ token: String) -> String? {
    if token.hasPrefix("cat:") { return String(token.dropFirst(4)) }
    return nil
  }

  /// Web `reorderInsertIndex` — index into the list **after** removing the dragged id.
  static func reorderInsertIndex(
    orderedIDs: [String], draggedID: String, insertBeforeID: String?
  ) -> Int? {
    let without = orderedIDs.filter { $0 != draggedID }
    guard let insertBeforeID else { return without.count }
    if insertBeforeID == draggedID { return nil }
    return without.firstIndex(of: insertBeforeID) ?? without.count
  }

  // MARK: - Mutations

  private func nudgeCategory(_ categoryID: String, by delta: Int) async {
    let ids = realCategories.map(\.id)
    guard let current = ids.firstIndex(of: categoryID) else { return }
    let nextPosition = current + 1 + delta
    let target = min(max(1, nextPosition), ids.count)
    if target == current + 1 { return }
    let without = ids.filter { $0 != categoryID }
    let insertAt = min(max(0, target - 1), without.count)
    let insertBeforeID = insertAt < without.count ? without[insertAt] : nil
    guard
      let sibling = Self.reorderInsertIndex(
        orderedIDs: ids, draggedID: categoryID, insertBeforeID: insertBeforeID)
    else { return }
    await moveCategory(categoryID, siblingIndex: sibling)
  }

  private func nudgeChannel(
    _ channel: EchoGuildChannel, in bucket: CategoryBucket, by delta: Int
  ) async {
    let ids = bucket.channels.map(\.id)
    guard let current = ids.firstIndex(of: channel.id) else { return }
    let nextPosition = current + 1 + delta
    let target = min(max(1, nextPosition), ids.count)
    if target == current + 1 { return }
    let without = ids.filter { $0 != channel.id }
    let insertAt = min(max(0, target - 1), without.count)
    let insertBeforeID = insertAt < without.count ? without[insertAt] : nil
    guard
      let sibling = Self.reorderInsertIndex(
        orderedIDs: ids, draggedID: channel.id, insertBeforeID: insertBeforeID)
    else { return }
    await moveChannel(
      id: channel.id,
      targetCategoryID: bucket.isUncategorized ? nil : bucket.id,
      siblingIndex: sibling
    )
  }

  private func moveCategory(_ categoryID: String, siblingIndex: Int) async {
    localError = nil
    busyID = categoryID
    defer {
      busyID = nil
      dragging = nil
      dropLine = nil
    }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.patchCategory(
        serverID: server.id,
        categoryID: categoryID,
        siblingIndex: max(0, siblingIndex),
        accessToken: token
      )
      await model.loadChannels(for: server.id)
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t reorder that category."))
    }
  }

  private func moveChannel(
    id channelID: String,
    targetCategoryID: String?,
    siblingIndex: Int
  ) async {
    localError = nil
    busyID = channelID
    defer {
      busyID = nil
      dragging = nil
      dropLine = nil
    }

    let channel = model.channels(for: server.id).first { $0.id == channelID }
    let sourceCategoryID: String? = {
      guard let raw = channel?.categoryID.trimmingCharacters(in: .whitespacesAndNewlines),
        !raw.isEmpty
      else { return nil }
      return raw
    }()

    var patch = EchoChannelPatch()
    patch.siblingIndex = max(0, siblingIndex)
    if sourceCategoryID != targetCategoryID {
      if let targetCategoryID {
        patch.category = .set(targetCategoryID)
      } else {
        patch.category = .clear
      }
      // Required when leaving a category or crossing between categories.
      if sourceCategoryID != nil {
        patch.moveOutOfCategoryPermission = "keep"
      }
    }

    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.patchChannel(
        channelID: channelID, patch: patch, accessToken: token)
      await model.loadChannels(for: server.id)
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t reorder that channel."))
    }
  }
}
