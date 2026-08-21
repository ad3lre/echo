import EchoNetworking
import Observation
import SwiftUI

@MainActor
@Observable
private final class EchoAddFriendModel {
  private let client: EchoSettingsClient
  private let accessToken: String
  private(set) var candidates: [EchoFriendCandidate] = []
  private(set) var isLoading = false
  private(set) var errorMessage: String?
  private(set) var sentIDs = Set<String>()
  private(set) var sendingIDs = Set<String>()

  init(baseURL: URL, accessToken: String) {
    client = EchoSettingsClient(baseURL: baseURL)
    self.accessToken = accessToken
  }

  func search(_ query: String) async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      candidates = try await client.searchFriendCandidates(
        query: query.trimmingCharacters(in: .whitespacesAndNewlines),
        limit: 8,
        accessToken: accessToken
      )
    } catch {
      candidates = []
      if let settingsError = error as? EchoSettingsClientError,
        case .server(let statusCode, _, _) = settingsError,
        statusCode == 404
      {
        errorMessage = "People search is temporarily unavailable while this Echo server updates."
      } else {
        errorMessage = "Echo couldn’t load people right now. Please try again."
      }
    }
  }

  func sendRequest(to candidate: EchoFriendCandidate) async {
    guard !sendingIDs.contains(candidate.id), !sentIDs.contains(candidate.id) else { return }
    sendingIDs.insert(candidate.id)
    defer { sendingIDs.remove(candidate.id) }
    do {
      try await client.sendFriendRequest(peerID: candidate.id, accessToken: accessToken)
      sentIDs.insert(candidate.id)
    } catch {
      errorMessage = "Echo couldn’t send that friend request."
    }
  }
}

struct EchoAddFriendView: View {
  let baseURL: URL
  let accessToken: String

  @Environment(\.dismiss) private var dismiss
  @State private var model: EchoAddFriendModel
  @State private var searchText = ""

  init(baseURL: URL, accessToken: String) {
    self.baseURL = baseURL
    self.accessToken = accessToken
    _model = State(initialValue: EchoAddFriendModel(baseURL: baseURL, accessToken: accessToken))
  }

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 24) {
          HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
              EchoCopy.text("Find your people")
                .font(.system(size: 27, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.96))
              EchoCopy.text("Search Echo or start with a few people you might know.")
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.52))
                .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button(action: { dismiss() }) {
              Image(systemName: "arrow.left")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white.opacity(0.88))
                .frame(width: 40, height: 40)
                .background(.white.opacity(0.08), in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.12), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(EchoCopy.string("Close add friend"))
          }

          HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
              .foregroundStyle(.white.opacity(0.45))
            TextField(EchoCopy.string("Search by name or username"), text: $searchText)
              .font(.system(size: 15, weight: .regular, design: .rounded))
              .foregroundStyle(.white)
              .tint(.white)
              .textFieldStyle(.plain)
              #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
              #endif
          }
          .padding(.horizontal, 15)
          .frame(height: 50)
          .background(.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 17))
          .overlay(RoundedRectangle(cornerRadius: 17).stroke(.white.opacity(0.09)))

          VStack(alignment: .leading, spacing: 9) {
            Text(searchText.isEmpty ? EchoCopy.string("SUGGESTED PEOPLE") : EchoCopy.string("RESULTS"))
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .tracking(2.2)
              .foregroundStyle(.white.opacity(0.38))

            if model.isLoading && model.candidates.isEmpty {
              ProgressView()
                .tint(.white.opacity(0.68))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 26)
            } else if let errorMessage = model.errorMessage, model.candidates.isEmpty {
              VStack(alignment: .leading, spacing: 12) {
                Label(errorMessage, systemImage: "person.2.slash")
                  .font(.system(size: 14, design: .rounded))
                  .foregroundStyle(.white.opacity(0.58))
                Button(EchoCopy.string("Try again")) {
                  Task { await model.search(searchText) }
                }
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .buttonStyle(.bordered)
                .tint(.indigo)
              }
              .padding(.vertical, 20)
            } else if model.candidates.isEmpty {
              Text(searchText.isEmpty ? EchoCopy.string("No suggestions yet.") : EchoCopy.string("No people found."))
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(.white.opacity(0.48))
                .padding(.vertical, 20)
            } else {
              VStack(spacing: 1) {
                ForEach(model.candidates) { candidate in
                  EchoFriendCandidateRow(
                    candidate: candidate,
                    baseURL: baseURL,
                    accessToken: accessToken,
                    isSending: model.sendingIDs.contains(candidate.id),
                    didSend: model.sentIDs.contains(candidate.id),
                    onAdd: { Task { await model.sendRequest(to: candidate) } }
                  )
                }
              }
              .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 20))
              .overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.075)))
            }
          }
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 30)
      }
      .background(EchoAddFriendBackground().ignoresSafeArea())
      .navigationBarBackButtonHidden(true)
      #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
      #endif
    }
    .preferredColorScheme(.dark)
    .task(id: searchText) {
      do {
        try await Task.sleep(for: .milliseconds(searchText.isEmpty ? 0 : 300))
        try Task.checkCancellation()
        await model.search(searchText)
      } catch is CancellationError {
        // A newer query owns the next task; stale searches must not run.
      } catch {
        // Search errors are surfaced by the model.
      }
    }
  }
}

private struct EchoFriendCandidateRow: View {
  let candidate: EchoFriendCandidate
  let baseURL: URL
  let accessToken: String
  let isSending: Bool
  let didSend: Bool
  let onAdd: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      EchoMediaImage(source: candidate.avatarURL, baseURL: baseURL, accessToken: accessToken) {
        EchoGeneratedAvatar(name: candidate.name, seed: candidate.id)
      }
      .clipShape(Circle())
      .frame(width: 44, height: 44)

      VStack(alignment: .leading, spacing: 3) {
        Text(candidate.name)
          .font(.system(size: 15, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.92))
          .lineLimit(1)
        Text("@\(candidate.username)")
          .font(.system(size: 13, weight: .regular, design: .rounded))
          .foregroundStyle(.white.opacity(0.44))
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Button(action: onAdd) {
        Group {
          if isSending {
            ProgressView().tint(.white.opacity(0.85))
          } else if didSend {
            Image(systemName: "checkmark")
          } else {
            Image(systemName: "person.badge.plus")
          }
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(.white.opacity(0.92))
        .frame(width: 36, height: 34)
        .background(
          didSend ? Color.green.opacity(0.22) : Color.indigo.opacity(0.55),
          in: RoundedRectangle(cornerRadius: 12)
        )
      }
      .buttonStyle(.plain)
      .disabled(isSending || didSend)
      .accessibilityLabel(didSend ? EchoCopy.string("Friend request sent") : EchoCopy.format("Add %@", candidate.name))
    }
    .padding(.horizontal, 13)
    .padding(.vertical, 10)
  }
}

private struct EchoAddFriendBackground: View {
  var body: some View {
    ZStack {
      EchoTheme.Color.canvas
      RadialGradient(
        colors: [Color.blue.opacity(0.16), Color.indigo.opacity(0.06), .clear],
        center: UnitPoint(x: 0.88, y: 0.02),
        startRadius: 0,
        endRadius: 380
      )
    }
  }
}
