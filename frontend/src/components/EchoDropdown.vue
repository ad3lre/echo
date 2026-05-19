<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
  useId,
} from 'vue';

export interface EchoDropdownOption {
  label: string;
  value: string;
  /** Optional leading icon (e.g. channel glyph). */
  iconSrc?: string;
  /** Extra classes on the icon `<img>` (e.g. Tailwind `invert`). */
  iconClass?: string;
  /**
   * Channel-style bundled SVG / hash glyph (monochrome). Server dropdowns use this to
   * render light icons on dark theme without ad-hoc `filter` classes.
   */
  iconMono?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: EchoDropdownOption[];
    label?: string;
    /** When set, shown on the trigger instead of the selected option label (e.g. dynamic suffix). */
    triggerLabel?: string;
    /** Tighter padding for inline toolbars (e.g. Explore sort). */
    compact?: boolean;
    disabled?: boolean;
    searchable?: boolean;
    /**
     * Render the menu in a Teleport to document.body with position:fixed so it stays above
     * modals that use transform/overflow (e.g. server settings audit filters).
     */
    teleportMenu?: boolean;
    /**
     * Use global `--srv-*` tokens (server settings inputs / role menus). Safe with `teleport-menu`
     * because those variables live on the document theme root.
     */
    surface?: 'default' | 'server';
    /**
     * When true, the open menu is exactly the trigger width (no `w-max` expansion).
     * Use in tight forms (e.g. channel settings slowmode) so the panel doesn’t outgrow its column.
     */
    menuMatchTriggerWidth?: boolean;
    /** With `surface="server"`, no inset ring on the trigger (focus uses outline). */
    borderless?: boolean;
  }>(),
  {
    teleportMenu: false,
    surface: 'default',
    menuMatchTriggerWidth: true,
    borderless: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isOpen = ref(false);
const openUpward = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const menuPanelRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const searchTerm = ref('');
const listboxId = useId();
const triggerId = useId();
/** When opening via keyboard, move focus to first/last option (non-searchable menus). */
const pendingListFocus = ref<'first' | 'last' | null>(null);

const MENU_MAX_HEIGHT = 240;
const GAP = 8;
/** Approximate row height for option buttons (py-2.5 + line). */
const OPTION_ROW_APPROX_PX = 44;
const MENU_VERTICAL_CHROME_PX = 16;
const SEARCH_BLOCK_APPROX_PX = 48;

const fixedMenuStyle = ref<Record<string, string>>({});

function estimatedMenuHeight(): number {
  const n = Math.max(1, props.options.length);
  const searchSlack = props.searchable ? SEARCH_BLOCK_APPROX_PX : 0;
  const raw = MENU_VERTICAL_CHROME_PX + searchSlack + n * OPTION_ROW_APPROX_PX;
  return Math.min(MENU_MAX_HEIGHT, Math.max(raw, 72));
}

/**
 * Prefer opening downward; open upward when the viewport cannot fit the menu
 * below the trigger, or when there is clearly more usable space above.
 */
function computeOpenUpward(): boolean {
  const el = triggerRef.value;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const need = estimatedMenuHeight();
  if (spaceBelow >= need) return false;
  if (spaceAbove >= need) return true;
  return spaceAbove > spaceBelow;
}

function syncTeleportMenuGeometry() {
  if (!props.teleportMenu || !triggerRef.value) return;
  if (isOpen.value) {
    openUpward.value = computeOpenUpward();
  }
  const r = triggerRef.value.getBoundingClientRect();
  const upward = openUpward.value;
  const spaceBelow = window.innerHeight - r.bottom - GAP;
  const spaceAbove = r.top - GAP;
  const cap = Math.max(
    80,
    Math.min(MENU_MAX_HEIGHT, upward ? spaceAbove : spaceBelow),
  );
  const w = `${r.width}px`;
  const match = props.menuMatchTriggerWidth;
  if (upward) {
    fixedMenuStyle.value = {
      left: `${r.left}px`,
      minWidth: w,
      width: match ? w : 'max-content',
      maxHeight: `${cap}px`,
      bottom: `${window.innerHeight - r.top + GAP}px`,
      top: 'auto',
    };
  } else {
    fixedMenuStyle.value = {
      left: `${r.left}px`,
      minWidth: w,
      width: match ? w : 'max-content',
      maxHeight: `${cap}px`,
      top: `${r.bottom + GAP}px`,
      bottom: 'auto',
    };
  }
}

function onScrollOrResize() {
  if (isOpen.value && props.teleportMenu) syncTeleportMenuGeometry();
}

function focusOptionEdge(edge: 'first' | 'last') {
  nextTick(() => {
    const panel = menuPanelRef.value;
    if (!panel) return;
    const opts = panel.querySelectorAll<HTMLElement>(
      'button.echo-dropdown-option',
    );
    if (!opts.length) return;
    (edge === 'first' ? opts[0] : opts[opts.length - 1])?.focus();
  });
}

function toggle() {
  if (props.disabled) return;
  if (!isOpen.value && triggerRef.value) {
    openUpward.value = computeOpenUpward();
  }
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    if (props.teleportMenu) {
      nextTick(() => syncTeleportMenuGeometry());
    }
    if (props.searchable) {
      searchTerm.value = '';
      pendingListFocus.value = null;
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    } else if (pendingListFocus.value) {
      const edge = pendingListFocus.value;
      pendingListFocus.value = null;
      nextTick(() => {
        if (props.teleportMenu) syncTeleportMenuGeometry();
        focusOptionEdge(edge);
      });
    }
  } else {
    pendingListFocus.value = null;
  }
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (props.disabled) return;

  if (e.key === 'Escape') {
    if (isOpen.value) {
      e.preventDefault();
      isOpen.value = false;
    }
    return;
  }

  if (isOpen.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusOptionEdge('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusOptionEdge('last');
    }
    return;
  }

  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pendingListFocus.value = 'first';
    toggle();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    pendingListFocus.value = 'last';
    toggle();
  }
}

