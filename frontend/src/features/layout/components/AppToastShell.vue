<script setup lang="ts">
import { ref } from 'vue';
import AppToastQuickReplyComposer from '@/features/layout/components/AppToastQuickReplyComposer.vue';
import {
  useAppToastController,
  type AppToastLayoutContext,
} from '@/features/layout/composables/useAppToastController';
import { safeImageUrl } from '@/utils/safeImageUrl';

const props = defineProps<{
  layoutContext: AppToastLayoutContext;
}>();

const quickReplyComposerRef = ref<InstanceType<
  typeof AppToastQuickReplyComposer
> | null>(null);

const {
  appToast,
  toastQuickReplyText,
  appToastProgressEpoch,
  appToastContextMenuOpen,
  appToastContextMenuRef,
  appToastContextMenuPosition,
  appToastIsRich,
  appToastLinearProgressVisible,
  appToastCircularProgressVisible,
  appToastContainerClass,
  appToastLeadingIconSrc,
  onAppToastContextMenu,
  hasAppToastPrimaryContextAction,
  openMessageChannelFromToast,
  openMessageChannelFromToastContextMenu,
  dismissToastFromContextMenu,
  appToastHasQuickReplyFooter,
  toastQuickReplyChannelFormat,
  showToastQuickReplyOpenButton,
  appToastVisibleActions,
  appToastProgressGridRowClass,
  appToastShellPositionStyle,
  appToastShellClass,
  appToastViewportClass,
  appToastStackClass,
  ringtoneMuted,
  dismissAppToast,
  submitToastQuickReply,
  onAppToastAction,
  incomingCallToastActionIconSrc,
  incomingCallToastActionLabel,
  incomingCallToastActionTitle,
  onAppToastInteractionExtend,
  appToastMessageNavVisible,
  appToastMessageNavCanGoPrev,
  appToastMessageNavCanGoNext,
  appToastMessageNavLabel,
  showPrevMessageToast,
  showNextMessageToast,
} = useAppToastController(props.layoutContext, quickReplyComposerRef);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="appToast"
      :class="appToastViewportClass"
      :style="appToastShellPositionStyle"
    >
      <div :class="appToastStackClass">
        <div
          :class="[appToastShellClass, appToastContainerClass]"
          role="status"
          @click="onAppToastInteractionExtend"
          @contextmenu="onAppToastContextMenu"
          @auxclick="onAppToastContextMenu"
        >
          <div
            class="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain [grid-row:1]"
          >
            <div
              class="app-toast-incoming-call__inner flex items-start gap-2.5"
            >
              <div
                v-if="appToastIsRich"
                class="app-toast-incoming-call__avatar-col relative mt-0.5 h-11 w-11 shrink-0"
                aria-hidden="true"
              >
                <div
                  v-if="appToast.imageUrl"
                  class="app-toast-incoming-call__avatar-aura"
                  :style="{
                    backgroundImage: `url(${safeImageUrl(appToast.imageUrl)})`,
                  }"
                />
                <span
                  class="app-toast-incoming-call__pulse pointer-events-none absolute inset-0 rounded-full"
                />
                <img
                  v-if="appToast.imageUrl"
                  class="relative z-[2] h-full w-full rounded-full object-cover shadow-md ring-1 ring-border"
                  :src="safeImageUrl(appToast.imageUrl)"
                  alt=""
                />
                <div
                  v-else
                  class="app-toast-incoming-call__avatar-fallback relative z-[2] flex h-full w-full items-center justify-center rounded-full bg-glass-2 text-base font-semibold text-foreground shadow-md ring-1 ring-border"
                >
                  {{
                    (appToast.title || appToast.message || '?')
                      .trim()
                      .charAt(0) || '?'
                  }}
                </div>
                <span
                  v-if="appToast.badge"
                  class="pointer-events-none absolute -bottom-0.5 -right-0.5 z-[3] flex min-h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full border-2 border-[var(--echo-avatar-ring-bg)] bg-[#f23f42] px-1 text-[10px] font-bold leading-none text-white shadow-sm"
                  >{{ appToast.badge }}</span
                >
              </div>
              <div class="min-h-0 min-w-0 flex-1">
                <p
                  v-if="appToast.variant === 'incoming_call'"
                  class="flex min-w-0 flex-wrap items-center gap-2 leading-snug text-lg font-semibold tracking-tight text-foreground"
                >
                  <span
                    class="app-toast-incoming-call__waves shrink-0"
                    :class="{
                      'app-toast-incoming-call__waves--muted': ringtoneMuted,
                    }"
                    aria-hidden="true"
                  >
                    <span class="app-toast-incoming-call__wave" />
                    <span class="app-toast-incoming-call__wave" />
                    <span class="app-toast-incoming-call__wave" />
                  </span>
                  <span
                    class="min-w-0 break-words text-fg max-sm:[overflow-wrap:anywhere]"
                  >
                    {{ appToast.message
                    }}<template v-if="appToast.subtitle">
                      {{ ' ' + appToast.subtitle }}</template
                    >
                  </span>
                </p>
                <template
                  v-else-if="appToast.variant === 'incoming_chat_message'"
                >
                  <p
                    class="min-w-0 truncate text-lg font-semibold leading-snug tracking-tight text-foreground max-sm:overflow-visible max-sm:whitespace-normal max-sm:break-words"
                  >
                    {{ appToast.title }}
                  </p>
                  <p
                    v-if="appToast.subtitle"
                    class="mt-0.5 truncate text-xs font-medium leading-snug text-fg-soft max-sm:overflow-visible max-sm:whitespace-normal max-sm:break-words"
                  >
                    {{ appToast.subtitle }}
                  </p>
                  <p
                    class="mt-2 line-clamp-3 text-sm leading-snug text-fg-soft [overflow-wrap:anywhere] max-sm:line-clamp-none"
                  >
                    {{ appToast.message }}
                  </p>
                </template>
                <template v-else>
                  <div
                    class="app-toast-default-row flex min-w-0 items-start gap-2"
                  >
                    <span
                      class="app-toast-default-row__icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      aria-hidden="true"
                    >
                      <img
                        :src="appToastLeadingIconSrc"
                        alt=""
                        class="h-4 w-4 opacity-95"
                      />
                    </span>
                    <span class="min-w-0 flex-1 pr-1">
                      <template v-if="appToast.title?.trim()">
                        <p
                          class="leading-snug text-[15px] font-semibold tracking-tight text-fg [overflow-wrap:anywhere] max-sm:break-words"
                        >
                          {{ appToast.title.trim() }}
                        </p>
                        <p
                          v-if="appToast.subtitle?.trim()"
                          class="mt-0.5 text-[12px] leading-snug text-fg-soft [overflow-wrap:anywhere] max-sm:break-words"
                        >
                          {{ appToast.subtitle.trim() }}
                        </p>
                        <p
                          class="mt-1.5 text-[13px] leading-relaxed text-fg [overflow-wrap:anywhere] max-sm:break-words"
                        >
                          {{ appToast.message }}
                        </p>
                      </template>
                      <template v-else>
                        <p
                          class="leading-snug font-medium text-fg [overflow-wrap:anywhere] max-sm:break-words"
                        >
                          {{ appToast.message }}
                        </p>
                        <p
                          v-if="appToast.subtitle"
                          class="mt-0.5 text-[11px] leading-snug text-fg-soft [overflow-wrap:anywhere] max-sm:break-words"
                        >
                          {{ appToast.subtitle }}
                        </p>
                      </template>
                    </span>
                  </div>
                </template>
                <div
                  v-if="appToastVisibleActions.length"
                  :class="
                    appToastIsRich
                      ? 'app-toast-incoming-call__actions mt-3 flex w-full min-w-0 flex-nowrap items-stretch gap-1.5'
                      : 'mt-2.5 flex w-full min-w-0 items-stretch gap-1.5 max-sm:mt-3 max-sm:flex-nowrap sm:flex-wrap sm:items-center'
                  "
                >
                  <button
                    v-for="action in appToastVisibleActions"
                    :key="
                      action.id === 'mute_ringtone'
                        ? `${action.id}:${ringtoneMuted ? '1' : '0'}`
                        : action.id
                    "
                    type="button"
                    :class="[
                      'chat-focus-ring inline-flex items-center justify-center rounded-md font-semibold transition-[transform,background-color,box-shadow] duration-150',
                      'max-sm:min-w-0 max-sm:flex-1 max-sm:basis-0 max-sm:text-center max-sm:leading-tight max-sm:whitespace-normal',
                      appToastIsRich
                        ? 'min-w-0 flex-1 basis-0 gap-1.5 whitespace-nowrap px-2.5 py-2 text-xs leading-tight max-sm:gap-1 max-sm:px-2'
                        : 'gap-2 px-3.5 py-2 text-sm max-sm:px-2.5 max-sm:py-2 max-sm:text-xs',
                      appToastIsRich
                        ? action.kind === 'primary'
                          ? 'bg-emerald-500/90 text-white shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:scale-[1.02] hover:bg-emerald-400/95 active:scale-[0.98]'
                          : 'bg-glass-2 text-fg hover:scale-[1.02] hover:bg-glass-hover active:scale-[0.98]'
                        : action.kind === 'primary'
                          ? 'bg-emerald-500/88 text-white hover:bg-emerald-400/92'
                          : 'bg-glass-2 text-fg hover:bg-glass-hover',
                    ]"
                    :title="
                      appToast.variant === 'incoming_call'
                        ? incomingCallToastActionTitle(action)
                        : undefined
                    "
                    @click="onAppToastAction(action)"
                  >
                    <img
                      v-if="
                        appToast.variant === 'incoming_call' &&
                        incomingCallToastActionIconSrc(action.id)
                      "
                      :src="incomingCallToastActionIconSrc(action.id)"
                      alt=""
                      :class="[
                        'shrink-0 brightness-0 invert opacity-90',
                        appToastIsRich ? 'h-3.5 w-3.5' : 'h-4 w-4',
                        action.kind === 'primary' ? 'opacity-95' : 'opacity-80',
                      ]"
                    />
                    {{
                      appToast.variant === 'incoming_call'
                        ? incomingCallToastActionLabel(action)
                        : action.label
                    }}
                  </button>
                </div>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-0.5">
                <div
                  v-if="appToastMessageNavVisible"
                  class="flex items-center gap-0.5"
                >
                  <button
                    type="button"
                    class="chat-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-glass-hover hover:text-fg-soft disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Previous notification"
                    :disabled="!appToastMessageNavCanGoPrev"
                    @click="showPrevMessageToast"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <span
                    class="min-w-[2rem] px-0.5 text-center text-[10px] font-semibold tabular-nums leading-none text-fg-subtle"
                    aria-live="polite"
                  >
                    {{ appToastMessageNavLabel }}
                  </span>
                  <button
                    type="button"
                    class="chat-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-glass-hover hover:text-fg-soft disabled:pointer-events-none disabled:opacity-35"
                    aria-label="Next notification"
                    :disabled="!appToastMessageNavCanGoNext"
                    @click="showNextMessageToast"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  class="chat-focus-ring relative z-[2] inline-flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-glass-hover"
                  :class="[
                    appToastCircularProgressVisible ? 'h-7 w-7 p-0' : 'p-1',
                    appToastIsRich
                      ? 'text-fg-subtle hover:text-fg-soft'
                      : 'text-muted hover:bg-overlay-subtle hover:text-foreground',
                  ]"
                  aria-label="Dismiss"
                  @click="dismissAppToast"
                >
                  <svg
                    v-if="appToastCircularProgressVisible"
                    class="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      class="opacity-25"
                    />
                    <circle
                      :key="appToastProgressEpoch"
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      pathLength="1"
                      stroke-dasharray="1"
                      stroke-dashoffset="0"
                      class="app-toast-dismiss-progress-ring text-emerald-400/95"
                      :style="{
                        animationDuration: `${appToast.durationMs}ms`,
                      }"
                    />
                  </svg>
                  <svg
                    v-if="appToastIsRich"
                    class="relative h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                  <svg
                    v-else
                    class="relative h-4 w-4 opacity-80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="appToastHasQuickReplyFooter"
            class="app-toast-quick-reply-footer flex w-full min-w-0 flex-nowrap items-end gap-1.5 border-t border-border/35 px-3 pb-3.5 pt-2.5 [grid-row:2]"
          >
            <AppToastQuickReplyComposer
              ref="quickReplyComposerRef"
              v-model="toastQuickReplyText"
              :channel-id="appToast!.quickReplyChannelId!.trim()"
              :message-format-template="
                toastQuickReplyChannelFormat?.messageFormatTemplate
              "
              :message-format-hard="
                toastQuickReplyChannelFormat?.messageFormatHard === true
              "
              @submit="submitToastQuickReply"
            />
            <button
              v-if="showToastQuickReplyOpenButton"
              type="button"
              class="chat-focus-ring shrink-0 rounded-md bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-glass-hover"
              @click="openMessageChannelFromToast"
            >
              Open
            </button>
            <button
              v-else
              type="button"
              class="chat-focus-ring shrink-0 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400/95 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!toastQuickReplyText.trim()"
              @click="submitToastQuickReply"
            >
              Send
            </button>
          </div>
          <div
            v-if="appToastLinearProgressVisible"
            :class="[
              'pointer-events-none mx-3 mb-1.5 mt-0.5 h-[3px] shrink-0 overflow-hidden rounded-full bg-glass-2/90',
              appToastProgressGridRowClass,
            ]"
            aria-hidden="true"
          >
            <div
              :key="appToastProgressEpoch"
              class="app-toast-dismiss-progress-fill h-full w-full rounded-full bg-emerald-400/95"
              :style="{ animationDuration: `${appToast.durationMs}ms` }"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
  <Teleport to="body">
    <div
      v-if="
        appToast &&
        appToastContextMenuOpen &&
        appToast.variant === 'incoming_chat_message'
      "
      ref="appToastContextMenuRef"
      class="ellipsis-menu fixed z-[120] min-w-[180px] py-1"
      :style="{
        left: `${appToastContextMenuPosition.left}px`,
        top: `${appToastContextMenuPosition.top}px`,
      }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <button
        v-if="hasAppToastPrimaryContextAction"
        type="button"
        class="chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover"
        @click="openMessageChannelFromToastContextMenu"
      >
        Open conversation
      </button>
      <button
        type="button"
        class="chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-fg-soft hover:bg-glass-hover"
        @click="dismissToastFromContextMenu"
      >
        Dismiss notification
      </button>
    </div>
  </Teleport>
</template>

<style lang="scss">
@use '@/features/layout/styles/appToastShell.scss';
</style>
