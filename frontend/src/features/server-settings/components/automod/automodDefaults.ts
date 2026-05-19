import type {
  AutomodAction,
  AutomodGroupNode,
  AutomodNode,
} from '@shared/types/automod';

export function newAutomodUiId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function defaultAutomodConditionTree(): AutomodGroupNode {
  return {
    kind: 'group',
    id: newAutomodUiId(),
    combinator: 'AND',
    children: [
      {
        kind: 'condition',
        id: newAutomodUiId(),
        field: 'message.content',
        op: 'contains',
        value: 'edit-this-phrase',
      },
    ],
  };
}

export function defaultAutomodActions(): AutomodAction[] {
  return [{ kind: 'block_message', phase: 'pre_send' }];
}

export function countAutomodNodes(node: AutomodNode): number {
  if (node.kind === 'condition') return 1;
  return 1 + node.children.reduce((a, c) => a + countAutomodNodes(c), 0);
}

export function maxAutomodDepth(node: AutomodNode, d = 1): number {
  if (node.kind === 'condition') return d;
  if (node.children.length === 0) return d;
  return Math.max(...node.children.map((c) => maxAutomodDepth(c, d + 1)));
}