function onOptionKeydown(e: KeyboardEvent) {
  const panel = menuPanelRef.value;
  if (!panel) return;
  const opts = [
    ...panel.querySelectorAll<HTMLElement>('button.echo-dropdown-option'),
  ];
  const el = e.currentTarget as HTMLElement;
  const i = opts.indexOf(el);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    opts[i + 1]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (i <= 0 && props.searchable && searchInputRef.value) {
      searchInputRef.value.focus();
    } else {
      opts[i - 1]?.focus();
    }
  } else if (e.key === 'Home') {
    e.preventDefault();
    opts[0]?.focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    opts[opts.length - 1]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    isOpen.value = false;
    nextTick(() => triggerRef.value?.focus());
  } else if (e.key === 'Tab') {
    isOpen.value = false;
  }
}

function selectOption(option: EchoDropdownOption) {
  if (props.disabled) return;
  emit('update:modelValue', option.value);
  isOpen.value = false;
}

function handleClickOutside(event: MouseEvent) {
  const t = event.target as Node;
  if (dropdownRef.value?.contains(t)) return;
  if (menuPanelRef.value?.contains(t)) return;
  isOpen.value = false;
}

watch(isOpen, (open) => {
  if (!props.teleportMenu) return;
  if (open) {
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
  } else {
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  }
});

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});

const selectedOption = computed(() =>
  props.options.find((o) => o.value === props.modelValue),
);

const currentLabel = computed(() => {
  const override = props.triggerLabel?.trim();
  if (override) return override;
  return selectedOption.value?.label || props.modelValue;
});

const triggerIconSrc = computed(
  () => selectedOption.value?.iconSrc?.trim() || '',
);
const triggerIconClass = computed(
  () => selectedOption.value?.iconClass?.trim() || '',
);
const triggerIconMono = computed(
  () => selectedOption.value?.iconMono === true,
);

const filteredOptions = computed(() => {
  if (!props.searchable || !searchTerm.value.trim()) return props.options;
  const q = searchTerm.value.trim().toLowerCase();
  return props.options.filter((o) => o.label.toLowerCase().includes(q));
});

const isServerSurface = computed(() => props.surface === 'server');

const isServerBorderless = computed(
  () => isServerSurface.value && props.borderless,
);

const menuPanelPositionClass = computed(() =>
  props.menuMatchTriggerWidth
    ? 'left-0 right-0 w-full max-w-full'
    : 'left-0 min-w-full w-max max-w-[calc(100vw-1rem)]',
);

function optionRowClass(value: string) {
  const selected = props.modelValue === value;
  const base =
    'echo-dropdown-option flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors';
  return [base, selected && 'echo-dropdown-option--selected'];
}
</script>

