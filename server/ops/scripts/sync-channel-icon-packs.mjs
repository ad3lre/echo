/**
 * Vendors curated channel icons from @phosphor-icons/core (MIT) into
 * clients/web/src/assets/icons/ with math- and hobby- prefixes.
 *
 * Run: node server/ops/scripts/sync-channel-icon-packs.mjs
 * Requires: npm install (devDependency @phosphor-icons/core)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');
const phosphorFillDir = path.join(
  repoRoot,
  'node_modules/@phosphor-icons/core/assets/fill',
);
const iconsOutDir = path.join(repoRoot, 'clients/web/src/assets/icons');

/** phosphor basename (without -fill.svg) → output filename */
const MATH_PACK = {
  sigma: 'math-sigma.svg',
  pi: 'math-pi.svg',
  infinity: 'math-infinity.svg',
  calculator: 'math-calculator.svg',
  percent: 'math-percent.svg',
  divide: 'math-divide.svg',
  'plus-minus': 'math-plus-minus.svg',
  equals: 'math-equals.svg',
  function: 'math-function.svg',
  'math-operations': 'math-operations.svg',
  radical: 'math-radical.svg',
  'chart-line': 'math-chart-line.svg',
  'chart-bar': 'math-chart-bar.svg',
  'chart-pie': 'math-chart-pie.svg',
  'list-numbers': 'math-list-numbers.svg',
  atom: 'math-atom.svg',
  dna: 'math-dna.svg',
  flask: 'math-flask.svg',
  microscope: 'math-microscope.svg',
  ruler: 'math-ruler.svg',
  'graduation-cap': 'math-graduation.svg',
  brain: 'math-brain.svg',
};

const HOBBY_PACK = {
  'game-controller': 'hobby-game-controller.svg',
  'dice-six': 'hobby-dice.svg',
  trophy: 'hobby-trophy.svg',
  medal: 'hobby-medal.svg',
  'puzzle-piece': 'hobby-puzzle.svg',
  palette: 'hobby-palette.svg',
  'paint-brush': 'hobby-paint-brush.svg',
  guitar: 'hobby-guitar.svg',
  'piano-keys': 'hobby-piano.svg',
  'music-notes': 'hobby-music-notes.svg',
  'flower-tulip': 'hobby-flower.svg',
  'tree-palm': 'hobby-tree.svg',
  leaf: 'hobby-leaf.svg',
  'paw-print': 'hobby-paw.svg',
  fish: 'hobby-fish.svg',
  basketball: 'hobby-basketball.svg',
  football: 'hobby-football.svg',
  'soccer-ball': 'hobby-soccer.svg',
  'tennis-ball': 'hobby-tennis.svg',
  volleyball: 'hobby-volleyball.svg',
  golf: 'hobby-golf.svg',
  campfire: 'hobby-campfire.svg',
  tent: 'hobby-tent.svg',
  mountains: 'hobby-mountains.svg',
  backpack: 'hobby-backpack.svg',
  bicycle: 'hobby-bicycle.svg',
  train: 'hobby-train.svg',
  'rocket-launch': 'hobby-rocket.svg',
  planet: 'hobby-planet.svg',
  ghost: 'hobby-ghost.svg',
  skull: 'hobby-skull.svg',
  robot: 'hobby-robot.svg',
  'magic-wand': 'hobby-magic-wand.svg',
  alien: 'hobby-alien.svg',
  balloon: 'hobby-balloon.svg',
};

function normalizeSvg(content) {
  return content.replace(/fill="currentColor"/g, 'fill="rgb(0,0,0)"');
}

function phosphorSourcePath(stem) {
  return path.join(phosphorFillDir, `${stem}-fill.svg`);
}

function syncPack(pack, label) {
  let ok = 0;
  let missing = 0;
  for (const [stem, outName] of Object.entries(pack)) {
    const src = phosphorSourcePath(stem);
    const dest = path.join(iconsOutDir, outName);
    if (!fs.existsSync(src)) {
      console.warn(`⚠️  ${label}: missing phosphor icon ${stem}-fill.svg`);
      missing++;
      continue;
    }
    const raw = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, normalizeSvg(raw));
    ok++;
  }
  return { ok, missing };
}

function main() {
  if (!fs.existsSync(phosphorFillDir)) {
    console.error('❌ @phosphor-icons/core not found. Run: npm install');
    process.exit(1);
  }
  if (!fs.existsSync(iconsOutDir)) {
    console.error(`❌ Icons directory not found: ${iconsOutDir}`);
    process.exit(1);
  }

  const math = syncPack(MATH_PACK, 'math');
  const hobby = syncPack(HOBBY_PACK, 'hobby');
  console.log(
    `✅ Channel icon packs synced: math ${math.ok} (${math.missing} missing), hobby ${hobby.ok} (${hobby.missing} missing)`,
  );
  if (math.missing + hobby.missing > 0) process.exit(1);
}

main();
