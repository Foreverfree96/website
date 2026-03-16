<template>
  <div class="sp-wrap">

    <!-- ── Fallback iframe ──────────────────────────────────────────────────── -->
    <template v-if="state === 'unavailable'">
      <iframe :src="embedUrl" frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        :class="['sp-iframe', isPlaylist ? 'sp-iframe--playlist' : 'sp-iframe--audio']" />
    </template>

    <!-- ── Loading ──────────────────────────────────────────────────────────── -->
    <div v-else-if="state !== 'ready'" class="sp-card sp-loading">
      <div class="sp-spinner"></div>
      <span class="sp-status-msg">{{ statusMsg }}</span>
    </div>

    <!-- ── Player ───────────────────────────────────────────────────────────── -->
    <div v-else class="sp-card">

      <!-- Album art + track info -->
      <div class="sp-top">
        <div class="sp-art-wrap">
          <img v-if="track.art" :src="track.art" class="sp-art" />
          <div v-else class="sp-art sp-art--empty">🎵</div>
        </div>
        <div class="sp-info">
          <div class="sp-track-name" :title="track.name">{{ track.name || '—' }}</div>
          <div class="sp-track-artist">{{ track.artist || '—' }}</div>
          <div class="sp-track-album">{{ track.album }}</div>
        </div>
        <a :href="mediaUrl" target="_blank" rel="noopener noreferrer"
          class="sp-open-btn" title="Open on Spotify">
          <svg viewBox="0 0 24 24" fill="currentColor" class="sp-spotify-icon">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.307a.75.75 0 0 1-1.032.248c-2.826-1.727-6.38-2.117-10.57-1.16a.75.75 0 1 1-.334-1.463c4.583-1.047 8.515-.596 11.688 1.343a.75.75 0 0 1 .248 1.032zm1.47-3.268a.938.938 0 0 1-1.29.31c-3.234-1.988-8.162-2.564-11.986-1.403a.937.937 0 1 1-.544-1.794c4.37-1.325 9.8-.683 13.51 1.597a.938.938 0 0 1 .31 1.29zm.127-3.405C15.38 8.39 9.446 8.19 6.02 9.216a1.125 1.125 0 1 1-.653-2.154c3.96-1.2 10.545-.968 14.7 1.617a1.125 1.125 0 0 1-1.154 1.935-.985.985 0 0 1-.8.003z"/>
          </svg>
          Open
        </a>
      </div>

      <!-- Progress bar -->
      <div class="sp-progress-wrap" @mousedown="startScrub" @touchstart.passive="startScrub">
        <div class="sp-bar" ref="progressBar">
          <div class="sp-bar-fill" :style="{ width: progressPct + '%' }"></div>
          <div class="sp-bar-thumb" :style="{ left: progressPct + '%' }"></div>
        </div>
        <div class="sp-times">
          <span>{{ fmtMs(position) }}</span>
          <span>{{ fmtMs(duration) }}</span>
        </div>
      </div>

      <!-- Controls row -->
      <div class="sp-controls">
        <!-- Shuffle -->
        <button class="sp-btn sp-btn--shuffle" :class="{ 'sp-btn--shuffle-on': shuffleOn }"
          @click="toggleShuffle" title="Shuffle">
          🔀
        </button>

        <button class="sp-btn sp-btn--skip" @click="prevTrack" title="Previous">⏮</button>

        <button class="sp-btn sp-btn--play" @click="togglePlay" :title="paused ? 'Play' : 'Pause'">
          {{ paused ? '▶' : '⏸' }}
        </button>

        <button class="sp-btn sp-btn--skip" @click="nextTrack" title="Next">⏭</button>

        <!-- Volume -->
        <div class="sp-volume-wrap">
          <button class="sp-btn sp-vol-icon" @click="toggleMute"
            :title="muted ? 'Unmute' : 'Mute'">
            {{ muted || displayVolume === 0 ? '🔇' : displayVolume < 50 ? '🔉' : '🔊' }}
          </button>
          <div class="sp-vol-track" ref="volTrack"
            @mousedown="startVolScrub" @touchstart.passive="startVolScrub">
            <div class="sp-vol-fill" :style="{ width: displayVolume + '%' }"></div>
            <div class="sp-vol-thumb" :style="{ left: displayVolume + '%' }"></div>
          </div>
          <span class="sp-vol-pct">{{ displayVolume }}%</span>
        </div>
      </div>

      <div class="sp-brand">Powered by Spotify</div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  mediaUrl:   { type: String, default: '' },
  isPlaylist: { type: Boolean, default: false },
});

