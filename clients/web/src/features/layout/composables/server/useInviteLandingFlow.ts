import { ref, computed, watch, type ComputedRef, type Ref } from 'vue';
import { fetchEchoInvitePreview } from '@/api/echo/invitesAndDirectory';
import { postEchoJoinWithInviteToken } from '@/api/echo/invitesAndDirectory';
import type { EchoInvitePreviewDto } from '@/api/echo/types';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import type { RailTab } from '@/features/layout/mainSurface';
import {
  normalizePathname,
  RESERVED_TOP_LEVEL_PATH_SLUGS,
  stripBasePath,
} from '@/features/layout/urlNavigation';

const PENDING_INVITE_STORAGE_KEY = 'echo:pendingInvite';

function readPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function writePendingInvite(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, code);
    else sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  } catch {
    /* private browsing / quota */
  }
}

/**
 * Detect invite URL slugs for unauthenticated users and drive the branded
 * invite landing experience.  Persists the pending invite code in
 * `sessionStorage` so it survives OAuth redirects.
 */
export function useInviteLandingFlow(deps: {
  base: string;
  isAuthenticated: ComputedRef<boolean>;
  workspaceReady: ComputedRef<boolean>;
  activeRailTab: Ref<RailTab>;
  /** IDs of servers the user has already joined. */
  joinedServerIds: ComputedRef<string[]>;
  /** IDs + vanity codes for servers the user has joined. */
  joinedServerSlugs: ComputedRef<{ id: string; vanityCode?: string }[]>;
  openServerSurface: (serverId: string, channelId?: string | null) => void;
  selectExploreTab: () => void;
  /** Re-fetch workspace after a join so the new server appears in the rail. */
  refreshWorkspace: () => void | Promise<void>;
}) {
  const inviteCode = ref<string | null>(null);
  const invitePreview = ref<EchoInvitePreviewDto | null>(null);
  const isLoading = ref(false);
  const previewError = ref<string | null>(null);
  const joinBusy = ref(false);
  const joinError = ref<string | null>(null);

  /** True when the invite landing view should replace WelcomeBackExploreGate. */
  const inviteLandingActive = computed(
    () =>
      !deps.isAuthenticated.value &&
      !!inviteCode.value &&
      (!!invitePreview.value || isLoading.value),
  );

  // ---------------------------------------------------------------------------
  // Boot: detect invite slug from URL or sessionStorage
  // ---------------------------------------------------------------------------

  /**
   * Bare vanity short links only (`/{code}`). Never treat `/channels/{serverId}/…`
   * guild navigation as an invite — that was spamming join 404s with snowflake ids.
   */
  function detectInviteFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const p = normalizePathname(
      stripBasePath(window.location.pathname, deps.base),
    );
    if (!/^\/[^/]+$/.test(p)) return null;
    let slug: string;
    try {
      slug = decodeURIComponent(p.slice(1)).trim();
    } catch {
      return null;
    }
    if (!slug) return null;
    if (RESERVED_TOP_LEVEL_PATH_SLUGS.has(slug.toLowerCase())) return null;
    // Snowflake/UUID path segments are server ids, not vanity invite codes.
    if (isEchoGraphId(slug)) return null;
    return slug;
  }

  function sanitizePendingInviteCode(code: string | null): string | null {
    const t = code?.trim() || null;
    if (!t) return null;
    if (isEchoGraphId(t)) return null;
    if (RESERVED_TOP_LEVEL_PATH_SLUGS.has(t.toLowerCase())) return null;
    return t;
  }

  function isSlugJoinedServer(slug: string): boolean {
    const lower = slug.toLowerCase();
    return deps.joinedServerSlugs.value.some(
      (s) =>
        s.id === slug || (s.vanityCode ?? '').trim().toLowerCase() === lower,
    );
  }

  async function fetchPreview(code: string) {
    isLoading.value = true;
    previewError.value = null;
    try {
      const data = await fetchEchoInvitePreview(code);
      if (!data) {
        previewError.value = 'This invite is invalid or has expired.';
        return;
      }
      invitePreview.value = data;
    } catch {
      previewError.value = 'Failed to load invite preview.';
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Attempt to activate the invite landing for the current URL.
   * Called once when the composable mounts (before workspace loads).
   */
  function initFromUrl() {
    const slug = detectInviteFromUrl();
    const stored = sanitizePendingInviteCode(readPendingInvite());
    if (readPendingInvite() && !stored) {
      // Drop stale snowflake/server-id leftovers from older builds.
      writePendingInvite(null);
    }
    const code = slug || stored;
    if (!code) return;

    if (deps.isAuthenticated.value) {
      // Authenticated user — don't show the landing.  Post-auth redemption
      // will pick up the stored code in `redeemPendingInviteIfNeeded`.
      if (slug && !stored) writePendingInvite(slug);
      return;
    }

    inviteCode.value = code;
    writePendingInvite(code);
    void fetchPreview(code);
  }

  // ---------------------------------------------------------------------------
  // Post-auth: redeem the pending invite after login / OAuth return
  // ---------------------------------------------------------------------------

  async function redeemPendingInviteIfNeeded(authToken: string | null) {
    const code = sanitizePendingInviteCode(readPendingInvite());
    if (!code) {
      if (readPendingInvite()) writePendingInvite(null);
      return;
    }

    // Already a member of the target server?
    if (invitePreview.value?.serverId) {
      const sid = invitePreview.value.serverId;
      if (deps.joinedServerIds.value.includes(sid)) {
        writePendingInvite(null);
        inviteCode.value = null;
        invitePreview.value = null;
        deps.openServerSurface(sid);
        return;
      }
    }

    joinBusy.value = true;
    joinError.value = null;
    try {
      const result = await postEchoJoinWithInviteToken(authToken ?? '', code);
      writePendingInvite(null);
      inviteCode.value = null;
      invitePreview.value = null;

      if (!result.alreadyMember) {
        await deps.refreshWorkspace();
      }
      deps.openServerSurface(result.serverId);
    } catch (err) {
      joinError.value =
        err instanceof Error ? err.message : 'Failed to join server.';
    } finally {
      joinBusy.value = false;
    }
  }

  /**
   * Watch for auth transitions (false -> true).  When the user logs in while
   * the invite landing is active, or returns from an OAuth redirect with a
   * pending invite in sessionStorage, auto-redeem.
   */
  watch(
    () => deps.isAuthenticated.value && deps.workspaceReady.value,
    (ready) => {
      if (!ready) return;
      if (!sanitizePendingInviteCode(readPendingInvite())) {
        if (readPendingInvite()) writePendingInvite(null);
        return;
      }
      void redeemPendingInviteIfNeeded(null);
    },
  );

  // ---------------------------------------------------------------------------
  // Persistence helpers for OAuth redirects
  // ---------------------------------------------------------------------------

  /** Save the invite code before navigating away for OAuth. */
  function persistInviteBeforeOAuth() {
    if (inviteCode.value) {
      writePendingInvite(inviteCode.value);
    }
  }

  function clearPendingInvite() {
    writePendingInvite(null);
    inviteCode.value = null;
    invitePreview.value = null;
    previewError.value = null;
    joinError.value = null;
  }

  return {
    inviteCode,
    invitePreview,
    inviteLandingActive,
    isLoading,
    previewError,
    joinBusy,
    joinError,
    initFromUrl,
    redeemPendingInviteIfNeeded,
    persistInviteBeforeOAuth,
    clearPendingInvite,
  };
}
