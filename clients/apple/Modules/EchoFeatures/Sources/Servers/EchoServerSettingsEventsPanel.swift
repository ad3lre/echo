import EchoDomain
import EchoNetworking
import PhotosUI
import SwiftUI

/// Web `ServerSettingsEventsSection` — community events (`/servers/:id/events`).
struct EchoServerSettingsEventsPanel: View {
  let server: EchoServerSummary
  let model: EchoServersModel
  let baseURL: URL
  var accessToken: String? = nil
  @Binding var localError: String?

  private enum LocationKind: String, CaseIterable, Identifiable {
    case voice, text, custom
    var id: String { rawValue }
  }

  @State private var events: [EchoServerEvent] = []
  @State private var loading = false
  @State private var saving = false
  @State private var cancellingID: String?
  @State private var expandedID: String?
  @State private var cancelTarget: EchoServerEvent?
  @State private var notice: String?

  // Editor
  @State private var editorOpen = false
  @State private var editingID: String?
  @State private var editingHadMirror = false
  @State private var title = ""
  @State private var details = ""
  @State private var startsAt = Date()
  @State private var endsAt = Date()
  @State private var locationKind: LocationKind = .voice
  @State private var channelID = ""
  @State private var customLocation = ""
  @State private var imageURL = ""
  @State private var mirrorToDiscord = false
  @State private var coverItem: PhotosPickerItem?
  @State private var coverUploading = false
  @State private var titleError: String?
  @State private var startError: String?
  @State private var endError: String?

