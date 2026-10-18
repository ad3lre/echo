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
  @Environment(\.colorScheme) private var colorScheme
  @State private var localModel: EchoExploreModel?
  @State private var accessToken = ""
  @FocusState private var searchFocused: Bool

  private var activeModel: EchoExploreModel? { model ?? localModel }

  var body: some View {
    NavigationStack {
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
      .echoNavigationChrome()
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
        .padding(.horizontal, 18)
        .padding(.top, 4)
        .padding(.bottom, 72)
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

  private func dismissSearchKeyboard() {
    guard searchFocused else { return }
    searchFocused = false
    #if os(iOS)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
  }

  private var emptyState: some View {
    VStack(spacing: 10) {
      Image("EchoTabExplore", bundle: .main)
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
          }
        }
      }
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
    if await model.join(listed) {
      onOpenServer?(listed.id)
    }
  }
}
