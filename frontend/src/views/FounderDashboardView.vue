<script setup lang="ts">
import { ApiError } from '@/api/client';
import {
  getFounderDashboard,
  getFounderSession,
  postFounderLogin,
  postFounderLogout,
  type FounderDashboardPayload,
  type FounderUser,
} from '@/api/founderClient';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

type TabId = 'overview' | 'users' | 'bugs' | 'monitoring' | 'health' | 'logs';

type GuestFilter = 'all' | 'full' | 'guest';
type PlanFilter = 'all' | 'free' | 'plus' | 'black';
type UserSortKey = 'createdAt' | 'username' | 'displayName' | 'plan';
type UserSortDir = 'asc' | 'desc';
type RefreshInterval = 0 | 10 | 30 | 60;

/** Turns off global `overflow:hidden` on html/body/#app so the founder page can use normal window scroll. */
const FOUNDER_DOC_SCROLL_CLASS = 'echo-founder-page-scroll';

const TAB_DEFS: Array<{ id: TabId; label: string; short: string }> = [
  { id: 'overview', label: 'Overview', short: 'Home' },
  { id: 'users', label: 'Users', short: 'Users' },
  { id: 'bugs', label: 'Bug reports', short: 'Bugs' },
  { id: 'monitoring', label: 'Monitoring', short: 'Monitor' },
  { id: 'health', label: 'Health & ops', short: 'Ops' },
  { id: 'logs', label: 'Local logs', short: 'Logs' },
];

const REFRESH_OPTIONS: Array<{ v: RefreshInterval; l: string }> = [
  { v: 0, l: 'Off' },
  { v: 10, l: '10s' },
  { v: 30, l: '30s' },
  { v: 60, l: '60s' },
];

/** True only when a normalized email exists and was verified (excludes guests with no email). */
function hasVerifiedEmail(user: FounderUser): boolean {
  const email = (user.email ?? '').trim();
  return Boolean(email) && user.emailVerified;
}

const GUEST_FILTER_OPTIONS: Array<{ v: GuestFilter; l: string }> = [
  { v: 'all', l: 'All' },
  { v: 'full', l: 'Full' },
  { v: 'guest', l: 'Guests' },
];

const PLAN_FILTER_OPTIONS: Array<{ v: PlanFilter; l: string }> = [
  { v: 'all', l: 'All plans' },
  { v: 'free', l: 'Free' },
  { v: 'plus', l: 'Plus' },
  { v: 'black', l: 'Black' },
];

const loadingSession = ref(true);
const loggingIn = ref(false);
const loadingDashboard = ref(false);
const authError = ref('');
const dashboardError = ref('');
const username = ref('');
const password = ref('');
const session = ref<{
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
} | null>(null);
const dashboard = shallowRef<FounderDashboardPayload | null>(null);

const activeTab = ref<TabId>('overview');
const refreshInterval = ref<RefreshInterval>(0);
const lastRefreshedAt = ref<number | null>(null);
const now = ref(Date.now());
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const userQuery = ref('');
const userGuestFilter = ref<GuestFilter>('all');
const userPlanFilter = ref<PlanFilter>('all');
const userVerifiedOnly = ref(false);
const userSortKey = ref<UserSortKey>('createdAt');
const userSortDir = ref<UserSortDir>('desc');
const selectedUserId = ref<string | null>(null);

const bugQuery = ref('');
const expandAllBugs = ref(false);

const copiedKey = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const userRows = computed<FounderUser[]>(() => dashboard.value?.users ?? []);
const bugReports = computed(() => dashboard.value?.bugReports ?? []);
const watcherTools = computed(() => dashboard.value?.watcherTools ?? []);
const monitoringFiles = computed(() => dashboard.value?.monitoring.files ?? []);
const localLogs = computed(() => dashboard.value?.localLogs ?? []);
const monitoringSummary = computed(
  () => dashboard.value?.monitoring.summary ?? null,
);

