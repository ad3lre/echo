/**
 * Bundled DM / group call ringtones (`?url` → hashed URLs at build time).
 * Source: pack folders under `src/assets/sounds/Ringtones/` (flat duplicates are not bundled).
 */
import bopsBeachBowling from '@/assets/sounds/Ringtones/Bops/Beach Bowling.mp3?url';
import bopsKiki from '@/assets/sounds/Ringtones/Bops/Kiki.mp3?url';
import bopsStealYoGirl from '@/assets/sounds/Ringtones/Bops/Steal yo girl.mp3?url';
import dialtoneDigiDate from '@/assets/sounds/Ringtones/Dialtone/Digi-date.ogg?url';
import dialtoneEchoMachine from '@/assets/sounds/Ringtones/Dialtone/Echo Machine.ogg?url';
import dialtoneEdSharron from '@/assets/sounds/Ringtones/Dialtone/Ed Sharron.ogg?url';
import dialtoneFmtySonic from '@/assets/sounds/Ringtones/Dialtone/FMTY Sonic.ogg?url';
import dialtoneFncDance from '@/assets/sounds/Ringtones/Dialtone/FNC Dance.ogg?url';
import dialtoneGlitchDance from '@/assets/sounds/Ringtones/Dialtone/Glitch Dance.ogg?url';
import dialtoneGlitchyBanger from '@/assets/sounds/Ringtones/Dialtone/Glitchy Banger.ogg?url';
import dialtoneHtrag from '@/assets/sounds/Ringtones/Dialtone/HTRAG.ogg?url';
import dialtoneIndianMafia from '@/assets/sounds/Ringtones/Dialtone/Indian Mafia.mp3?url';
import dialtonePingMeAgain from '@/assets/sounds/Ringtones/Dialtone/Ping Me Again.mp3?url';
import retro8BitBattle from '@/assets/sounds/Ringtones/Retro/8-Bit Battle.ogg?url';
import retro80sCommerical from '@/assets/sounds/Ringtones/Retro/80s Commerical.ogg?url';
import retroPixelDance from '@/assets/sounds/Ringtones/Retro/Pixel Dance.mp3?url';
import retroPixelParty from '@/assets/sounds/Ringtones/Retro/Pixel Party.mp3?url';
import retroQuickBit from '@/assets/sounds/Ringtones/Retro/Quick Bit.mp3?url';
import retroRsl from '@/assets/sounds/Ringtones/Retro/RSL.mp3?url';
import vibesDownwardSpiraling from '@/assets/sounds/Ringtones/Vibes/Downward Spiraling.ogg?url';
import vibesGalacticDrake from '@/assets/sounds/Ringtones/Vibes/Galactic Drake.ogg?url';
import vibesGalaxyDance from '@/assets/sounds/Ringtones/Vibes/Galaxy Dance.ogg?url';
import vibesGlassWait from '@/assets/sounds/Ringtones/Vibes/Glass Wait.ogg?url';
import vibesGrooveyGlass from '@/assets/sounds/Ringtones/Vibes/Groovey Glass.ogg?url';
import vibesModestRing from '@/assets/sounds/Ringtones/Vibes/Modest Ring.ogg?url';
import vibesNeutron from '@/assets/sounds/Ringtones/Vibes/Neutron.ogg?url';
import vibesOneEightNine from '@/assets/sounds/Ringtones/Vibes/One Eight Nine.ogg?url';
import vibesRoyalMess from '@/assets/sounds/Ringtones/Vibes/Royal Mess.mp3?url';
import vibesStateFarm from '@/assets/sounds/Ringtones/Vibes/State Farm.mp3?url';
import vibesWobblyGlass from '@/assets/sounds/Ringtones/Vibes/Wobbly Glass.mp3?url';

export const CALL_RINGTONE_PACK_ORDER = [
  'Bops',
  'Dialtone',
  'Retro',
  'Vibes',
] as const;

export type CallRingtonePackLabel = (typeof CALL_RINGTONE_PACK_ORDER)[number];

export type CallRingtoneEntry = {
  id: string;
  label: string;
  url: string;
  packLabel: CallRingtonePackLabel;
};

/** Default when no persisted selection (matches previous first built-in: Glass Wait). */
export const CALL_RINGTONE_DEFAULT_BUILTIN_ID = 'vibes:glass-wait';

/** Maps pre-pack `builtin:*` ids (camelCase) to pack ids. */
export const LEGACY_BUILTIN_RINGTONE_IDS: Readonly<Record<string, string>> = {
  glassWait: 'vibes:glass-wait',
  glitchDance: 'dialtone:glitch-dance',
  grooveyGlass: 'vibes:groovey-glass',
  modestRing: 'vibes:modest-ring',
  pixelDance: 'retro:pixel-dance',
  pixelParty: 'retro:pixel-party',
  wobblyGlass: 'vibes:wobbly-glass',
};

function labelFromFileName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '') || 'Ringtone';
}

