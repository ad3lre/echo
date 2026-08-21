import EchoDomain
import SwiftUI

struct EchoPollDisplay: View {
  let poll: EchoPoll
  let currentUserID: String
  var currentUserDisplayName: String = EchoCopy.string("You")
  var resolveVoterName: (String) -> String = { _ in "Unknown" }
  let onVote: (String) -> Void

  @State private var showingVoters = false

  private var totalVotes: Int { poll.totalVotes }
  private var showTallies: Bool { poll.hasEnded || poll.hasVoted(userID: currentUserID) }
  private var showWhoVoted: Bool { !poll.anonymous }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(poll.question)
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.94))
        .fixedSize(horizontal: false, vertical: true)

      VStack(spacing: 6) {
        ForEach(poll.options) { option in
          Button {
            onVote(option.id)
          } label: {
            optionRow(option)
          }
          .buttonStyle(.plain)
          .disabled(poll.hasEnded || poll.isSelected(optionID: option.id, userID: currentUserID))
          .accessibilityLabel(option.text)
        }
      }

      HStack(alignment: .firstTextBaseline, spacing: 10) {
        if showTallies {
          Text(totalVotes == 1 ? EchoCopy.format("%lld vote total", totalVotes) : EchoCopy.format("%lld votes total", totalVotes))
        } else {
          EchoCopy.text("Results hidden until you vote")
        }
        if showWhoVoted {
          Button(EchoCopy.string("View who voted")) { showingVoters = true }
            .foregroundStyle(accent)
            .fontWeight(.medium)
        }
        Spacer(minLength: 8)
        TimelineView(.periodic(from: .now, by: 60)) { context in
          if let label = formatPollTimeRemaining(poll.endsAt, now: context.date) {
            Text(label)
              .foregroundStyle(poll.hasEnded ? accent.opacity(0.72) : .white.opacity(0.42))
          }
        }
      }
      .font(.system(size: 11, design: .rounded))
      .foregroundStyle(.white.opacity(0.42))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .frame(maxWidth: 400, alignment: .leading)
    .background(
      EchoTheme.Color.elevated.opacity(0.98),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(.white.opacity(0.08), lineWidth: 1)
    }
    .sheet(isPresented: $showingVoters) {
      EchoPollVotersSheet(
        poll: poll,
        currentUserID: currentUserID,
        currentUserDisplayName: currentUserDisplayName,
        resolveVoterName: resolveVoterName
      )
    }
  }

  private func optionRow(_ option: EchoPollOption) -> some View {
    let selected = poll.isSelected(optionID: option.id, userID: currentUserID)
    let percent =
      totalVotes == 0 ? 0 : Int((Double(option.votes) / Double(totalVotes) * 100).rounded())
    var tally = option.votes == 1
      ? EchoCopy.format("%lld vote", option.votes)
      : EchoCopy.format("%lld votes", option.votes)
    if totalVotes > 0 {
      tally += " · \(percent)%"
    }
    return HStack(spacing: 8) {
      if let emoji = option.emoji, !emoji.isEmpty {
        Text(emoji)
      }
      Text(option.text)
        .lineLimit(2)
        .foregroundStyle(.white.opacity(0.92))
      Spacer(minLength: 8)
      if showTallies {
        Text(tally)
          .font(.system(size: 11, weight: .regular, design: .rounded).monospacedDigit())
          .foregroundStyle(.white.opacity(0.48))
      }
    }
    .font(.system(size: 14, design: .rounded))
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(Color.white.opacity(selected ? 0.04 : 0.03))
        .overlay(alignment: .leading) {
          if showTallies {
            GeometryReader { geo in
              accent.opacity(0.15)
                .frame(width: geo.size.width * CGFloat(percent) / 100)
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          }
        }
    }
    .overlay {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .stroke(selected ? accent.opacity(0.40) : .white.opacity(0.07), lineWidth: 1)
    }
    .opacity(poll.hasEnded ? 0.80 : 1)
  }

  private var accent: Color { EchoTheme.Color.indigoBright }
}

private struct EchoPollVotersSheet: View {
  let poll: EchoPoll
  let currentUserID: String
  let currentUserDisplayName: String
  let resolveVoterName: (String) -> String
  @Environment(\.dismiss) private var dismiss
  @State private var selectedOptionID: String

