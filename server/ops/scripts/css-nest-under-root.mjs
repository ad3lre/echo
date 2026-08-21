#!/usr/bin/env node
/**
 * Nest flat CSS (selectors prefixed with `.rootClass`) under a single SCSS block.
 * Usage: node server/ops/scripts/css-nest-under-root.mjs <input.css> <output.scss> <rootClass>
 */
import fs from 'node:fs';
import postcss from 'postcss';

const [inputPath, outputPath, rootClass] = process.argv.slice(2);
if (!inputPath || !outputPath || !rootClass) {
  console.error(
    'Usage: node server/ops/scripts/css-nest-under-root.mjs <input.css> <output.scss> <rootClass>',
  );
  process.exit(1);
}

const rootPrefix = `.${rootClass}`;
const css = fs.readFileSync(inputPath, 'utf8');
const ast = postcss.parse(css);

/** @param {string} selector */
function stripRootPrefix(selector) {
  const trimmed = selector.trim();
  if (trimmed === rootPrefix) return '&';
  if (trimmed.startsWith(`${rootPrefix}[`)) {
    return `&${trimmed.slice(rootPrefix.length)}`;
  }
  if (trimmed.startsWith(`${rootPrefix}:`)) {
    return `&${trimmed.slice(rootPrefix.length)}`;
  }
  if (trimmed.startsWith(`${rootPrefix} `)) {
    return trimmed.slice(rootPrefix.length + 1);
  }
  return null;
}

/** @param {string} selector */
function splitSelector(selector) {
  const nested = [];
  const outside = [];
  for (const part of selector.split(',').map((s) => s.trim())) {
    const inner = stripRootPrefix(part);
    if (inner === null) outside.push(part);
    else nested.push(inner);
  }
  return { nested, outside };
}

/** @param {import('postcss').Container} container */
function partitionContainer(container) {
  /** @type {import('postcss').ChildNode[]} */
  const nested = [];
  /** @type {import('postcss').ChildNode[]} */
  const outside = [];

  for (const node of [...container.nodes]) {
    if (node.type === 'comment') {
      nested.push(node.clone());
      continue;
    }

    if (node.type === 'rule') {
      const { nested: nSel, outside: oSel } = splitSelector(node.selector);
      if (oSel.length > 0) {
        outside.push(
          postcss.rule({ selector: oSel.join(', '), nodes: node.nodes }),
        );
      }
      if (nSel.length > 0) {
        nested.push(
          postcss.rule({ selector: nSel.join(', '), nodes: node.nodes }),
        );
      }
      continue;
    }

    if (node.type === 'atrule') {
      const inner = partitionContainer(node);
      if (inner.outside.length > 0) {
        const outAt = postcss.atRule({
          name: node.name,
          params: node.params,
          nodes: inner.outside,
        });
        outside.push(outAt);
      }
      if (inner.nested.length > 0) {
        const nestedAt = postcss.atRule({
          name: node.name,
          params: node.params,
          nodes: inner.nested,
        });
        nested.push(nestedAt);
      }
      continue;
    }

    nested.push(node.clone());
  }

  return { nested, outside };
}

const { nested, outside } = partitionContainer(ast);

const output = postcss.root();
for (const node of outside) output.append(node);

output.append(
  postcss.rule({
    selector: rootPrefix,
    nodes: nested,
  }),
);

fs.writeFileSync(outputPath, `${output.toString()}\n`);
console.log(`Wrote ${outputPath}`);
