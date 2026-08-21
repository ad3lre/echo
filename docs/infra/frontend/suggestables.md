# Suggestables (frontend)

Reusable foundation for text-input autocomplete: emoji `:slug:`, `@mention`, `#channel`, and future providers such as slash commands.

## Mental model

1. **Provider config, not a monolith** — Each source implements `SuggestableConfig` (`detectTrigger` → `getSuggestions` → `applySelection`). Keyboard navigation and trigger state live in `useSuggestable`.

2. **UI stays in Vue components** — Popovers (`EmojiAutocompletePopover`, `MentionAutocompletePopover`, …) bind to session refs (`suggestions`, `selectedIndex`, `showPopup`). Suggestables do not render.

3. **Registry for composers** — `useSuggestableRegistry` runs multiple providers and chains `handleKeydown` by `priority` (same order as `ChatInput`: mention → channel → emoji).

4. **Migrate incrementally** — Emoji already delegates to `useEmojiSuggestable`. Mentions and channels can adopt `useSuggestable` without changing popover components.

## Key files

| Piece                                     | Location                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types                                     | [`clients/web/src/suggestables/types.ts`](../../../clients/web/src/suggestables/types.ts)                                                                                                                                |
| Core session                              | [`clients/web/src/suggestables/useSuggestable.ts`](../../../clients/web/src/suggestables/useSuggestable.ts)                                                                                                              |
| Multi-provider registry                   | [`clients/web/src/suggestables/useSuggestableRegistry.ts`](../../../clients/web/src/suggestables/useSuggestableRegistry.ts)                                                                                              |
| Emoji reference adapter                   | [`clients/web/src/suggestables/adapters/emojiSuggestable.ts`](../../../clients/web/src/suggestables/adapters/emojiSuggestable.ts)                                                                                        |
| Emoji public API (unchanged)              | [`clients/web/src/features/chat/emoji/useEmojiAutocomplete.ts`](../../../clients/web/src/features/chat/emoji/useEmojiAutocomplete.ts)                                                                                    |
| Legacy mention/channel (not migrated yet) | [`useMentionAutocomplete.ts`](../../../clients/web/src/features/chat/composables/useMentionAutocomplete.ts), [`useChannelAutocomplete.ts`](../../../clients/web/src/features/chat/composables/useChannelAutocomplete.ts) |

## Add a new suggestable (e.g. slash commands)

1. **Define items** — e.g. `CommandOption { id, name, args? }`.

2. **Implement `SuggestableConfig<CommandOption>`**:
   - `detectTrigger` — match `/command` before the caret (respect word boundaries).
   - `getSuggestions` — filter registered commands by query prefix.
   - `applySelection` — replace trigger range with command text or invoke a handler.
   - `resolveSelectionRange` — optional; extend past caret if query tail can lag.
   - `handleKeydownExtra` — optional; e.g. complete on second `/`.
   - `showWithEmptyQuery` — `true` if bare `/` should list all commands.

3. **Expose a composable** — thin wrapper around `useSuggestable` (see `useEmojiSuggestable`).

4. **Wire the composer** — either keep a dedicated composable + `handleKeydown` chain, or register with `useSuggestableRegistry` and a `priority` between existing providers.

5. **Add a popover** — Vue listbox matching `EmojiAutocompletePopover` patterns (`role="listbox"`, `aria-selected`, `@mousedown.prevent` on items).

### Example skeleton

```ts
import { useSuggestable } from '@/suggestables';
import type { SuggestableConfig } from '@/suggestables';

const SLASH_TRIGGER = /(?:^|\s)\/([a-z0-9_-]*)$/i;

export function createCommandSuggestableConfig(
  commands: CommandOption[],
  insert: (start: number, end: number, cmd: CommandOption) => void,
): SuggestableConfig<CommandOption> {
  return {
    showWithEmptyQuery: true,
    detectTrigger: ({ text, cursor }) => {
      const before = text.slice(0, cursor);
      const match = before.match(SLASH_TRIGGER);
      if (!match) return null;
      const leading = match[0].startsWith('/') ? 0 : 1;
      return {
        start: cursor - match[0].length + leading,
        query: match[1] ?? '',
      };
    },
    getSuggestions: (query) =>
      commands.filter((c) =>
        c.name.toLowerCase().startsWith(query.toLowerCase()),
      ),
    applySelection: (cmd, range) => insert(range.start, range.end, cmd),
  };
}
```

## Migration checklist (mention / channel)

- [ ] Extract `createMentionSuggestableConfig` using existing `findMentionTrigger` and `optionMatchesQuery`.
- [ ] Extract `createChannelSuggestableConfig` using `findChannelTrigger`.
- [ ] Point `useMentionAutocomplete` / `useChannelAutocomplete` at `useSuggestable` (keep exports stable).
- [ ] Optionally replace three separate composables in `ChatInput.vue` with `useSuggestableRegistry`.
- [ ] Add adapter tests beside `useSuggestable.test.ts`.

Parent entry: [docs/README.md](../../README.md).
