import EchoDomain
import EchoNetworking
import SwiftUI

extension EchoComposerState {
  /// Replaces a UTF-16 range of the draft and parks the caret `caretFromEnd` units after the
  /// inserted text (negative = back inside it).
  func replace(_ range: NSRange, with insert: String, caretFromEnd: Int = 0) {
    let ns = text as NSString
    let safe = NSRange(
      location: min(max(0, range.location), ns.length),
      length: min(range.length, max(0, ns.length - range.location)))
    text = ns.replacingCharacters(in: safe, with: insert)
    let caret = max(0, safe.location + (insert as NSString).length + caretFromEnd)
    tokenCaretUTF16 = caret
    pendingPreferredTokenOffset = caret
  }

  /// Rich blocks (`![image: …]`, `![button: …]`) must sit on their own line to become blocks.
  func insertBlock(_ token: String) {
    guard !token.isEmpty else { return }
    let ns = text as NSString
    let caret = min(max(0, tokenCaretUTF16), ns.length)
    let needsLeadingBreak =
      caret > 0 && ns.substring(with: NSRange(location: caret - 1, length: 1)) != "\n"
    replace(NSRange(location: caret, length: 0), with: (needsLeadingBreak ? "\n" : "") + token + "\n")
  }

  /// Resolved mention spans — the ranges `@`/`#` autocomplete must not re-open inside.
  var pickedMentionRanges: [Range<Int>] {
    EchoMentionResolver.resolve(text: text, tokens: mentionTokens).map { $0.start..<$0.end }
  }
}

extension EchoMessageComposer {
  // MARK: Visible suggestions

  var mentionSuggestions: [EchoMentionOption] {
    guard let trigger = state.mentionTrigger else { return [] }
    switch trigger.sigil {
    case .at:
      return EchoMentionCatalog.atSuggestions(
        query: trigger.query, options: access.mentionOptions,
        allowBroadcast: access.allowBroadcastMentions)
    case .hash:
      return EchoMentionCatalog.hashSuggestions(query: trigger.query, options: access.mentionOptions)
    }
  }

  var slashSuggestions: [EchoSlashCommand] {
    guard let trigger = state.slashTrigger else { return [] }
    let catalog = EchoSlashCommands.catalog(
      EchoSlashContext(
        mediaAllowed: access.mediaAllowed, pollAllowed: access.pollAllowed, editing: isEditing))
    return Array(
      EchoSlashCommands.filter(catalog, query: trigger.query).prefix(EchoSlashCommands.suggestionLimit))
  }

  @ViewBuilder
  var composerSuggestions: some View {
    let mentions = mentionSuggestions
    let commands = mentions.isEmpty ? slashSuggestions : []
    if !mentions.isEmpty {
      EchoMentionSuggestionList(
        options: mentions, selectedIndex: min(state.suggestionIndex, mentions.count - 1),
        baseURL: baseURL, accessToken: accessToken
      ) { selectMention($0) }
      .transition(.opacity)
    } else if !commands.isEmpty {
      EchoSlashSuggestionList(
        commands: commands, selectedIndex: min(state.suggestionIndex, commands.count - 1)
      ) { selectSlash($0) }
      .transition(.opacity)
    }
  }

  // MARK: Trigger tracking

  func refreshSuggestions() {
    let caret = state.tokenCaretUTF16
    var mention = EchoMentionTriggers.find(
      text: state.text, caret: caret, protectedRanges: state.pickedMentionRanges)
    // Edit mode keeps `@` / `#` autocomplete (web edit composer) but no slash commands.
    var slash: (start: Int, query: String)? =
      mention == nil && !isEditing ? EchoSlashCommands.trigger(text: state.text, caret: caret) : nil
    if let dismissed = state.dismissedTriggerStart {
      if mention?.start == dismissed { mention = nil }
      if slash?.start == dismissed { slash = nil }
      if mention == nil && slash == nil { state.dismissedTriggerStart = nil }
    }
    let changed =
      mention != state.mentionTrigger || slash?.start != state.slashTrigger?.start
      || slash?.query != state.slashTrigger?.query
    state.mentionTrigger = mention
    state.slashTrigger = slash
    if changed { state.suggestionIndex = 0 }
  }

