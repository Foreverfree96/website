<template>
  <div class="sp-wrap">

    <!-- ── Fallback iframe ──────────────────────────────────────────────────── -->
    <iframe v-if="state === 'unavailable'" :src="embedUrl" frameborder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      :class="['sp-iframe', isPlaylist ? 'sp-iframe--playlist' : 'sp-iframe--audio']" />

    <!-- ── Needs Spotify connect ────────────────────────────────────────────── -->
    <div v-else-if="state === 'needs-connect'" class="sp-card sp-needs-connect">
      <span class="sp-nc-icon">🎵</span>
      <div class="sp-nc-text">
        <strong>Spotify Premium required</strong>
        <span>Connect your Spotify account on your profile to use the player.</span>
      </div>
      <a href="/profile" class="sp-nc-btn">Go to Profile</a>
    </div>

    <!-- ── Loading ──────────────────────────────────────────────────────────── -->
    <div v-else-if="state !== 'ready'" class="sp-card sp-loading">
      <div class="sp-spinner"></div>
      <span class="sp-status-msg">{{ statusMsg }}</span>
    </div>

    <!-- ── Player ───────────────────────────────────────────────────────────── -->
    <div v-else class="sp-card">

      <!-- Album art + track info + open link -->
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

      <!-- Controls -->
      <div class="sp-controls">
        <button class="sp-btn sp-btn--shuffle" :class="{ 'sp-btn--shuffle-on': shuffleOn }"
          @click="toggleShuffle" title="Shuffle">🔀</button>
        <button class="sp-btn sp-btn--skip" @click="prevTrack" title="Previous">⏮</button>
        <button class="sp-btn sp-btn--play" @click="togglePlay" :title="paused ? 'Play' : 'Pause'">
          {{ paused ? '▶' : '⏸' }}
        </button>
        <button class="sp-btn sp-btn--skip" @click="nextTrack" title="Next">⏭</button>
        <div class="sp-volume-wrap">
          <button class="sp-btn sp-vol-icon" @click="toggleMute" :title="muted ? 'Unmute' : 'Mute'">
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

      <!-- ── Scrollable playlist track list ───────────────────────────────── -->
      <div v-if="isPlaylist && playlistTracks.length" class="sp-tracklist">
        <div class="sp-tracklist-header">Queue</div>
        <div
          v-for="(t, i) in playlistTracks"
          :key="t.uri"
          class="sp-track-row"
          :class="{ 'sp-track-row--active': t.uri === currentTrackUri }"
          @click="playTrackFromList(t.uri)"
        >
          <span class="sp-track-row-num">{{ i + 1 }}</span>
          <div class="sp-track-row-info">
            <span class="sp-track-row-name">{{ t.name }}</span>
            <span class="sp-track-row-artist">{{ t.artist }}</span>
          </div>
          <span class="sp-track-row-dur">{{ fmtMs(t.duration) }}</span>
        </div>
      </div>

      <div class="sp-brand">Powered by Spotify</div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  mediaUrl:   { type: String,  default: '' },
  isPlaylist: { type: Boolean, default: false },
  autoPlay:   { type: Boolean, default: false }, // false = load paused (page embeds), true = play immediately (mini player)
});

const API = import.meta.env.VITE_API_URL;

// ── State ──────────────────────────────────────────────────────────────────────
const state          = ref('loading');
const statusMsg      = ref('Connecting to Spotify…');
const paused         = ref(true);
const position       = ref(0);
const duration       = ref(0);
const volume         = ref(70);
const muted          = ref(false);
const shuffleOn      = ref(false);
const track          = ref({ name: '', artist: '', album: '', art: '' });
const currentTrackUri = ref('');
const playlistTracks = ref([]);

const progressBar = ref(null);
const volTrack    = ref(null);

let player         = null;
let deviceId       = null;
let ticker         = null;
let token          = null;
let connectTimeout = null;
let prevVol  = 70;
let firstStateReceived = false;