const filteredUsers = computed<FounderUser[]>(() => {
  const q = userQuery.value.trim().toLowerCase();
  const guest = userGuestFilter.value;
  const plan = userPlanFilter.value;
  const verifiedOnly = userVerifiedOnly.value;
  const rows = userRows.value.filter((u) => {
    if (guest === 'guest' && !u.isGuest) return false;
    if (guest === 'full' && u.isGuest) return false;
    if (plan !== 'all' && (u.echoPlan ?? 'free') !== plan) return false;
    if (verifiedOnly && !hasVerifiedEmail(u)) return false;
    if (!q) return true;
    const haystack = [
      u.username,
      u.displayName,
      u.email ?? '',
      u.phone ?? '',
      u.id,
      u.customStatus ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
  const key = userSortKey.value;
  const dir = userSortDir.value === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    let av = '';
    let bv = '';
    if (key === 'createdAt') {
      return (
        dir *
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    }
    if (key === 'username') {
      av = (a.username ?? '').toLowerCase();
      bv = (b.username ?? '').toLowerCase();
    } else if (key === 'displayName') {
      av = (a.displayName || a.username || '').toLowerCase();
      bv = (b.displayName || b.username || '').toLowerCase();
    } else if (key === 'plan') {
      av = a.echoPlan ?? 'free';
      bv = b.echoPlan ?? 'free';
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return sorted;
});

const selectedUser = computed<FounderUser | null>(() => {
  const id = selectedUserId.value;
  if (!id) return null;
  return userRows.value.find((u) => u.id === id) ?? null;
});

const filteredBugs = computed(() => {
  const q = bugQuery.value.trim().toLowerCase();
  if (!q) return bugReports.value;
  return bugReports.value.filter((report) => {
    const haystack = [
      report.body,
      report.reporter.username,
      report.reporter.displayName,
      report.reporter.email ?? '',
      report.id,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
});

const healthStatus = computed(() => {
  const h = dashboard.value?.health;
  if (!h) return 'unknown';
  const dbBad = h.backendStorageMode === 'postgres' && h.db === 'disconnected';
  const natsBad = h.nats === 'disconnected';
  if (dbBad || natsBad) return 'warn';
  return h.status || 'ok';
});

const healthPillKind = computed<'ok' | 'warn' | 'err' | 'muted'>(() => {
  if (healthStatus.value === 'ok') return 'ok';
  if (healthStatus.value === 'warn') return 'warn';
  if (healthStatus.value === 'unknown') return 'muted';
  return 'err';
});

const diagnosticsPillKind = computed<'ok' | 'muted'>(() =>
  dashboard.value?.diagnostics.enabled ? 'ok' : 'muted',
);

const verifiedPercent = computed(() => {
  const total = dashboard.value?.counts.users ?? 0;
  const verified = dashboard.value?.counts.verifiedEmails ?? 0;
  if (!total) return 0;
  return Math.round((verified / total) * 100);
});

const guestPercent = computed(() => {
  const total = dashboard.value?.counts.users ?? 0;
  const guests = dashboard.value?.counts.guests ?? 0;
  if (!total) return 0;
  return Math.round((guests / total) * 100);
});

const paidUsers = computed(
  () => userRows.value.filter((u) => u.hasActiveSubscription).length,
);

const recentBugs = computed(() => bugReports.value.slice(0, 4));

const refreshAgo = computed(() => {
  if (!lastRefreshedAt.value) return '';
  const delta = Math.max(0, now.value - lastRefreshedAt.value);
  return formatRelative(delta);
});

function formatRelative(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDateShort(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function formatSize(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

async function copyText(text: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1400);
  } catch {
    /* ignore — browser denied clipboard */
  }
}

function toggleUserSort(key: UserSortKey): void {
  if (userSortKey.value === key) {
    userSortDir.value = userSortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    userSortKey.value = key;
    userSortDir.value = key === 'createdAt' ? 'desc' : 'asc';
  }
}

function userInitials(user: {
  displayName?: string | null;
  username?: string | null;
}): string {
  const base = (user.displayName || user.username || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function userStatusKind(user: FounderUser): 'ok' | 'warn' | 'err' | 'muted' {
  if (user.status === 'online') return 'ok';
  if (user.status === 'idle') return 'warn';
  if (user.status === 'do_not_disturb') return 'err';
  return 'muted';
}

function setTab(tab: TabId): void {
  activeTab.value = tab;
}

function resetUserFilters(): void {
  userQuery.value = '';
  userGuestFilter.value = 'all';
  userPlanFilter.value = 'all';
  userVerifiedOnly.value = false;
}

async function refreshDashboard(): Promise<void> {
  if (!session.value?.authenticated) return;
  loadingDashboard.value = true;
  dashboardError.value = '';
  try {
    dashboard.value = await getFounderDashboard();
    lastRefreshedAt.value = Date.now();
  } catch (error) {
    dashboardError.value = apiErrorMessage(
      error,
      'Could not load founder dashboard.',
    );
  } finally {
    loadingDashboard.value = false;
  }
}

async function refreshSession(): Promise<void> {
  loadingSession.value = true;
  authError.value = '';
  try {
    session.value = await getFounderSession();
    if (session.value.authenticated) {
      username.value = session.value.username ?? '';
      await refreshDashboard();
    } else {
      dashboard.value = null;
    }
  } catch (error) {
    authError.value = apiErrorMessage(
      error,
      'Could not verify founder session.',
    );
  } finally {
    loadingSession.value = false;
  }
}

async function onLoginSubmit(): Promise<void> {
  if (!username.value.trim() || !password.value) {
    authError.value = 'Enter the founder username and password.';
    return;
  }
  loggingIn.value = true;
  authError.value = '';
  try {
    await postFounderLogin({
      username: username.value.trim(),
      password: password.value,
    });
    password.value = '';
    await refreshSession();
  } catch (error) {
    authError.value = apiErrorMessage(error, 'Founder login failed.');
  } finally {
    loggingIn.value = false;
  }
}

async function onLogout(): Promise<void> {
  try {
    await postFounderLogout();
  } finally {
    session.value = {
      enabled: session.value?.enabled ?? true,
      authenticated: false,
      username: null,
    };
    dashboard.value = null;
    lastRefreshedAt.value = null;
    refreshInterval.value = 0;
  }
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startAutoRefresh(seconds: RefreshInterval): void {
  stopAutoRefresh();
  if (!seconds) return;
  refreshTimer = setInterval(() => {
    if (!loadingDashboard.value) {
      void refreshDashboard();
    }
  }, seconds * 1000);
}

watch(refreshInterval, (value) => {
  startAutoRefresh(value);
});

function onKeydown(event: KeyboardEvent): void {
  if (!session.value?.authenticated) return;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  const typingInField = tag === 'input' || tag === 'textarea';
  if (!typingInField && (event.key === 'r' || event.key === 'R')) {
    event.preventDefault();
    void refreshDashboard();
  }
}

onMounted(() => {
  document.documentElement.classList.add(FOUNDER_DOC_SCROLL_CLASS);
  void refreshSession();
  window.addEventListener('keydown', onKeydown);
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 5000);
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove(FOUNDER_DOC_SCROLL_CLASS);
  stopAutoRefresh();
  if (tickTimer) clearInterval(tickTimer);
  if (copiedTimer) clearTimeout(copiedTimer);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="founder-shell">
    <div class="founder-shell__bg" aria-hidden="true" />
    <div class="founder-shell__noise" aria-hidden="true" />

    <main class="founder-main">
      <section
        v-if="loadingSession"
        class="founder-loading-panel founder-glass"
      >
        <div class="founder-spinner" aria-hidden="true" />
        <span>Verifying founder session…</span>
      </section>

      <section
        v-else-if="session && !session.enabled"
        class="founder-gate founder-glass"
      >
        <div class="founder-gate__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
            <path
              d="M12 3 3 7v5c0 5 4 8 9 9 5-1 9-4 9-9V7l-9-4Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2>Founder route is disabled</h2>
        <p>
          Set
          <code>founder_name</code>
          and
          <code>founder_pass</code>
          in the backend environment to enable the
          <code>/founder</code>
          dashboard.
        </p>
      </section>

      <section
        v-else-if="session && !session.authenticated"
        class="founder-login"
      >
        <div class="founder-login__card founder-glass">
          <div class="founder-login__accent" aria-hidden="true" />
          <div class="founder-login__head">
            <span class="founder-kicker">Founder control</span>
            <h1>Signed access only</h1>
            <p>
              Bug reports, user inventory, health, monitoring inventory,
              diagnostics, and local logs — all behind one credential.
            </p>
          </div>

          <form class="founder-login__form" @submit.prevent="onLoginSubmit">
            <label class="founder-field">
              <span>Founder name</span>
              <input
                v-model="username"
                type="text"
                autocomplete="username"
                autofocus
                placeholder="founder"
              />
            </label>
            <label class="founder-field">
              <span>Password</span>
              <input
                v-model="password"
                type="password"
                autocomplete="current-password"
                placeholder="••••••••"
              />
            </label>
            <p v-if="authError" class="founder-inline-error">
              {{ authError }}
            </p>
            <button
              type="submit"
              class="founder-button founder-button--primary"
              :disabled="loggingIn"
            >
              {{ loggingIn ? 'Signing in…' : 'Enter founder panel' }}
            </button>
          </form>
        </div>

        <aside class="founder-login__aside">
          <div
            v-for="item in [
              {
                t: 'Bug reports',
                d: 'Recent reports with reporter identity, attachments, client meta and trace payloads.',
              },
              {
                t: 'User inventory',
                d: 'Every account including guests, verification state, plans and timestamps.',
              },
              {
                t: 'Health & monitors',
                d: 'Backend health, metrics preview, Grafana panels, Prometheus alerts and recording rules.',
              },
              {
                t: 'Watcher tools & logs',
                d: 'Operational scripts, diagnostics session state and local log tails when present.',
              },
            ]"
            :key="item.t"
            class="founder-login__aside-card founder-glass"
          >
            <h3>{{ item.t }}</h3>
            <p>{{ item.d }}</p>
          </div>
        </aside>
      </section>

      <template v-else-if="session && session.authenticated">
        <header class="founder-topbar founder-glass">
          <div class="founder-topbar__left">
            <div class="founder-brand" aria-hidden="true">
              <span class="founder-brand__dot" />
              <span class="founder-brand__dot" />
              <span class="founder-brand__dot" />
            </div>
            <div class="founder-topbar__title">
              <span class="founder-kicker">Founder</span>
              <h1>Echo control panel</h1>
            </div>
          </div>

          <div class="founder-topbar__right">
            <div class="founder-topbar__meta">
              <span class="founder-pill founder-pill--muted">
                <span class="founder-dot founder-dot--ok" />
                {{ session.username }}
              </span>
              <span
                v-if="lastRefreshedAt"
                class="founder-topbar__timestamp"
                :title="formatDate(new Date(lastRefreshedAt).toISOString())"
              >
                Updated {{ refreshAgo }}
              </span>
            </div>

            <div class="founder-segmented founder-segmented--tight">
              <button
                v-for="opt in REFRESH_OPTIONS"
                :key="opt.v"
                type="button"
                class="founder-segmented__btn"
                :class="{ 'is-active': refreshInterval === opt.v }"
                @click="refreshInterval = opt.v"
              >
                {{ opt.l }}
              </button>
            </div>

            <button
              type="button"
              class="founder-button founder-button--secondary"
              :disabled="loadingDashboard"
              :title="'Refresh (press R)'"
              @click="refreshDashboard"
            >
              <svg
                :class="{ 'founder-spin': loadingDashboard }"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              {{ loadingDashboard ? 'Refreshing' : 'Refresh' }}
            </button>

            <button
              type="button"
              class="founder-button founder-button--ghost"
              @click="onLogout"
            >
              Logout
            </button>
          </div>
        </header>

        <nav class="founder-tabs" aria-label="Founder sections">
          <button
            v-for="tab in TAB_DEFS"
            :key="tab.id"
            type="button"
            class="founder-tab"
            :class="{ 'is-active': activeTab === tab.id }"
            @click="setTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </nav>

        <p
          v-if="dashboardError"
          class="founder-inline-error founder-inline-error--toast"
        >
          {{ dashboardError }}
        </p>

        <!-- OVERVIEW ------------------------------------------------------ -->
        <section v-if="activeTab === 'overview'" class="founder-section">
          <div class="founder-kpi-grid">
            <article class="founder-kpi founder-glass">
              <span class="founder-kpi__label">Users</span>
              <strong class="founder-kpi__value">
                {{ dashboard?.counts.users ?? 0 }}
              </strong>
              <div class="founder-kpi__meta">
                <span class="founder-pill founder-pill--info">
                  {{ dashboard?.counts.guests ?? 0 }} guests
                </span>
                <span class="founder-kpi__sub">
                  {{ guestPercent }}% of base
                </span>
              </div>
            </article>

            <article class="founder-kpi founder-glass">
              <span class="founder-kpi__label">Verified emails</span>
              <strong class="founder-kpi__value">
                {{ dashboard?.counts.verifiedEmails ?? 0 }}
              </strong>
              <div class="founder-kpi__bar">
                <div
                  class="founder-kpi__bar-fill"
                  :style="{ width: `${verifiedPercent}%` }"
                />
              </div>
              <span class="founder-kpi__sub">
                {{ verifiedPercent }}% verified
              </span>
            </article>

            <article class="founder-kpi founder-glass">
              <span class="founder-kpi__label">Paid subscribers</span>
              <strong class="founder-kpi__value">{{ paidUsers }}</strong>
              <span class="founder-kpi__sub">Active subscriptions</span>
            </article>

            <article class="founder-kpi founder-glass">
              <span class="founder-kpi__label">Bug reports</span>
              <strong class="founder-kpi__value">
                {{ dashboard?.counts.bugReports ?? 0 }}
              </strong>
              <span class="founder-kpi__sub">Latest 100 persisted</span>
            </article>

            <article class="founder-kpi founder-glass">
              <span class="founder-kpi__label">System health</span>
              <strong class="founder-kpi__value founder-kpi__value--sm">
                <span
                  class="founder-pill"
                  :class="`founder-pill--${healthPillKind}`"
                >
                  <span
                    class="founder-dot"
                    :class="`founder-dot--${healthPillKind}`"
                  />
                  {{ healthStatus }}
                </span>
              </strong>
              <span class="founder-kpi__sub">
                db {{ dashboard?.health.db || '—' }} · nats
                {{ dashboard?.health.nats || 'none' }}
              </span>
            </article>

            <article class="founder-kpi founder-glass">
              <span class="founder-kpi__label">Diagnostics</span>
              <strong class="founder-kpi__value founder-kpi__value--sm">
                <span
                  class="founder-pill"
                  :class="`founder-pill--${diagnosticsPillKind}`"
                >
                  <span
                    class="founder-dot"
                    :class="`founder-dot--${diagnosticsPillKind}`"
                  />
                  {{ dashboard?.diagnostics.enabled ? 'On' : 'Off' }}
                </span>
              </strong>
              <span class="founder-kpi__sub">
                {{ dashboard?.diagnostics.sessionId || 'No active session' }}
              </span>
            </article>
          </div>

          <div class="founder-split">
            <article class="founder-panel founder-glass">
              <header class="founder-panel__head">
                <div>
                  <h3>Recent bug reports</h3>
                  <p>
                    Four most recent reports. See <em>Bug reports</em> tab for
                    all.
                  </p>
                </div>
                <button
                  type="button"
                  class="founder-button founder-button--ghost founder-button--sm"
                  @click="setTab('bugs')"
                >
                  View all →
                </button>
              </header>
              <div class="founder-recent-bugs">
                <div
                  v-for="report in recentBugs"
                  :key="report.id"
                  class="founder-recent-bug"
                >
                  <div class="founder-recent-bug__head">
                    <div class="founder-avatar founder-avatar--sm">
                      {{ userInitials(report.reporter) }}
                    </div>
                    <div class="founder-recent-bug__who">
                      <strong>
                        {{
                          report.reporter.displayName ||
                          report.reporter.username
                        }}
                      </strong>
                      <span>
                        @{{ report.reporter.username }} ·
                        {{ formatDate(report.createdAt) }}
                      </span>
                    </div>
                  </div>
                  <p class="founder-recent-bug__body">{{ report.body }}</p>
                </div>
                <p v-if="!recentBugs.length" class="founder-empty">
                  No bug reports yet.
                </p>
              </div>
            </article>

            <article class="founder-panel founder-glass">
              <header class="founder-panel__head">
                <div>
                  <h3>System snapshot</h3>
                  <p>Storage, connectivity and diagnostics session.</p>
                </div>
                <span
                  class="founder-pill"
                  :class="`founder-pill--${healthPillKind}`"
                >
                  {{ healthStatus }}
                </span>
              </header>
              <dl class="founder-kvs">
                <div>
                  <dt>Storage mode</dt>
                  <dd>{{ dashboard?.health.backendStorageMode || '—' }}</dd>
                </div>
                <div>
                  <dt>Database</dt>
                  <dd>{{ dashboard?.health.db || '—' }}</dd>
                </div>
                <div>
                  <dt>NATS</dt>
                  <dd>{{ dashboard?.health.nats || 'none' }}</dd>
                </div>
                <div>
                  <dt>Mock DB</dt>
                  <dd>{{ dashboard?.health.useMockDb ? 'yes' : 'no' }}</dd>
                </div>
                <div>
                  <dt>Last health</dt>
                  <dd>{{ formatDate(dashboard?.health.timestamp) }}</dd>
                </div>
                <div>
                  <dt>Diagnostics</dt>
                  <dd>
                    {{
                      dashboard?.diagnostics.enabled ? 'Enabled' : 'Disabled'
                    }}
                  </dd>
                </div>
                <div class="founder-kvs__full">
                  <dt>Session dir</dt>
                  <dd class="founder-mono founder-ellipsis">
                    {{ dashboard?.diagnostics.sessionDir || '—' }}
                  </dd>
                </div>
              </dl>
            </article>
          </div>
        </section>

        <!-- USERS --------------------------------------------------------- -->
        <section v-else-if="activeTab === 'users'" class="founder-section">
          <article class="founder-panel founder-panel--flush founder-glass">
            <header class="founder-panel__head founder-panel__head--toolbar">
              <div class="founder-toolbar">
                <label class="founder-search">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" stroke-linecap="round" />
                  </svg>
                  <input
                    v-model="userQuery"
                    type="search"
                    placeholder="Search users (name, email, id)"
                  />
                </label>

                <div class="founder-segmented">
                  <button
                    v-for="opt in GUEST_FILTER_OPTIONS"
                    :key="opt.v"
                    type="button"
                    class="founder-segmented__btn"
                    :class="{ 'is-active': userGuestFilter === opt.v }"
                    @click="userGuestFilter = opt.v"
                  >
                    {{ opt.l }}
                  </button>
                </div>

                <div class="founder-segmented">
                  <button
                    v-for="opt in PLAN_FILTER_OPTIONS"
                    :key="opt.v"
                    type="button"
                    class="founder-segmented__btn"
                    :class="{ 'is-active': userPlanFilter === opt.v }"
                    @click="userPlanFilter = opt.v"
                  >
                    {{ opt.l }}
                  </button>
                </div>

                <label class="founder-checkbox">
                  <input v-model="userVerifiedOnly" type="checkbox" />
                  <span>Verified only</span>
                </label>

                <button
                  type="button"
                  class="founder-button founder-button--ghost founder-button--sm"
                  @click="resetUserFilters"
                >
                  Clear
                </button>
              </div>

              <div class="founder-toolbar__right">
                <span class="founder-count">
                  {{ filteredUsers.length }} / {{ userRows.length }}
                </span>
              </div>
            </header>

            <div class="founder-table-wrap">
              <table class="founder-table">
                <thead>
                  <tr>
                    <th
                      class="founder-th founder-th--sortable"
                      @click="toggleUserSort('displayName')"
                    >
                      User
                      <span
                        v-if="userSortKey === 'displayName'"
                        class="founder-sort-arrow"
                      >
                        {{ userSortDir === 'asc' ? '↑' : '↓' }}
                      </span>
                    </th>
                    <th class="founder-th">Email</th>
                    <th class="founder-th">Flags</th>
                    <th
                      class="founder-th founder-th--sortable"
                      @click="toggleUserSort('plan')"
                    >
                      Plan
                      <span
                        v-if="userSortKey === 'plan'"
                        class="founder-sort-arrow"
                      >
                        {{ userSortDir === 'asc' ? '↑' : '↓' }}
                      </span>
                    </th>
                    <th
                      class="founder-th founder-th--sortable"
                      @click="toggleUserSort('createdAt')"
                    >
                      Created
                      <span
                        v-if="userSortKey === 'createdAt'"
                        class="founder-sort-arrow"
                      >
                        {{ userSortDir === 'asc' ? '↑' : '↓' }}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="user in filteredUsers"
                    :key="user.id"
                    class="founder-tr"
                    :class="{ 'is-active': selectedUserId === user.id }"
                    @click="selectedUserId = user.id"
                  >
                    <td class="founder-td founder-td--user">
                      <div class="founder-user-cell">
                        <div class="founder-avatar">
                          {{ userInitials(user) }}
                          <span
                            class="founder-status-dot"
                            :class="`founder-status-dot--${userStatusKind(user)}`"
                            :title="user.status"
                          />
                        </div>
                        <div>
                          <strong>{{
                            user.displayName || user.username
                          }}</strong>
                          <span>@{{ user.username }}</span>
                          <small class="founder-mono">{{ user.id }}</small>
                        </div>
                      </div>
                    </td>
                    <td class="founder-td">
                      <strong>{{ user.email || '—' }}</strong>
                      <span
                        class="founder-pill founder-pill--sm"
                        :class="
                          hasVerifiedEmail(user)
                            ? 'founder-pill--ok'
                            : 'founder-pill--muted'
                        "
                      >
                        {{
                          hasVerifiedEmail(user)
                            ? 'verified'
                            : (user.email ?? '').trim()
                              ? 'unverified'
                              : 'no email'
                        }}
                      </span>
                    </td>
                    <td class="founder-td">
                      <div class="founder-tag-row">
                        <span
                          class="founder-pill founder-pill--sm"
                          :class="
                            user.isGuest
                              ? 'founder-pill--warn'
                              : 'founder-pill--info'
                          "
                        >
                          {{ user.isGuest ? 'guest' : 'full' }}
                        </span>
                        <span
                          v-if="user.totpEnabled"
                          class="founder-pill founder-pill--sm founder-pill--ok"
                        >
                          2FA
                        </span>
                        <span
                          v-if="user.phoneVerified"
                          class="founder-pill founder-pill--sm founder-pill--muted"
                        >
                          phone ok
                        </span>
                        <span
                          v-if="user.isDiscordShadow"
                          class="founder-pill founder-pill--sm founder-pill--info"
                        >
                          discord
                        </span>
                      </div>
                    </td>
                    <td class="founder-td">
                      <strong>{{ user.echoPlan || 'free' }}</strong>
                      <span>{{
                        user.hasActiveSubscription ? 'paying' : 'not paid'
                      }}</span>
                    </td>
                    <td class="founder-td">
                      <strong>{{ formatDateShort(user.createdAt) }}</strong>
                      <span>
                        {{
                          user.updatedAt
                            ? `upd ${formatDateShort(user.updatedAt)}`
                            : '—'
                        }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!filteredUsers.length">
                    <td colspan="5" class="founder-empty-row">
                      No users match the current filters.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <!-- BUGS ---------------------------------------------------------- -->
        <section v-else-if="activeTab === 'bugs'" class="founder-section">
          <article class="founder-panel founder-glass">
            <header class="founder-panel__head founder-panel__head--toolbar">
              <div class="founder-toolbar">
                <label class="founder-search">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" stroke-linecap="round" />
                  </svg>
                  <input
                    v-model="bugQuery"
                    type="search"
                    placeholder="Search bugs (body, reporter, id)"
                  />
                </label>
                <label class="founder-checkbox">
                  <input v-model="expandAllBugs" type="checkbox" />
                  <span>Expand all</span>
                </label>
              </div>
              <div class="founder-toolbar__right">
                <span class="founder-count">
                  {{ filteredBugs.length }} / {{ bugReports.length }}
                </span>
              </div>
            </header>

            <div class="founder-bug-list">
              <details
                v-for="report in filteredBugs"
                :key="report.id"
                :open="expandAllBugs"
                class="founder-details founder-details--report"
              >
                <summary>
                  <div class="founder-bug-summary">
                    <div class="founder-avatar founder-avatar--sm">
                      {{ userInitials(report.reporter) }}
                    </div>
                    <div class="founder-bug-summary__who">
                      <strong>
                        {{
                          report.reporter.displayName ||
                          report.reporter.username
                        }}
                      </strong>
                      <span>
                        @{{ report.reporter.username }}
                        <template v-if="report.reporter.email">
                          · {{ report.reporter.email }}
                        </template>
                      </span>
                    </div>
                    <div class="founder-bug-summary__meta">
                      <span>{{ formatDate(report.createdAt) }}</span>
                      <code>{{ report.id }}</code>
                    </div>
                  </div>
                </summary>
                <div class="founder-bug-body">
                  <div class="founder-copy-block">
                    <button
                      type="button"
                      class="founder-icon-btn"
                      :title="'Copy body'"
                      @click.prevent="
                        copyText(report.body, `bug-body-${report.id}`)
                      "
                    >
                      {{ copiedKey === `bug-body-${report.id}` ? '✓' : '⧉' }}
                    </button>
                    <pre>{{ report.body }}</pre>
                  </div>

                  <div class="founder-bug-grid">
                    <section>
                      <header class="founder-subhead">
                        <h4>Reporter</h4>
                        <button
                          type="button"
                          class="founder-icon-btn"
                          @click.prevent="
                            copyText(
                              prettyJson(report.reporter),
                              `bug-rep-${report.id}`,
                            )
                          "
                        >
                          {{
                            copiedKey === `bug-rep-${report.id}` ? '✓' : 'Copy'
                          }}
                        </button>
                      </header>
                      <pre class="founder-pre">{{
                        prettyJson(report.reporter)
                      }}</pre>
                    </section>
                    <section>
                      <header class="founder-subhead">
                        <h4>
                          Attachments
                          <span class="founder-count founder-count--inline">
                            {{ report.attachmentUrls.length }}
                          </span>
                        </h4>
                        <button
                          type="button"
                          class="founder-icon-btn"
                          @click.prevent="
                            copyText(
                              prettyJson(report.attachmentUrls),
                              `bug-att-${report.id}`,
                            )
                          "
                        >
                          {{
                            copiedKey === `bug-att-${report.id}` ? '✓' : 'Copy'
                          }}
                        </button>
                      </header>
                      <ul
                        v-if="report.attachmentUrls.length"
                        class="founder-simple-list"
                      >
                        <li
                          v-for="url in report.attachmentUrls"
                          :key="url"
                          class="founder-ellipsis"
                        >
                          <a :href="url" target="_blank" rel="noreferrer">
                            {{ url }}
                          </a>
                        </li>
                      </ul>
                      <p v-else class="founder-empty">None</p>
                    </section>
                  </div>

                  <details class="founder-details founder-details--nested">
                    <summary>Client meta</summary>
                    <pre class="founder-pre">{{
                      prettyJson(report.clientMeta)
                    }}</pre>
                  </details>
                  <details class="founder-details founder-details--nested">
                    <summary>Trace JSON</summary>
                    <pre class="founder-pre">{{
                      prettyJson(report.traceJson)
                    }}</pre>
                  </details>
                </div>
              </details>

              <p v-if="!filteredBugs.length" class="founder-empty">
                No bug reports match the current search.
              </p>
            </div>
          </article>
        </section>

        <!-- MONITORING ---------------------------------------------------- -->
        <section v-else-if="activeTab === 'monitoring'" class="founder-section">
          <div class="founder-split">
            <article class="founder-panel founder-glass">
              <header class="founder-panel__head">
                <div>
                  <h3>Monitoring inventory</h3>
                  <p>Dashboard panels, alerts, and recording rules.</p>
                </div>
              </header>
              <dl class="founder-kvs">
                <div class="founder-kvs__full">
                  <dt>Grafana dashboard</dt>
                  <dd>
                    {{ monitoringSummary?.dashboardTitle }}
                    <small class="founder-mono">
                      ({{ monitoringSummary?.dashboardUid }})
                    </small>
                  </dd>
                </div>
              </dl>
              <details class="founder-details founder-details--nested" open>
                <summary>
                  Grafana panels
                  <span class="founder-count founder-count--inline">
                    {{ monitoringSummary?.panelTitles.length ?? 0 }}
                  </span>
                </summary>
                <ul class="founder-simple-list">
                  <li
                    v-for="panel in monitoringSummary?.panelTitles ?? []"
                    :key="panel"
                  >
                    {{ panel }}
                  </li>
                </ul>
              </details>
              <details class="founder-details founder-details--nested">
                <summary>
                  Prometheus alerts
                  <span class="founder-count founder-count--inline">
                    {{ monitoringSummary?.alerts.length ?? 0 }}
                  </span>
                </summary>
                <ul class="founder-simple-list">
                  <li
                    v-for="alert in monitoringSummary?.alerts ?? []"
                    :key="alert"
                  >
                    {{ alert }}
                  </li>
                </ul>
              </details>
              <details class="founder-details founder-details--nested">
                <summary>
                  Recording rules
                  <span class="founder-count founder-count--inline">
                    {{ monitoringSummary?.recordingRules.length ?? 0 }}
                  </span>
                </summary>
                <ul class="founder-simple-list">
                  <li
                    v-for="rule in monitoringSummary?.recordingRules ?? []"
                    :key="rule"
                  >
                    {{ rule }}
                  </li>
                </ul>
              </details>
            </article>

            <article class="founder-panel founder-glass">
              <header class="founder-panel__head">
                <div>
                  <h3>Metrics preview</h3>
                  <p>First slice of the backend Prometheus exposition.</p>
                </div>
                <button
                  type="button"
                  class="founder-button founder-button--ghost founder-button--sm"
                  @click="
                    copyText(
                      dashboard?.monitoring.metricsPreview ?? '',
                      'metrics',
                    )
                  "
                >
                  {{ copiedKey === 'metrics' ? 'Copied' : 'Copy' }}
                </button>
              </header>
              <pre class="founder-pre founder-pre--tall">{{
                dashboard?.monitoring.metricsPreview
              }}</pre>
            </article>
          </div>

          <article class="founder-panel founder-glass">
            <header class="founder-panel__head">
              <div>
                <h3>Shipped monitoring files</h3>
                <p>Files present in this workspace (monitoring & scripts).</p>
              </div>
            </header>
            <div class="founder-row-grid">
              <div
                v-for="entry in monitoringFiles"
                :key="entry.relativePath"
                class="founder-row-card founder-glass"
              >
                <div>
                  <strong>{{ entry.name }}</strong>
                  <p class="founder-mono">{{ entry.relativePath }}</p>
                </div>
                <div class="founder-row-card__meta">
                  <span>{{ formatSize(entry.sizeBytes) }}</span>
                  <span>{{ formatDate(entry.updatedAt) }}</span>
                </div>
              </div>
              <p v-if="!monitoringFiles.length" class="founder-empty">
                No monitoring files resolved.
              </p>
            </div>
          </article>
        </section>

        <!-- HEALTH -------------------------------------------------------- -->
        <section v-else-if="activeTab === 'health'" class="founder-section">
          <div class="founder-split">
            <article class="founder-panel founder-glass">
              <header class="founder-panel__head">
                <div>
                  <h3>System health</h3>
                  <p>Storage, NATS connectivity and diagnostics session.</p>
                </div>
                <span
                  class="founder-pill"
                  :class="`founder-pill--${healthPillKind}`"
                >
                  <span
                    class="founder-dot"
                    :class="`founder-dot--${healthPillKind}`"
                  />
                  {{ healthStatus }}
                </span>
              </header>
              <dl class="founder-kvs">
                <div>
                  <dt>Backend storage</dt>
                  <dd>{{ dashboard?.health.backendStorageMode || '—' }}</dd>
                </div>
                <div>
                  <dt>Database</dt>
                  <dd>{{ dashboard?.health.db || '—' }}</dd>
                </div>
                <div>
                  <dt>NATS</dt>
                  <dd>{{ dashboard?.health.nats || 'none' }}</dd>
                </div>
                <div>
                  <dt>Mock DB</dt>
                  <dd>{{ dashboard?.health.useMockDb ? 'yes' : 'no' }}</dd>
                </div>
                <div>
                  <dt>Last health</dt>
                  <dd>{{ formatDate(dashboard?.health.timestamp) }}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{{ formatDate(dashboard?.generatedAt) }}</dd>
                </div>
                <div class="founder-kvs__full">
                  <dt>Diagnostics dir</dt>
                  <dd class="founder-mono founder-ellipsis">
                    {{ dashboard?.diagnostics.sessionDir || '—' }}
                  </dd>
                </div>
                <div>
                  <dt>Diagnostics</dt>
                  <dd>
                    <span
                      class="founder-pill founder-pill--sm"
                      :class="`founder-pill--${diagnosticsPillKind}`"
                    >
                      {{
                        dashboard?.diagnostics.enabled ? 'enabled' : 'disabled'
                      }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Session id</dt>
                  <dd class="founder-mono founder-ellipsis">
                    {{ dashboard?.diagnostics.sessionId || '—' }}
                  </dd>
                </div>
              </dl>
            </article>

            <article class="founder-panel founder-glass">
              <header class="founder-panel__head">
                <div>
                  <h3>Watcher tools</h3>
                  <p>Operational scripts and monitoring files resolved.</p>
                </div>
              </header>
              <div class="founder-row-grid">
                <div
                  v-for="entry in watcherTools"
                  :key="entry.relativePath"
                  class="founder-row-card founder-glass"
                >
                  <div>
                    <strong>{{ entry.name }}</strong>
                    <p class="founder-mono">{{ entry.relativePath }}</p>
                  </div>
                  <div class="founder-row-card__meta">
                    <span>{{ formatSize(entry.sizeBytes) }}</span>
                    <span>{{ formatDate(entry.updatedAt) }}</span>
                  </div>
                </div>
                <p v-if="!watcherTools.length" class="founder-empty">
                  No watcher tools resolved.
                </p>
              </div>
            </article>
          </div>
        </section>

        <!-- LOGS ---------------------------------------------------------- -->
        <section v-else-if="activeTab === 'logs'" class="founder-section">
          <article class="founder-panel founder-glass">
            <header class="founder-panel__head">
              <div>
                <h3>Local logs</h3>
                <p>
                  Tail previews from local operational files when they exist in
                  this workspace.
                </p>
              </div>
            </header>
            <div class="founder-log-list">
              <details
                v-for="log in localLogs"
                :key="log.relativePath"
                class="founder-details"
              >
                <summary>
                  <div class="founder-log-summary">
                    <strong>{{ log.name }}</strong>
                    <span class="founder-mono">{{ log.relativePath }}</span>
                    <span class="founder-log-summary__meta">
                      {{ formatSize(log.sizeBytes) }} ·
                      {{ formatDate(log.updatedAt) }}
                    </span>
                  </div>
                </summary>
                <div class="founder-log-body">
                  <button
                    type="button"
                    class="founder-button founder-button--ghost founder-button--sm founder-log-copy"
                    @click.prevent="
                      copyText(log.preview, `log-${log.relativePath}`)
                    "
                  >
                    {{
                      copiedKey === `log-${log.relativePath}`
                        ? 'Copied'
                        : 'Copy'
                    }}
                  </button>
                  <pre class="founder-pre founder-pre--tall">{{
                    log.preview
                  }}</pre>
                </div>
              </details>
              <p v-if="!localLogs.length" class="founder-empty">
                No local logs resolved.
              </p>
            </div>
          </article>
        </section>
      </template>
    </main>

    <!-- USER DRAWER ----------------------------------------------------- -->
    <transition name="founder-drawer">
      <aside
        v-if="selectedUser"
        class="founder-drawer"
        role="dialog"
        aria-modal="true"
      >
        <div class="founder-drawer__scrim" @click="selectedUserId = null" />
        <div class="founder-drawer__panel founder-glass">
          <header class="founder-drawer__head">
            <div class="founder-drawer__identity">
              <div class="founder-avatar founder-avatar--lg">
                {{ userInitials(selectedUser) }}
                <span
                  class="founder-status-dot"
                  :class="`founder-status-dot--${userStatusKind(selectedUser)}`"
                />
              </div>
              <div>
                <h2>
                  {{ selectedUser.displayName || selectedUser.username }}
                </h2>
                <span class="founder-mono">@{{ selectedUser.username }}</span>
              </div>
            </div>
            <button
              type="button"
              class="founder-icon-btn founder-icon-btn--close"
              @click="selectedUserId = null"
            >
              ✕
            </button>
          </header>

          <div class="founder-drawer__tags">
            <span
              class="founder-pill founder-pill--sm"
              :class="
                selectedUser.isGuest
                  ? 'founder-pill--warn'
                  : 'founder-pill--info'
              "
            >
              {{ selectedUser.isGuest ? 'guest' : 'full account' }}
            </span>
            <span
              class="founder-pill founder-pill--sm"
              :class="
                hasVerifiedEmail(selectedUser)
                  ? 'founder-pill--ok'
                  : 'founder-pill--muted'
              "
            >
              {{
                hasVerifiedEmail(selectedUser)
                  ? 'email verified'
                  : (selectedUser.email ?? '').trim()
                    ? 'email unverified'
                    : 'no email on file'
              }}
            </span>
            <span
              v-if="selectedUser.totpEnabled"
              class="founder-pill founder-pill--sm founder-pill--ok"
            >
              2FA on
            </span>
            <span
              v-if="selectedUser.phoneVerified"
              class="founder-pill founder-pill--sm founder-pill--muted"
            >
              phone ok
            </span>
            <span
              v-if="selectedUser.hasActiveSubscription"
              class="founder-pill founder-pill--sm founder-pill--info"
            >
              paying
            </span>
            <span class="founder-pill founder-pill--sm founder-pill--muted">
              plan {{ selectedUser.echoPlan || 'free' }}
            </span>
          </div>

          <dl class="founder-kvs">
            <div>
              <dt>User id</dt>
              <dd class="founder-mono founder-ellipsis">
                {{ selectedUser.id }}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{{ selectedUser.email || '—' }}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{{ selectedUser.phone || '—' }}</dd>
            </div>
            <div>
              <dt>Pending phone</dt>
              <dd>{{ selectedUser.pendingPhone || '—' }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{{ selectedUser.status }}</dd>
            </div>
            <div>
              <dt>Custom status</dt>
              <dd>{{ selectedUser.customStatus || '—' }}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{{ formatDate(selectedUser.createdAt) }}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{{ formatDate(selectedUser.updatedAt) }}</dd>
            </div>
            <template v-if="selectedUser.isGuest">
              <div>
                <dt>Guest minted</dt>
                <dd>{{ formatDate(selectedUser.guestMintedAt) }}</dd>
              </div>
              <div>
                <dt>Guest pending email</dt>
                <dd>{{ selectedUser.guestPendingEmail || '—' }}</dd>
              </div>
              <div>
                <dt>Guest suspended until</dt>
                <dd>{{ formatDate(selectedUser.guestSuspendedUntil) }}</dd>
              </div>
              <div>
                <dt>Guest deleted at</dt>
                <dd>{{ formatDate(selectedUser.guestDeletedAt) }}</dd>
              </div>
              <div>
                <dt>Total guest messages</dt>
                <dd>{{ selectedUser.guestTotalMessages ?? 0 }}</dd>
              </div>
            </template>
          </dl>

          <div class="founder-drawer__json">
            <header class="founder-subhead">
              <h4>Raw record</h4>
              <button
                type="button"
                class="founder-icon-btn"
                @click="
                  copyText(prettyJson(selectedUser), `user-${selectedUser.id}`)
                "
              >
                {{
                  copiedKey === `user-${selectedUser.id}`
                    ? 'Copied'
                    : 'Copy JSON'
                }}
              </button>
            </header>
            <pre class="founder-pre founder-pre--tall">{{
              prettyJson(selectedUser)
            }}</pre>
          </div>
        </div>
      </aside>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.founder-shell {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  color: var(--text);
  overflow-x: clip;
  overflow-y: visible;
  font-feature-settings:
    'cv11' 1,
    'ss01' 1;
  background: transparent;
}

.founder-shell__bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--founder-shell-bg);
  animation: founder-bg-drift 40s ease-in-out infinite alternate;
}

.founder-shell__noise {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.035;
  background-image: radial-gradient(
    var(--founder-noise-dot) 1px,
    transparent 1px
  );
  background-size: 3px 3px;
  mix-blend-mode: overlay;
}

@keyframes founder-bg-drift {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.07) translate3d(-1%, -1%, 0);
  }
}

.founder-main {
  position: relative;
  z-index: 1;
  margin: 0 auto;
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  max-width: 1680px;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.25rem 1.25rem 3rem;

  @media (min-width: 768px) {
    padding: 1.5rem 1.75rem 3rem;
  }
}

/* ----------------------------------------------------------------
 * Glass primitive — shared on every translucent surface.
 * -------------------------------------------------------------- */
.founder-glass {
  position: relative;
  background: var(--founder-glass-panel-bg);
  backdrop-filter: var(--founder-glass-backdrop);
  -webkit-backdrop-filter: var(--founder-glass-backdrop);
  border: 1px solid var(--founder-border-subtle);
  box-shadow: var(--founder-panel-shadow);
  border-radius: 22px;
}

.founder-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    var(--founder-panel-highlight),
    transparent 35%
  );
  opacity: 0.35;
  mix-blend-mode: overlay;
}

.founder-kicker {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--founder-kicker-fg);
}

/* ----------------------------------------------------------------
 * TOPBAR
 * -------------------------------------------------------------- */
.founder-topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  border-radius: 20px;
  flex-wrap: wrap;
}

.founder-topbar__left {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
}

.founder-brand {
  display: inline-flex;
  gap: 4px;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  background: var(--founder-accent-soft);
  border: 1px solid var(--founder-border-subtle);
}

.founder-brand__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--founder-accent);
  opacity: 0.85;
}

.founder-brand__dot:nth-child(2) {
  opacity: 0.6;
}
.founder-brand__dot:nth-child(3) {
  opacity: 0.35;
}

.founder-topbar__title h1 {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text);
  line-height: 1.2;
}

.founder-topbar__title .founder-kicker {
  margin-bottom: 0.1rem;
}

.founder-topbar__right {
  display: flex;
  gap: 0.55rem;
  margin-left: auto;
  align-items: center;
  flex-wrap: wrap;
}

.founder-topbar__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.founder-topbar__timestamp {
  font-size: 0.74rem;
  color: var(--founder-body-muted-2);
  letter-spacing: 0.02em;
}

/* ----------------------------------------------------------------
 * TABS
 * -------------------------------------------------------------- */
.founder-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.3rem;
  border-radius: 16px;
  background: var(--founder-glass-panel-bg);
  backdrop-filter: var(--founder-glass-backdrop);
  -webkit-backdrop-filter: var(--founder-glass-backdrop);
  border: 1px solid var(--founder-border-subtle);
  overflow-x: auto;
  scrollbar-width: none;
}

.founder-tabs::-webkit-scrollbar {
  display: none;
}

.founder-tab {
  flex: 0 0 auto;
  padding: 0.55rem 0.95rem;
  border: 0;
  background: transparent;
  color: var(--founder-body-muted);
  border-radius: 12px;
  font-size: 0.84rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
  white-space: nowrap;
}

.founder-tab:hover {
  color: var(--text);
  background: var(--founder-accent-soft);
}

.founder-tab.is-active {
  background: var(--founder-accent-soft);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--founder-accent-strong);
}

/* ----------------------------------------------------------------
 * SECTIONS / PANELS
 * -------------------------------------------------------------- */
.founder-section {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.founder-panel {
  padding: 1.1rem 1.25rem 1.25rem;
  border-radius: 22px;
}

.founder-panel--flush {
  padding: 0;
}

.founder-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.founder-panel--flush .founder-panel__head {
  padding: 1rem 1.25rem 0.85rem;
  margin-bottom: 0;
  border-bottom: 1px solid var(--founder-border-subtle);
}

.founder-panel__head h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.005em;
  color: var(--text);
}

.founder-panel__head p {
  margin: 0.3rem 0 0;
  color: var(--founder-body-muted);
  font-size: 0.86rem;
  line-height: 1.5;
}

.founder-panel__head--toolbar {
  flex-direction: column;
  align-items: stretch;

  @media (min-width: 900px) {
    flex-direction: row;
    align-items: center;
  }
}

.founder-split {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: 1fr;

  @media (min-width: 1100px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

/* ----------------------------------------------------------------
 * KPI
 * -------------------------------------------------------------- */
.founder-kpi-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
}

.founder-kpi {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1rem 1.1rem 1.1rem;
  border-radius: 20px;
}

.founder-kpi__label {
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--founder-stat-label);
  font-weight: 600;
}

.founder-kpi__value {
  font-size: clamp(1.6rem, 2vw, 2.1rem);
  line-height: 1.05;
  color: var(--text);
  letter-spacing: -0.02em;
}

.founder-kpi__value--sm {
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
}

.founder-kpi__sub {
  font-size: 0.8rem;
  color: var(--founder-body-muted);
}

.founder-kpi__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.founder-kpi__bar {
  height: 6px;
  border-radius: 999px;
  background: var(--founder-pill-muted-bg);
  overflow: hidden;
}

.founder-kpi__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--founder-kpi-bar-start),
    var(--founder-kpi-bar-end)
  );
  transition: width 240ms ease;
}

