import type { FastifyBaseLogger } from 'fastify';
import type { PeerAddition, SessionPeerConfig } from '@honcho-ai/sdk';
import { getHonchoClient, isHonchoActive } from './client';

export type HonchoPeerConfigInput = {
  observeMe?: boolean;
  observeOthers?: boolean;
};

function peerAdditionFromConfig(
  peers?: Record<string, HonchoPeerConfigInput>,
): PeerAddition | undefined {
  if (!peers || Object.keys(peers).length === 0) return undefined;
  const additions: [string, SessionPeerConfig][] = [];
  for (const [peerId, cfg] of Object.entries(peers)) {
    const id = peerId.trim();
    if (!id) continue;
    additions.push([
      id,
      {
        ...(cfg.observeMe !== undefined ? { observeMe: cfg.observeMe } : {}),
        ...(cfg.observeOthers !== undefined
          ? { observeOthers: cfg.observeOthers }
          : {}),
      },
    ]);
  }
  return additions.length > 0 ? additions : undefined;
}

export async function honchoEnsureSession(
  sessionId: string,
  peers?: Record<string, HonchoPeerConfigInput>,
): Promise<{ sessionId: string }> {
  const honcho = getHonchoClient();
  const session = await honcho.session(sessionId);
  const peerAddition = peerAdditionFromConfig(peers);
  if (peerAddition) {
    await session.addPeers(peerAddition);
  }
  return { sessionId: session.id };
}

export async function honchoRecordMessage(opts: {
  sessionId: string;
  peerId: string;
  content: string;
  metadata?: Record<string, unknown>;
  observeMe?: boolean;
}): Promise<{ messageId: string }> {
  const content = opts.content.trim();
  if (!content) {
    throw new Error('Honcho message content must be non-empty');
  }
  const honcho = getHonchoClient();
  const peer = await honcho.peer(opts.peerId);
  const session = await honcho.session(opts.sessionId);
  await session.addPeers([
    [opts.peerId, { observeMe: opts.observeMe ?? true }],
  ]);
  const created = await session.addMessages([
    peer.message(
      content,
      opts.metadata ? { metadata: opts.metadata } : undefined,
    ),
  ]);
  const first = created[0];
  if (!first) {
    throw new Error('Honcho did not return a created message');
  }
  return { messageId: first.id };
}

export async function honchoQueryPeer(opts: {
  peerId: string;
  query: string;
  sessionId?: string;
  targetPeerId?: string;
  reasoningLevel?: string;
}): Promise<{ content: string | null }> {
  const query = opts.query.trim();
  if (!query) {
    throw new Error('Honcho chat query must be non-empty');
  }
  const honcho = getHonchoClient();
  const peer = await honcho.peer(opts.peerId);
  const content = await peer.chat(query, {
    ...(opts.sessionId ? { session: opts.sessionId } : {}),
    ...(opts.targetPeerId ? { target: opts.targetPeerId } : {}),
    ...(opts.reasoningLevel ? { reasoningLevel: opts.reasoningLevel } : {}),
  });
  return { content };
}

/**
 * Fire-and-forget sync of a persisted Echo chat message into Honcho memory.
 * Skips empty content and never throws to callers.
 */
export function scheduleHonchoMessageSync(
  log: FastifyBaseLogger,
  opts: {
    channelId: string;
    userId: string;
    messageId: string;
    content: string;
  },
): void {
  if (!isHonchoActive()) return;
  const content = opts.content.trim();
  if (!content) return;
  void (async () => {
    try {
      await honchoRecordMessage({
        sessionId: opts.channelId,
        peerId: opts.userId,
        content,
        metadata: {
          echoMessageId: opts.messageId,
          echoChannelId: opts.channelId,
          isUser: true,
        },
      });
      log.info(
        {
          msg: 'honcho.message_synced',
          channelId: opts.channelId,
          userId: opts.userId,
          messageId: opts.messageId,
        },
        'Synced Echo message to Honcho',
      );
    } catch (err) {
      log.warn(
        {
          err,
          msg: 'honcho.message_sync_failed',
          channelId: opts.channelId,
          userId: opts.userId,
          messageId: opts.messageId,
        },
        'Failed to sync Echo message to Honcho',
      );
    }
  })();
}