// ── Computed ───────────────────────────────────────────────────────────────────
const progressPct   = computed(() =>
  duration.value > 0 ? Math.min(100, (position.value / duration.value) * 100) : 0
);
const displayVolume = computed(() => muted.value ? 0 : volume.value);
const embedUrl      = computed(() =>
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
// Returns { token } on success, { needsConnect: true } if not linked/premium, { unavailable: true } on other errors
const fetchToken = async () => {
  const jwt = localStorage.getItem('jwtToken');
  if (!jwt) return { needsConnect: true };
  const res = await fetch(`${API}/api/spotify/token`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (res.status === 403 || res.status === 404) return { needsConnect: true };
  if (!res.ok) return { unavailable: true };
  return { token: (await res.json()).accessToken };
};

// ── SDK loader ─────────────────────────────────────────────────────────────────
const loadSDK = () => new Promise((resolve, reject) => {
  if (window.Spotify?.Player) { resolve(); return; }
  // If script is already in DOM but SDK not ready yet, wait for callback
  const timer = setTimeout(() => reject(new Error('SDK load timeout')), 8000);
  const prev = window.onSpotifyWebPlaybackSDKReady;
  window.onSpotifyWebPlaybackSDKReady = () => {
    clearTimeout(timer);
    prev?.();
    resolve();
  };
  if (!document.querySelector('script[src*="spotify-player"]')) {
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = () => { clearTimeout(timer); reject(new Error('SDK load failed')); };
    document.head.appendChild(s);
  }
});

// ── Wait until our device appears in Spotify's Connect device list ────────────
const waitForDevice = async (maxWaitMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 3000);
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if ((data.devices || []).some(d => d.id === deviceId)) return true;
      }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
};

// ── Start playback context (waits for device to register, then plays) ─────────
const startPlayback = async () => {
  const found = await waitForDevice();
  if (!found) { state.value = 'needs-connect'; return; }

  const uri     = getSpotifyUri(props.mediaUrl);
  const isTrack = uri?.startsWith('spotify:track:');

  if (!uri) {
    await spotifyFetch('PUT', '/me/player', { device_ids: [deviceId], play: false });
    return;
  }
  await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`,
    isTrack
      ? { uris: [uri] }
      : { context_uri: uri, offset: { position: 0 }, position_ms: 0 }
  );
};

// ── Fetch playlist tracks from Spotify API ────────────────────────────────────
const fetchPlaylistTracks = async () => {
  const m = props.mediaUrl.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (!m) return;
  try {
    const res = await spotifyFetch('GET',
      `/playlists/${m[1]}/tracks?limit=50&fields=items(track(name,uri,duration_ms,artists(name)))`
    );
    if (!res.ok) return;
    const data = await res.json();
    playlistTracks.value = (data.items || [])
      .filter(item => item?.track?.uri)
      .map(item => ({
        name:     item.track.name,
        uri:      item.track.uri,
        artist:   item.track.artists?.map(a => a.name).join(', ') || '',
        duration: item.track.duration_ms,
      }));
  } catch { /* non-fatal */ }
};

// ── Play a specific track from the queue list ─────────────────────────────────
const playTrackFromList = async (uri) => {
  const contextUri = getSpotifyUri(props.mediaUrl);
  await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`,
    contextUri
      ? { context_uri: contextUri, offset: { uri }, position_ms: 0 }
      : { uris: [uri] }
  );
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
  await spotifyFetch('PUT', `/me/player/shuffle?state=${shuffleOn.value}&device_id=${deviceId}`).catch(() => {});
};

const toggleMute = () => {
  muted.value = !muted.value;
  if (muted.value) { prevVol = volume.value; player?.setVolume(0); }
  else             { player?.setVolume(prevVol / 100); }
};

const applyVolume = (val) => {
  volume.value = Math.round(val);
  muted.value  = false;
  player?.setVolume(volume.value / 100);
};

