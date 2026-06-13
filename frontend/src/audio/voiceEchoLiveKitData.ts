/** Binary JSON payloads on LiveKit `publishData` / `RoomEvent.DataReceived`. */

// Barrel: the per-activity codecs live in ./voiceData/* so this module stays a
// stable import surface. Each sub-module is self-contained (TextEncoder + JSON).
export * from './voiceData/youtubeActivity';
export * from './voiceData/watchTogetherActivity';
export * from './voiceData/mediaPlaybackSync';
export * from './voiceData/vcActivityPresence';
export * from './voiceData/ticTacToe';
export * from './voiceData/hangman';
export * from './voiceData/skriggles';
export * from './voiceData/codenames';
export * from './voiceData/vcCore';