  private var channels: [EchoGuildChannel] { model.channels(for: server.id) }
  private var voiceChannels: [EchoGuildChannel] { channels.filter(\.isVoiceLike) }
  private var textChannels: [EchoGuildChannel] { channels.filter(\.isTextLike) }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .top) {
        EchoSettingsSectionHeading(
          title: EchoCopy.string("Community events"),
          subtitle: EchoCopy.string(
            "Schedule voice hangouts, game nights, and meetups. Members can RSVP."))
        Spacer(minLength: 12)
        if !editorOpen {
          EchoDesktopPrimaryButton(title: EchoCopy.string("New event"), enabled: !saving) {
            openCreate()
          }
        }
      }

      if let notice { EchoSettingsStatusLine(message: notice) }

      if editorOpen { editor }

      if loading && events.isEmpty {
        ProgressView()
      } else if events.isEmpty && !editorOpen {
        Text(EchoCopy.string("No events scheduled yet."))
          .font(.system(size: 13))
          .foregroundStyle(EchoTheme.Color.ink(0.5))
          .echoSettingsCard()
      } else {
        ForEach(events) { event in
          eventCard(event)
        }
      }
    }
    .task { await reload() }
    .onChange(of: coverItem) { _, item in
      guard let item else { return }
      Task { await uploadCover(item) }
    }
    .alert(
      EchoCopy.string("Cancel this event?"),
      isPresented: Binding(
        get: { cancelTarget != nil },
        set: { if !$0 { cancelTarget = nil } })
    ) {
      Button(EchoCopy.string("Cancel event"), role: .destructive) {
        if let target = cancelTarget { Task { await cancel(target) } }
        cancelTarget = nil
      }
      Button(EchoCopy.string("Keep"), role: .cancel) { cancelTarget = nil }
    } message: {
      Text(
        EchoCopy.format(
          "%@ will be marked as cancelled for everyone.", cancelTarget?.title ?? ""))
    }
  }

  // MARK: - Cards

  private func eventCard(_ event: EchoServerEvent) -> some View {
    let expanded = expandedID == event.id
    return VStack(alignment: .leading, spacing: 10) {
      Button {
        expandedID = expanded ? nil : event.id
      } label: {
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 4) {
            Text(event.title)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.fg)
              .strikethrough(event.isCancelled)
              .multilineTextAlignment(.leading)
            Text(whenLabel(event))
              .font(.system(size: 12))
              .foregroundStyle(EchoTheme.Color.ink(0.55))
            if !event.locationSummary.isEmpty {
              Label(event.locationSummary, systemImage: "mappin.and.ellipse")
                .font(.system(size: 12))
                .foregroundStyle(EchoTheme.Color.ink(0.5))
            }
          }
          Spacer(minLength: 8)
          VStack(alignment: .trailing, spacing: 4) {
            statusPill(event)
            Text(EchoCopy.format("%d going", event.goingCount))
              .font(.system(size: 11))
              .foregroundStyle(EchoTheme.Color.ink(0.45))
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if expanded {
        if !event.imageURL.isEmpty {
          EchoMediaImage(source: event.imageURL, baseURL: baseURL, accessToken: accessToken) {
            EchoTheme.Color.ink(0.08)
          }
          .frame(height: 140)
          .frame(maxWidth: .infinity)
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        if !event.description.isEmpty {
          Text(event.description)
            .font(.system(size: 13))
            .foregroundStyle(EchoTheme.Color.ink(0.7))
            .fixedSize(horizontal: false, vertical: true)
        }
        if event.hasDiscordMirror {
          Label(EchoCopy.string("Listed on Discord"), systemImage: "link")
            .font(.system(size: 12))
            .foregroundStyle(EchoTheme.Color.ink(0.5))
        }
        if !event.isCancelled {
          HStack(spacing: 8) {
            EchoSettingsSecondaryButton(title: EchoCopy.string("Edit")) { openEdit(event) }
            EchoSettingsDangerButton(
              title: cancellingID == event.id
                ? EchoCopy.string("Cancelling…") : EchoCopy.string("Cancel event"),
              disabled: cancellingID != nil
            ) {
              cancelTarget = event
            }
          }
        }
      }
    }
    .echoSettingsCard()
  }

  private func statusPill(_ event: EchoServerEvent) -> some View {
    let (label, color): (String, Color) = {
      if event.isCancelled { return (EchoCopy.string("Cancelled"), EchoTheme.Color.mentionPing) }
      let now = Date()
      if let start = event.startDate, let end = event.endDate {
        if now >= start && now <= end {
          return (EchoCopy.string("Happening now"), EchoTheme.Color.presenceOnline)
        }
        if now > end { return (EchoCopy.string("Ended"), EchoTheme.Color.ink(0.5)) }
      }
      return (EchoCopy.string("Scheduled"), EchoTheme.Color.signInBlue)
    }()
    return Text(label)
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(color)
      .padding(.horizontal, 10)
      .padding(.vertical, 4)
      .background(color.opacity(0.14), in: Capsule())
  }

  private func whenLabel(_ event: EchoServerEvent) -> String {
    guard let start = event.startDate else { return event.startsAt }
    let startText = start.formatted(date: .abbreviated, time: .shortened)
    guard let end = event.endDate else { return startText }
    let sameDay = Calendar.current.isDate(start, inSameDayAs: end)
    let endText =
      sameDay
      ? end.formatted(date: .omitted, time: .shortened)
      : end.formatted(date: .abbreviated, time: .shortened)
    return "\(startText) – \(endText)"
  }

  // MARK: - Editor

  private var editor: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Text(editingID == nil ? EchoCopy.string("New event") : EchoCopy.string("Edit event"))
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.fg)
        Spacer()
        EchoDesktopGhostButton(title: EchoCopy.string("Close")) { closeEditor() }
      }

      EchoSettingsPanel(
        title: EchoCopy.string("Details"),
        subtitle: EchoCopy.string("Title and description shown on the event card.")
      ) {
        VStack(alignment: .leading, spacing: 14) {
          VStack(alignment: .leading, spacing: 4) {
            EchoDesktopLabeledField(title: EchoCopy.string("Title")) {
              TextField(EchoCopy.string("Friday game night"), text: $title)
            }
            if let titleError {
              EchoSettingsStatusLine(message: titleError, isError: true)
            }
          }
          EchoDesktopLabeledField(title: EchoCopy.string("Description"), minHeight: 88) {
            TextField(
              EchoCopy.string("What should people know?"), text: $details, axis: .vertical
            )
            .lineLimit(3...6)
          }
        }
      }

      EchoSettingsPanel(
        title: EchoCopy.string("Schedule"),
        subtitle: EchoCopy.string("When the event starts and ends.")
      ) {
        HStack(alignment: .top, spacing: 14) {
          VStack(alignment: .leading, spacing: 4) {
            EchoSettingsDateTimeField(
              title: EchoCopy.string("Starts"),
              date: $startsAt,
              minimumDate: Date(),
              invalid: startError != nil,
              disabled: saving
            )
            if let startError { EchoSettingsStatusLine(message: startError, isError: true) }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          VStack(alignment: .leading, spacing: 4) {
            EchoSettingsDateTimeField(
              title: EchoCopy.string("Ends"),
              date: $endsAt,
              minimumDate: startsAt.addingTimeInterval(60),
              invalid: endError != nil,
              disabled: saving
            )
            if let endError { EchoSettingsStatusLine(message: endError, isError: true) }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }

      EchoSettingsPanel(
        title: EchoCopy.string("Location"),
        subtitle: EchoCopy.string(
          "Point members at a voice/text channel or a custom place.")
      ) {
        locationEditor
      }

      EchoSettingsPanel(title: EchoCopy.string("Cover image")) {
        coverEditor
      }

      if server.isDiscordImported && !editingHadMirror {
        EchoSettingsToggleRow(
          title: EchoCopy.string("Also create on Discord"),
          subtitle: EchoCopy.string("Mirror this event to a Discord scheduled event."),
          isOn: $mirrorToDiscord)
      }

      HStack(spacing: 8) {
        Spacer()
        EchoDesktopGhostButton(title: EchoCopy.string("Cancel")) { closeEditor() }
        EchoDesktopPrimaryButton(
          title: saving ? EchoCopy.string("Saving…") : EchoCopy.string("Save event"),
          enabled: !saving && !coverUploading
        ) {
          Task { await save() }
        }
      }
    }
  }

  private var locationEditor: some View {
    VStack(alignment: .leading, spacing: 14) {
      EchoSettingsSegmentedControl(
        selection: $locationKind,
        options: [
          (.voice, EchoCopy.string("Voice")),
          (.text, EchoCopy.string("Text")),
          (.custom, EchoCopy.string("Custom")),
        ],
        disabled: saving
      )
      .onChange(of: locationKind) { _, next in
        guard next != .custom else { return }
        let match = channels.first { $0.id == channelID }
        if match == nil || (next == .voice ? !(match!.isVoiceLike) : !(match!.isTextLike)) {
          channelID = ""
        }
      }

      switch locationKind {
      case .voice:
        EchoSettingsPickerField(
          title: EchoCopy.string("Voice or stage channel"),
          selection: $channelID,
          options: [("", EchoCopy.string("No voice channel"))]
            + voiceChannels.map { ($0.id, $0.name) },
          disabled: saving
        )
      case .text:
        EchoSettingsPickerField(
          title: EchoCopy.string("Text channel"),
          selection: $channelID,
          options: [("", EchoCopy.string("No text channel"))]
            + textChannels.map { ($0.id, "#" + $0.name) },
          disabled: saving
        )
      case .custom:
        EchoDesktopLabeledField(title: EchoCopy.string("Custom venue"), minHeight: 88) {
          TextField(
            EchoCopy.string("Park, address, or link"),
            text: $customLocation,
            axis: .vertical
          )
          .lineLimit(2...5)
          .disabled(saving)
        }
      }
    }
  }

  private var coverEditor: some View {
    VStack(alignment: .leading, spacing: 10) {
      if !imageURL.isEmpty {
        EchoMediaImage(source: imageURL, baseURL: baseURL, accessToken: accessToken) {
          EchoTheme.Color.ink(0.08)
        }
        .frame(height: 140)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(EchoTheme.Color.ink(0.08), lineWidth: 1)
        }
      } else {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(EchoTheme.Color.ink(0.04))
          .frame(height: 88)
          .overlay {
            Text(EchoCopy.string("No cover yet"))
              .font(.system(size: 13))
              .foregroundStyle(EchoTheme.Color.ink(0.42))
          }
      }
      HStack(spacing: 8) {
        PhotosPicker(selection: $coverItem, matching: .images) {
          Text(
            coverUploading
              ? EchoCopy.string("Uploading…")
              : (imageURL.isEmpty
                ? EchoCopy.string("Upload cover") : EchoCopy.string("Replace cover"))
          )
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.75))
          .padding(.horizontal, 12)
          .frame(height: 32)
          .background(
            EchoTheme.Color.ink(0.06),
            in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(coverUploading || saving)
        if !imageURL.isEmpty {
          EchoSettingsDangerButton(title: EchoCopy.string("Remove")) { imageURL = "" }
        }
      }
    }
  }

  // MARK: - Editor lifecycle

  private func openCreate() {
    resetDraft()
    let start = Date().addingTimeInterval(60 * 60)
    startsAt = start
    endsAt = start.addingTimeInterval(2 * 60 * 60)
    editorOpen = true
    expandedID = nil
  }

  private func openEdit(_ event: EchoServerEvent) {
    resetDraft()
    editingID = event.id
    title = event.title
    details = event.description
    startsAt = event.startDate ?? Date()
    endsAt = event.endDate ?? startsAt.addingTimeInterval(2 * 60 * 60)
    imageURL = event.imageURL
    if let custom = event.customLocation, !custom.isEmpty {
      locationKind = .custom
      customLocation = custom
    } else {
      channelID = event.channelID ?? ""
      let channel = channels.first { $0.id == channelID }
      locationKind = channel?.isTextLike == true ? .text : .voice
    }
    editingHadMirror = event.hasDiscordMirror
    editorOpen = true
    expandedID = nil
  }

  private func resetDraft() {
    editingID = nil
    title = ""
    details = ""
    channelID = ""
    customLocation = ""
    imageURL = ""
    locationKind = .voice
    mirrorToDiscord = false
    editingHadMirror = false
    coverItem = nil
    titleError = nil
    startError = nil
    endError = nil
  }

  private func closeEditor() {
    editorOpen = false
    resetDraft()
  }

  private func validate() -> Bool {
    titleError = nil
    startError = nil
    endError = nil
    var ok = true
    if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      titleError = EchoCopy.string("Give the event a title.")
      ok = false
    }
    if startsAt < Date() {
      startError = EchoCopy.string("Start time can’t be in the past.")
      ok = false
    }
    if endsAt <= startsAt {
      endError = EchoCopy.string("End time must be after the start.")
      ok = false
    }
    return ok
  }

  // MARK: - Networking

  private func reload() async {
    loading = true
    defer { loading = false }
    do {
      let token = try await model.auth.ensureAccessToken()
      events = try await model.client.loadServerEvents(serverID: server.id, accessToken: token)
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t load events."))
    }
  }

  private func save() async {
    localError = nil
    notice = nil
    guard validate() else { return }
    saving = true
    defer { saving = false }
    let draft = EchoServerEventDraft(
      title: title,
      description: details,
      imageURL: imageURL,
      startsAt: startsAt,
      endsAt: endsAt,
      channelID: locationKind == .custom ? nil : (channelID.isEmpty ? nil : channelID),
      customLocation: locationKind == .custom ? customLocation : nil,
      mirrorToDiscord: server.isDiscordImported && mirrorToDiscord && !editingHadMirror)
    do {
      let token = try await model.auth.ensureAccessToken()
      let result: EchoServerEventSaveResult
      let created = editingID == nil
      if let editingID {
        result = try await model.client.updateServerEvent(
          serverID: server.id, eventID: editingID, draft: draft, accessToken: token)
      } else {
        result = try await model.client.createServerEvent(
          serverID: server.id, draft: draft, accessToken: token)
      }
      if result.discordMirrorOK == false {
        localError =
          result.discordMirrorMessage
          ?? EchoCopy.string("Echo saved the event, but Discord didn’t accept the listing.")
      } else {
        notice = created ? EchoCopy.string("Event created.") : EchoCopy.string("Event updated.")
      }
      closeEditor()
      await reload()
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t save that event."))
    }
  }

  private func cancel(_ event: EchoServerEvent) async {
    localError = nil
    notice = nil
    cancellingID = event.id
    defer { cancellingID = nil }
    do {
      let token = try await model.auth.ensureAccessToken()
      try await model.client.cancelServerEvent(
        serverID: server.id, eventID: event.id, accessToken: token)
      notice = EchoCopy.string("Event cancelled.")
      await reload()
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t cancel that event."))
    }
  }

  private func uploadCover(_ item: PhotosPickerItem) async {
    defer { coverItem = nil }
    localError = nil
    guard let raw = try? await item.loadTransferable(type: Data.self) else {
      localError = EchoCopy.string("Echo couldn’t read that image.")
      return
    }
    coverUploading = true
    defer { coverUploading = false }
    // Event covers are wide banners — keep them within a sane pixel budget.
    guard let jpeg = EchoSettingsImage.downscaledJPEG(raw, maxPixel: 1600, quality: 0.85) else {
      localError = EchoCopy.string("Use a PNG, JPEG, or GIF image.")
      return
    }
    do {
      let token = try await model.auth.ensureAccessToken()
      do {
        imageURL = try await model.client.uploadServerAsset(
          serverID: server.id,
          purpose: "server_event_cover",
          data: jpeg,
          filename: "event-cover.jpg",
          mimeType: "image/jpeg",
          accessToken: token)
      } catch let error as EchoHomeClientError {
        // Object storage not configured: same inline `data:` fallback as web.
        guard case .server(let status, _, _) = error, status == 503 else { throw error }
        let inline = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        guard inline.count <= 590_000 else {
          localError = EchoCopy.string("That image is too large to store. Try a smaller one.")
          return
        }
        imageURL = inline
      }
    } catch {
      localError = echoSettingsErrorMessage(
        error, fallback: EchoCopy.string("Echo couldn’t upload that cover image."))
    }
  }
}