// ── Progress scrubbing ────────────────────────────────────────────────────────
const startScrub = (e) => {
  e.preventDefault();
  const bar = progressBar.value;
  if (!bar) return;
  const doScrub = (x) => {
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    position.value = Math.floor(pct * duration.value);
    player?.seek(position.value);
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

// ── Volume scrubbing ──────────────────────────────────────────────────────────
const startVolScrub = (e) => {
  e.preventDefault();
  const vt = volTrack.value;
  if (!vt) return;
  const doVol = (x) => {
    const rect = vt.getBoundingClientRect();
    applyVolume(Math.round(Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * 100));
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
  // Web Playback SDK requires HTTPS — skip straight to iframe on HTTP
  if (location.protocol !== 'https:') {
    state.value = 'unavailable';
    return;
  }

  // Global fallback: if SDK never connects, fall back to iframe embed after 8s
  connectTimeout = setTimeout(() => {
    if (state.value !== 'ready') state.value = 'unavailable';
  }, 8000);

  try {
    statusMsg.value = 'Fetching credentials…';
    const tokenResult = await fetchToken();
    if (tokenResult.needsConnect) { clearTimeout(connectTimeout); state.value = 'needs-connect'; return; }
    if (tokenResult.unavailable)  { clearTimeout(connectTimeout); state.value = 'unavailable'; return; }
    token = tokenResult.token;

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
      // Show the player UI immediately — don't wait for player_state_changed
      clearTimeout(connectTimeout);
      state.value = 'ready';
      // Start playback in the background; player_state_changed will update track info
      startPlayback().catch(() => {});
    });

    player.addListener('not_ready', () => {
      if (state.value === 'ready') state.value = 'connecting';
    });

    player.addListener('player_state_changed', async (s) => {
      if (!s) return;

      const isFirst = !firstStateReceived;
      firstStateReceived = true;

      paused.value    = s.paused;
      position.value  = s.position;
      duration.value  = s.duration;
      shuffleOn.value = s.shuffle;

      const t = s.track_window?.current_track;
      if (t) {
        currentTrackUri.value = t.uri;
        track.value = {
          name:   t.name,
          artist: t.artists?.map(a => a.name).join(', ') || '',
          album:  t.album?.name || '',
          art:    t.album?.images?.[0]?.url || '',
        };
      }

      if (isFirst) {
        if (props.isPlaylist) fetchPlaylistTracks();
        if (!props.autoPlay && !s.paused) {
          spotifyFetch('PUT', `/me/player/pause?device_id=${deviceId}`).catch(() => {});
          return;
        }
      }

      if (!s.paused) startTicker();
      else           stopTicker();
    });

    player.addListener('initialization_error', () => { clearTimeout(connectTimeout); state.value = 'unavailable'; });
    player.addListener('authentication_error',  () => { clearTimeout(connectTimeout); state.value = 'unavailable'; });
    player.addListener('account_error',         () => { clearTimeout(connectTimeout); state.value = 'needs-connect'; });

    await player.connect();
  } catch {
    state.value = 'unavailable';
  }
});

onUnmounted(() => {
  clearTimeout(connectTimeout);
  stopTicker();
  player?.disconnect();
  player = null;
});
</script>

<style scoped>
.sp-wrap { width: 100%; margin-top: 12px; box-sizing: border-box; overflow: hidden; }

.sp-iframe           { width: 100%; border-radius: 10px; display: block; }
.sp-iframe--audio    { height: 166px; }
.sp-iframe--playlist { height: 460px; }

/* ── Card ── */
.sp-card {
  background: #121212;
  border: 2px solid #1db954;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #fff;
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
}