const API = import.meta.env.VITE_API_URL;

// ── State ──────────────────────────────────────────────────────────────────────
const state     = ref('loading');
const statusMsg = ref('Connecting to Spotify…');
const paused    = ref(true);
const position  = ref(0);
const duration  = ref(0);
const volume    = ref(70);   // 0-100
const muted     = ref(false);
const shuffleOn = ref(false);
const track     = ref({ name: '', artist: '', album: '', art: '' });

const progressBar = ref(null);
const volTrack    = ref(null);

let player   = null;
let deviceId = null;
let ticker   = null;
let token    = null;
let prevVol  = 70;

// ── Computed ───────────────────────────────────────────────────────────────────
const progressPct  = computed(() =>
  duration.value > 0 ? Math.min(100, (position.value / duration.value) * 100) : 0
);
const displayVolume = computed(() => muted.value ? 0 : volume.value);

const embedUrl = computed(() =>
  props.mediaUrl.replace('open.spotify.com/', 'open.spotify.com/embed/')
);

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtMs = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const getSpotifyUri = (url) => {
  const m = url.match(/open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
};

const spotifyFetch = (method, path, body) =>
  fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── Token ──────────────────────────────────────────────────────────────────────
const fetchToken = async () => {
  const jwt = localStorage.getItem('jwtToken');
  if (!jwt) return null;
  const res = await fetch(`${API}/api/spotify/token`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  return (await res.json()).accessToken;
};

// ── SDK loader ─────────────────────────────────────────────────────────────────
const loadSDK = () => new Promise((resolve) => {
  if (window.Spotify?.Player) { resolve(); return; }
  const prev = window.onSpotifyWebPlaybackSDKReady;
  window.onSpotifyWebPlaybackSDKReady = () => { prev?.(); resolve(); };
  if (!document.querySelector('script[src*="spotify-player"]')) {
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    document.head.appendChild(s);
  }
});

// ── Start playback ─────────────────────────────────────────────────────────────
// Passing device_id as a query param implicitly transfers playback to this
// device — avoids a separate PUT /me/player call that 404s on fresh sessions.
const startPlayback = async () => {
  const uri = getSpotifyUri(props.mediaUrl);
  if (uri) {
    const isTrack = uri.startsWith('spotify:track:');
    await spotifyFetch(
      'PUT',
      `/me/player/play?device_id=${deviceId}`,
      isTrack
        ? { uris: [uri], position_ms: 0 }
        : { context_uri: uri, offset: { position: 0 }, position_ms: 0 }
    );
  } else {
    // No extractable URI — just transfer device without starting playback
    await spotifyFetch('PUT', '/me/player', { device_ids: [deviceId], play: false });
  }
  await spotifyFetch('PUT', `/me/player/shuffle?state=false&device_id=${deviceId}`);
  await new Promise(r => setTimeout(r, 400));
  await spotifyFetch('PUT', `/me/player/pause?device_id=${deviceId}`);
};

// ── Ticker ─────────────────────────────────────────────────────────────────────
const startTicker = () => {
  if (ticker) return;
  ticker = setInterval(() => {
    if (!paused.value && duration.value > 0)
      position.value = Math.min(position.value + 500, duration.value);
  }, 500);
};
const stopTicker = () => { clearInterval(ticker); ticker = null; };

// ── Controls ───────────────────────────────────────────────────────────────────
const togglePlay = () => player?.togglePlay();
const nextTrack  = () => player?.nextTrack();
const prevTrack  = () => player?.previousTrack();

const toggleShuffle = async () => {
  shuffleOn.value = !shuffleOn.value;
  await spotifyFetch('PUT', `/me/player/shuffle?state=${shuffleOn.value}`);
};

const toggleMute = () => {
  muted.value = !muted.value;
  if (muted.value) {
    prevVol = volume.value;
    player?.setVolume(0);
  } else {
    player?.setVolume(prevVol / 100);
  }
};

const applyVolume = (val) => {
  volume.value = Math.round(val);
  muted.value  = false;
  player?.setVolume(volume.value / 100);
};

// ── Progress scrubbing (mouse + touch) ────────────────────────────────────────
const startScrub = (e) => {
  e.preventDefault();
  const bar = progressBar.value;
  if (!bar) return;

  const doScrub = (clientX) => {
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ms   = Math.floor(pct * duration.value);
    position.value = ms;
    player?.seek(ms);
  };

  const onMove = (ev) => doScrub(ev.touches ? ev.touches[0].clientX : ev.clientX);
  const onUp   = (ev) => {
    doScrub(ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup',   onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend',  onUp);
  };

  doScrub(e.touches ? e.touches[0].clientX : e.clientX);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend',  onUp);
};

// ── Volume scrubbing (mouse + touch) ─────────────────────────────────────────
const startVolScrub = (e) => {
  e.preventDefault();
  const track = volTrack.value;
  if (!track) return;

  const doVol = (clientX) => {
    const rect = track.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    applyVolume(Math.round(pct * 100));
  };

  const onMove = (ev) => doVol(ev.touches ? ev.touches[0].clientX : ev.clientX);
  const onUp   = (ev) => {
    doVol(ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup',   onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend',  onUp);
  };

  doVol(e.touches ? e.touches[0].clientX : e.clientX);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend',  onUp);
};

// ── Mount ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    statusMsg.value = 'Fetching credentials…';
    token = await fetchToken();
    if (!token) { state.value = 'unavailable'; return; }

    statusMsg.value = 'Loading Spotify SDK…';
    await loadSDK();

    statusMsg.value = 'Connecting player…';
    state.value = 'connecting';

    player = new window.Spotify.Player({
      name: 'Site Player',
      getOAuthToken: (cb) => cb(token),
      volume: volume.value / 100,
    });

    player.addListener('ready', async ({ device_id }) => {
      deviceId = device_id;
      statusMsg.value = 'Starting playback…';
      try {
        await startPlayback();
        state.value = 'ready';
      } catch {
        state.value = 'unavailable';
      }
    });

    player.addListener('not_ready', () => {
      if (state.value === 'ready') state.value = 'connecting';
    });

    player.addListener('player_state_changed', (s) => {
      if (!s) return;
      paused.value    = s.paused;
      position.value  = s.position;
      duration.value  = s.duration;
      shuffleOn.value = s.shuffle;

      const t = s.track_window?.current_track;
      if (t) {
        track.value = {
          name:   t.name,
          artist: t.artists?.map(a => a.name).join(', ') || '',
          album:  t.album?.name || '',
          art:    t.album?.images?.[0]?.url || '',
        };
      }

      if (!s.paused) startTicker();
      else           stopTicker();
    });

    player.addListener('initialization_error', () => { state.value = 'unavailable'; });
    player.addListener('authentication_error',  () => { state.value = 'unavailable'; });
    player.addListener('account_error',         () => { state.value = 'unavailable'; });

    await player.connect();
  } catch {
    state.value = 'unavailable';
  }
});

