import EchoDomain
import EchoNetworking
import SwiftUI

#if os(iOS)
  import UIKit
#endif

struct EchoExploreView: View {
  let baseURL: URL
  /// Shell-owned model (preloaded) — keeps Explore warm across tab switches.
  var model: EchoExploreModel? = nil
  /// Join or Open — hand the server id to the shell so Servers can present it.
  var onOpenServer: ((String) -> Void)? = nil

  @Environment(EchoAuthenticationModel.self) private var auth
  @Environment(EchoDisplayPreferences.self) private var displayPrefs
  @Environment(EchoShellChrome.self) private var shellChrome
  @Environment(\.colorScheme) private var colorScheme
  @State private var localModel: EchoExploreModel?
  @State private var accessToken = ""
  @FocusState private var searchFocused: Bool

  private var activeModel: EchoExploreModel? { model ?? localModel }

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

  /// Duo / wide: even column counts so cards don’t straddle the fold.
  private var exploreColumnCount: Int {
    let layout = shellChrome.layout
    guard layout.usesSplitChrome else { return 1 }
    let width = max(layout.size.width - scrollTrailingInset - 36, 320)
    let raw = Int(width / 300)
    let count = max(2, min(4, raw))
    if layout.prefersEvenColumns, count % 2 == 1 {
      return max(2, count - 1)
    }
    return count
  }

  var body: some View {
    let _ = displayPrefs.applyForcedColorScheme(systemScheme: colorScheme)
    return NavigationStack {
      Group {
        if let activeModel {
          content(activeModel)
        } else {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .background(EchoHomeBackground().ignoresSafeArea())
      .navigationTitle(EchoCopy.string("Explore"))
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .echoNavigationChrome(blendsWithCanvas: true)
      #if os(iOS)
        .toolbar(searchFocused ? .hidden : .automatic, for: .navigationBar)
      #endif
    }
    .padding(.leading, scrollLeadingInset)
    .padding(.trailing, scrollTrailingInset)
    .onChange(of: searchFocused) { _, focused in
      shellChrome.listSearchActive = focused
    }
    .onChange(of: shellChrome.resignListSearchRequest) { _, _ in
      dismissSearchKeyboard()
    }
    .onDisappear {
      if searchFocused {
        shellChrome.listSearchActive = false
      }
    }
    .task {
      accessToken = (try? await auth.ensureAccessToken()) ?? ""
      if let model {
        await model.loadIfNeeded()
        return
      }
      let next = localModel ?? EchoExploreModel(baseURL: baseURL, auth: auth)
      localModel = next
      await next.loadIfNeeded()
    }
  }

  @ViewBuilder
  private func content(_ model: EchoExploreModel) -> some View {
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
      emptyState
    } else {
      VStack(spacing: 0) {
        if let joinError = model.joinErrorMessage {
          joinErrorBanner(joinError, model: model)
        }
        ScrollView(showsIndicators: false) {
          // Top-level LazyVStack — a plain VStack was forcing every card to build
          // on first Explore visit (big tab-switch hitch).
          // Search + recommended stay first; Featured sits under the filters.
          LazyVStack(alignment: .leading, spacing: 18) {
            controlsSection(model)
            if !model.featured.isEmpty {
              featuredSection(model)
            }
            resultsSection(model)
          }
          // Theme flips bake into row ink via EchoTheme — recycle lazy rows so
          // Sunny brown names don’t stick until the user scrolls.
          .id(displayPrefs.appearanceGeneration)
          .padding(.horizontal, 18)
          .padding(.top, 4)
          .padding(.bottom, scrollBottomInset)
          .frame(maxWidth: .infinity, alignment: .topLeading)
          .contentShape(Rectangle())
          .simultaneousGesture(
            TapGesture().onEnded { dismissSearchKeyboard() }
          )
        }
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await model.reload() }
      }
    }
  }