/* ----------------------------------------------------------------
 * KVS (definition list)
 * -------------------------------------------------------------- */
.founder-kvs {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  margin: 0;
}

.founder-kvs > div {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  background: var(--founder-pill-muted-bg);
  border: 1px solid var(--founder-border-subtle);
  min-width: 0;
}

.founder-kvs__full {
  grid-column: 1 / -1;
}

.founder-kvs dt {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--founder-stat-label);
}

.founder-kvs dd {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text);
  line-height: 1.4;
  min-width: 0;
}

/* ----------------------------------------------------------------
 * BUTTONS / PILLS
 * -------------------------------------------------------------- */
.founder-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.55rem 0.95rem;
  border: 0;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.86rem;
  letter-spacing: 0.005em;
  cursor: pointer;
  transition:
    transform 120ms ease,
    background-color 150ms ease,
    box-shadow 180ms ease,
    opacity 120ms ease;
}

.founder-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.founder-button:disabled {
  opacity: 0.55;
  cursor: default;
}

.founder-button--sm {
  padding: 0.4rem 0.7rem;
  font-size: 0.78rem;
  border-radius: 10px;
}

.founder-button--primary {
  background: var(--founder-btn-primary-bg);
  color: var(--founder-btn-primary-fg);
  box-shadow: var(--founder-btn-primary-glow);
}

