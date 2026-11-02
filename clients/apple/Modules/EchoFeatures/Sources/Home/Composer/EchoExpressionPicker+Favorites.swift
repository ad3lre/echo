import EchoNetworking
import SwiftUI

extension EchoExpressionPicker {
  var favoritesContent: some View {
    let favorites = favoritesStore.gifFavorites
    return Group {
      if favorites.isEmpty {
        ContentUnavailableView(
          EchoCopy.string("No favorites yet"),
          systemImage: "star",
          description: Text(EchoCopy.string("Star GIFs while browsing to save them here."))
        )
      } else {
        ScrollView(showsIndicators: false) {
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 5) {
            ForEach(favorites) { fav in
              favoriteTile(fav)
            }
          }
        }
      }
    }
  }

  func favoriteTile(_ fav: EchoMediaFavorite) -> some View {
    ZStack(alignment: .topTrailing) {
      Button {
        onGIF(EchoMediaFavorites.asGIF(fav))
      } label: {
        EchoMediaImage(source: fav.thumbUrl, baseURL: baseURL, accessToken: accessToken) {
          Rectangle().fill(EchoTheme.Color.ink(0.05))
        }
        .frame(height: 92)
        .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(fav.title.isEmpty ? EchoCopy.string("GIF") : fav.title)

      favoriteStarButton(isOn: true) {
        favoritesStore.remove(id: fav.id)
      }
      .padding(6)
    }
  }

  func gifTileWithFavorite(_ gif: EchoGIF) -> some View {
    let favorited = favoritesStore.isGIFFavorited(gif)
    return ZStack(alignment: .topTrailing) {
      Button {
        onGIF(gif)
      } label: {
        EchoMediaImage(source: gif.thumbnailURL, baseURL: baseURL, accessToken: accessToken) {
          Rectangle().fill(EchoTheme.Color.ink(0.05))
        }
        .frame(height: 92)
        .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(gif.title.isEmpty ? EchoCopy.string("GIF") : gif.title)

      favoriteStarButton(isOn: favorited) {
        favoritesStore.toggleGIF(gif)
      }
      .padding(6)
    }
  }

  func favoriteStarButton(isOn: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: isOn ? "star.fill" : "star")
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(isOn ? Color.yellow : EchoTheme.Color.ink(0.85))
        .padding(6)
        .background(.ultraThinMaterial, in: Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      isOn
        ? EchoCopy.string("Remove from favorites")
        : EchoCopy.string("Add to favorites"))
  }
}
