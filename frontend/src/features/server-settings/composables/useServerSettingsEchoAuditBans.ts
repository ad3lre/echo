import { computed, ref, watch, type Ref } from 'vue';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import {
  fetchEchoAuditLog,
  fetchEchoServerBans,
  postEchoModerationAction,
} from '@/api/echoClient';
import { isEchoGraphId } from '@/utils/echoIds';
import type {
  AuditActorCatalogRow,
  AuditLogEntry,
} from '@/features/server-settings/composables/useServerSettingsAudit';
import {
  describeEchoAuditAction,
  echoAuditActionToCategory,
  formatBanExpiresLabel,
  formatShortRelative,
  type BanListRowUi,
} from '@/features/server-settings/auditBanFormatting';
import { sessionUserDisplayName } from '@/utils/memberProfiles';

export type UseServerSettingsEchoAuditBansOptions = {
  modelValue: Ref<boolean>;
  server: Ref<{
    id: string;
    name?: string;
    ownerId?: string;
    vanityCode?: string;
    description?: string;
    imageUrl?: string;
    bannerImageUrl?: string;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
  } | null>;
  accessToken: Ref<string | null | undefined>;
  /** Drives `GET /audit?actorId=` refetch when changed (Echo mode). */
  auditActorFilter: Ref<string>;
  /** Refetch audit + bans when user opens these sections (e.g. after a ban elsewhere). */
  activeSection?: Ref<ServerSettingsSection>;
};

export function useServerSettingsEchoAuditBans(
  opts: UseServerSettingsEchoAuditBansOptions,
) {
  const useEchoSettingsApi = computed(
    () => !!opts.server.value?.id && isEchoGraphId(opts.server.value.id),
  );

  const liveAuditEntries = ref<AuditLogEntry[]>([]);
  const auditActorCatalog = ref<AuditActorCatalogRow[]>([]);
  const echoBanRows = ref<BanListRowUi[]>([]);

  async function refreshEchoAuditAndBans() {
    if (!useEchoSettingsApi.value || !opts.server.value) return;
    const token = opts.accessToken.value ?? '';
    try {
      const sel = opts.auditActorFilter.value;
      const actorId = sel !== 'All' ? sel : undefined;
      const [auditRes, bansRes] = await Promise.all([
        fetchEchoAuditLog(token, opts.server.value.id, 200, { actorId }),
        fetchEchoServerBans(token, opts.server.value.id),
      ]);
      if (!actorId) {
        const m = new Map<string, string>();
        for (const e of auditRes.entries) {
          const id = String(e.actor_id);
          const label = (e.actor_label || 'Unknown').trim() || 'Unknown';
          if (!m.has(id)) m.set(id, label);
        }
        auditActorCatalog.value = [...m.entries()]
          .map(([id, label]) => ({ id, label }))
          .sort((a, b) => a.label.localeCompare(b.label));
      }
      liveAuditEntries.value = auditRes.entries.map((e) => {
        const createdAt = new Date(e.created_at).getTime();
        return {
          id: e.id,
          actorId: String(e.actor_id),
          tab: echoAuditActionToCategory(e.action),
          actor: (e.actor_label || 'Unknown').trim() || 'Unknown',
          action: describeEchoAuditAction(e.action, e.target_type, e.target_id),
          time: formatShortRelative(e.created_at),
          createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
        };
      });
      echoBanRows.value = bansRes.bans.map((b) => ({
        id: b.userId,
        userName:
          sessionUserDisplayName(b.displayName, b.username ?? '').trim() ||
          'User',
        userPfp: b.pfp || '',
        reason: b.reason?.trim() ? b.reason.trim() : '—',
        moderator: b.bannedByLabel?.trim() ? b.bannedByLabel.trim() : '—',
        expiresAt: b.expiresAt ? formatBanExpiresLabel(b.expiresAt) : null,
        createdAtLabel: formatShortRelative(b.createdAt),
      }));
    } catch {
      liveAuditEntries.value = [];
      auditActorCatalog.value = [];
      echoBanRows.value = [];
    }
  }

  watch(
    () =>
      [
        opts.modelValue.value,
        opts.server.value?.id,
        useEchoSettingsApi.value,
        opts.auditActorFilter.value,
      ] as const,
    ([open]) => {
      if (!open) return;
      if (useEchoSettingsApi.value) void refreshEchoAuditAndBans();
    },
  );

  if (opts.activeSection) {
    watch(
      () => [opts.modelValue.value, opts.activeSection!.value] as const,
      ([open, section]) => {
        if (!open || !useEchoSettingsApi.value) return;
        if (section === 'Audit Log' || section === 'Bans') {
          void refreshEchoAuditAndBans();
        }
      },
    );
  }

  const banSearchQuery = ref('');
  const banScopeFilter = ref<'all' | 'temporary' | 'permanent'>('all');

  const filteredBans = computed(() => {
    const q = banSearchQuery.value.trim().toLowerCase();
    return echoBanRows.value.filter((ban) => {
      if (banScopeFilter.value === 'temporary' && !ban.expiresAt) return false;
      if (banScopeFilter.value === 'permanent' && ban.expiresAt) return false;
      if (!q) return true;
      return (
        ban.userName.toLowerCase().includes(q) ||
        ban.reason.toLowerCase().includes(q) ||
        ban.moderator.toLowerCase().includes(q)
      );
    });
  });

  async function unbanMember(banId: string, reason: string): Promise<boolean> {
    if (!useEchoSettingsApi.value || !opts.server.value) return false;
    const token = opts.accessToken.value ?? '';
    const r = reason.trim().slice(0, 500);
    if (!r) return false;
    try {
      await postEchoModerationAction(token, opts.server.value.id, {
        action: 'unban',
        targetUserId: banId,
        meta: { reason: r },
      });
      echoBanRows.value = echoBanRows.value.filter((b) => b.id !== banId);
      return true;
    } catch {
      void refreshEchoAuditAndBans();
      return false;
    }
  }

  return {
    useEchoSettingsApi,
    liveAuditEntries,
    auditActorCatalog,
    banSearchQuery,
    banScopeFilter,
    filteredBans,
    unbanMember,
  };
}
