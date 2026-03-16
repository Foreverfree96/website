<template>
  <div class="sp-wrap">

    <!-- ── Fallback iframe (not Premium / not connected / SDK error) ────────── -->
    <template v-if="state === 'unavailable'">
      <iframe :src="embedUrl" frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        :class="['sp-iframe', isPlaylist ? 'sp-iframe--playlist' : 'sp-iframe--audio']" />
    </template>

    <!-- ── Loading / connecting ─────────────────────────────────────────────── -->
    <div v-else-if="state !== 'ready'" class="sp-card sp-loading">
      <div class="sp-spinner"></div>
      <span class="sp-status-msg">{{ statusMsg }}</span>
    </div>

    <!-- ── Custom player UI ─────────────────────────────────────────────────── -->
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
      </div>

      <!-- Progress bar -->
      <div class="sp-progress-wrap" @click="handleSeek">
        <div class="sp-bar">
          <div class="sp-bar-fill" :style="{ width: progressPct + '%' }"></div>
          <div class="sp-bar-thumb" :style="{ left: progressPct + '%' }"></div>
        </div>
        <div class="sp-times">
          <span>{{ fmtMs(position) }}</span>
          <span>{{ fmtMs(duration) }}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="sp-controls">
        <button class="sp-btn" @click="prevTrack" title="Previous">⏮</button>
        <button class="sp-btn sp-btn--play" @click="togglePlay" :title="paused ? 'Play' : 'Pause'">
          <span class="sp-play-icon">{{ paused ? '▶' : '⏸' }}</span>
        </button>
        <button class="sp-btn" @click="nextTrack" title="Next">⏭</button>
        <div class="sp-volume-wrap">
          <span class="sp-vol-icon" @click="toggleMute">{{ muted || volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊' }}</span>
          <input type="range" min="0" max="100" :value="muted ? 0 : volume"
            @input="handleVolume" class="sp-vol-slider" />
        </div>
      </div>

      <div class="sp-brand">Powered by Spotify</div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  mediaUrl:  { type: String, default: '' },
  isPlaylist: { type: Boolean, default: false },
});

const API = import.meta.env.VITE_API_URL;

// ── State ──────────────────────────────────────────────────────────────────────
// 'loading' | 'connecting' | 'ready' | 'unavailable'
const state     = ref('loading');
const statusMsg = ref('Connecting to Spotify…');
const paused    = ref(true);
const position  = ref(0);
const duration  = ref(0);
const volume    = ref(70);
const muted     = ref(false);
const track     = ref({ name: '', artist: '', album: '', art: '' });

let player   = null;
let deviceId = null;
let ticker   = null;
let token    = null;
let prevVol  = 70;

// ── Computed ───────────────────────────────────────────────────────────────────
const progressPct = computed(() =>
  duration.value > 0 ? Math.min(100, (position.value / duration.value) * 100) : 0
);

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

