<script setup lang="ts">
import { computed } from 'vue';
import {
  normalizeCanonicalPresenceStatus,
  presenceIndicatorTitle,
} from '@/services/domain/presence';

/** Unique status indicators: online, idle, busy (DND), offline. */

export type UserStatus = 'online' | 'idle' | 'do_not_disturb' | 'offline';

const props = withDefaults(
  defineProps<{
    status?: UserStatus | string;
    size?: 'sm' | 'md' | 'lg';
    /** Echo Web on a phone-class device — compact handset instead of dot/moon/dash. */
    mobileSurface?: boolean;
    /** Show a blue dot when the user is active on Discord (online on Discord but not Echo). */
    discordOnline?: boolean;
  }>(),
  { status: 'offline', size: 'sm', mobileSurface: false, discordOnline: false },
);

const normalizedStatus = computed<UserStatus>(() => {
  return normalizeCanonicalPresenceStatus(props.status) ?? 'offline';
});

const showPhoneGlyph = computed(
  () => !!props.mobileSurface && normalizedStatus.value !== 'offline',
);

/** Show Discord blue dot when user is online on Discord but appears offline or not active on Echo. */
const showDiscordIndicator = computed(() => {
  return !!props.discordOnline;
});

const sizeClasses = computed(() => `status-indicator--${props.size}`);

const hoverTitle = computed(() =>
  presenceIndicatorTitle({
    status: props.status,
    mobileSurface: props.mobileSurface,
    discordOnline: props.discordOnline,
  }),
);

const ariaLabel = computed(() => `Status: ${hoverTitle.value}`);
</script>

<template>
  <span
    class="status-indicator"
    :class="[sizeClasses, `status-indicator--${normalizedStatus}`]"
    :aria-label="ariaLabel"
    :title="hoverTitle"
    role="img"
  >
    <svg
      v-if="showPhoneGlyph"
      class="status-svg status-phone"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <rect
        x="3.25"
        y="1"
        width="5.5"
        height="10"
        rx="1.25"
        fill="currentColor"
      />
    </svg>
    <template v-else>
      <!-- Discord Online: blue dot (shown when active on Discord) -->
      <span
        v-if="showDiscordIndicator"
        class="status-discord-dot"
        aria-hidden="true"
      />
      <!-- Online: green dot -->
      <span
        v-else-if="normalizedStatus === 'online'"
        class="status-dot"
        aria-hidden="true"
      />
      <!-- Idle: crescent moon -->
      <svg
        v-else-if="normalizedStatus === 'idle'"
        class="status-svg status-moon"
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        <path
          d="M6 1a5 5 0 0 1 0 10c-2.5 0-5-2-5-5s2.5-5 5-5z"
          fill="currentColor"
        />
      </svg>
      <!-- DND: dash -->
      <span
        v-else-if="normalizedStatus === 'do_not_disturb'"
        class="status-dash"
        aria-hidden="true"
      />
      <!-- Offline: filled gray circle -->
      <span v-else class="status-offline-dot" aria-hidden="true" />
    </template>
  </span>
</template>

<style scoped lang="scss">
.status-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  /* Sit above absolutely positioned avatars (e.g. PausedGifAvatar / LimitedGifImg). */
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: transparent;
  box-sizing: border-box;
}

.status-indicator--sm {
  width: 10px;
  height: 10px;
}

.status-indicator--md {
  width: 12px;
  height: 12px;
}

.status-indicator--lg {
  width: 16px;
  height: 16px;
}

/* Online: green filled circle (full cell — no ring) */
.status-indicator--online {
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    /* Explicit green: `--vue-auto-084` can resolve to near-black in some dark themes. */
    background: rgb(34 197 94);
  }

  .status-phone {
    width: 7px;
    height: 10px;
    color: rgb(34 197 94);
  }
}

/* Idle: amber crescent */
.status-indicator--idle {
  .status-svg {
    width: 10px;
    height: 10px;
    color: var(--vue-auto-083);
  }

  .status-phone {
    width: 7px;
    height: 10px;
    color: var(--vue-auto-083);
  }
}

/* Busy/DND: coral dash */
.status-indicator--do_not_disturb {
  .status-dash {
    width: 8px;
    height: 2.5px;
    border-radius: 999px;
    background: var(--vue-auto-082);
  }

  .status-phone {
    width: 7px;
    height: 10px;
    color: var(--vue-auto-082);
  }
}

/* Offline: gray filled circle */
.status-indicator--offline {
  .status-offline-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--vue-auto-284);
  }
}

/* Discord Online: blue filled circle (Discord blurple) */
.status-discord-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #5865f2;
  box-shadow: 0 0 0 2px var(--surface);
}

.status-indicator--md .status-discord-dot {
  width: 12px;
  height: 12px;
}

.status-indicator--lg .status-discord-dot {
  width: 16px;
  height: 16px;
}

.status-indicator--md .status-dot {
  width: 12px;
  height: 12px;
}
.status-indicator--md .status-dash {
  width: 10px;
  height: 3px;
}
.status-indicator--md .status-offline-dot {
  width: 12px;
  height: 12px;
}
.status-indicator--md .status-svg {
  width: 12px;
  height: 12px;
}

.status-indicator--md .status-phone {
  width: 8px;
  height: 11px;
}

.status-indicator--lg .status-phone {
  width: 10px;
  height: 14px;
}

.status-indicator--lg .status-dot {
  width: 16px;
  height: 16px;
}

.status-indicator--lg .status-dash {
  width: 13px;
  height: 3.5px;
}

.status-indicator--lg .status-offline-dot {
  width: 16px;
  height: 16px;
}

.status-indicator--lg .status-svg {
  width: 15px;
  height: 15px;
}
</style>
