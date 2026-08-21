(function () {
  const LK = window.LivekitClient;
  if (!LK) {
    console.error('livekit-client failed to load');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const wsUrl = params.get('url');
  const token = params.get('token');
  let layout = params.get('layout') || 'grid';
  let speakerIds = new Set();
  let pinnedIdentity = null;
  let recordingSignaled = false;

  const root = document.getElementById('stage-program');
  const primaryEl = document.getElementById('stage-program-primary');
  const sidebarEl = document.getElementById('stage-program-sidebar');
  const gridEl = document.getElementById('stage-program-grid');
  const emptyEl = document.getElementById('stage-program-empty');

  /** @type {Map<string, { name: string, pfp?: string, wrapper: HTMLElement, hasVideo: boolean, hasScreen: boolean }>} */
  const tiles = new Map();

  function parseProgramMeta(metadata) {
    if (!metadata) return;
    try {
      const o = JSON.parse(metadata);
      const p = o.echoStageProgram;
      if (Array.isArray(p?.speakerIds)) {
        speakerIds = new Set(p.speakerIds.map(String));
      }
      if (p?.layout && ['grid', 'spotlight', 'screen'].includes(p.layout)) {
        layout = p.layout;
      }
      pinnedIdentity =
        typeof p?.pinnedIdentity === 'string' ? p.pinnedIdentity : null;
    } catch {
      /* ignore */
    }
  }

  function isOnStage(identity) {
    if (!speakerIds.size) return false;
    return speakerIds.has(identity);
  }

  function parseParticipantPfp(metadata) {
    if (!metadata) return undefined;
    try {
      const o = JSON.parse(metadata);
      const pfp = o?.pfp;
      return typeof pfp === 'string' && pfp.trim() ? pfp.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  function makeWrapper(identity, name, pfp) {
    const wrapper = document.createElement('div');
    wrapper.className = 'stage-program__tile stage-program__tile--avatar';
    wrapper.dataset.identity = identity;
    const img = document.createElement('img');
    img.className = 'stage-program__avatar';
    img.alt = '';
    if (pfp) img.src = pfp;
    const label = document.createElement('span');
    label.className = 'stage-program__name';
    label.textContent = name;
    const media = document.createElement('div');
    media.className = 'stage-program__media';
    wrapper.appendChild(media);
    wrapper.appendChild(img);
    wrapper.appendChild(label);
    return wrapper;
  }

  function ensureEntry(participant) {
    if (!isOnStage(participant.identity)) return null;
    let entry = tiles.get(participant.identity);
    if (entry) return entry;
    const name = participant.name || participant.identity;
    const pfp = parseParticipantPfp(participant.metadata);
    const wrapper = makeWrapper(participant.identity, name, pfp);
    entry = {
      name,
      pfp,
      wrapper,
      hasVideo: false,
      hasScreen: false,
    };
    tiles.set(participant.identity, entry);
    emptyEl.hidden = true;
    return entry;
  }

  function removeEntry(identity) {
    const entry = tiles.get(identity);
    if (!entry) return;
    entry.wrapper.remove();
    tiles.delete(identity);
    if (!tiles.size) emptyEl.hidden = false;
    render();
  }

  function mediaHost(entry) {
    return entry.wrapper.querySelector('.stage-program__media');
  }

  function onTrackSubscribed(track, publication, participant) {
    if (!isOnStage(participant.identity)) return;
    const entry = ensureEntry(participant);
    if (!entry) return;
    const host = mediaHost(entry);
    if (!host) return;
    host.innerHTML = '';
    const video = track.attach();
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit =
      publication.source === LK.Track.Source.ScreenShare ? 'contain' : 'cover';
    host.appendChild(video);
    entry.wrapper.classList.remove('stage-program__tile--avatar');
    if (publication.source === LK.Track.Source.ScreenShare) {
      entry.hasScreen = true;
    } else if (publication.source === LK.Track.Source.Camera) {
      entry.hasVideo = true;
    }
    render();
  }

  function onTrackUnsubscribed(track, publication, participant) {
    const entry = tiles.get(participant.identity);
    if (!entry) return;
    track.detach().forEach((el) => el.remove());
    if (publication.source === LK.Track.Source.ScreenShare) {
      entry.hasScreen = false;
    } else if (publication.source === LK.Track.Source.Camera) {
      entry.hasVideo = false;
    }
    const host = mediaHost(entry);
    if (host) host.innerHTML = '';
    if (!entry.hasVideo && !entry.hasScreen) {
      entry.wrapper.classList.add('stage-program__tile--avatar');
    }
    render();
  }

  function render() {
    root.dataset.layout = layout;
    primaryEl.replaceChildren();
    sidebarEl.replaceChildren();
    gridEl.replaceChildren();

    const entries = [...tiles.values()].filter((e) =>
      isOnStage(e.wrapper.dataset.identity || ''),
    );
    if (!entries.length) {
      emptyEl.hidden = false;
      root.dataset.hasPrimary = 'false';
      return;
    }
    emptyEl.hidden = true;

    const screens = entries.filter((e) => e.hasScreen);
    const others = entries.filter((e) => !e.hasScreen);

    let main = null;
    let rest = entries;

    if (layout === 'screen' && screens.length) {
      main = screens[0];
      rest = [...screens.slice(1), ...others];
    } else if (layout === 'spotlight') {
      main =
        entries.find((e) => e.wrapper.dataset.identity === pinnedIdentity) ||
        screens[0] ||
        others[0] ||
        entries[0];
      rest = entries.filter((e) => e !== main);
    }

    if (main && layout !== 'grid') {
      primaryEl.appendChild(main.wrapper);
      for (const e of rest) sidebarEl.appendChild(e.wrapper);
      root.dataset.hasPrimary = 'true';
    } else {
      const cols = Math.min(
        3,
        Math.max(1, Math.ceil(Math.sqrt(entries.length))),
      );
      gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      for (const e of entries) gridEl.appendChild(e.wrapper);
      root.dataset.hasPrimary = 'false';
    }

    maybeSignalRecording();
  }

  function maybeSignalRecording() {
    if (recordingSignaled) return;
    if (!tiles.size) return;
    recordingSignaled = true;
    window.postMessage({ type: 'START_RECORDING' }, '*');
  }

  async function run() {
    if (!wsUrl || !token) {
      console.error('missing url or token query params');
      return;
    }
    const room = new LK.Room({ adaptiveStream: true, dynacast: true });
    room.on(LK.RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(LK.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(LK.RoomEvent.ParticipantDisconnected, (p) => {
      removeEntry(p.identity);
    });
    room.on(LK.RoomEvent.RoomMetadataChanged, (md) => {
      parseProgramMeta(md);
      for (const id of [...tiles.keys()]) {
        if (!isOnStage(id)) removeEntry(id);
      }
      render();
    });
    await room.connect(wsUrl, token);
    parseProgramMeta(room.metadata);
    for (const p of room.remoteParticipants.values()) {
      if (!isOnStage(p.identity)) continue;
      ensureEntry(p);
      for (const pub of p.trackPublications.values()) {
        if (pub.track) onTrackSubscribed(pub.track, pub, p);
      }
    }
    render();
    setTimeout(maybeSignalRecording, 2500);
  }

  run().catch((e) => console.error(e));
})();
