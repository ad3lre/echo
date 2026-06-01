/**
 * Generates the icons section of frontend/src/assets/index.ts
 * - Converts filenames to camelCase keys
 * - Validates paths exist (skips missing, logs warning)
 * - Supports preferred filenames (e.g., search.svg over search-2.svg)
 *
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const iconsDir = path.join(__dirname, '../frontend/src/assets/icons');

/**
 * Map of key -> candidate filenames (first existing wins)
 */
const iconMapping = {
  echoRounded: ['echo-rounded-logo.png', 'echo-rounded-trans.svg'],
  echo: ['echo-logo.png', 'echo.svg'],
  hashtag: ['hashtag.svg'],
  volumeUp: ['volume up.svg'],
  usersAvatar: ['Users avatar.svg', 'Users avatar-2.svg'],
  mic: ['mic.svg'],
  headphones: ['headphones.svg'],
  settings: ['settings.svg'],
  plus: ['plus.svg'],
  logIn: ['log in.svg', 'log in-2.svg'],
  list: ['list.svg'],
  gif: ['GIF.svg'],
  emotes: ['Emotes.svg'],
  emotesServerNav: ['Emotes-server-nav.svg'],
  stopwatch: ['stopwatch.svg'],
  search: ['SEARCH-NORMAL.svg', 'search.svg', 'search-3.svg', 'search-2.svg'],
  sliders: ['sliders.svg', 'sliders-2.svg'],
  message: ['message.svg', 'message-4.svg'],
  messageFilled: ['message-filled.svg'],
  messageAlt: [
    'MESSAGE-STYLED-RIGHT-ALIGNMENT-SEMI.svg',
    'message-3.svg',
    'message-5.svg',
  ],
  more: ['more information.svg', 'more information-2.svg'],
  // Friend buttons
  friendAdd: ['user avatar-13.svg'],
  friendAdded: ['user avatar-20.svg'],
  // Voice controls
  cameraOn: ['camera-on.svg', 'camera.svg'],
  desktop: ['desktop.svg'],
  stream: ['stream.svg'],
  logOut: ['log out.svg'],
  // Explore = branded rocket (use specific rocket.svg first so we don't flip styles)
  explore: [
    'rocket.svg',
    'rocket-2.svg',
    'rocket launch.svg',
    'rocket launch-2.svg',
  ],
  // Servers rail = people/group silhouette, not a literal server rack
  community: [
    'multiple-users-silhouette.svg',
    'multiple-users-silhouette-filled.svg',
  ],
  communityFilled: [
    'multiple-users-silhouette-filled.svg',
    'multiple-users-silhouette.svg',
  ],
  bellSchool: ['bell-school.svg', 'bell-school-2.svg', 'bell-school-3.svg'],
  laptopCode: ['laptop code.svg'],
  camera: ['camera.svg', 'camera-on.svg'],
  musicNote: ['music note.svg', 'music note-2.svg'],
  speedometer: ['speedometer.svg', 'speedometer-2.svg'],
  crown: ['crown.svg', 'crown-2.svg'],
  telescope: ['telescope.svg'],
  rocketLaunch: ['rocket launch.svg', 'rocket launch-2.svg'],
  mugHot: ['mug-hot.svg', 'mug-hot-2.svg'],
  sofa: ['sofa.svg', 'sofa-2.svg'],
  puzzle: ['puzzle.svg', 'puzzle-2.svg'],
  globe: ['globe.svg', 'globe earth.svg'],
  leaf: ['leaf.svg'],
  imageGallery: ['image gallery.svg', 'image gallery-2.svg'],
  thumbtack: ['thumbtack.svg'],
  profileView: ['USER-AVATAR-IDENTIFY.svg', 'user avatar-4.svg'],
};

function findExistingFile(candidates) {
  for (const file of candidates) {
    const fullPath = path.join(iconsDir, file);
    if (fs.existsSync(fullPath)) return file;
  }
  return null;
}

function generateIconsSection() {
  const importLines = ['// Icons'];
  const objectEntries = [];

  for (const [key, candidates] of Object.entries(iconMapping)) {
    const found = findExistingFile(candidates);
    if (!found) {
      console.warn(
        `⚠️  No icon found for "${key}" (tried: ${candidates.join(', ')})`,
      );
      continue;
    }

    const varName = 'icon' + key.charAt(0).toUpperCase() + key.slice(1);
    const relPath = `./icons/${found}`;
    importLines.push(`import ${varName} from '${relPath}?url';`);
    objectEntries.push(`  ${key}: ${varName} ?? '',`);
  }

  return {
    imports: importLines.join('\n'),
    object: ['export const icons = {', ...objectEntries, '};'].join('\n'),
  };
}

function main() {
  if (!fs.existsSync(iconsDir)) {
    console.error(`❌ Icons directory not found: ${iconsDir}`);
    process.exit(1);
  }

  const { imports, object } = generateIconsSection();
  const indexPath = path.join(__dirname, '../frontend/src/assets/index.ts');
  let content = fs.readFileSync(indexPath, 'utf8');

  // Replace icon imports: from "// Icons" through last "import iconX..." before "// User avatars"
  const iconsStart = content.indexOf('// Icons');
  const userAvatarsStart = content.indexOf('// User avatars');
  if (iconsStart === -1 || userAvatarsStart === -1) {
    console.error('❌ Could not find section boundaries');
    process.exit(1);
  }

  content =
    content.slice(0, iconsStart) +
    imports +
    '\n\n' +
    content.slice(userAvatarsStart);

  // Replace icons object: from "export const icons = {" through "};" before "export const channelIcons"
  const objStart = content.indexOf('export const icons = {');
  const objEnd = content.indexOf('\n};', objStart) + 3;
  const chStart = content.indexOf('export const channelIcons');
  if (objStart === -1 || objEnd === -1 || chStart === -1) {
    console.error('❌ Could not find icons object boundaries');
    process.exit(1);
  }

  content =
    content.slice(0, objStart) + object + '\n\n' + content.slice(chStart);
  fs.writeFileSync(indexPath, content);
  console.log('✅ Icons index updated');
}

main();
