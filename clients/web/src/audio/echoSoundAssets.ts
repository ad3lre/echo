/**
 * Bundled Echo UI sounds (`?url` → hashed asset URL at build time).
 * Source files: `src/assets/sounds/*.ogg`
 */
import streamStart from '@/assets/sounds/Streaming ON.ogg?url';
import streamEnd from '@/assets/sounds/Streaming OFF.ogg?url';
import videoStart from '@/assets/sounds/Camera ON.ogg?url';
import videoEnd from '@/assets/sounds/Camera OFF.ogg?url';
/** Viewer: you subscribed to another user’s screen share. */
import streamJoinSelf from '@/assets/sounds/Stream Join.ogg?url';
/** Streamer: joined VC / viewer context — same asset for multiple logical ids. */
import joinVc from '@/assets/sounds/Join VC.ogg?url';
/** Streamer: a remote participant left while you are sharing screen. */
import streamViewerLeave from '@/assets/sounds/Stream Leave.ogg?url';
import pttOn from '@/assets/sounds/Push To Talk Start.ogg?url';
import pttOff from '@/assets/sounds/Push To Talk Off.ogg?url';
import vcMute from '@/assets/sounds/Mute.ogg?url';
import vcUnmute from '@/assets/sounds/Unmute.ogg?url';
import vcDeafen from '@/assets/sounds/Deafen.ogg?url';
import vcUndeafen from '@/assets/sounds/Undeafen.ogg?url';
import pingActive from '@/assets/sounds/Active Ping.ogg?url';
import pingDirectMention from '@/assets/sounds/Direct Mention Ping.ogg?url';
import pingDm from '@/assets/sounds/DM Ping.ogg?url';
import pingEveryone from '@/assets/sounds/Everyone Ping.ogg?url';
/** Optional: user left VC (reserved for future hooks; same asset family as stream viewer leave). */
import leaveVc from '@/assets/sounds/Leave VC.ogg?url';

const ECHO_SOUND_URLS = {
  streamStart,
  streamEnd,
  videoStart,
  videoEnd,
  streamJoinSelf,
  streamViewerArrive: joinVc,
  /** Local: you connected to a voice channel. */
  joinVoiceChannel: joinVc,
  streamViewerLeave,
  pttOn,
  pttOff,
  vcMute,
  vcUnmute,
  vcDeafen,
  vcUndeafen,
  pingActive,
  pingDirectMention,
  pingDm,
  pingEveryone,
  leaveVc,
} as const;

export type EchoSoundId = keyof typeof ECHO_SOUND_URLS;

/** Stable order for preload (all bundled ids). */
export const ECHO_SOUND_IDS = Object.keys(ECHO_SOUND_URLS) as EchoSoundId[];

/** Human-readable source filenames (for logging / sound design docs). */
export const ECHO_SOUND_SOURCE_FILES: Record<EchoSoundId, string> = {
  streamStart: 'Streaming ON.ogg',
  streamEnd: 'Streaming OFF.ogg',
  videoStart: 'Camera ON.ogg',
  videoEnd: 'Camera OFF.ogg',
  streamJoinSelf: 'Stream Join.ogg',
  streamViewerArrive: 'Join VC.ogg',
  joinVoiceChannel: 'Join VC.ogg',
  streamViewerLeave: 'Stream Leave.ogg',
  pttOn: 'Push To Talk Start.ogg',
  pttOff: 'Push To Talk Off.ogg',
  vcMute: 'Mute.ogg',
  vcUnmute: 'Unmute.ogg',
  vcDeafen: 'Deafen.ogg',
  vcUndeafen: 'Undeafen.ogg',
  pingActive: 'Active Ping.ogg',
  pingDirectMention: 'Direct Mention Ping.ogg',
  pingDm: 'DM Ping.ogg',
  pingEveryone: 'Everyone Ping.ogg',
  leaveVc: 'Leave VC.ogg',
};

export function echoSoundUrl(id: EchoSoundId): string {
  return ECHO_SOUND_URLS[id];
}
