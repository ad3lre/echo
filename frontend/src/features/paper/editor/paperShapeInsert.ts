import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import {
  defaultPaperShapeSize,
  PAPER_DEFAULT_SHAPE_FILL,
  type PaperShapeAlign,
  type PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';

export type PaperShapeInsertAttrs = {
  shape: PaperShapeKind;
  fill?: string;
  width?: string;
  height?: string;
  align?: PaperShapeAlign;
};

function buildShapeNode(
  schema: ProseMirrorNode['type']['schema'],
  attrs: PaperShapeInsertAttrs,
): ProseMirrorNode {
  const shape = attrs.shape ?? 'rectangle';
  const size = defaultPaperShapeSize(shape);
  return schema.nodes.paperShape.create({
    shape,
    fill: attrs.fill ?? PAPER_DEFAULT_SHAPE_FILL,
    width: attrs.width ?? size.width,
    height: attrs.height ?? size.height,
    align: attrs.align ?? 'center',
  });
}

type ShapeInsertContext =
  | { kind: 'in-row'; rowPos: number; insertPos: number }
  | { kind: 'standalone'; shapePos: number; shapeNode: ProseMirrorNode }
  | { kind: 'doc' };

function contextFromShapeNode(
  shapeNode: ProseMirrorNode,
  shapePos: number,
  parent: ProseMirrorNode,
): ShapeInsertContext {
  if (parent.type.name === 'paperShapeRow') {
    return {
      kind: 'in-row',
      rowPos: shapePos,
      insertPos: shapePos + shapeNode.nodeSize,
    };
  }
  return { kind: 'standalone', shapePos, shapeNode };
}

function resolveShapeInsertContext(editor: Editor): ShapeInsertContext {
  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;

  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === 'paperShape'
  ) {
    const shapePos = selection.from;
    const parent = state.doc.resolve(shapePos).parent;
    return contextFromShapeNode(selection.node, shapePos, parent);
  }

  if ($from.parent.type.name === 'paperShape') {
    const shapeDepth = $from.depth;
    const shapePos = $from.before(shapeDepth);
    const shapeNode = $from.parent;
    const grandParent = $from.node(shapeDepth - 1);
    return contextFromShapeNode(shapeNode, shapePos, grandParent);
  }

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'paperShape') {
      const parent = $from.node(depth - 1);
      return contextFromShapeNode(node, $from.before(depth), parent);
    }
  }

  const nodeBefore = $from.nodeBefore;
  if (nodeBefore?.type.name === 'paperShape') {
    const shapePos = $from.pos - nodeBefore.nodeSize;
    const parent = state.doc.resolve(shapePos).parent;
    return contextFromShapeNode(nodeBefore, shapePos, parent);
  }

  return { kind: 'doc' };
}

/** Insert a shape, placing it beside the selected shape when possible. */
export function insertPaperShapeAdjacent(
  editor: Editor,
  attrs: PaperShapeInsertAttrs,
): boolean {
  const { state, view } = editor;
  const { schema } = state;
  const rowType = schema.nodes.paperShapeRow;
  const newShape = buildShapeNode(schema, attrs);
  const ctx = resolveShapeInsertContext(editor);
  let tr = state.tr;

  if (ctx.kind === 'in-row' && rowType) {
    tr = tr.insert(ctx.insertPos, newShape);
  } else if (ctx.kind === 'standalone' && rowType) {
    const row = rowType.create(null, [ctx.shapeNode, newShape]);
    tr = tr.replaceWith(
      ctx.shapePos,
      ctx.shapePos + ctx.shapeNode.nodeSize,
      row,
    );
  } else {
    return false;
  }

  try {
    view.dispatch(tr.scrollIntoView());
    return true;
  } catch {
    return false;
  }
}
