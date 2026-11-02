import EchoDomain
import SwiftUI

/// Friend picker for creating a group DM or adding people to one
/// (web `GroupDMCreateModal`, including its add-members mode).
struct EchoGroupDmPickerSheet: View {
  enum Mode: Equatable {
    case create
    /// Ids already in the group (shown as "Already in this conversation", not toggleable).
    case add(existing: Set<String>)
  }

  let mode: Mode
  let baseURL: URL
  let accessToken: String
  /// Friend ids already checked when the sheet opens (web `preselectedIds` from a 1:1 DM header).
  var preselectedIDs: [String] = []
  /// Returns an error message, or `nil` on success (the sheet then closes).
  let onSubmit: (_ name: String, _ members: [EchoUserProfile]) async -> String?
  let onClose: () -> Void

  @Environment(EchoAuthenticationModel.self) private var auth
  @State private var friendsModel: EchoFriendsModel?
  @State private var pickedIDs: [String] = []
  @State private var didApplyPreselection = false
  @State private var name = ""
  @State private var errorMessage: String?
  @State private var isSubmitting = false

  private var isCreate: Bool { mode == .create }
  private var existing: Set<String> {
    if case .add(let ids) = mode { return ids }
    return []
  }
  private var friends: [EchoUserProfile] { friendsModel?.friends ?? [] }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      header
      if isCreate {
        TextField(EchoCopy.string("Group name (optional)"), text: $name)
          .textFieldStyle(.plain)
          .font(.system(size: 14))
          .padding(.horizontal, 12)
          .frame(height: 38)
          .background(
            EchoTheme.Color.elevatedMid, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          .onChange(of: name) { _, next in
            if next.count > EchoGroupDmRules.maxNameLength {
              name = String(next.prefix(EchoGroupDmRules.maxNameLength))
            }
          }
      }
      list
      if let errorMessage {
        Text(errorMessage).font(.system(size: 12)).foregroundStyle(EchoTheme.Color.mentionPing)
      }
      footer
    }
    .padding(20)
    #if os(macOS)
      .frame(width: 440, height: 560)
    #endif
    .background(EchoTheme.Color.elevatedDeep.ignoresSafeArea())
    .task {
      let model = friendsModel ?? EchoFriendsModel(baseURL: baseURL, auth: auth)
      friendsModel = model
      await model.load()
      applyPreselectionIfNeeded()
    }
    .onChange(of: friends.map(\.id)) { _, _ in
      applyPreselectionIfNeeded()
    }
  }

  private func applyPreselectionIfNeeded() {
    guard isCreate, !didApplyPreselection, !friends.isEmpty else { return }
    let friendIDs = Set(friends.map(\.id))
    let seeded = preselectedIDs.filter { friendIDs.contains($0) }
    guard !seeded.isEmpty else {
      didApplyPreselection = true
      return
    }
    pickedIDs = Array(seeded.prefix(EchoGroupDmRules.maxPicks))
    didApplyPreselection = true
  }

  private var header: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 3) {
        Text(isCreate ? EchoCopy.string("New group DM") : EchoCopy.string("Add Members"))
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(EchoTheme.Color.fg)
        Text(
          isCreate
            ? EchoCopy.string(
              "Choose friends to add to this private conversation (minimum 3 people including you)."
            )
            : EchoCopy.string("Select friends to add to this group.")
        )
        .font(.system(size: 12))
        .foregroundStyle(EchoTheme.Color.ink(0.5))
        .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
  }

  @ViewBuilder
  private var list: some View {
    if friendsModel?.isLoading != false && friends.isEmpty {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if friends.isEmpty {
      Text(EchoCopy.string("You have no friends yet. Add some from the Friends tab first."))
        .font(.system(size: 13)).foregroundStyle(EchoTheme.Color.ink(0.5))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ScrollView(showsIndicators: false) {
        LazyVStack(spacing: 2) {
          ForEach(friends) { friend in row(friend) }
        }
      }
    }
  }

  private func row(_ friend: EchoUserProfile) -> some View {
    let locked = existing.contains(friend.id)
    let on = locked || pickedIDs.contains(friend.id)
    return Button {
      toggle(friend.id)
    } label: {
      HStack(spacing: 12) {
        EchoMediaImage(source: friend.avatarURL, baseURL: baseURL, accessToken: accessToken) {
          EchoGeneratedAvatar(name: friend.name, seed: friend.id)
        }
        .frame(width: 34, height: 34)
        .clipShape(Circle())
        VStack(alignment: .leading, spacing: 1) {
          Text(friend.name).font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.fg)
          if locked {
            Text(EchoCopy.string("Already in this conversation"))
              .font(.system(size: 11)).foregroundStyle(EchoTheme.Color.ink(0.45))
          }
        }
        Spacer()
        Image(systemName: on ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 18))
          .foregroundStyle(on ? EchoTheme.Color.signInBlue : EchoTheme.Color.ink(0.3))
      }
      .padding(.vertical, 6).padding(.horizontal, 6)
      .contentShape(Rectangle())
      .opacity(locked ? 0.55 : 1)
      .echoPointerHoverFill(
        isSelected: on && !locked,
        selectedFill: EchoTheme.Color.ink(0.06),
        hoverFill: EchoTheme.Color.ink(0.07),
        cornerRadius: 10)
    }
    .buttonStyle(.plain)
    .disabled(locked)
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  private var footer: some View {
    HStack {
      Text(EchoCopy.format("%lld selected", Int64(pickedIDs.count)))
        .font(.system(size: 12)).foregroundStyle(EchoTheme.Color.ink(0.5))
      Spacer()
      Button(EchoCopy.string("Cancel"), action: onClose)
        .buttonStyle(.plain).foregroundStyle(EchoTheme.Color.ink(0.6))
        .font(.system(size: 13, weight: .semibold))
        .padding(.trailing, 8)
      Button {
        Task { await submit() }
      } label: {
        Text(isCreate ? EchoCopy.string("Create Group DM") : EchoCopy.string("Add Members"))
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.onAccent)
          .padding(.horizontal, 14).frame(height: 34)
          .background(EchoTheme.Color.signInBlue, in: Capsule())
          .opacity(isSubmitting || pickedIDs.isEmpty ? 0.5 : 1)
      }
      .buttonStyle(.plain)
      .disabled(isSubmitting || pickedIDs.isEmpty)
    }
  }

  private func toggle(_ id: String) {
    errorMessage = nil
    if let index = pickedIDs.firstIndex(of: id) {
      pickedIDs.remove(at: index)
    } else if pickedIDs.count < EchoGroupDmRules.maxPicks {
      pickedIDs.append(id)
    }
  }

  private func submit() async {
    let picked = pickedIDs.compactMap { id in friends.first { $0.id == id } }
    if isCreate, let message = EchoGroupDmRules.createError(pickCount: picked.count) {
      errorMessage = message
      return
    }
    isSubmitting = true
    let trimmed = EchoGroupDmRules.clampName(name)
    let finalName = trimmed.isEmpty && isCreate ? EchoGroupDmRules.defaultName(for: picked) : trimmed
    // Create: dismiss immediately (web `GroupDMCreateModal`), then finish on the parent.
    // Add-members stays open so validation/errors remain visible in-sheet.
    if isCreate {
      onClose()
      _ = await onSubmit(finalName, picked)
      return
    }
    defer { isSubmitting = false }
    if let failure = await onSubmit(finalName, picked) {
      errorMessage = failure
    } else {
      onClose()
    }
  }
}