<template>
  <div
    class="echo-dropdown-container flex flex-col gap-2"
    :class="{
      'echo-dropdown--server': isServerSurface,
      'echo-dropdown--server-borderless': isServerBorderless,
    }"
    ref="dropdownRef"
  >
    <span v-if="label" class="settings-label">{{ label }}</span>
    <div class="relative">
      <button
        :id="triggerId"
        ref="triggerRef"
        type="button"
        :disabled="props.disabled"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
        class="echo-dropdown-trigger w-full flex items-center justify-between transition-all"
        :class="[
          isServerSurface ? 'rounded-[0.9rem]' : 'rounded-xl',
          props.compact
            ? 'px-3 py-2'
            : isServerSurface
              ? 'py-[0.85rem] pl-4 pr-3'
              : 'px-4 py-3',
          {
            'echo-dropdown-trigger--open': isOpen,
            'opacity-40 cursor-not-allowed': props.disabled,
          },
        ]"
        @click="toggle"
        @keydown="onTriggerKeydown"
      >
        <span
          class="echo-dropdown-trigger-text flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
        >
          <img
            v-if="triggerIconSrc"
            :src="triggerIconSrc"
            alt=""
            class="h-4 w-4 shrink-0 object-contain echo-dropdown-channel-icon"
            :class="[
              triggerIconMono
                ? 'echo-dropdown-channel-icon--mono'
                : 'echo-dropdown-channel-icon--color',
              triggerIconClass,
            ]"
          />
          <span class="min-w-0 truncate">{{ currentLabel }}</span>
        </span>
        <svg
          class="echo-dropdown-chevron h-4 w-4 shrink-0 transition-transform duration-300"
          :class="[
            { 'rotate-180': isOpen },
            isServerSurface ? 'ml-2 mr-1' : '',
          ]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <template v-if="!props.teleportMenu">
        <Transition :name="openUpward ? 'dropdown-up' : 'dropdown'">
          <div
            v-if="isOpen"
            :id="listboxId"
            ref="menuPanelRef"
            role="listbox"
            :aria-labelledby="triggerId"
            class="echo-dropdown-menu absolute z-[420] py-2 overflow-hidden"
            :class="[
              menuPanelPositionClass,
              isServerSurface ? 'rounded-[0.75rem]' : 'rounded-xl shadow-2xl',
              openUpward ? 'bottom-full mb-2' : 'top-full mt-2',
              isServerSurface && 'echo-dropdown-menu--server',
            ]"
          >
            <div class="max-h-[240px] overflow-y-auto custom-scrollbar">
              <div v-if="props.searchable" class="px-3 py-2">
                <input
                  ref="searchInputRef"
                  v-model="searchTerm"
                  type="text"
                  class="echo-dropdown-search w-full rounded-lg px-3 py-2 text-sm outline-none"
                  :class="isServerSurface && 'echo-dropdown-search--server'"
                  placeholder="Search…"
                  @keydown.down.prevent="focusOptionEdge('first')"
                />
              </div>
              <button
                v-for="option in filteredOptions"
                :key="option.value"
                type="button"
                role="option"
                :aria-selected="props.modelValue === option.value"
                :class="optionRowClass(option.value)"
                @click="selectOption(option)"
                @keydown="onOptionKeydown"
              >
                <img
                  v-if="option.iconSrc?.trim()"
                  :src="option.iconSrc.trim()"
                  alt=""
                  class="h-4 w-4 shrink-0 object-contain echo-dropdown-channel-icon"
                  :class="[
                    option.iconMono
                      ? 'echo-dropdown-channel-icon--mono'
                      : 'echo-dropdown-channel-icon--color',
                    option.iconClass,
                  ]"
                />
                <span class="min-w-0 truncate">{{ option.label }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </template>
      <Teleport v-else to="body">
        <Transition :name="openUpward ? 'dropdown-up' : 'dropdown'">
          <div
            v-if="isOpen"
            :id="listboxId"
            ref="menuPanelRef"
            role="listbox"
            :aria-labelledby="triggerId"
            class="echo-dropdown-menu fixed z-[420] py-2 overflow-hidden"
            :class="[
              !menuMatchTriggerWidth && 'max-w-[calc(100vw-1rem)]',
              isServerSurface ? 'rounded-[0.75rem]' : 'rounded-xl shadow-2xl',
              isServerSurface && 'echo-dropdown-menu--server',
            ]"
            :style="fixedMenuStyle"
          >
            <div class="max-h-[240px] overflow-y-auto custom-scrollbar">
              <div v-if="props.searchable" class="px-3 py-2">
                <input
                  ref="searchInputRef"
                  v-model="searchTerm"
                  type="text"
                  class="echo-dropdown-search w-full rounded-lg px-3 py-2 text-sm outline-none"
                  :class="isServerSurface && 'echo-dropdown-search--server'"
                  placeholder="Search…"
                  @keydown.down.prevent="focusOptionEdge('first')"
                />
              </div>
              <button
                v-for="option in filteredOptions"
                :key="option.value"
                type="button"
                role="option"
                :aria-selected="props.modelValue === option.value"
                :class="optionRowClass(option.value)"
                @click="selectOption(option)"
                @keydown="onOptionKeydown"
              >
                <img
                  v-if="option.iconSrc?.trim()"
                  :src="option.iconSrc.trim()"
                  alt=""
                  class="h-4 w-4 shrink-0 object-contain echo-dropdown-channel-icon"
                  :class="[
                    option.iconMono
                      ? 'echo-dropdown-channel-icon--mono'
                      : 'echo-dropdown-channel-icon--color',
                    option.iconClass,
                  ]"
                />
                <span class="min-w-0 truncate">{{ option.label }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<style scoped lang="scss">
.echo-dropdown-trigger {
  outline: none;
}

.echo-dropdown-container:not(.echo-dropdown--server) .echo-dropdown-trigger {
  background: var(--echo-control-bg);
  box-shadow: inset 0 0 0 1px var(--echo-control-border);

  &:hover {
    background: var(--echo-control-bg-hover);
    box-shadow: inset 0 0 0 1px var(--echo-control-border-hover);
  }

  &.echo-dropdown-trigger--open {
    box-shadow: inset 0 0 0 1px var(--echo-control-border-focus);
    background: var(--echo-control-bg-active);
  }
}

.echo-dropdown--server .echo-dropdown-trigger {
  background: var(--srv-input-bg);
  box-shadow: inset 0 0 0 1px var(--srv-input-ring);

  &:hover:not(:disabled) {
    background: var(--srv-role-trigger-hover-bg);
    box-shadow: inset 0 0 0 1px var(--srv-input-ring);
  }

  &.echo-dropdown-trigger--open {
    background: var(--srv-input-bg);
    box-shadow: inset 0 0 0 1px var(--srv-input-focus-ring);
  }
}

.echo-dropdown--server-borderless .echo-dropdown-trigger {
  background: transparent;
  box-shadow: none;

  &:hover:not(:disabled):not(.echo-dropdown-trigger--open) {
    background: var(--srv-role-trigger-hover-bg);
    box-shadow: none;
  }

  /* Inset ring only: outer outline/outline-offset stacks into sibling rows in tight forms */
  &:focus-visible:not(:disabled):not(.echo-dropdown-trigger--open) {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  &.echo-dropdown-trigger--open {
    background: transparent;
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
  }
}

.echo-dropdown-container:not(.echo-dropdown--server)
  .echo-dropdown-trigger-text {
  color: var(--echo-control-fg);
}

.echo-dropdown--server .echo-dropdown-trigger-text {
  color: var(--srv-input-fg);
}

.echo-dropdown-container:not(.echo-dropdown--server) .echo-dropdown-chevron {
  color: var(--echo-control-chevron);
}

.echo-dropdown--server .echo-dropdown-chevron {
  color: var(--srv-subtitle-fg);
}

.echo-dropdown-search:not(.echo-dropdown-search--server) {
  background: var(--echo-control-bg);
  box-shadow: inset 0 0 0 1px var(--echo-control-border);
  color: var(--echo-control-fg);
}

.echo-dropdown-search--server {
  border: none;
  background: var(--srv-pos-input-bg);
  box-shadow: inset 0 0 0 1px var(--srv-pos-input-ring);
  color: var(--srv-toolbar-search-fg);

  &::placeholder {
    color: var(--srv-toolbar-placeholder);
  }
}

.echo-dropdown-menu:not(.echo-dropdown-menu--server) {
  background: color-mix(in srgb, var(--echo-menu-bg) 94%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px var(--vue-auto-013);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: radial-gradient(
      circle at top right,
      color-mix(in srgb, var(--accent) 16%, transparent),
      transparent 60%
    );
  }

  .echo-dropdown-option {
    color: var(--echo-control-fg);

    &:hover {
      background: var(--echo-control-option-hover-bg);
    }

    &.echo-dropdown-option--selected {
      color: var(--echo-control-option-selected-fg);
      background: var(--echo-control-option-selected-bg);
      font-weight: 700;
    }
  }
}

.echo-dropdown-menu--server {
  background: var(--srv-role-menu-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--srv-role-menu-shadow);

  &::before {
    display: none;
  }
}

.echo-dropdown-menu--server .echo-dropdown-option {
  border-radius: 0.5rem;
  color: var(--srv-input-fg);
  font-weight: 500;

  &:hover {
    background: var(--srv-row-hover);
  }

  &.echo-dropdown-option--selected {
    font-weight: 700;
    background: var(--srv-row-active);
    box-shadow: inset 0 0 0 1px var(--srv-input-focus-ring);
  }
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

/* Open upward: animate from below */
.dropdown-up-enter-active,
.dropdown-up-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-up-enter-from,
.dropdown-up-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.settings-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vue-auto-042);
}

.echo-dropdown--server .settings-label {
  color: var(--srv-label-fg);
  letter-spacing: 0.16em;
}

/* Channel icons in server settings dropdowns: readable on dark menus */
html[data-theme='dark'] .echo-dropdown--server .echo-dropdown-channel-icon--mono {
  filter: brightness(0) invert(1);
  opacity: 0.92;
}

html[data-theme='dark'] .echo-dropdown--server .echo-dropdown-channel-icon--color {
  filter: brightness(1.12);
  opacity: 0.98;
}
</style>
