#!/usr/bin/env node
/**
 * Nest `.block__*` rules under `.block { }` in SCSS.
 * Usage: node server/ops/scripts/css-nest-bem-block.mjs <input.scss> <output.scss> <blockClass>
 */
import fs from 'node:fs';
import postcss from 'postcss';

const [inputPath, outputPath, blockClass] = process.argv.slice(2);
if (!inputPath || !outputPath || !blockClass) {
  console.error(
    'Usage: node server/ops/scripts/css-nest-bem-block.mjs <in.scss> <out.scss> <blockClass>',
  );
  process.exit(1);
}

const blockSel = `.${blockClass}`;
const elemPrefix = `${blockSel}__`;
const css = fs.readFileSync(inputPath, 'utf8');
const ast = postcss.parse(css);

/** @type {import('postcss').ChildNode[]} */
const before = [];
/** @type {import('postcss').Rule[]} */
const blockBase = [];
/** @type {import('postcss').Rule[]} */
const blockElem = [];
/** @type {import('postcss').ChildNode[]} */
const after = [];

let phase = 'before';

for (const node of ast.nodes) {
  if (node.type !== 'rule') {
    if (phase === 'elem') phase = 'after';
    (phase === 'before' ? before : after).push(node.clone());
    continue;
  }

  const sel = node.selector.trim();
  if (sel === blockSel) {
    blockBase.push(node);
    phase = 'elem';
    continue;
  }

  if (sel.startsWith(elemPrefix) || sel.includes(`${elemPrefix}`)) {
    blockElem.push(node);
    phase = 'elem';
    continue;
  }

  if (phase === 'elem' || blockBase.length > 0) {
    phase = 'after';
    after.push(node.clone());
  } else {
    before.push(node.clone());
  }
}

function toElemSelector(selector) {
  return selector
    .split(',')
    .map((part) => {
      const s = part.trim();
      if (s.startsWith(elemPrefix)) {
        return `&${s.slice(blockSel.length)}`;
      }
      return s.replaceAll(blockSel, '&');
    })
    .join(', ');
}

const output = postcss.root();
for (const node of before) output.append(node);

const blockRule = postcss.rule({ selector: blockSel, nodes: [] });
for (const rule of blockBase) {
  for (const decl of rule.nodes) blockRule.append(decl.clone());
}
for (const rule of blockElem) {
  blockRule.append(
    postcss.rule({
      selector: toElemSelector(rule.selector),
      nodes: rule.nodes,
    }),
  );
}
output.append(blockRule);

for (const node of after) output.append(node);

fs.writeFileSync(outputPath, `${output.toString()}\n`);
console.log(`Wrote ${outputPath}`);