.founder-button--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.founder-button--secondary {
  background: var(--founder-btn-secondary-bg);
  color: var(--founder-btn-secondary-fg);
  border: 1px solid var(--founder-btn-secondary-border);
}

.founder-button--secondary:hover:not(:disabled) {
  background: var(--founder-btn-secondary-bg-hover);
}

.founder-button--ghost {
  background: var(--founder-btn-ghost-bg);
  color: var(--text);
  border: 1px solid var(--founder-btn-ghost-border);
}

.founder-button--ghost:hover:not(:disabled) {
  background: var(--founder-btn-ghost-bg-hover);
}

.founder-button--danger {
  background: var(--founder-btn-danger-bg);
  color: var(--founder-btn-danger-fg);
  border: 1px solid var(--founder-btn-danger-border);
}

.founder-button--danger:hover:not(:disabled) {
  background: var(--founder-btn-danger-bg-hover);
}

.founder-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0 0.55rem;
  border: 1px solid var(--founder-border-subtle);
  background: var(--founder-pill-muted-bg);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  transition:
    background-color 140ms ease,
    transform 120ms ease;
}

.founder-icon-btn:hover {
  background: var(--founder-accent-soft);
  transform: translateY(-1px);
}

.founder-icon-btn--close {
  font-size: 0.95rem;
}

