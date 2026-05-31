#!/usr/bin/env node
/**
 * Nest `.prefix-*` rules under `.rootClass` (VC tic-tac-toe pattern).
 * Usage: node scripts/css-nest-under-prefix.mjs <input.css> <output.scss> <rootClass> <classPrefix>
 */
import fs from 'node:fs';
import postcss from 'postcss';

const [inputPath, outputPath, rootClass, classPrefix] = process.argv.slice(2);
if (!inputPath || !outputPath || !rootClass || !classPrefix) {
  console.error(
    'Usage: node scripts/css-nest-under-prefix.mjs <in.css> <out.scss> <rootClass> <classPrefix>',
  );
  process.exit(1);
}

const rootSel = `.${rootClass}`;
const css = fs.readFileSync(inputPath, 'utf8');
const ast = postcss.parse(css);

/** @param {string} selector */
function belongsInsideRoot(selector) {
  return selector.split(',').every((part) => {
    const s = part.trim();
    if (
      s === rootSel ||
      s.startsWith(`${rootSel} `) ||
      s.startsWith(`${rootSel}[`)
    ) {
      return true;
    }
    if (s.startsWith(`.${classPrefix}`)) return true;
    return false;
  });
}

/** @param {string} selector */
function toNestedSelector(selector) {
  return selector
    .split(',')
    .map((part) => {
      const s = part.trim();
      if (s === rootSel) return '&';
      if (s.startsWith(`${rootSel}[`)) return `&${s.slice(rootSel.length)}`;
      if (s.startsWith(`${rootSel} `)) return s.slice(rootSel.length + 1);
      return s;
    })
    .join(', ');
}

/** @param {import('postcss').Container} container */
function partition(container) {
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
      if (belongsInsideRoot(node.selector)) {
        nested.push(
          postcss.rule({
            selector: toNestedSelector(node.selector),
            nodes: node.nodes,
          }),
        );
      } else {
        outside.push(node.clone());
      }
      continue;
    }

    if (node.type === 'atrule') {
      if (node.name === 'keyframes') {
        outside.push(node.clone());
        continue;
      }
      const inner = partition(node);
      if (inner.outside.length > 0) {
        outside.push(
          postcss.atRule({
            name: node.name,
            params: node.params,
            nodes: inner.outside,
          }),
        );
      }
      if (inner.nested.length > 0) {
        nested.push(
          postcss.atRule({
            name: node.name,
            params: node.params,
            nodes: inner.nested,
          }),
        );
      }
      continue;
    }

    outside.push(node.clone());
  }

  return { nested, outside };
}

const { nested, outside } = partition(ast);
const output = postcss.root();
for (const node of outside) output.append(node);
output.append(postcss.rule({ selector: rootSel, nodes: nested }));

fs.writeFileSync(outputPath, `${output.toString()}\n`);
console.log(`Wrote ${outputPath}`);
