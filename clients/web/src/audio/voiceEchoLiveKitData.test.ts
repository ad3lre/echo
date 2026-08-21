import { describe, expect, it } from 'vitest';
import * as vcData from './voiceEchoLiveKitData';

function bytes(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

describe('voice Echo LiveKit data codecs', () => {
  it('round-trips YouTube activity, presence, and public/private media payloads', () => {
    const youtube = {
      v: 1,
      t: 'youtube_activity',
      updatedAt: 100,
      fromUserId: 'host',
      fromName: 'Host',
      activityPhase: 'youtube',
      playlist: [{ id: 'video-1', title: 'Song' }],
      currentIndex: 0,
      youtubeBrowseOpen: true,
      ytPlayback: { playing: true, mediaTimeSec: 12.5, wallMs: 90 },
      codenamesRoomUrl: 'legacy-field',
    };
    expect(
      vcData.decodeEchoYoutubeActivity(
        vcData.encodeEchoYoutubeActivity(youtube as never),
      ),
    ).toEqual({
      ...youtube,
      codenamesRoomUrl: undefined,
    });
    expect(
      vcData.decodeEchoYoutubeActivity(
        bytes({ ...youtube, activityPhase: 'unknown' }),
      ),
    ).toBeNull();
    expect(
      vcData.decodeEchoYoutubeActivity(
        bytes({ ...youtube, playlist: [{ title: 'missing id' }] }),
      )?.playlist,
    ).toEqual([]);

    expect(
      vcData.decodeEchoVcActivityPresence(
        vcData.encodeEchoVcActivityPresence({
          v: 1,
          t: 'vc_activity_presence',
          updatedAt: 101,
          activities: ['youtube', 'not-real', 'codenames'] as never,
        }),
      ),
    ).toEqual({
      v: 1,
      t: 'vc_activity_presence',
      updatedAt: 101,
      activities: ['youtube', 'codenames'],
    });

    expect(
      vcData.decodeEchoVcData(
        vcData.encodeEchoVcData({
          v: 1,
          t: 'public_media',
          kind: 'stream_start',
          userId: 'u1',
          name: 'Ada',
        }),
      ),
    ).toEqual({
      v: 1,
      t: 'public_media',
      kind: 'stream_start',
      userId: 'u1',
      name: 'Ada',
    });
    expect(
      vcData.decodeEchoVcPrivateViewer(
        vcData.encodeEchoVcPrivateViewer({
          v: 1,
          t: 'viewer_stream',
          kind: 'viewer_left_stream',
          viewerId: 'viewer',
        }),
      ),
    ).toEqual({
      v: 1,
      t: 'viewer_stream',
      kind: 'viewer_left_stream',
      viewerId: 'viewer',
    });
    expect(
      vcData.decodeEchoVcData(bytes({ v: 1, t: 'public_media' })),
    ).toBeNull();
    expect(vcData.decodeEchoVcPrivateViewer(bytes({}))).toBeNull();
  });

  it('normalizes Skriggles activity, intents, and canvas payloads', () => {
    const settings = {
      rounds: 20,
      drawTimeSec: 3,
      wordPickSec: 50,
      minWordLen: 9,
      hints: true,
      language: ' english ',
      customWords: 'cat,dog',
    };
    const activity = {
      v: 1,
      t: 'skriggles_activity',
      updatedAt: 300,
      revision: 9.8,
      fromUserId: ' host ',
      roundSeq: 2.2,
      rosterUserIds: [' u1 ', 'u2'],
      phase: 'drawing',
      settings,
      scores: { u1: 5.7 },
      drawerUserId: ' drawer ',
      wordChoices: [' cat ', 'dog', 'bird'],
      wordHint: 'c_t',
      phaseEndsAt: 999,
      chatLog: [
        { kind: 'correct', userId: ' u1 ', text: 'cat', at: 301, points: 3.8 },
      ],
      roundResult: { word: 'cat', guessers: [{ userId: ' u1 ', points: 4.9 }] },
      canvasStrokeSeq: 6.6,
      correctGuessersThisRound: [' u1 ', ''],
      hintRevealed: true,
    };
    expect(
      vcData.decodeEchoSkrigglesActivity(
        vcData.encodeEchoSkrigglesActivity(activity as never),
      ),
    ).toMatchObject({
      revision: 9,
      fromUserId: 'host',
      roundSeq: 2,
      rosterUserIds: ['u1', 'u2'],
      settings: {
        rounds: 10,
        drawTimeSec: 15,
        wordPickSec: 30,
        minWordLen: 5,
        hints: true,
      },
      scores: { u1: 5, u2: 0 },
      wordChoices: ['cat', 'dog', 'bird'],
      chatLog: [
        { kind: 'correct', userId: 'u1', text: 'cat', at: 301, points: 3 },
      ],
      roundResult: { word: 'cat', guessers: [{ userId: 'u1', points: 4 }] },
      canvasStrokeSeq: 6,
      correctGuessersThisRound: ['u1'],
      hintRevealed: true,
    });
    expect(
      vcData.decodeEchoSkrigglesActivity(bytes({ ...activity, chatLog: [{}] })),
    ).toBeNull();

    expect(
      vcData.decodeEchoSkrigglesGuessIntent(
        vcData.encodeEchoSkrigglesGuessIntent({
          v: 1,
          t: 'skriggles_guess_intent',
          updatedAt: 301,
          fromUserId: ' u1 ',
          roundSeq: 3.2,
          guess: '  a very good guess  ',
        } as never),
      ),
    ).toMatchObject({
      fromUserId: 'u1',
      roundSeq: 3,
      guess: 'a very good guess',
    });
    expect(
      vcData.decodeEchoSkrigglesWordChoiceIntent(
        vcData.encodeEchoSkrigglesWordChoiceIntent({
          v: 1,
          t: 'skriggles_word_choice_intent',
          updatedAt: 302,
          fromUserId: ' u1 ',
          roundSeq: 3.9,
          word: ' elephant ',
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'u1', roundSeq: 3, word: 'elephant' });
    expect(
      vcData.decodeEchoSkrigglesSettingsIntent(
        vcData.encodeEchoSkrigglesSettingsIntent({
          v: 1,
          t: 'skriggles_settings_intent',
          updatedAt: 303,
          fromUserId: ' host ',
          settings: { hints: false },
        }),
      ),
    ).toMatchObject({ fromUserId: 'host', settings: { hints: false } });
    expect(
      vcData.decodeEchoSkrigglesStartIntent(
        vcData.encodeEchoSkrigglesStartIntent({
          v: 1,
          t: 'skriggles_start_intent',
          updatedAt: 304,
          fromUserId: ' host ',
        }),
      ),
    ).toMatchObject({ fromUserId: 'host' });
    expect(
      vcData.decodeEchoSkrigglesNextRoundIntent(
        vcData.encodeEchoSkrigglesNextRoundIntent({
          v: 1,
          t: 'skriggles_next_round_intent',
          updatedAt: 305,
          fromUserId: ' host ',
          completedRoundSeq: 8.7,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', completedRoundSeq: 8 });
    expect(
      vcData.decodeEchoSkrigglesRoundSecret(
        vcData.encodeEchoSkrigglesRoundSecret({
          v: 1,
          t: 'skriggles_round_secret',
          updatedAt: 306,
          fromUserId: ' host ',
          roundSeq: 9.1,
          drawerUserId: ' drawer ',
          secret: '  lighthouse  ',
        } as never),
      ),
    ).toMatchObject({
      fromUserId: 'host',
      roundSeq: 9,
      drawerUserId: 'drawer',
      secret: 'lighthouse',
    });

    expect(
      vcData.decodeEchoSkrigglesStrokeBatch(
        vcData.encodeEchoSkrigglesStrokeBatch({
          v: 1,
          t: 'skriggles_stroke_batch',
          roundSeq: 1.8,
          strokeId: 2.9,
          color: '#1234567890abcdef',
          width: 99,
          tool: 'pen',
          points: [0, 1, 2, 3],
        } as never),
      ),
    ).toEqual({
      v: 1,
      t: 'skriggles_stroke_batch',
      roundSeq: 1,
      strokeId: 2,
      color: '#1234567890abcde',
      width: 32,
      tool: 'pen',
      points: [0, 1, 2, 3],
    });
    expect(
      vcData.decodeEchoSkrigglesStrokeBatch(
        bytes({
          v: 1,
          t: 'skriggles_stroke_batch',
          roundSeq: 1,
          strokeId: 2,
          color: '#fff',
          width: 1,
          tool: 'pen',
          points: [0, 1, 2],
        }),
      ),
    ).toBeNull();

    expect(
      vcData.decodeEchoSkrigglesCanvasCmd(
        vcData.encodeEchoSkrigglesCanvasCmd({
          v: 1,
          t: 'skriggles_canvas_cmd',
          roundSeq: 2.4,
          cmd: 'clear',
          seq: 3.8,
        } as never),
      ),
    ).toMatchObject({ roundSeq: 2, cmd: 'clear', seq: 3 });
    expect(
      vcData.decodeEchoSkrigglesCanvasCmd(
        vcData.encodeEchoSkrigglesCanvasCmd({
          v: 1,
          t: 'skriggles_canvas_cmd',
          roundSeq: 2,
          cmd: 'fill',
          seq: 4,
          x: 1,
          y: 2,
          color: '#abcdef1234567890',
        }),
      ),
    ).toMatchObject({ cmd: 'fill', color: '#abcdef123456789' });
    expect(
      vcData.decodeEchoSkrigglesCanvasSnapshot(
        vcData.encodeEchoSkrigglesCanvasSnapshot({
          v: 1,
          t: 'skriggles_canvas_snapshot',
          roundSeq: 5.5,
          seq: 6.6,
          pngBase64: 'abc',
        } as never),
      ),
    ).toEqual({
      v: 1,
      t: 'skriggles_canvas_snapshot',
      roundSeq: 5,
      seq: 6,
      pngBase64: 'abc',
    });
    expect(
      vcData.decodeEchoSkrigglesCanvasSnapshot(
        bytes({
          v: 1,
          t: 'skriggles_canvas_snapshot',
          roundSeq: 1,
          seq: 1,
          pngBase64: '',
        }),
      ),
    ).toBeNull();
  });

  it('normalizes Codenames activity, keys, and turn intents', () => {
    const hiddenCell = { revealed: false, word: 'echo' };
    const cells = Array.from({ length: 25 }, (_, i) =>
      i === 0
        ? { revealed: true, word: 'alpha', affiliation: 'red' }
        : hiddenCell,
    );
    const roles = [
      { userId: ' red1 ', team: 'red', role: 'spymaster' },
      { userId: 'blue1', team: 'blue', role: 'operative' },
    ];
    const activity = {
      v: 1,
      t: 'codenames_activity',
      updatedAt: 400,
      revision: 3.7,
      fromUserId: ' host ',
      gameSeq: 2.9,
      rosterUserIds: [' red1 ', 'blue1'],
      phase: 'playing',
      turnStage: 'await_guess',
      cells,
      startingTeam: 'red',
      currentTeam: 'blue',
      winner: null,
      currentClue: { word: ' signal ', number: 2.8 },
      guessesRemaining: 3.9,
      roleAssignments: roles,
      lastEvent: '  clue given  ',
    };
    expect(
      vcData.decodeEchoCodenamesActivity(
        vcData.encodeEchoCodenamesActivity(activity as never),
      ),
    ).toMatchObject({
      revision: 3,
      fromUserId: 'host',
      gameSeq: 2,
      rosterUserIds: ['red1', 'blue1'],
      currentClue: { word: 'signal', number: 2 },
      guessesRemaining: 3,
      roleAssignments: [
        { userId: 'red1', team: 'red', role: 'spymaster' },
        { userId: 'blue1', team: 'blue', role: 'operative' },
      ],
      lastEvent: 'clue given',
    });
    expect(
      vcData.decodeEchoCodenamesActivity(bytes({ ...activity, cells: [] })),
    ).toBeNull();
    expect(
      vcData.decodeEchoCodenamesActivity(
        bytes({
          ...activity,
          cells: Array.from({ length: 25 }, () => ({
            revealed: false,
            word: 'bad',
            affiliation: 'red',
          })),
        }),
      ),
    ).toBeNull();

    const key = Array.from({ length: 25 }, (_, i) =>
      i === 24 ? 'assassin' : i % 2 === 0 ? 'red' : 'blue',
    );
    expect(
      vcData.decodeEchoCodenamesSpymasterKey(
        vcData.encodeEchoCodenamesSpymasterKey({
          v: 1,
          t: 'codenames_spymaster_key',
          updatedAt: 401,
          fromUserId: ' host ',
          gameSeq: 4.9,
          key,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', gameSeq: 4, key });
    expect(
      vcData.decodeEchoCodenamesKeyToOrchestrator(
        vcData.encodeEchoCodenamesKeyToOrchestrator({
          v: 1,
          t: 'codenames_key_to_orch',
          updatedAt: 402,
          fromUserId: ' host ',
          gameSeq: 4.1,
          key,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', gameSeq: 4, key });

    expect(
      vcData.decodeEchoCodenamesClueIntent(
        vcData.encodeEchoCodenamesClueIntent({
          v: 1,
          t: 'codenames_clue_intent',
          updatedAt: 403,
          fromUserId: ' host ',
          gameSeq: 5.8,
          word: ' beacon ',
          number: 9.9,
        } as never),
      ),
    ).toMatchObject({
      fromUserId: 'host',
      gameSeq: 5,
      word: 'beacon',
      number: 9,
    });
    expect(
      vcData.decodeEchoCodenamesClueIntent(
        bytes({
          v: 1,
          t: 'codenames_clue_intent',
          updatedAt: 403,
          fromUserId: 'host',
          gameSeq: 5,
          word: 'bad',
          number: 10,
        }),
      ),
    ).toBeNull();

    expect(
      vcData.decodeEchoCodenamesRevealIntent(
        vcData.encodeEchoCodenamesRevealIntent({
          v: 1,
          t: 'codenames_reveal_intent',
          updatedAt: 404,
          fromUserId: ' host ',
          gameSeq: 6.5,
          cardIndex: 24.9,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', gameSeq: 6, cardIndex: 24 });
    expect(
      vcData.decodeEchoCodenamesEndTurnIntent(
        vcData.encodeEchoCodenamesEndTurnIntent({
          v: 1,
          t: 'codenames_end_turn_intent',
          updatedAt: 405,
          fromUserId: ' host ',
          gameSeq: 7.7,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', gameSeq: 7 });
    expect(
      vcData.decodeEchoCodenamesSetupIntent(
        vcData.encodeEchoCodenamesSetupIntent({
          v: 1,
          t: 'codenames_setup_intent',
          updatedAt: 406,
          fromUserId: ' host ',
          gameSeq: 8.2,
          roleAssignments: roles,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', gameSeq: 8 });
    expect(
      vcData.decodeEchoCodenamesDealIntent(
        vcData.encodeEchoCodenamesDealIntent({
          v: 1,
          t: 'codenames_deal_intent',
          updatedAt: 407,
          fromUserId: ' host ',
          gameSeq: 9.3,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', gameSeq: 9 });
    expect(
      vcData.decodeEchoCodenamesNewGameIntent(
        vcData.encodeEchoCodenamesNewGameIntent({
          v: 1,
          t: 'codenames_new_game_intent',
          updatedAt: 408,
          fromUserId: ' host ',
          completedGameSeq: 10.9,
        } as never),
      ),
    ).toMatchObject({ fromUserId: 'host', completedGameSeq: 10 });
  });
});