onUnmounted(() => {
  stopTicker();
  player?.disconnect();
  player = null;
});
</script>

<style scoped>
.sp-wrap { width: 100%; margin-top: 12px; }

.sp-iframe           { width: 100%; border-radius: 10px; display: block; }
.sp-iframe--audio    { height: 166px; }
.sp-iframe--playlist { height: 460px; }

/* ── Card ──────────────────────────────────────────────────────────────────── */
.sp-card {
  background: #121212;
  border: 2px solid #1db954;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #fff;
}

/* ── Loading ───────────────────────────────────────────────────────────────── */
.sp-loading {
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 14px;
  min-height: 100px;
}
.sp-spinner {
  width: 24px; height: 24px;
  border: 3px solid #333;
  border-top-color: #1db954;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.sp-status-msg { font-size: 0.95rem; color: #aaa; }

/* ── Top: art + info ───────────────────────────────────────────────────────── */
.sp-top { display: flex; gap: 20px; align-items: center; }
.sp-art-wrap { flex-shrink: 0; }
.sp-art {
  width: 90px; height: 90px;
  border-radius: 10px;
  object-fit: cover;
  display: block;
}
.sp-art--empty {
  background: #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
}
.sp-info { flex: 1; min-width: 0; }
.sp-track-name {
  font-weight: 700;
  font-size: 1.1rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-track-artist { font-size: 0.9rem; color: #aaa; margin-top: 4px; }
.sp-track-album  {
  font-size: 0.8rem; color: #666; margin-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Open on Spotify button ────────────────────────────────────────────────── */
.sp-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  align-self: flex-start;
  background: #1db954;
  color: #000;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 20px;
  text-decoration: none;
  transition: background 0.15s, transform 0.15s;
  white-space: nowrap;
}
.sp-open-btn:hover { background: #1ed760; transform: scale(1.05); }
.sp-spotify-icon { width: 14px; height: 14px; flex-shrink: 0; }

/* ── Progress ──────────────────────────────────────────────────────────────── */
.sp-progress-wrap { cursor: pointer; user-select: none; padding: 8px 0; }
.sp-bar {
  position: relative;
  height: 5px;
  background: #333;
  border-radius: 3px;
  overflow: visible;
}
.sp-bar-fill {
  height: 100%;
  background: #1db954;
  border-radius: 3px;
  pointer-events: none;
}
.sp-bar-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}
.sp-progress-wrap:hover .sp-bar-thumb { opacity: 1; }
.sp-progress-wrap:hover .sp-bar-fill  { background: #1ed760; }
.sp-times {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #666;
  margin-top: 8px;
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
.sp-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s, transform 0.15s;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sp-btn:hover { color: #fff; background: #2a2a2a; }

/* Skip buttons */
.sp-btn--skip {
  font-size: 1.4rem;
  padding: 8px;
  width: 42px; height: 42px;
}

/* Play/Pause */
.sp-btn--play {
  width: 52px; height: 52px;
  font-size: 1.3rem;
  background: #1db954;
  color: #000;
}
.sp-btn--play:hover { background: #1ed760; color: #000; transform: scale(1.08); }

/* Shuffle */
.sp-btn--shuffle {
  font-size: 1.1rem;
  padding: 7px;
  width: 38px; height: 38px;
  opacity: 0.45;
}
.sp-btn--shuffle:hover { opacity: 1; }
.sp-btn--shuffle-on    { opacity: 1; color: #1db954; }
.sp-btn--shuffle-on:hover { color: #1ed760; }

/* ── Volume ────────────────────────────────────────────────────────────────── */
.sp-volume-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.sp-vol-icon {
  font-size: 1.2rem;
  padding: 6px;
  width: 36px; height: 36px;
  flex-shrink: 0;
}

/* Custom draggable volume track */
.sp-vol-track {
  position: relative;
  width: 100px;
  height: 5px;
  background: #333;
  border-radius: 3px;
  cursor: pointer;
  flex-shrink: 0;
}
.sp-vol-fill {
  height: 100%;
  background: #1db954;
  border-radius: 3px;
  pointer-events: none;
}
.sp-vol-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  pointer-events: none;
  transition: transform 0.1s;
}
.sp-vol-track:hover .sp-vol-fill  { background: #1ed760; }
.sp-vol-track:hover .sp-vol-thumb { transform: translate(-50%, -50%) scale(1.2); }

.sp-vol-pct {
  font-size: 0.78rem;
  color: #888;
  min-width: 32px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Branding ──────────────────────────────────────────────────────────────── */
.sp-brand { font-size: 0.7rem; color: #444; text-align: right; }

/* ── Mobile ────────────────────────────────────────────────────────────────── */
@media (max-width: 560px) {
  .sp-card  { padding: 16px; gap: 14px; }
  .sp-art   { width: 70px; height: 70px; }
  .sp-track-name   { font-size: 1rem; }
  .sp-btn--play    { width: 46px; height: 46px; font-size: 1.15rem; }
  .sp-btn--skip    { width: 36px; height: 36px; font-size: 1.2rem; }
  .sp-vol-track    { width: 70px; }
  .sp-vol-pct      { display: none; }
}
</style>
