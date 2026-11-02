import EchoDomain
import EchoNetworking
import SwiftUI

#if os(iOS)
  import UIKit
#endif

struct EchoServersView: View {
  let baseURL: URL
  let userID: String
  @Binding var pendingOpenServerID: String?
  /// Shell-owned model (preloaded) — keeps Servers warm across tab switches.
  var model: EchoServersModel? = nil

  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) private var shellChrome
  @Environment(\.colorScheme) private var colorScheme
  @State private var localModel: EchoServersModel?
  @State private var selectedServer: EchoServerSummary?
  @State private var accessToken = ""
  @State private var leaveTarget: EchoServerSummary?
  @State private var showingLeaveConfirm = false
  @State private var isSearching = false
  @State private var searchText = ""
  @FocusState private var searchFieldFocused: Bool
  @State private var attention = EchoAttentionSync.shared
  @State private var markAllServersNote: String?

  private var activeModel: EchoServersModel? { model ?? localModel }

  private var canMarkAllServersRead: Bool {
    EchoServerMarkRead.hasUnreadGuildChannels(
      channelAttention: attention.snapshot.channelAttention)
  }

  private var scrollBottomInset: CGFloat {
    shellChrome.layout.contentBottomInset(tabBarVisible: !shellChrome.suppressTabBar)
  }

  private var scrollTrailingInset: CGFloat {
    guard shellChrome.layout.verticalSystemBarEdge != .leading else { return 0 }
    return shellChrome.layout.contentTrailingInset(tabBarVisible: !shellChrome.suppressTabBar)
  }

  private var scrollLeadingInset: CGFloat {
    guard shellChrome.layout.verticalSystemBarEdge == .leading else { return 0 }
    return shellChrome.layout.contentTrailingInset(tabBarVisible: !shellChrome.suppressTabBar)
  }

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    // Portrait: channel list overlays the server list (tab bar can peek).
    // Landscape / Duo: persistent list column beside channels.
    return Group {
      #if os(macOS)
        macServersBody
      #else
        if shellChrome.layout.usesSplitChrome {
          serversSplitBody
        } else {
          serversStackedBody
        }
      #endif
    }
    .alert(
      EchoCopy.string("Leave server?"),
      isPresented: $showingLeaveConfirm,
      presenting: leaveTarget
    ) { server in
      Button(EchoCopy.string("Leave"), role: .destructive) {
        Task { await activeModel?.leave(server) }
      }
      Button(EchoCopy.string("Cancel"), role: .cancel) {}
    } message: { server in
      Text(EchoCopy.format("Leave %@? You can rejoin later with an invite.", server.name))
    }
    .alert(
      EchoCopy.string("Couldn’t leave server"),
      isPresented: Binding(
        get: { activeModel?.actionErrorMessage != nil },
        set: { if !$0 { activeModel?.clearActionError() } }
      )
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) { activeModel?.clearActionError() }
    } message: {
      Text(activeModel?.actionErrorMessage ?? "")
    }
    .task {
      accessToken = (try? await auth.ensureAccessToken()) ?? ""
      if let model {
        await model.loadIfNeeded()
        await openPendingServerIfNeeded()
        return
      }
      let next = localModel ?? EchoServersModel(baseURL: baseURL, auth: auth)
      localModel = next
      await next.loadIfNeeded()
      await openPendingServerIfNeeded()
    }
    .onChange(of: pendingOpenServerID) { _, _ in
      Task { await openPendingServerIfNeeded() }
    }
    .onChange(of: isSearching) { _, _ in
      syncListSearchChrome()
    }
    .onChange(of: searchFieldFocused) { _, _ in
      syncListSearchChrome()
    }
    .onChange(of: shellChrome.resignListSearchRequest) { _, _ in
      if isSearching || searchFieldFocused {
        closeServersSearch()
      }
    }
    .onChange(of: selectedServer?.id) { _, id in
      shellChrome.activeServerID = id
      // Portrait overlay: leave search when diving into a server.
      // Landscape split keeps the list (and search) beside channels.
      if id != nil, !shellChrome.layout.usesSplitChrome {
        closeServersSearch()
      } else {
        syncListSearchChrome()
      }
    }
    .onChange(of: shellChrome.serversBackRequest) { _, _ in
      #if os(macOS)
        selectedServer = nil
        shellChrome.activeServerID = nil
      #endif
    }
    .onDisappear {
      if selectedServer == nil {
        shellChrome.activeServerID = nil
      }
    }
    .padding(.leading, scrollLeadingInset)
    .padding(.trailing, scrollTrailingInset)
  }

  private func syncListSearchChrome() {
    // Channel overlay owns immersive chrome; list search only while on the list
    // (split chrome keeps the list visible, so search suppress still applies).
    if !shellChrome.layout.usesSplitChrome, selectedServer != nil {
      shellChrome.listSearchActive = false
      return
    }
    shellChrome.listSearchActive = isSearching || searchFieldFocused
  }

  #if os(macOS)
    @ViewBuilder
    private var macServersBody: some View {
      if let selected = selectedServer, let activeModel {
        let server = activeModel.servers.first(where: { $0.id == selected.id }) ?? selected
        EchoServerChannelsView(
          server: server,
          model: activeModel,
          baseURL: baseURL,
          userID: userID,
          accessToken: accessToken,
          onClose: {
            selectedServer = nil
            shellChrome.activeServerID = nil
          }
        )
        .environment(auth)
        .environment(displayPrefs)
        .environment(shellChrome)
        .id(server.id)
      } else {
        VStack(spacing: 8) {
          Text(EchoCopy.string("Select a server"))
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.78))
          Text(EchoCopy.string("Open a community from the rail to start chatting."))
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.46))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(EchoHomeBackground().ignoresSafeArea())
      }
    }
  #endif

  private var serversStackedBody: some View {
    ZStack {
      serversListColumn
      if let server = selectedServer, let activeModel {
        EchoServerChannelsView(
          server: server,
          model: activeModel,
          baseURL: baseURL,
          userID: userID,
          accessToken: accessToken,
          onClose: { selectedServer = nil }
        )
        .environment(auth)
        .environment(displayPrefs)
        .environment(shellChrome)
        .transition(.opacity)
        .zIndex(2)
      }
    }
  }

  @ViewBuilder
  private var serversSplitBody: some View {
    // Book pose: give both halves of the fold to channels | chat.
    // Server list stays one back-tap away (xmark / tab re-select).
    if shellChrome.layout.pose == .book, let server = selectedServer, let activeModel {
      EchoServerChannelsView(
        server: server,
        model: activeModel,
        baseURL: baseURL,
        userID: userID,
        accessToken: accessToken,
        onClose: { selectedServer = nil }
      )
      .environment(auth)
      .environment(displayPrefs)
      .environment(shellChrome)
      .id(server.id)
    } else {
      EchoDuoArrangement(showsSecondary: true) {
        serversListColumn
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } secondary: {
        if let server = selectedServer, let activeModel {
          EchoServerChannelsView(
            server: server,
            model: activeModel,
            baseURL: baseURL,
            userID: userID,
            accessToken: accessToken,
            onClose: { selectedServer = nil }
          )
          .environment(auth)
          .environment(displayPrefs)
          .environment(shellChrome)
          .id(server.id)
        } else {
          serversSplitEmptyDetail
        }
      }
    }
  }

  private var serversListColumn: some View {
    NavigationStack {
      VStack(spacing: 0) {
        serversHeader
        Group {
          if let activeModel {
            content(activeModel)
          } else {
            ProgressView()
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        }
      }
      .background(EchoHomeBackground().ignoresSafeArea())
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
      #endif
      .simultaneousGesture(
        TapGesture().onEnded { dismissServersSearchKeyboard() }
      )
    }
  }

  private var serversSplitEmptyDetail: some View {
    VStack(spacing: 10) {
      Image("EchoTabCommunityFilled", bundle: .main)
        .renderingMode(.template)
        .resizable()
        .scaledToFit()
        .frame(width: 36, height: 36)
        .foregroundStyle(EchoTheme.Color.ink(0.32))
      Text(EchoCopy.string("Select a server"))
        .font(.system(size: 18, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.88))
      Text(EchoCopy.string("Pick a community from the list to browse channels."))
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.46))
        .multilineTextAlignment(.center)
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(EchoHomeBackground().ignoresSafeArea())
  }

  private func openPendingServerIfNeeded() async {
    guard let id = pendingOpenServerID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !id.isEmpty
    else { return }
    let next: EchoServersModel
    if let model {
      next = model
    } else if let localModel {
      next = localModel
    } else {
      next = EchoServersModel(baseURL: baseURL, auth: auth)
      localModel = next
    }
    // Join → Open can race membership; retry a few times before giving up.
    for attempt in 0..<4 {
      await next.reload()
      if let server = next.servers.first(where: { $0.id == id }) {
        next.noteOpened(server)
        selectedServer = server
        pendingOpenServerID = nil
        return
      }
      if attempt < 3 {
        try? await Task.sleep(for: .milliseconds(280 + attempt * 180))
      }
    }
    pendingOpenServerID = nil
  }

  private func dismissServersSearchKeyboard() {
    guard searchFieldFocused else { return }
    searchFieldFocused = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  private func closeServersSearch() {
    withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
      isSearching = false
      searchText = ""
      searchFieldFocused = false
    }
    shellChrome.listSearchActive = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  /// Single-row header: “Servers” + search icon, or an in-place expanding field.
  private var serversHeader: some View {
    HStack(spacing: 10) {
      if isSearching {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.40))
          TextField(EchoCopy.string("Search servers"), text: $searchText)
            .font(.system(size: 16, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.fg)
            .textFieldStyle(.plain)
            .focused($searchFieldFocused)
            .submitLabel(.search)
            #if os(iOS)
              .textInputAutocapitalization(.never)
            #endif
            .autocorrectionDisabled()
          if !searchText.isEmpty {
            Button {
              searchText = ""
            } label: {
              Image(systemName: "xmark.circle.fill")
                .font(.system(size: 15))
                .foregroundStyle(EchoTheme.Color.ink(0.34))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(EchoCopy.string("Clear search"))
          }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .frame(height: 40)
        .background(
          EchoTheme.Color.ink(0.07), in: Capsule(style: .continuous)
        )

        Button(EchoCopy.string("Cancel")) {
          closeServersSearch()
        }
        .font(.system(size: 15, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.72))
        .buttonStyle(.plain)
        .transition(.opacity.combined(with: .move(edge: .trailing)))
      } else {
        Text(EchoCopy.string("Servers"))
          .font(.system(size: 28, weight: .bold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.94))
          .accessibilityAddTraits(.isHeader)
          .frame(maxWidth: .infinity, alignment: .leading)

        if canMarkAllServersRead {
          Button {
            Task { await markAllServersRead() }
          } label: {
            Image(systemName: "envelope.open.fill")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.70))
              .frame(width: 40, height: 40)
              .background(EchoTheme.Color.ink(0.07), in: Circle())
              .contentShape(Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(EchoCopy.string("Mark all as read"))
        }

        Button {
          withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
            isSearching = true
          }
          DispatchQueue.main.async {
            searchFieldFocused = true
          }
        } label: {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.70))
            .frame(width: 40, height: 40)
            .background(
              EchoTheme.Color.ink(0.07), in: Circle()
            )
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Search servers"))
        .transition(.opacity.combined(with: .scale(scale: 0.92)))
      }
    }
    .padding(.horizontal, 18)
    .padding(.top, 6)
    .padding(.bottom, 10)
    .animation(.spring(response: 0.32, dampingFraction: 0.88), value: isSearching)
    .alert(
      EchoCopy.string("Mark all as read"),
      isPresented: Binding(
        get: { markAllServersNote != nil },
        set: { if !$0 { markAllServersNote = nil } })
    ) {
      Button(EchoCopy.string("OK"), role: .cancel) { markAllServersNote = nil }
    } message: {
      Text(markAllServersNote ?? "")
    }
  }

  private func markAllServersRead() async {
    let ids = activeModel?.orderedServers.map(\.id) ?? []
    let result = await EchoServerMarkRead.markAllServers(
      serverIDs: ids, baseURL: baseURL, auth: auth, userID: userID)
    switch result {
    case .ok:
      break
    case .empty:
      markAllServersNote = EchoCopy.string("Nothing to mark as read.")
    case .failed:
      markAllServersNote = EchoCopy.string("Echo couldn’t mark servers as read.")
    case .unauthenticated:
      markAllServersNote = EchoCopy.string("Sign in to mark servers as read.")
    }
  }

  private func filteredServers(_ model: EchoServersModel) -> [EchoServerSummary] {
    let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return model.orderedServers }
    return model.orderedServers.filter {
      $0.name.localizedCaseInsensitiveContains(trimmed)
    }
  }

  @ViewBuilder
  private func content(_ model: EchoServersModel) -> some View {
    if model.isLoading && model.servers.isEmpty {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if let error = model.errorMessage, model.servers.isEmpty {
      VStack(spacing: 14) {
        Text(error)
          .font(.system(size: 15, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .multilineTextAlignment(.center)
        Button(EchoCopy.string("Try again")) {
          Task { await model.reload() }
        }
        .buttonStyle(.borderedProminent)
      }
      .padding(28)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if model.servers.isEmpty {
      VStack(spacing: 10) {
        Image("EchoTabCommunity", bundle: .main)
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: 36, height: 36)
          .foregroundStyle(EchoTheme.Color.ink(0.35))
        Text(EchoCopy.string("No servers yet"))
          .font(.system(size: 20, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.92))
        #if os(macOS)
          let emptyHint = EchoCopy.string("Join or create one from Explore.")
        #else
          let emptyHint = EchoCopy.string(
            "Join one from Explore, or create a community on the web.")
        #endif
        Text(emptyHint)
          .font(.system(size: 14, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .multilineTextAlignment(.center)
      }
      .padding(32)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      let servers = filteredServers(model)
      List {
        if servers.isEmpty {
          Text(EchoCopy.string("No servers found."))
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(EchoTheme.Color.ink(0.46))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        } else {
          ForEach(servers) { server in
            Button {
              // First tap while the keyboard is up only dismisses it (DM parity).
              if searchFieldFocused {
                dismissServersSearchKeyboard()
                return
              }
              model.noteOpened(server)
              selectedServer = server
            } label: {
              EchoServerRow(
                server: server,
                baseURL: baseURL,
                accessToken: accessToken,
                isStarred: model.isStarred(server.id)
              )
            }
            .buttonStyle(.plain)
            .listRowBackground(Color.clear)
            .listRowSeparatorTint(EchoTheme.Color.ink(0.08))
            .contextMenu {
              Button {
                model.toggleStar(server)
              } label: {
                Label(
                  model.isStarred(server.id)
                    ? EchoCopy.string("Unstar") : EchoCopy.string("Star"),
                  systemImage: model.isStarred(server.id) ? "star.slash" : "star.fill"
                )
              }
              Button(role: .destructive) {
                leaveTarget = server
                showingLeaveConfirm = true
              } label: {
                Label(
                  EchoCopy.string("Leave server"), systemImage: "rectangle.portrait.and.arrow.right"
                )
              }
            }
          }
        }
      }
      // Observe theme flips for ink redraw without remounting (remount wiped
      // the open server / conversation selection).
      .opacity(displayPrefs.appearanceGeneration >= 0 ? 1 : 1)
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .scrollDismissesKeyboard(.immediately)
      .contentMargins(.bottom, scrollBottomInset, for: .scrollContent)
      .refreshable { await model.reload() }
    }
  }
}
