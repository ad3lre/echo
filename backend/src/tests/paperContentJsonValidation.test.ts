/**
 * Run: node --import tsx backend/src/tests/paperContentJsonValidation.test.ts
 */
import assert from 'node:assert/strict';
import { validatePaperContentJsonForWrite } from '../domain/contentJsonValidation';

function testAcceptsPaperShapeNode(): void {
  const result = validatePaperContentJsonForWrite({
    type: 'doc',
    content: [
      {
        type: 'paperShape',
        attrs: {
          shape: 'rectangle',
          fill: '#3b82f6',
          width: '120px',
          height: '120px',
          align: 'center',
        },
      },
    ],
  });
  assert.equal(result.ok, true);
}

function testRejectsUnknownNodeType(): void {
  const result = validatePaperContentJsonForWrite({
    type: 'doc',
    content: [{ type: 'notARealNode' }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /unknown node type/);
  }
}

function testRejectsInvalidPaperShapeKind(): void {
  const result = validatePaperContentJsonForWrite({
    type: 'doc',
    content: [
      {
        type: 'paperShape',
        attrs: { shape: 'hexagon', fill: '#fff' },
      },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /paperShape invalid shape/);
  }
}

function run(): void {
  testAcceptsPaperShapeNode();
  testRejectsUnknownNodeType();
  testRejectsInvalidPaperShapeKind();
  console.log('paperContentJsonValidation.test.ts: ok');
}

run();