/* ── Needs connect ── */
.sp-needs-connect {
  align-items: center; text-align: center;
  flex-direction: column; gap: 14px; padding: 28px 20px;
}
.sp-nc-icon { font-size: 2.2rem; }
.sp-nc-text { display: flex; flex-direction: column; gap: 6px; }
.sp-nc-text strong { color: #fff; font-size: 0.95rem; }
.sp-nc-text span   { color: #888; font-size: 0.82rem; line-height: 1.4; }
.sp-nc-btn {
  display: inline-block; padding: 8px 22px;
  background: #1db954; color: #000;
  font-size: 0.82rem; font-weight: 700;
  border-radius: 20px; text-decoration: none;
  transition: background 0.15s;
}
.sp-nc-btn:hover { background: #1ed760; }

/* ── Loading ── */
.sp-loading {
  align-items: center; justify-content: center;
  flex-direction: row; gap: 14px; min-height: 100px;
}
.sp-spinner {
  width: 24px; height: 24px;
  border: 3px solid #333; border-top-color: #1db954;
  border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.sp-status-msg { font-size: 0.95rem; color: #aaa; }

/* ── Top ── */
.sp-top { display: flex; gap: 14px; align-items: center; }
.sp-art-wrap { flex-shrink: 0; }
.sp-art { width: 80px; height: 80px; border-radius: 10px; object-fit: cover; display: block; }
.sp-art--empty {
  background: #2a2a2a; display: flex; align-items: center;
  justify-content: center; font-size: 2rem;
}
.sp-info { flex: 1; min-width: 0; }
.sp-track-name {
  font-weight: 700; font-size: 1rem; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sp-track-artist { font-size: 0.85rem; color: #aaa; margin-top: 3px; }
.sp-track-album  { font-size: 0.78rem; color: #555; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Open on Spotify ── */
.sp-open-btn {
  display: inline-flex; align-items: center; gap: 5px;
  flex-shrink: 0; align-self: flex-start;
  background: #1db954; color: #000;
  font-size: 0.75rem; font-weight: 700;
  padding: 5px 11px; border-radius: 20px; text-decoration: none;
  transition: background 0.15s, transform 0.15s; white-space: nowrap;
}
.sp-open-btn:hover { background: #1ed760; transform: scale(1.05); }
.sp-spotify-icon { width: 13px; height: 13px; flex-shrink: 0; }

/* ── Progress ── */
.sp-progress-wrap { cursor: pointer; user-select: none; padding: 6px 0; }
.sp-bar { position: relative; height: 5px; background: #333; border-radius: 3px; overflow: visible; }
.sp-bar-fill { height: 100%; background: #1db954; border-radius: 3px; pointer-events: none; }
.sp-bar-thumb {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 13px; height: 13px; background: #fff; border-radius: 50%;
  opacity: 0; transition: opacity 0.15s; pointer-events: none;
}
.sp-progress-wrap:hover .sp-bar-thumb { opacity: 1; }
.sp-progress-wrap:hover .sp-bar-fill  { background: #1ed760; }
.sp-times { display: flex; justify-content: space-between; font-size: 0.72rem; color: #555; margin-top: 6px; }

/* ── Controls ── */
.sp-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.sp-btn {
  background: none; border: none; color: #aaa; cursor: pointer;
  border-radius: 50%; transition: color 0.15s, background 0.15s, transform 0.15s;
  line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sp-btn:hover { color: #fff; background: #2a2a2a; }
.sp-btn--skip { font-size: 1.3rem; padding: 7px; width: 40px; height: 40px; }
.sp-btn--play { width: 50px; height: 50px; font-size: 1.2rem; background: #1db954; color: #000; }
.sp-btn--play:hover { background: #1ed760; color: #000; transform: scale(1.06); }
.sp-btn--shuffle { font-size: 1rem; padding: 7px; width: 36px; height: 36px; opacity: 0.45; }
.sp-btn--shuffle:hover { opacity: 1; }
.sp-btn--shuffle-on   { opacity: 1; color: #1db954; }
.sp-btn--shuffle-on:hover { color: #1ed760; }

/* ── Volume ── */
.sp-volume-wrap { display: flex; align-items: center; gap: 6px; margin-left: auto; min-width: 0; flex-shrink: 1; }
.sp-vol-icon { font-size: 1.1rem; padding: 5px; width: 34px; height: 34px; flex-shrink: 0; }
.sp-vol-track {
  position: relative; width: clamp(50px, 80px, 100px); min-width: 50px;
  height: 5px; background: #333; border-radius: 3px; cursor: pointer; flex-shrink: 1;
}
.sp-vol-fill  { height: 100%; background: #1db954; border-radius: 3px; pointer-events: none; }
.sp-vol-thumb {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 13px; height: 13px; background: #fff; border-radius: 50%;
  pointer-events: none; transition: transform 0.1s;
}
.sp-vol-track:hover .sp-vol-fill  { background: #1ed760; }
.sp-vol-track:hover .sp-vol-thumb { transform: translate(-50%, -50%) scale(1.2); }
.sp-vol-pct { font-size: 0.75rem; color: #888; min-width: 30px; text-align: right; font-variant-numeric: tabular-nums; }

/* ── Playlist track list ── */
.sp-tracklist {
  margin-top: -8px;
  border-top: 1px solid #2a2a2a;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.sp-tracklist::-webkit-scrollbar { width: 4px; }
.sp-tracklist::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

.sp-tracklist-header {
  padding: 8px 12px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  position: sticky;
  top: 0;
  background: #121212;
}

.sp-track-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s;
  min-width: 0;
}
.sp-track-row:hover { background: #1a1a1a; }
.sp-track-row--active { background: #1a2e1a; }
.sp-track-row--active .sp-track-row-name { color: #1db954; }

.sp-track-row-num {
  font-size: 0.75rem; color: #555; min-width: 18px; text-align: right; flex-shrink: 0;
}
.sp-track-row-info { flex: 1; min-width: 0; }
.sp-track-row-name {
  font-size: 0.85rem; font-weight: 600; color: #ddd;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
}
.sp-track-row-artist {
  font-size: 0.75rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
}
.sp-track-row-dur { font-size: 0.72rem; color: #555; flex-shrink: 0; font-variant-numeric: tabular-nums; }

/* ── Branding ── */
.sp-brand { font-size: 0.68rem; color: #333; text-align: right; margin-top: -8px; }

/* ── Mobile ── */
@media (max-width: 560px) {
  .sp-card { padding: 14px; gap: 14px; }
  .sp-art  { width: 64px; height: 64px; }
  .sp-track-name { font-size: 0.92rem; }
  .sp-btn--play  { width: 44px; height: 44px; font-size: 1.1rem; }
  .sp-btn--skip  { width: 34px; height: 34px; font-size: 1.1rem; }
  .sp-vol-track  { width: 60px; }
  .sp-vol-pct    { display: none; }
}
</style>