.founder-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  border: 1px solid transparent;
}

.founder-pill--sm {
  padding: 0.18rem 0.5rem;
  font-size: 0.68rem;
}

.founder-pill--ok {
  background: var(--founder-pill-ok-bg);
  color: var(--founder-pill-ok-fg);
  border-color: var(--founder-pill-ok-border);
}
.founder-pill--warn {
  background: var(--founder-pill-warn-bg);
  color: var(--founder-pill-warn-fg);
  border-color: var(--founder-pill-warn-border);
}
.founder-pill--err {
  background: var(--founder-pill-err-bg);
  color: var(--founder-pill-err-fg);
  border-color: var(--founder-pill-err-border);
}
.founder-pill--info {
  background: var(--founder-pill-info-bg);
  color: var(--founder-pill-info-fg);
  border-color: var(--founder-pill-info-border);
}
.founder-pill--muted {
  background: var(--founder-pill-muted-bg);
  color: var(--founder-pill-muted-fg);
  border-color: var(--founder-pill-muted-border);
}

.founder-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  display: inline-block;
  flex: none;
}

.founder-dot--ok {
  background: var(--founder-status-ok);
  box-shadow: var(--founder-status-ok-glow);
}
.founder-dot--warn {
  background: var(--founder-status-warn);
  box-shadow: var(--founder-status-warn-glow);
}
.founder-dot--err {
  background: var(--founder-status-err);
  box-shadow: var(--founder-status-err-glow);
}
.founder-dot--info,
.founder-dot--muted {
  background: var(--founder-accent);
  box-shadow: 0 0 0 3px var(--founder-accent-soft);
}

