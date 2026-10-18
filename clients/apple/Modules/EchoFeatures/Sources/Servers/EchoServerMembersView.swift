import EchoDomain
import SwiftUI

struct EchoServerMembersView: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  /// Optional escape hatch when a host still wants the full profile path.
  var onSelectMember: ((EchoServerMember) -> Void)? = nil

  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var colorScheme
  @State private var selectedMember: EchoServerMember?
  @State private var fullProfileMember: EchoServerMember?
  @State private var showGuests = false
  @State private var kickTarget: EchoServerMember?
  @State private var banTarget: EchoServerMember?
  @State private var timeoutTarget: EchoServerMember?

  private var preferLight: Bool { colorScheme == .light }
  private var sections: [EchoMemberListSection] {
    model.memberSections(
      for: server.id, preferLight: preferLight, hideGuests: !showGuests)
  }
  private var guestCount: Int {
    model.members(for: server.id).filter(\.isGuest).count
  }

  var body: some View {
    let members = model.members(for: server.id)
    NavigationStack {
      Group {
        if model.isLoadingMembers && members.isEmpty {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = model.membersErrorMessage, members.isEmpty {
          Text(error)
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.55))
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if members.isEmpty {
          Text(EchoCopy.string("No members yet."))
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.48))
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          List {
            ForEach(sections) { section in
              Section {
                ForEach(section.members) { member in
                  memberRow(member)
                }
              } header: {
                HStack(spacing: 8) {
                  Circle()
                    .fill(
                      Color(hex: section.colorHex) ?? EchoTheme.Color.ink(0.35)
                    )
                    .frame(width: 8, height: 8)
                  Text(section.title.uppercased())
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(EchoTheme.Color.ink(0.42))
                  Text(EchoCopy.format("— %lld", Int64(section.members.count)))
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(EchoTheme.Color.ink(0.32))
                }
              }
            }

            if guestCount > 0 {
              Section {
                Button {
                  showGuests.toggle()
                } label: {
                  Text(
                    showGuests
                      ? EchoCopy.string("Hide guests")
                      : EchoCopy.format("Show guests (%d)", guestCount)
                  )
                  .font(.system(size: 14, weight: .medium, design: .rounded))
                  .foregroundStyle(EchoTheme.Color.ink(0.55))
                  .frame(maxWidth: .infinity, alignment: .center)
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.clear)
              }
            }
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
        }
      }
      .background(EchoHomeBackground().ignoresSafeArea())
      .navigationTitle(EchoCopy.string("Members"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(EchoCopy.string("Done")) { dismiss() }
        }
      }
      .task { await model.loadMembers(for: server.id) }
      .sheet(item: $selectedMember) { member in
        EchoGuildMemberQuickProfile(
          server: server,
          member: member,
          model: model,
          baseURL: baseURL,
          accessToken: accessToken,
          onOpenFullProfile: {
            selectedMember = nil
            if let onSelectMember {
              onSelectMember(member)
            } else {
              fullProfileMember = member
            }
          }
        )
      }
      #if os(iOS)
        .fullScreenCover(item: $fullProfileMember) { member in
          EchoFullProfileView(
            profile: EchoUserProfile(
              id: member.userID,
              name: member.name,
              username: member.username,
              avatarURL: member.avatarURL
            ),
            presenceStatus: nil,
            baseURL: baseURL,
            accessToken: accessToken ?? ""
          )
        }
      #else
        .sheet(item: $fullProfileMember) { member in
          EchoFullProfileView(
            profile: EchoUserProfile(
              id: member.userID,
              name: member.name,
              username: member.username,
              avatarURL: member.avatarURL
            ),
            presenceStatus: nil,
            baseURL: baseURL,
            accessToken: accessToken ?? ""
          )
        }
      #endif
      .confirmationDialog(
        EchoCopy.string("Kick member?"),
        isPresented: Binding(
          get: { kickTarget != nil },
          set: { if !$0 { kickTarget = nil } }
        ),
        titleVisibility: .visible,
        presenting: kickTarget
      ) { member in
        Button(EchoCopy.string("Kick"), role: .destructive) {
          Task { await model.kick(server: server, member: member) }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: { member in
        Text(EchoCopy.format("Remove %@ from %@?", member.name, server.name))
      }
      .confirmationDialog(
        EchoCopy.string("Ban member?"),
        isPresented: Binding(
          get: { banTarget != nil },
          set: { if !$0 { banTarget = nil } }
        ),
        titleVisibility: .visible,
        presenting: banTarget
      ) { member in
        Button(EchoCopy.string("Ban"), role: .destructive) {
          Task { await model.ban(server: server, member: member) }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: { member in
        Text(EchoCopy.format("Ban %@ from %@?", member.name, server.name))
      }
      .confirmationDialog(
        EchoCopy.string("Timeout member?"),
        isPresented: Binding(
          get: { timeoutTarget != nil },
          set: { if !$0 { timeoutTarget = nil } }
        ),
        titleVisibility: .visible,
        presenting: timeoutTarget
      ) { member in
        Button(EchoCopy.string("Timeout 1 hour"), role: .destructive) {
          Task { await model.timeout(server: server, member: member, minutes: 60) }
        }
        Button(EchoCopy.string("Cancel"), role: .cancel) {}
      } message: { member in
        Text(EchoCopy.format("Disable communication for %@?", member.name))
      }
      .alert(
        EchoCopy.string("Couldn’t update member"),
        isPresented: Binding(
          get: { model.memberActionErrorMessage != nil },
          set: { if !$0 { model.clearMemberActionError() } }
        )
      ) {
        Button(EchoCopy.string("OK"), role: .cancel) { model.clearMemberActionError() }
      } message: {
        Text(model.memberActionErrorMessage ?? "")
      }
    }
  }

  @ViewBuilder
  private func memberRow(_ member: EchoServerMember) -> some View {
    Button {
      selectedMember = member
    } label: {
      HStack(spacing: 12) {
        ZStack(alignment: .bottomTrailing) {
          EchoMediaImage(
            source: member.avatarURL, baseURL: baseURL, accessToken: accessToken
          ) {
            EchoGeneratedAvatar(name: member.name, seed: member.userID)
          }
          .clipShape(Circle())
          .frame(width: 40, height: 40)

          if isOwner(member) {
            Image(systemName: "crown.fill")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(EchoTheme.Color.ownerCrown)
              .padding(2)
              .background(Circle().fill(EchoTheme.Color.ink(0.06)))
              .offset(x: 2, y: 2)
          }
        }

        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(member.name)
              .font(.system(size: 16, weight: .semibold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.94))
              .lineLimit(1)
            if member.isGuest {
              Text(EchoCopy.string("Guest"))
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.50))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(
                  EchoTheme.Color.ink(0.08), in: Capsule())
            }
          }
          if let username = member.username, !username.isEmpty {
            Text("@\(username)")
              .font(.system(size: 12, weight: .regular, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
              .lineLimit(1)
          }
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.28))
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
    .contextMenu {
      if model.canManageRolesUI(for: server.id) {
        Button {
          selectedMember = member
        } label: {
          Label(EchoCopy.string("Manage roles"), systemImage: "person.badge.key")
        }
      }
      if model.canTimeout(server, targetUserID: member.userID) {
        Button {
          timeoutTarget = member
        } label: {
          Label(EchoCopy.string("Timeout"), systemImage: "clock.badge.exclamationmark")
        }
      }
      if model.canKick(server, targetUserID: member.userID) {
        Button(role: .destructive) {
          kickTarget = member
        } label: {
          Label(EchoCopy.string("Kick"), systemImage: "figure.walk")
        }
      }
      if model.canBan(server, targetUserID: member.userID) {
        Button(role: .destructive) {
          banTarget = member
        } label: {
          Label(EchoCopy.string("Ban"), systemImage: "hammer.fill")
        }
      }
    }
  }

  private func isOwner(_ member: EchoServerMember) -> Bool {
    guard let owner = server.ownerID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !owner.isEmpty
    else { return false }
    return owner == member.userID
  }
}
