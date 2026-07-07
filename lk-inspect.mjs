import { RoomServiceClient } from 'livekit-server-sdk';
const secret = process.env.LK_SECRET;
const c = new RoomServiceClient(
  'https://livekit.chat-echo.com',
  'devkey',
  secret,
);
const rooms = await c.listRooms();
if (!rooms.length) console.log('no active rooms');
for (const r of rooms) {
  console.log('ROOM', r.name, 'participants:', r.numParticipants);
  const ps = await c.listParticipants(r.name);
  for (const p of ps) {
    console.log(
      '  P',
      p.identity,
      'state',
      p.state,
      'perms',
      JSON.stringify({
        canPublish: p.permission?.canPublish,
        sources: p.permission?.canPublishSources,
      }),
    );
    for (const t of p.tracks) {
      console.log(
        '    T',
        t.sid,
        'type',
        t.type,
        'src',
        t.source,
        'muted:',
        t.muted,
        'mime:',
        t.mimeType,
        'enc:',
        t.encryption,
      );
    }
  }
}
