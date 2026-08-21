import { EventEmitter } from 'events';
import type { Message } from '../../../../contracts/types/message';
import type { EchoWorkspaceEvent } from '../../../../contracts/types/socket';

export type BotMessageEvent = {
  kind: 'message';
  channelId: string;
  serverId: string;
  message: Message;
};

export type BotMessageUpdateEvent = {
  kind: 'message:updated';
  channelId: string;
  serverId: string;
  messageId: string;
  content: string;
  editedAt: string;
};

export type BotMessageDeleteEvent = {
  kind: 'message:deleted';
  channelId: string;
  serverId: string;
  messageId: string;
};

export type BotWorkspaceEvent = {
  kind: 'workspace';
  payload: EchoWorkspaceEvent;
};

export type BotEvent =
  | BotMessageEvent
  | BotMessageUpdateEvent
  | BotMessageDeleteEvent
  | BotWorkspaceEvent;

class BotEventBus extends EventEmitter {
  emitBotEvent(event: BotEvent): void {
    this.emit('event', event);
  }
}

export const botEventBus = new BotEventBus();
// Allow many concurrent gateway connections without spurious MaxListeners warnings.
botEventBus.setMaxListeners(2000);