/* ----------------------------------------------------------------
 * SEGMENTED CONTROL
 * -------------------------------------------------------------- */
.founder-segmented {
  display: inline-flex;
  padding: 0.2rem;
  gap: 0.15rem;
  border-radius: 12px;
  background: var(--founder-pill-muted-bg);
  border: 1px solid var(--founder-border-subtle);
}

.founder-segmented--tight {
  padding: 0.15rem;
}

.founder-segmented__btn {
  border: 0;
  background: transparent;
  padding: 0.4rem 0.75rem;
  border-radius: 9px;
  color: var(--founder-body-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.founder-segmented--tight .founder-segmented__btn {
  padding: 0.3rem 0.55rem;
  font-size: 0.74rem;
}

.founder-segmented__btn:hover {
  color: var(--text);
}

.founder-segmented__btn.is-active {
  background: var(--founder-accent-soft);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--founder-accent-strong);
}

/* ----------------------------------------------------------------
 * TOOLBAR / SEARCH / CHECKBOX
 * -------------------------------------------------------------- */
.founder-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  padding: 0;
  flex: 1;
}

.founder-toolbar__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.founder-search {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 260px;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  background: var(--founder-input-bg);
  border: 1px solid var(--founder-input-border);
  color: var(--text);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
  flex: 1 1 260px;
}

