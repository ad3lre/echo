import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { EchoTicket, EchoTicketConfig } from '@shared/types/ticket';
import {
  createEchoTicket,
  deleteEchoTicket,
  fetchEchoTicketByChannelId,
  fetchEchoTicketConfig,
  fetchEchoTickets,
  patchEchoTicket,
  patchEchoTicketConfig,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';

export const useServerTicketsStore = defineStore('serverTickets', () => {
  const configByServer = shallowRef<Record<string, EchoTicketConfig>>({});
  const ticketsByServer = shallowRef<Record<string, EchoTicket[]>>({});
  const ticketByChannel = shallowRef<Record<string, EchoTicket | null>>({});
  const loading = ref(false);
  const mutating = ref(false);
  const lastError = ref<string | null>(null);

  function configFor(serverId: string): EchoTicketConfig | undefined {
    return configByServer.value[serverId];
  }

  function ticketsFor(serverId: string): EchoTicket[] {
    return ticketsByServer.value[serverId] ?? [];
  }

  function ticketForChannel(channelId: string): EchoTicket | null | undefined {
    return ticketByChannel.value[channelId];
  }

  async function loadConfig(serverId: string, token: string): Promise<void> {
    lastError.value = null;
    loading.value = true;
    try {
      const config = await fetchEchoTicketConfig(token, serverId);
      configByServer.value = { ...configByServer.value, [serverId]: config };
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig(
    serverId: string,
    token: string,
    updates: Partial<EchoTicketConfig>,
  ): Promise<EchoTicketConfig | null> {
    lastError.value = null;
    mutating.value = true;
    try {
      const config = await patchEchoTicketConfig(token, serverId, updates);
      configByServer.value = { ...configByServer.value, [serverId]: config };
      return config;
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
      return null;
    } finally {
      mutating.value = false;
    }
  }

  async function loadTickets(
    serverId: string,
    token: string,
    opts?: { status?: string; mine?: boolean },
  ): Promise<void> {
    lastError.value = null;
    loading.value = true;
    try {
      const { tickets } = await fetchEchoTickets(token, serverId, opts);
      ticketsByServer.value = { ...ticketsByServer.value, [serverId]: tickets };
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function loadTicketForChannel(
    serverId: string,
    channelId: string,
    token: string,
  ): Promise<EchoTicket | null> {
    try {
      const ticket = await fetchEchoTicketByChannelId(
        token,
        serverId,
        channelId,
      );
      ticketByChannel.value = { ...ticketByChannel.value, [channelId]: ticket };
      return ticket;
    } catch {
      ticketByChannel.value = { ...ticketByChannel.value, [channelId]: null };
      return null;
    }
  }

  async function submitTicket(
    serverId: string,
    token: string,
    body: {
      subject: string;
      category?: string | null;
      answers?: Record<string, unknown>;
    },
  ): Promise<EchoTicket | null> {
    lastError.value = null;
    mutating.value = true;
    try {
      const ticket = await createEchoTicket(token, serverId, body);
      const current = ticketsByServer.value[serverId] ?? [];
      ticketsByServer.value = {
        ...ticketsByServer.value,
        [serverId]: [ticket, ...current],
      };
      return ticket;
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
      return null;
    } finally {
      mutating.value = false;
    }
  }

  async function updateTicket(
    serverId: string,
    ticketId: string,
    token: string,
    body: { status?: string; assignedTo?: string | null },
  ): Promise<EchoTicket | null> {
    lastError.value = null;
    mutating.value = true;
    try {
      const updated = await patchEchoTicket(token, serverId, ticketId, body);
      const current = ticketsByServer.value[serverId] ?? [];
      ticketsByServer.value = {
        ...ticketsByServer.value,
        [serverId]: current.map((t) => (t.id === ticketId ? updated : t)),
      };
      if (updated.channelId) {
        ticketByChannel.value = {
          ...ticketByChannel.value,
          [updated.channelId]: updated,
        };
      }
      return updated;
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
      return null;
    } finally {
      mutating.value = false;
    }
  }

  async function removeTicket(
    serverId: string,
    ticketId: string,
    token: string,
  ): Promise<boolean> {
    lastError.value = null;
    mutating.value = true;
    try {
      await deleteEchoTicket(token, serverId, ticketId);
      const current = ticketsByServer.value[serverId] ?? [];
      ticketsByServer.value = {
        ...ticketsByServer.value,
        [serverId]: current.filter((t) => t.id !== ticketId),
      };
      return true;
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
      return false;
    } finally {
      mutating.value = false;
    }
  }

  return {
    configByServer,
    ticketsByServer,
    ticketByChannel,
    loading,
    mutating,
    lastError,
    configFor,
    ticketsFor,
    ticketForChannel,
    loadConfig,
    saveConfig,
    loadTickets,
    loadTicketForChannel,
    submitTicket,
    updateTicket,
    removeTicket,
  };
});