  // MARK: Selection

  func selectMention(_ option: EchoMentionOption) {
    state.insertMention(option, replacing: state.mentionTrigger)
    state.mentionTrigger = nil
    state.suggestionIndex = 0
    refreshSuggestions()
  }

  func selectSlash(_ command: EchoSlashCommand) {
    guard let trigger = state.slashTrigger else { return }
    let caret = min(state.tokenCaretUTF16, (state.text as NSString).length)
    // Drop `/query` (and any command letters typed past a lagging caret) before running it.
    var end = caret
    let ns = state.text as NSString
    let tail = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
    while end < ns.length,
      let scalar = ns.substring(with: NSRange(location: end, length: 1)).unicodeScalars.first,
      tail.contains(scalar)
    {
      end += 1
    }
    state.replace(NSRange(location: trigger.start, length: end - trigger.start), with: "")
    state.slashTrigger = nil
    state.suggestionIndex = 0
    runSlash(command)
  }

  func runSlash(_ command: EchoSlashCommand) {
    switch command.action {
    case .upload: showingFileImporter = true
    case .poll: showingPoll = true
    case .gif:
      state.pickerStartsOnGIFs = true
      state.panel = .emoji
    case .imageSlot(let w, let h):
      state.insertBlock(EchoComposerRichBlocks.imageSlotShortcut(w: w, h: h))
    case .buttonRow(let buttons):
      state.insertBlock(EchoComposerRichBlocks.buttonRowShortcut(buttons))
    case .markdownWrap(let wrap):
      let (prefix, suffix) = wrap.delimiters
      let caret = min(state.tokenCaretUTF16, (state.text as NSString).length)
      state.replace(
        NSRange(location: caret, length: 0), with: prefix + suffix,
        caretFromEnd: -(suffix as NSString).length)
    case .insertText(let text, let offset):
      let caret = min(state.tokenCaretUTF16, (state.text as NSString).length)
      state.replace(NSRange(location: caret, length: 0), with: text, caretFromEnd: offset)
    }
    refreshSuggestions()
  }

  // MARK: Keyboard (macOS) — arrows / Return / Tab / Esc while a popup is open

  /// `true` when the key was consumed by an open suggestion popup.
  func handleMenuKey(_ key: EchoComposerMenuKey) -> Bool {
    let mentions = mentionSuggestions
    let commands = mentions.isEmpty ? slashSuggestions : []
    let count = mentions.isEmpty ? commands.count : mentions.count
    guard count > 0 else { return false }
    switch key {
    case .up:
      state.suggestionIndex = max(0, min(state.suggestionIndex, count - 1) - 1)
    case .down:
      state.suggestionIndex = min(count - 1, state.suggestionIndex + 1)
    case .confirm:
      let index = min(state.suggestionIndex, count - 1)
      if !mentions.isEmpty { selectMention(mentions[index]) } else { selectSlash(commands[index]) }
    case .dismiss:
      state.dismissedTriggerStart = state.mentionTrigger?.start ?? state.slashTrigger?.start
      state.mentionTrigger = nil
      state.slashTrigger = nil
    }
    return true
  }

  // MARK: Send failures

  /// SLOWMODE gets localized copy and restarts the countdown; everything else keeps the
  /// server's own message (web `realtimeMessageFailedUserMessage`).
  func sendFailureMessage(_ error: Error, fallback: String) -> String {
    if EchoSlowmode.isRejection(error) {
      state.slowmodeRejectedAt = Date()
      return EchoSlowmode.rejectionMessage()
    }
    return (error as? LocalizedError)?.errorDescription ?? fallback
  }
}