.founder-search:focus-within {
  border-color: var(--founder-input-focus-border);
  box-shadow: 0 0 0 4px var(--founder-input-focus-ring);
  background: var(--founder-input-focus-bg);
}

.founder-search svg {
  color: var(--founder-body-muted);
  flex: none;
}

.founder-search input {
  border: 0;
  background: transparent;
  color: var(--text);
  outline: 0;
  width: 100%;
  font-size: 0.86rem;
  min-width: 0;
}

.founder-search input::placeholder {
  color: var(--founder-body-muted-2);
}

.founder-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.65rem;
  border-radius: 10px;
  background: var(--founder-pill-muted-bg);
  border: 1px solid var(--founder-border-subtle);
  color: var(--founder-body-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 140ms ease;
}

.founder-checkbox:hover {
  color: var(--text);
}

.founder-checkbox input {
  accent-color: var(--founder-accent);
}

.founder-count {
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  color: var(--founder-body-muted);
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: var(--founder-pill-muted-bg);
  border: 1px solid var(--founder-border-subtle);
}

.founder-count--inline {
  margin-left: 0.4rem;
}

/* ----------------------------------------------------------------
 * TABLE
 * -------------------------------------------------------------- */
.founder-table-wrap {
  overflow: auto;
  max-height: 72vh;
}

.founder-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 920px;
}

.founder-th,
.founder-td {
  padding: 0.9rem 1rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--founder-table-border);
}

.founder-th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--founder-table-head-bg);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--founder-table-th-fg);
  backdrop-filter: var(--founder-glass-backdrop);
  -webkit-backdrop-filter: var(--founder-glass-backdrop);
}

.founder-th--sortable {
  cursor: pointer;
  user-select: none;
}

.founder-th--sortable:hover {
  color: var(--text);
}

.founder-sort-arrow {
  margin-left: 0.3rem;
  color: var(--founder-accent);
}

.founder-tr {
  cursor: pointer;
  transition: background-color 140ms ease;
}

.founder-tr:hover {
  background: var(--founder-table-row-hover);
}

.founder-tr.is-active {
  background: var(--founder-table-row-active);
}

.founder-td strong {
  display: block;
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
}

.founder-td span {
  display: block;
  margin-top: 0.18rem;
  color: var(--founder-table-td-muted);
  font-size: 0.78rem;
}

.founder-td small {
  display: block;
  margin-top: 0.12rem;
  color: var(--founder-body-muted-2);
  font-size: 0.7rem;
}

.founder-td--user {
  min-width: 260px;
}

.founder-user-cell {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  min-width: 0;
}

.founder-user-cell > div:last-child {
  min-width: 0;
  flex: 1;
}

.founder-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.founder-empty-row {
  padding: 2rem;
  text-align: center;
  color: var(--founder-body-muted);
}

/* ----------------------------------------------------------------
 * AVATAR / STATUS
 * -------------------------------------------------------------- */
.founder-avatar {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--founder-avatar-grad);
  color: var(--founder-avatar-fg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  box-shadow: var(--founder-avatar-shadow);
  flex: none;
}

.founder-avatar--sm {
  width: 30px;
  height: 30px;
  font-size: 0.7rem;
  border-radius: 10px;
}

.founder-avatar--lg {
  width: 54px;
  height: 54px;
  font-size: 1rem;
  border-radius: 16px;
}

.founder-status-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid var(--founder-glass-panel-bg-strong);
}

.founder-status-dot--ok {
  background: var(--founder-status-ok);
}
.founder-status-dot--warn {
  background: var(--founder-status-warn);
}
.founder-status-dot--err {
  background: var(--founder-status-err);
}
.founder-status-dot--muted {
  background: var(--founder-status-muted);
}

/* ----------------------------------------------------------------
 * RECENT BUGS / SUB-HEAD
 * -------------------------------------------------------------- */
.founder-recent-bugs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.founder-recent-bug {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.85rem 0.95rem;
  border-radius: 14px;
  background: var(--founder-pill-muted-bg);
  border: 1px solid var(--founder-border-subtle);
}

.founder-recent-bug__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.founder-recent-bug__who {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
}

.founder-recent-bug__who strong {
  color: var(--text);
  font-size: 0.88rem;
}

.founder-recent-bug__who span {
  color: var(--founder-body-muted);
  font-size: 0.74rem;
}

.founder-recent-bug__body {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--founder-body-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.founder-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
}

.founder-subhead h4 {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text);
}

/* ----------------------------------------------------------------
 * DETAILS (collapsible)
 * -------------------------------------------------------------- */
.founder-details {
  border: 1px solid var(--founder-border-subtle);
  border-radius: 14px;
  background: var(--founder-details-bg);
  padding: 0.6rem 0.85rem;
}

.founder-details + .founder-details {
  margin-top: 0.55rem;
}

.founder-details--nested {
  background: transparent;
}

.founder-details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
  list-style: none;
  color: var(--founder-details-summary-fg);
  font-size: 0.85rem;
  font-weight: 600;
}

.founder-details summary::-webkit-details-marker {
  display: none;
}

.founder-details[open] summary {
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--founder-border-subtle);
  margin-bottom: 0.55rem;
}

.founder-details--report summary {
  align-items: flex-start;
}

.founder-bug-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: center;
  width: 100%;
}