// ── Fetch fresh token from our backend ────────────────────────────────────────
const fetchToken = async () => {
  const jwt = localStorage.getItem('jwtToken');
  if (!jwt) return null;
  const res = await fetch(`${API}/api/spotify/token`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.accessToken;
};

// ── Load Spotify Web Playback SDK (idempotent) ────────────────────────────────
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

// ── Transfer playback to SDK device and start the context ────────────────────
const startPlayback = async () => {
  const uri = getSpotifyUri(props.mediaUrl);

  // Transfer device ownership
  await spotifyFetch('PUT', '/me/player', { device_ids: [deviceId], play: false });

  // Start context (playlist/album) or single track
  if (uri) {
    const isTrack = uri.startsWith('spotify:track:');
    await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`,
      isTrack
        ? { uris: [uri], position_ms: 0 }
        : { context_uri: uri, offset: { position: 0 }, position_ms: 0 }
    );
  }

  // Shuffle off, then pause immediately — user presses play to start
  await spotifyFetch('PUT', '/me/player/shuffle?state=false');
  await new Promise(r => setTimeout(r, 500)); // let Spotify settle
  await spotifyFetch('PUT', '/me/player/pause');
};

// ── Position ticker ────────────────────────────────────────────────────────────
const startTicker = () => {
  if (ticker) return;
  ticker = setInterval(() => {
    if (!paused.value && duration.value > 0)
      position.value = Math.min(position.value + 500, duration.value);
  }, 500);
};
const stopTicker = () => { clearInterval(ticker); ticker = null; };

// ── Player controls ────────────────────────────────────────────────────────────
const togglePlay = () => player?.togglePlay();
const nextTrack  = () => player?.nextTrack();
const prevTrack  = () => player?.previousTrack();

const handleVolume = (e) => {
  volume.value = Number(e.target.value);
  muted.value  = false;
  player?.setVolume(volume.value / 100);
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

// ── Seek ───────────────────────────────────────────────────────────────────────
const handleSeek = (e) => {
  const bar  = e.currentTarget.querySelector('.sp-bar');
  const rect = bar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const ms   = Math.floor(pct * duration.value);
  position.value = ms;
  player?.seek(ms);
};

// ── Mount: fetch token → load SDK → init player ───────────────────────────────
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
        // Playback transfer failed — fall back to iframe
        state.value = 'unavailable';
      }
    });

    player.addListener('not_ready', () => {
      if (state.value === 'ready') state.value = 'connecting';
    });

    player.addListener('player_state_changed', (s) => {
      if (!s) return;
      paused.value   = s.paused;
      position.value = s.position;
      duration.value = s.duration;

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

/* ── Fallback iframe sizes ─────────────────────────────────────────────────── */
.sp-iframe        { width: 100%; border-radius: 10px; display: block; height: 166px; }
.sp-iframe--audio    { height: 166px; }
.sp-iframe--playlist { height: 460px; }

/* ── Card shell ────────────────────────────────────────────────────────────── */
.sp-card {
  background: #121212;
  border: 2px solid #1db954;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #fff;
}

/* ── Loading state ─────────────────────────────────────────────────────────── */
.sp-loading {
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 12px;
  min-height: 80px;
}

.sp-spinner {
  width: 20px; height: 20px;
  border: 3px solid #333;
  border-top-color: #1db954;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.sp-status-msg { font-size: 0.9rem; color: #aaa; }

/* ── Top row: art + info ───────────────────────────────────────────────────── */
.sp-top {
  display: flex;
  gap: 16px;
  align-items: center;
}

.sp-art-wrap { flex-shrink: 0; }

.sp-art {
  width: 72px; height: 72px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}
.sp-art--empty {
  background: #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
}

.sp-info { flex: 1; min-width: 0; }

.sp-track-name {
  font-weight: 700;
  font-size: 1rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-track-artist { font-size: 0.85rem; color: #aaa; margin-top: 2px; }
.sp-track-album  { font-size: 0.78rem; color: #666; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Progress ──────────────────────────────────────────────────────────────── */
.sp-progress-wrap { cursor: pointer; user-select: none; }

.sp-bar {
  position: relative;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: visible;
}
.sp-bar-fill {
  height: 100%;
  background: #1db954;
  border-radius: 2px;
  transition: width 0.5s linear;
}
.sp-bar-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px; height: 12px;
  background: #fff;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s;
}
.sp-progress-wrap:hover .sp-bar-thumb { opacity: 1; }
.sp-progress-wrap:hover .sp-bar-fill  { background: #1ed760; }

.sp-times {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #666;
  margin-top: 6px;
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
.sp-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sp-btn:hover { color: #fff; background: #2a2a2a; }

.sp-btn--play {
  width: 40px; height: 40px;
  background: #1db954;
  color: #000;
  font-size: 1rem;
}
.sp-btn--play:hover { background: #1ed760; color: #000; }

.sp-play-icon { display: inline-block; }

/* ── Volume ────────────────────────────────────────────────────────────────── */
.sp-volume-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.sp-vol-icon {
  font-size: 1rem;
  cursor: pointer;
  user-select: none;
}
.sp-vol-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 80px;
  height: 4px;
  background: #333;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.sp-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  background: #fff;
  border-radius: 50%;
}
.sp-vol-slider::-moz-range-thumb {
  width: 12px; height: 12px;
  background: #fff;
  border-radius: 50%;
  border: none;
}

/* ── Branding ──────────────────────────────────────────────────────────────── */
.sp-brand {
  font-size: 0.7rem;
  color: #444;
  text-align: right;
}

/* ── Mobile ────────────────────────────────────────────────────────────────── */
@media (max-width: 480px) {
  .sp-card { padding: 14px; gap: 12px; }
  .sp-art  { width: 56px; height: 56px; }
  .sp-track-name { font-size: 0.9rem; }
  .sp-vol-slider { width: 60px; }
}
</style>
