'use strict';

// Voice and video calls, one per channel, through the LiveKit media server.
// app.js calls window.yapCalls.start(), .update(call), .channelOpened() and
// .hangUp(). Shared helpers ($, api, state, openChannel) come from app.js.

(() => {
  const LK = window.LivekitClient;
  const calls = new Map(); // channel id -> participants [{user_id, username}]
  let enabled = false;
  let room = null; // the LiveKit room we're in
  let roomChannel = null; // its channel id
  let joining = false;
  const tiles = new Map(); // tile key -> {el, video, track}

  // ---- page elements ----

  const startAudio = button('Call', 'secondary', () => join(false));
  const startVideo = button('Video', 'secondary', () => join(true));
  YapUI.Tooltip(startAudio, { content: 'Start a voice call in this channel' });
  YapUI.Tooltip(startVideo, { content: 'Start a video call in this channel' });
  const headButtons = document.createElement('span');
  headButtons.className = 'call-buttons';
  headButtons.hidden = true;
  headButtons.append(startAudio, startVideo);
  $('leave').before(headButtons);

  const banner = document.createElement('div');
  banner.className = 'call-banner';
  banner.hidden = true;
  const bannerText = document.createElement('span');
  banner.append(bannerText, button('Join', 'primary', () => join(false)), button('Join with video', 'secondary', () => join(true)));

  const stage = document.createElement('section');
  stage.className = 'call-stage';
  stage.hidden = true;
  stage.setAttribute('aria-label', 'Call');
  const stageHead = document.createElement('header');
  const stageTitle = document.createElement('strong');
  const stageStatus = document.createElement('span');
  stageStatus.className = 'muted';
  stageHead.append(stageTitle, stageStatus);
  const grid = document.createElement('div');
  grid.className = 'call-grid';
  const controls = document.createElement('div');
  controls.className = 'call-controls';
  const micBtn = button('Mute', 'secondary', toggleMic);
  const camBtn = button('Camera on', 'secondary', toggleCamera);
  const shareBtn = button('Share screen', 'secondary', toggleShare);
  const audioBtn = button('Turn on sound', 'primary', () => room && room.startAudio());
  audioBtn.hidden = true;
  const leaveBtn = button('Leave call', 'danger', hangUp);
  leaveBtn.classList.add('call-leave');
  controls.append(micBtn, camBtn, shareBtn, audioBtn, leaveBtn);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) shareBtn.hidden = true;
  const audioSink = document.createElement('div');
  audioSink.hidden = true;
  stage.append(stageHead, grid, controls, audioSink);

  $('messages').before(stage, banner);

  // A HeroUI button (YapUI.Button's classes). Disabled buttons use
  // aria-disabled, so they stay focusable; clicks on them are ignored.
  function button(label, variant, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = YapUI.Button.classes({ variant, size: 'sm' });
    b.dataset.slot = 'button';
    b.textContent = label;
    b.addEventListener('click', (e) => { if (b.getAttribute('aria-disabled') !== 'true') onClick(e); });
    return b;
  }

  function setDisabled(b, off) {
    if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
  }

  // ---- call presence ----

  async function start() {
    try {
      const cfg = await api('GET', '/api/config');
      enabled = !!cfg.calls && !!LK && LK.isBrowserSupported();
    } catch {
      enabled = false;
    }
    if (!enabled) return;
    try {
      const list = await api('GET', '/api/calls');
      calls.clear();
      for (const c of list) calls.set(c.channel_id, c.participants);
    } catch {}
    render();
  }

  function update(call) {
    const before = calls.get(call.channel_id) || [];
    if (call.participants.length) calls.set(call.channel_id, call.participants);
    else calls.delete(call.channel_id);
    // Someone else started a call: let people know.
    const first = call.participants[0];
    if (before.length === 0 && first && first.user_id !== state.me.id) notifyStart(call.channel_id, first.username);
    render();
  }

  function notifyStart(channelId, who) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const ch = state.channels.find((c) => c.id === channelId);
    const n = new Notification(`${who} started a call in #${ch ? ch.name : 'a channel'}`, {
      body: 'Open Yap to join.',
      tag: `yap-call-${channelId}`,
    });
    n.onclick = () => { window.focus(); openChannel(channelId); };
  }

  function names(list) {
    const n = list.map((p) => p.username);
    return n.length <= 3 ? n.join(', ') : `${n.slice(0, 3).join(', ')} and ${n.length - 3} more`;
  }

  // render updates everything outside the call stage: header buttons, the
  // "call in progress" banner and the sidebar markers.
  function render() {
    const ch = state.channels.find((c) => c.id === state.current);
    const inThisCall = room && roomChannel === state.current;
    const people = calls.get(state.current) || [];
    headButtons.hidden = !enabled || !ch || !ch.joined || inThisCall || people.length > 0;
    banner.hidden = !enabled || !ch || !ch.joined || inThisCall || people.length === 0;
    if (!banner.hidden) bannerText.textContent = `On a call: ${names(people)}`;
    for (const b of [...banner.querySelectorAll('button'), startAudio, startVideo]) setDisabled(b, joining || !!room);
    markChannels();
  }

  // Adds a marker to sidebar channels that have a call going.
  function markChannels() {
    for (const b of $('channels').querySelectorAll('button[data-channel-id]')) {
      const id = Number(b.dataset.channelId);
      const on = calls.has(id);
      b.classList.toggle('has-call', on);
      let marker = b.querySelector('.call-marker');
      if (on && !marker) {
        marker = document.createElement('span');
        marker.className = 'call-marker yui-visually-hidden';
        marker.textContent = ', call in progress';
        b.append(marker);
      } else if (!on && marker) marker.remove();
    }
  }
  new MutationObserver(() => enabled && markChannels()).observe($('channels'), { childList: true });

  // ---- joining and leaving ----

  async function join(withVideo) {
    const channelId = state.current;
    if (!enabled || room || joining || channelId == null) return;
    joining = true;
    render();
    let r;
    try {
      const { url, token } = await api('POST', `/api/channels/${channelId}/call`, {});
      r = new LK.Room({ adaptiveStream: true, dynacast: true });
      wire(r);
      room = r;
      roomChannel = channelId;
      showStage();
      stageStatus.textContent = 'Connecting…';
      await r.connect(url, token);
      stageStatus.textContent = '';
      await enableMedia(r, withVideo);
    } catch (err) {
      if (r) r.disconnect();
      cleanup();
      YapUI.toast.danger({ title: "Couldn't join the call.", description: sentence(err.message || String(err)) });
    } finally {
      joining = false;
      render();
      redraw();
    }
  }

  async function enableMedia(r, withVideo) {
    try {
      await r.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      stageStatus.textContent = 'Microphone unavailable: ' + deviceError(err);
    }
    if (withVideo) {
      try {
        await r.localParticipant.setCameraEnabled(true);
      } catch (err) {
        stageStatus.textContent = 'Camera unavailable: ' + deviceError(err);
      }
    }
  }

  function deviceError(err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) return 'permission was denied';
    if (err && err.name === 'NotFoundError') return 'none found';
    return (err && err.message) || 'unknown error';
  }

  function hangUp() {
    if (room) room.disconnect();
    cleanup();
  }

  function cleanup() {
    room = null;
    roomChannel = null;
    for (const t of tiles.values()) { if (t.track) t.track.detach(t.video); t.el.remove(); }
    tiles.clear();
    audioSink.replaceChildren();
    stage.hidden = true;
    stageStatus.textContent = '';
    render();
  }

  function showStage() {
    const ch = state.channels.find((c) => c.id === roomChannel);
    stageTitle.textContent = `Call in #${ch ? ch.name : 'channel'}`;
    stage.hidden = false;
  }

  function wire(r) {
    const E = LK.RoomEvent;
    for (const ev of [E.ParticipantConnected, E.ParticipantDisconnected, E.TrackSubscribed, E.TrackUnsubscribed,
      E.LocalTrackPublished, E.LocalTrackUnpublished, E.TrackMuted, E.TrackUnmuted, E.ActiveSpeakersChanged]) {
      r.on(ev, redraw);
    }
    r.on(E.TrackSubscribed, (track) => {
      if (track.kind === 'audio') audioSink.append(track.attach());
    });
    r.on(E.TrackUnsubscribed, (track) => {
      if (track.kind === 'audio') for (const el of track.detach()) el.remove();
    });
    r.on(E.AudioPlaybackStatusChanged, () => { audioBtn.hidden = r.canPlaybackAudio; });
    r.on(E.Reconnecting, () => { stageStatus.textContent = 'Reconnecting…'; });
    r.on(E.Reconnected, () => { stageStatus.textContent = ''; });
    r.on(E.LocalTrackUnpublished, (pub) => {
      // The browser's own "Stop sharing" button ends a screen share.
      if (pub.source === LK.Track.Source.ScreenShare) redraw();
    });
    r.on(E.Disconnected, (reason) => {
      if (room !== r) return;
      cleanup();
      if (reason === LK.DisconnectReason?.PARTICIPANT_REMOVED) YapUI.toast.warning('You were removed from the call.');
    });
  }

  // ---- the call stage ----

  // redraw keeps one tile per camera and screen share (or one per person with
  // no video), updating existing tiles in place so video doesn't flicker.
  function redraw() {
    if (!room) return;
    const S = LK.Track.Source;
    const people = [room.localParticipant, ...room.remoteParticipants.values()];
    const speaking = new Set(room.activeSpeakers.map((p) => p.identity));
    const want = [];
    for (const p of people) {
      const cam = p.getTrackPublication(S.Camera);
      const screen = p.getTrackPublication(S.ScreenShare);
      want.push({ key: p.identity + ':camera', p, pub: cam && !cam.isMuted && cam.track ? cam : null, screen: false });
      if (screen && screen.track) want.push({ key: p.identity + ':screen', p, pub: screen, screen: true });
    }
    const keys = new Set(want.map((w) => w.key));
    for (const [key, t] of tiles) {
      if (!keys.has(key)) { if (t.track) t.track.detach(t.video); t.el.remove(); tiles.delete(key); }
    }
    for (const w of want) {
      let t = tiles.get(w.key);
      if (!t) {
        const el = document.createElement('figure');
        el.className = 'call-tile';
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // sound comes through the audio elements
        const initial = document.createElement('div');
        initial.className = 'call-initial';
        const caption = document.createElement('figcaption');
        el.append(video, initial, caption);
        grid.append(el);
        t = { el, video, track: null };
        tiles.set(w.key, t);
      }
      const track = w.pub ? w.pub.track : null;
      if (t.track !== track) {
        if (t.track) t.track.detach(t.video);
        if (track) track.attach(t.video);
        t.track = track;
      }
      const isMe = w.p === room.localParticipant;
      const name = (w.p.name || w.p.identity) + (isMe ? ' (you)' : '');
      t.el.classList.toggle('has-video', !!track);
      t.el.classList.toggle('screen', w.screen);
      t.el.classList.toggle('mirror', isMe && !w.screen);
      t.el.classList.toggle('speaking', !w.screen && speaking.has(w.p.identity));
      t.el.querySelector('.call-initial').textContent = (w.p.name || '?').slice(0, 1).toUpperCase();
      t.el.querySelector('figcaption').textContent =
        w.screen ? `${name}'s screen` : name + (w.p.isMicrophoneEnabled ? '' : ' · muted');
    }
    grid.dataset.count = String(Math.min(tiles.size, 9));
    const me = room.localParticipant;
    micBtn.textContent = me.isMicrophoneEnabled ? 'Mute' : 'Unmute';
    micBtn.classList.toggle('off', !me.isMicrophoneEnabled);
    micBtn.classList.toggle('button--danger-soft', !me.isMicrophoneEnabled);
    micBtn.classList.toggle('button--secondary', me.isMicrophoneEnabled);
    camBtn.textContent = me.isCameraEnabled ? 'Camera off' : 'Camera on';
    shareBtn.textContent = me.isScreenShareEnabled ? 'Stop sharing' : 'Share screen';
  }

  async function toggleMic() {
    if (!room) return;
    try { await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled); }
    catch (err) { stageStatus.textContent = 'Microphone unavailable: ' + deviceError(err); }
    redraw();
  }

  async function toggleCamera() {
    if (!room) return;
    try { await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled); }
    catch (err) { stageStatus.textContent = 'Camera unavailable: ' + deviceError(err); }
    redraw();
  }

  async function toggleShare() {
    if (!room) return;
    try { await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: false }); }
    catch (err) { if (err && err.name !== 'NotAllowedError') stageStatus.textContent = 'Screen sharing failed: ' + deviceError(err); }
    redraw();
  }

  // Leave the room cleanly when the page goes away.
  window.addEventListener('pagehide', () => { if (room) room.disconnect(); });

  window.yapCalls = {
    start,
    update,
    channelOpened: render,
    hangUp,
    // For tests and debugging.
    get room() { return room; },
  };
})();