export const CALL_RINGTONE_ENTRIES: readonly CallRingtoneEntry[] = [
  {
    id: 'bops:beach-bowling',
    label: labelFromFileName('Beach Bowling.mp3'),
    url: bopsBeachBowling,
    packLabel: 'Bops',
  },
  {
    id: 'bops:kiki',
    label: labelFromFileName('Kiki.mp3'),
    url: bopsKiki,
    packLabel: 'Bops',
  },
  {
    id: 'bops:steal-yo-girl',
    label: labelFromFileName('Steal yo girl.mp3'),
    url: bopsStealYoGirl,
    packLabel: 'Bops',
  },
  {
    id: 'dialtone:digi-date',
    label: labelFromFileName('Digi-date.ogg'),
    url: dialtoneDigiDate,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:echo-machine',
    label: labelFromFileName('Echo Machine.ogg'),
    url: dialtoneEchoMachine,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:ed-sharron',
    label: labelFromFileName('Ed Sharron.ogg'),
    url: dialtoneEdSharron,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:fmty-sonic',
    label: labelFromFileName('FMTY Sonic.ogg'),
    url: dialtoneFmtySonic,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:fnc-dance',
    label: labelFromFileName('FNC Dance.ogg'),
    url: dialtoneFncDance,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:glitch-dance',
    label: labelFromFileName('Glitch Dance.ogg'),
    url: dialtoneGlitchDance,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:glitchy-banger',
    label: labelFromFileName('Glitchy Banger.ogg'),
    url: dialtoneGlitchyBanger,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:htrag',
    label: labelFromFileName('HTRAG.ogg'),
    url: dialtoneHtrag,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:indian-mafia',
    label: labelFromFileName('Indian Mafia.mp3'),
    url: dialtoneIndianMafia,
    packLabel: 'Dialtone',
  },
  {
    id: 'dialtone:ping-me-again',
    label: labelFromFileName('Ping Me Again.mp3'),
    url: dialtonePingMeAgain,
    packLabel: 'Dialtone',
  },
  {
    id: 'retro:8-bit-battle',
    label: labelFromFileName('8-Bit Battle.ogg'),
    url: retro8BitBattle,
    packLabel: 'Retro',
  },
  {
    id: 'retro:80s-commerical',
    label: labelFromFileName('80s Commerical.ogg'),
    url: retro80sCommerical,
    packLabel: 'Retro',
  },
  {
    id: 'retro:pixel-dance',
    label: labelFromFileName('Pixel Dance.mp3'),
    url: retroPixelDance,
    packLabel: 'Retro',
  },
  {
    id: 'retro:pixel-party',
    label: labelFromFileName('Pixel Party.mp3'),
    url: retroPixelParty,
    packLabel: 'Retro',
  },
  {
    id: 'retro:quick-bit',
    label: labelFromFileName('Quick Bit.mp3'),
    url: retroQuickBit,
    packLabel: 'Retro',
  },
  {
    id: 'retro:rsl',
    label: labelFromFileName('RSL.mp3'),
    url: retroRsl,
    packLabel: 'Retro',
  },
  {
    id: 'vibes:downward-spiraling',
    label: labelFromFileName('Downward Spiraling.ogg'),
    url: vibesDownwardSpiraling,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:galactic-drake',
    label: labelFromFileName('Galactic Drake.ogg'),
    url: vibesGalacticDrake,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:galaxy-dance',
    label: labelFromFileName('Galaxy Dance.ogg'),
    url: vibesGalaxyDance,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:glass-wait',
    label: labelFromFileName('Glass Wait.ogg'),
    url: vibesGlassWait,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:groovey-glass',
    label: labelFromFileName('Groovey Glass.ogg'),
    url: vibesGrooveyGlass,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:modest-ring',
    label: labelFromFileName('Modest Ring.ogg'),
    url: vibesModestRing,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:neutron',
    label: labelFromFileName('Neutron.ogg'),
    url: vibesNeutron,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:one-eight-nine',
    label: labelFromFileName('One Eight Nine.ogg'),
    url: vibesOneEightNine,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:royal-mess',
    label: labelFromFileName('Royal Mess.mp3'),
    url: vibesRoyalMess,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:state-farm',
    label: labelFromFileName('State Farm.mp3'),
    url: vibesStateFarm,
    packLabel: 'Vibes',
  },
  {
    id: 'vibes:wobbly-glass',
    label: labelFromFileName('Wobbly Glass.mp3'),
    url: vibesWobblyGlass,
    packLabel: 'Vibes',
  },
] as const;

/**
 * MP3 used for {@link HTMLAudioElement} when the selected ringtone is Ogg and
 * the browser cannot decode Ogg in `<audio>` (e.g. iOS Safari).
 */
export const CALL_RINGTONE_PLAYBACK_FALLBACK_URL: string = bopsBeachBowling;

export const CALL_RINGTONE_COUNT = CALL_RINGTONE_ENTRIES.length;

export function callRingtoneUrlByIndex(index: number): string | null {
  const n = CALL_RINGTONE_ENTRIES.length;
  if (n === 0) return null;
  const i = ((index % n) + n) % n;
  return CALL_RINGTONE_ENTRIES[i]?.url ?? null;
}

export function callRingtoneLabelByIndex(index: number): string {
  const n = CALL_RINGTONE_ENTRIES.length;
  if (n === 0) return '';
  const i = ((index % n) + n) % n;
  return CALL_RINGTONE_ENTRIES[i]?.label ?? '';
}