.founder-bug-summary__who {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.founder-bug-summary__who strong {
  color: var(--text);
  font-size: 0.9rem;
}

.founder-bug-summary__who span {
  font-size: 0.74rem;
  color: var(--founder-body-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.founder-bug-summary__meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  text-align: right;
  font-size: 0.72rem;
  color: var(--founder-body-muted);
}

.founder-bug-summary__meta code {
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: var(--founder-body-muted-2);
}

.founder-bug-body {
  padding-top: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.founder-bug-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: 1fr;

  @media (min-width: 900px) {
    grid-template-columns: 1fr 1fr;
  }
}

/* ----------------------------------------------------------------
 * CODE / COPY
 * -------------------------------------------------------------- */
.founder-copy-block {
  position: relative;
  padding: 1rem 1rem 1rem;
  background: var(--founder-copy-bg);
  border: 1px solid var(--founder-copy-border);
  border-radius: 14px;
}

.founder-copy-block pre {
  margin: 0;
  white-space: pre-wrap;
  color: var(--founder-copy-fg);
  font-size: 0.9rem;
  line-height: 1.55;
  font-family: inherit;
}

.founder-copy-block .founder-icon-btn {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
}

.founder-pre {
  margin: 0;
  padding: 0.85rem 1rem;
  background: var(--founder-copy-bg);
  border: 1px solid var(--founder-copy-border);
  border-radius: 12px;
  color: var(--founder-copy-fg);
  font-family:
    ui-monospace, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 0.76rem;
  line-height: 1.55;
  max-height: 320px;
  overflow: auto;
  white-space: pre;
}

.founder-pre--tall {
  max-height: 480px;
}

.founder-simple-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--founder-simple-list-fg);
  font-size: 0.85rem;
  line-height: 1.55;
}

.founder-simple-list li + li {
  margin-top: 0.35rem;
}

.founder-simple-list a {
  color: var(--founder-accent);
  text-decoration: none;
}

.founder-simple-list a:hover {
  text-decoration: underline;
}

.founder-mono {
  font-family:
    ui-monospace, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  color: var(--founder-body-muted);
}

.founder-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.founder-empty {
  margin: 0;
  padding: 0.85rem 0.25rem;
  color: var(--founder-body-muted-2);
  font-size: 0.85rem;
  text-align: center;
}

/* ----------------------------------------------------------------
 * ROW CARDS (watcher tools, monitoring files)
 * -------------------------------------------------------------- */
.founder-row-grid {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.founder-row-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border-radius: 14px;
}

.founder-row-card strong {
  color: var(--text);
  font-size: 0.88rem;
  display: block;
}

.founder-row-card p {
  margin: 0.18rem 0 0;
  color: var(--founder-body-muted-2);
  font-size: 0.72rem;
  line-height: 1.4;
  word-break: break-all;
}

.founder-row-card__meta {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  text-align: right;
  font-size: 0.7rem;
  color: var(--founder-body-muted-2);
}

/* ----------------------------------------------------------------
 * LOGS
 * -------------------------------------------------------------- */
.founder-log-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.founder-log-summary {
  display: grid;
  grid-template-columns: minmax(0, 0.6fr) minmax(0, 1.2fr) auto;
  gap: 0.75rem;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.founder-log-summary strong {
  color: var(--text);
  font-size: 0.88rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.founder-log-summary__meta {
  font-size: 0.72rem;
  color: var(--founder-body-muted);
  text-align: right;
  white-space: nowrap;
}

.founder-log-body {
  position: relative;
  padding-top: 0.6rem;
}

.founder-log-copy {
  position: absolute;
  top: 0.35rem;
  right: 0.25rem;
  z-index: 2;
}

/* ----------------------------------------------------------------
 * LOGIN
 * -------------------------------------------------------------- */
.founder-login {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: 1fr;
  padding: 3rem 0 4rem;
  align-items: center;

  @media (min-width: 960px) {
    grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
    gap: 2.5rem;
    padding: 5rem 0 6rem;
  }
}

.founder-login__card {
  position: relative;
  padding: 2rem 2rem 2.2rem;
  border-radius: 26px;
  overflow: hidden;
  isolation: isolate;
}

.founder-login__accent {
  position: absolute;
  top: -60px;
  right: -60px;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    var(--founder-accent-strong),
    transparent 70%
  );
  filter: blur(20px);
  z-index: -1;
}

.founder-login__head h1 {
  margin: 0.3rem 0 0.5rem;
  font-size: 2rem;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text);
}

.founder-login__head p {
  margin: 0;
  color: var(--founder-body-muted);
  font-size: 0.9rem;
  line-height: 1.55;
}

.founder-login__form {
  margin-top: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.founder-login__aside {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: 1fr;

  @media (min-width: 720px) {
    grid-template-columns: 1fr 1fr;
  }
}

.founder-login__aside-card {
  padding: 1rem 1.1rem;
  border-radius: 18px;
}

.founder-login__aside-card h3 {
  margin: 0 0 0.3rem;
  font-size: 0.95rem;
  color: var(--text);
}

.founder-login__aside-card p {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--founder-body-muted);
}

/* ----------------------------------------------------------------
 * FIELD
 * -------------------------------------------------------------- */
.founder-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.founder-field > span {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--founder-field-label);
  letter-spacing: 0.02em;
}

.founder-field input {
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--founder-input-border);
  background: var(--founder-input-bg);
  color: var(--text);
  font-size: 0.9rem;
  outline: 0;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    background-color 120ms ease;
}

.founder-field input:focus {
  border-color: var(--founder-input-focus-border);
  box-shadow: 0 0 0 4px var(--founder-input-focus-ring);
  background: var(--founder-input-focus-bg);
}

/* ----------------------------------------------------------------
 * ERRORS / GATES / LOADING
 * -------------------------------------------------------------- */
.founder-inline-error {
  margin: 0;
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--founder-pill-err-border);
  background: var(--founder-pill-err-bg);
  color: var(--founder-pill-err-fg);
  font-size: 0.84rem;
}

.founder-inline-error--toast {
  margin-top: 0.25rem;
}

.founder-loading-panel,
.founder-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 3rem 2rem;
  text-align: center;
  color: var(--founder-body-muted);
  margin: 3rem auto;
  max-width: 640px;
  border-radius: 24px;
}

.founder-gate__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--founder-accent-soft);
  color: var(--founder-accent);
  box-shadow: inset 0 0 0 1px var(--founder-accent-strong);
}

.founder-gate h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text);
}

.founder-gate p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
}

.founder-gate code {
  font-family:
    ui-monospace, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  padding: 0.08rem 0.35rem;
  border-radius: 6px;
  background: var(--founder-pill-muted-bg);
  border: 1px solid var(--founder-border-subtle);
}

.founder-spinner {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2.5px solid var(--spinner-track);
  border-top-color: var(--founder-accent);
  animation: founder-spin 0.85s linear infinite;
}

.founder-spin {
  animation: founder-spin 0.85s linear infinite;
}

@keyframes founder-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ----------------------------------------------------------------
 * DRAWER
 * -------------------------------------------------------------- */
.founder-drawer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}

.founder-drawer__scrim {
  position: absolute;
  inset: 0;
  background: var(--founder-scrim-bg);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.founder-drawer__panel {
  position: relative;
  width: min(520px, 100%);
  max-height: 100vh;
  max-height: 100dvh;
  overflow: auto;
  padding: 1.35rem 1.4rem 2rem;
  border-radius: 20px 0 0 20px;
  border-right: 0;
  background: var(--founder-drawer-bg);
  box-shadow: var(--founder-drawer-shadow);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.founder-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.founder-drawer__identity {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
}

.founder-drawer__identity h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.founder-drawer__identity span {
  color: var(--founder-body-muted);
  font-size: 0.8rem;
}

.founder-drawer__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.founder-drawer__json {
  margin-top: 0.25rem;
}

.founder-drawer-enter-active,
.founder-drawer-leave-active {
  transition:
    opacity 220ms ease,
    transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.founder-drawer-enter-from,
.founder-drawer-leave-to {
  opacity: 0;
}

.founder-drawer-enter-from .founder-drawer__panel,
.founder-drawer-leave-to .founder-drawer__panel {
  transform: translateX(24px);
}

/* ----------------------------------------------------------------
 * RESPONSIVE TWEAKS
 * -------------------------------------------------------------- */
@media (max-width: 768px) {
  .founder-topbar {
    gap: 0.6rem;
  }

  .founder-topbar__right {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
  }

  .founder-drawer__panel {
    width: 100%;
    border-radius: 20px 20px 0 0;
    margin-top: auto;
    max-height: 92vh;
    max-height: 92dvh;
  }

  .founder-drawer {
    align-items: flex-end;
    justify-content: center;
  }
}
</style>