  init(
    poll: EchoPoll,
    currentUserID: String,
    currentUserDisplayName: String,
    resolveVoterName: @escaping (String) -> String
  ) {
    self.poll = poll
    self.currentUserID = currentUserID
    self.currentUserDisplayName = currentUserDisplayName
    self.resolveVoterName = resolveVoterName
    _selectedOptionID = State(initialValue: poll.options.first?.id ?? "")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          EchoCopy.text("Who voted")
            .font(.system(size: 18, weight: .semibold, design: .rounded))
          Text(poll.question)
            .font(.system(size: 13, design: .rounded))
            .foregroundStyle(.white.opacity(0.48))
            .lineLimit(2)
        }
        Spacer()
        Button {
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(.white.opacity(0.45))
            .frame(width: 30, height: 30)
            .background(.white.opacity(0.06), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EchoCopy.string("Close"))
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 6) {
          ForEach(poll.options) { option in
            Button {
              selectedOptionID = option.id
            } label: {
              HStack(spacing: 6) {
                if let emoji = option.emoji, !emoji.isEmpty { Text(emoji) }
                Text(option.text).lineLimit(1)
                Text("\(option.votes)")
                  .font(.system(size: 10, weight: .semibold, design: .rounded))
                  .padding(.horizontal, 6)
                  .padding(.vertical, 2)
                  .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 5))
              }
              .font(.system(size: 12, weight: .medium, design: .rounded))
              .padding(.horizontal, 10)
              .padding(.vertical, 8)
              .foregroundStyle(selectedOptionID == option.id ? .white : .white.opacity(0.5))
              .background(
                selectedOptionID == option.id
                  ? Color.indigo.opacity(0.18) : .clear,
                in: RoundedRectangle(cornerRadius: 9, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                  .stroke(
                    selectedOptionID == option.id ? Color.indigo.opacity(0.35) : .clear,
                    lineWidth: 1
                  )
              }
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(.top, 16)
      .padding(.bottom, 12)

      Divider().overlay(.white.opacity(0.08))

      let voters = (poll.options.first { $0.id == selectedOptionID }?.voterIDs ?? [])
        .map { id in (id: id, label: voterLabel(id)) }
        .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }

      if voters.isEmpty {
        EchoCopy.text("No votes on this option yet")
          .font(.system(size: 14, design: .rounded))
          .foregroundStyle(.white.opacity(0.42))
          .italic()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView(showsIndicators: false) {
          VStack(spacing: 6) {
            ForEach(voters, id: \.id) { voter in
              HStack(spacing: 10) {
                EchoGeneratedAvatar(name: voter.label, seed: voter.id)
                  .frame(width: 36, height: 36)
                  .clipShape(Circle())
                Text(voter.label)
                  .font(.system(size: 14, design: .rounded))
                  .lineLimit(1)
                Spacer()
              }
              .padding(.vertical, 4)
            }
          }
          .padding(.top, 12)
        }
      }

      HStack {
        Spacer()
        Button(EchoCopy.string("Close")) { dismiss() }
          .font(.system(size: 14, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.55))
          .padding(.horizontal, 14)
          .padding(.vertical, 9)
      }
      .padding(.top, 8)
    }
    .padding(22)
    .frame(minWidth: 360, minHeight: 420)
    .preferredColorScheme(.dark)
  }

  private func voterLabel(_ userID: String) -> String {
    if userID == currentUserID {
      let name = currentUserDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
      return name.isEmpty ? EchoCopy.string("You") : name
    }
    return resolveVoterName(userID)
  }
}

func formatPollTimeRemaining(_ endsAt: String?, now: Date = Date()) -> String? {
  guard let endsAt, let end = EchoPoll.parseDate(endsAt) else { return nil }
  let seconds = end.timeIntervalSince(now)
  if seconds <= 0 {
    let ago = max(0, now.timeIntervalSince(end))
    let minute = Int(ago / 60)
    let hour = minute / 60
    let day = hour / 24
    if day >= 1 { return "Ended \(day) \(day == 1 ? "day" : "days") ago" }
    if hour >= 1 { return "Ended \(hour) \(hour == 1 ? "hour" : "hours") ago" }
    if minute >= 1 { return "Ended \(minute) \(minute == 1 ? "minute" : "minutes") ago" }
    return "Ended just now"
  }
  let minute = Int(seconds / 60)
  let hour = minute / 60
  let day = hour / 24
  if day >= 1 { return "Ends in \(day) \(day == 1 ? "day" : "days")" }
  if hour >= 1 { return "Ends in \(hour) \(hour == 1 ? "hour" : "hours")" }
  if minute >= 1 { return "Ends in \(minute) \(minute == 1 ? "minute" : "minutes")" }
  return "Ends in < 1 minute"
}