  private func joinErrorBanner(_ message: String, model: EchoExploreModel) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.circle.fill")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(EchoTheme.Color.ink(0.55))
      Text(message)
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.78))
        .frame(maxWidth: .infinity, alignment: .leading)
      Button {
        model.clearJoinError()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
          .frame(width: 28, height: 28)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Dismiss"))
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(EchoTheme.Color.ink(0.08))
  }

  private func dismissSearchKeyboard() {
    guard searchFocused else { return }
    searchFocused = false
    shellChrome.listSearchActive = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  private var emptyState: some View {
    VStack(spacing: 10) {
      Image("EchoTabExploreFilled", bundle: .main)
        .renderingMode(.template)
        .resizable()
        .scaledToFit()
        .frame(width: 36, height: 36)
        .foregroundStyle(EchoTheme.Color.ink(0.35))
      Text(EchoCopy.string("Nothing in Explore yet"))
        .font(.system(size: 20, weight: .semibold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.92))
      Text(EchoCopy.string("Public communities will show up here when they’re listed in the directory."))
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.48))
        .multilineTextAlignment(.center)
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func featuredSection(_ model: EchoExploreModel) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(EchoCopy.string("Featured now"))
          .font(.system(size: 16, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.94))
        Spacer()
        Text(EchoCopy.string("Swipe"))
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.38))
          .textCase(.uppercase)
          .tracking(1.2)
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 12) {
          ForEach(model.featured) { listed in
            EchoExploreFeaturedCard(
              listed: listed,
              baseURL: baseURL,
              accessToken: accessToken,
              isJoined: listed.alreadyMember || model.joinedIDs.contains(listed.id),
              isJoining: model.joiningIDs.contains(listed.id),
              onJoin: {
                dismissSearchKeyboard()
                Task { await join(listed, model: model) }
              }
            )
            .frame(width: 280)
            // Keep the whole card (banner + footer) in the scroll hit region.
            .contentShape(Rectangle())
          }
        }
        // Trailing slack so the last card isn’t flush against the edge.
        .padding(.trailing, 4)
        .contentShape(Rectangle())
      }
      // Nested in the vertical Explore scroll — prefer horizontal pans here.
      .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }
  }

  private func controlsSection(_ model: EchoExploreModel) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(EchoCopy.string("Recommended communities"))
          .font(.system(size: 20, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.94))
        Text(model.resultCountLabel)
          .font(.system(size: 13, weight: .regular, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.45))
      }

      HStack(spacing: 10) {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(EchoTheme.Color.ink(0.42))
          TextField(
            EchoCopy.string("Search by name, description, or tag"),
            text: Binding(
              get: { model.searchQuery },
              set: {
                model.searchQuery = $0
                model.resetPaging()
              }
            )
          )
          .font(.system(size: 15, weight: .regular, design: .rounded))
          .focused($searchFocused)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          // While focused, a tap on the field dismisses — don’t keep rebinding the caret.
          .overlay {
            if searchFocused {
              Color.clear
                .contentShape(Rectangle())
                .onTapGesture { dismissSearchKeyboard() }
            }
          }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(
          EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )

        if !model.searchQuery.isEmpty || model.selectedTag != nil {
          Button(EchoCopy.string("Clear")) {
            dismissSearchKeyboard()
            model.clearFilters()
          }
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.62))
        }
      }

      HStack(alignment: .center, spacing: 10) {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            EchoExploreTagChip(
              title: EchoCopy.string("All"),
              count: nil,
              selected: model.selectedTag == nil
            ) {
              dismissSearchKeyboard()
              model.selectedTag = nil
              model.resetPaging()
            }

            let visible = Array(model.quickFilters.prefix(model.filtersExpanded ? 12 : 5))
            ForEach(visible) { filter in
              EchoExploreTagChip(
                title: filter.label,
                count: filter.count,
                selected: model.selectedTag == filter.tag
              ) {
                dismissSearchKeyboard()
                model.toggleTag(filter.tag)
              }
            }

            if model.quickFilters.count > 5 {
              EchoExploreTagChip(
                title: model.filtersExpanded
                  ? EchoCopy.string("Less")
                  : EchoCopy.format("More %lld", Int64(model.quickFilters.count - 5)),
                count: nil,
                selected: model.filtersExpanded
              ) {
                dismissSearchKeyboard()
                model.filtersExpanded.toggle()
              }
            }
          }
        }

        Menu {
          ForEach(EchoExploreDirectory.SortMode.allCases) { mode in
            Button {
              dismissSearchKeyboard()
              model.setSort(mode)
            } label: {
              if model.sortMode == mode {
                Label(mode.title, systemImage: "checkmark")
              } else {
                Text(mode.title)
              }
            }
          }
          if model.sortMode == .alphabetical {
            Divider()
            Button {
              model.alphabeticalDescending.toggle()
              model.resetPaging()
            } label: {
              Text(model.alphabeticalDescending ? "Z–A" : "A–Z")
            }
          }
        } label: {
          HStack(spacing: 4) {
            Text(model.sortMode.title)
              .font(.system(size: 11, weight: .bold, design: .rounded))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
              .lineLimit(1)
            if model.sortMode == .alphabetical {
              Text(model.alphabeticalDescending ? "Z–A" : "A–Z")
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(EchoTheme.Color.ink(0.40))
            }
            Image(systemName: "chevron.up.chevron.down")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
          }
          .padding(.horizontal, 10)
          .frame(height: 34)
          .background(
            EchoTheme.Color.ink(0.06), in: Capsule(style: .continuous)
          )
        }
      }
    }
  }

  @ViewBuilder
  private func resultsSection(_ model: EchoExploreModel) -> some View {
    if model.visibleServers.isEmpty {
      Text(EchoCopy.string("No communities match those filters."))
        .font(.system(size: 14, weight: .regular, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.48))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    } else {
      let columnCount = exploreColumnCount
      let spacing: CGFloat = shellChrome.layout.prefersEvenColumns ? 20 : 14
      let columns = Array(
        repeating: GridItem(.flexible(), spacing: spacing),
        count: columnCount
      )
      LazyVGrid(columns: columns, spacing: spacing) {
        ForEach(model.visibleServers) { listed in
          EchoExploreServerCard(
            listed: listed,
            baseURL: baseURL,
            accessToken: accessToken,
            isJoined: listed.alreadyMember || model.joinedIDs.contains(listed.id),
            isJoining: model.joiningIDs.contains(listed.id),
            onJoin: {
              dismissSearchKeyboard()
              Task { await join(listed, model: model) }
            }
          )
        }
      }
      if model.canLoadMore {
        Button(EchoCopy.string("Load more")) {
          dismissSearchKeyboard()
          model.loadMore()
        }
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
      }
    }
  }

  private func join(
    _ listed: EchoExploreDirectory.ListedServer, model: EchoExploreModel
  ) async {
    if listed.alreadyMember || model.joinedIDs.contains(listed.id) {
      onOpenServer?(listed.id)
      return
    }
    let ok = await model.join(listed)
    if ok {
      onOpenServer?(listed.id)
    }
    // Failures surface via `joinErrorBanner` — never silent.
  }
}
