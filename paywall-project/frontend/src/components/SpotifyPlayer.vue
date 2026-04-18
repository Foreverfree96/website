<template>
  <div class="sp-wrap">

    <!-- ── Unavailable ──────────────────────────────────────────────────────── -->
    <div v-if="state === 'unavailable'" class="sp-card sp-unavail">
      <div class="sp-connect-icon">🎵</div>
      <span class="sp-connect-title">Player unavailable</span>
      <span v-if="!isSecureCtx" class="sp-connect-sub">Spotify Web Player requires HTTPS and a supported browser.</span>
      <span v-else class="sp-connect-sub">Could not connect to Spotify. Check your connection and try again.</span>
      <button v-if="isSecureCtx" class="sp-connect-btn" @click="handleRetry">Try Again</button>
    </div>

    <!-- ── Needs Spotify connect — show button instead of auto-redirecting ─── -->
    <div v-else-if="state === 'needs-connect'" class="sp-card sp-needs-connect">
      <div class="sp-connect-icon">🎵</div>
      <span class="sp-connect-title">Connect Spotify to play</span>
      <span class="sp-connect-sub">Requires a Spotify Premium account</span>
      <a :href="sdk.spotifyConnectUrl.value" class="sp-connect-btn">Connect Spotify</a>
    </div>

    <!-- ── Inactive (lazyConnect — preview shown, SDK not yet connected) ───── -->
    <div v-else-if="state === 'inactive'" class="sp-card sp-inactive">
      <div class="sp-top">
        <div class="sp-art-wrap">
          <img v-if="previewTrack.art" :src="previewTrack.art" class="sp-art" />
          <div v-else class="sp-art sp-art--empty">🎵</div>
        </div>
        <div class="sp-info">
          <div class="sp-track-name">{{ localMeta.name || previewTrack.name || 'Spotify' }}</div>
          <div v-if="localMeta.owner" class="sp-meta-owner">by {{ localMeta.owner }}</div>
          <div class="sp-track-artist">{{ previewTrack.artist || (isPlaylist ? 'Playlist' : 'Track') }}</div>
        </div>
        <a :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="sp-open-btn" title="Open on Spotify">
          <svg viewBox="0 0 24 24" fill="currentColor" class="sp-spotify-icon">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.307a.75.75 0 0 1-1.032.248c-2.826-1.727-6.38-2.117-10.57-1.16a.75.75 0 1 1-.334-1.463c4.583-1.047 8.515-.596 11.688 1.343a.75.75 0 0 1 .248 1.032zm1.47-3.268a.938.938 0 0 1-1.29.31c-3.234-1.988-8.162-2.564-11.986-1.403a.937.937 0 1 1-.544-1.794c4.37-1.325 9.8-.683 13.51 1.597a.938.938 0 0 1 .31 1.29zm.127-3.405C15.38 8.39 9.446 8.19 6.02 9.216a1.125 1.125 0 1 1-.653-2.154c3.96-1.2 10.545-.968 14.7 1.617a1.125 1.125 0 0 1-1.154 1.935-.985.985 0 0 1-.8.003z"/>
          </svg>
          Open
        </a>
      </div>
      <button class="sp-inactive-play" @click="connectAndPlay">▶ Play on this device</button>
    </div>

    <!-- ── Loading ──────────────────────────────────────────────────────────── -->
    <div v-else-if="state !== 'ready'" class="sp-card sp-loading">
      <div class="sp-spinner"></div>
      <span class="sp-status-msg">{{ sdk.statusMsg.value }}</span>
    </div>

    <!-- ── Player ───────────────────────────────────────────────────────────── -->
    <div v-else class="sp-card">

      <!-- Album art + track info + open link -->
      <div class="sp-top">
        <div class="sp-art-wrap">
          <img v-if="sdk.track.value.art" :src="sdk.track.value.art" class="sp-art" />
          <div v-else class="sp-art sp-art--empty">🎵</div>
        </div>
        <div class="sp-info">
          <div class="sp-track-name" :title="sdk.track.value.name">{{ sdk.track.value.name || '—' }}</div>
          <div class="sp-track-artist">{{ sdk.track.value.artist || '—' }}</div>
          <div class="sp-track-album">{{ sdk.track.value.album }}</div>
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
          <div class="sp-bar-fill" :style="{ width: sdk.progressPct.value + '%' }"></div>
          <div class="sp-bar-thumb" :style="{ left: sdk.progressPct.value + '%' }"></div>
        </div>
        <div class="sp-times">
          <span>{{ sdk.fmtMs(sdk.position.value) }}</span>
          <span>{{ sdk.fmtMs(sdk.duration.value) }}</span>
        </div>
      </div>

      <!-- Playback controls -->
      <div class="sp-controls">
        <button class="sp-btn sp-btn--skip" @click="sdk.prev()" title="Previous">⏮</button>
        <button class="sp-btn sp-btn--play" @click="sdk.togglePlay()" :title="sdk.paused.value ? 'Play' : 'Pause'">
          {{ sdk.paused.value ? '▶' : '⏸' }}
        </button>
        <button class="sp-btn sp-btn--skip" @click="sdk.next()" title="Next">⏭</button>
      </div>

      <!-- Shuffle + Volume row -->
      <div class="sp-extra-row">
        <button class="sp-shuffle-pill" :class="{ 'sp-shuffle-pill--on': sdk.shuffleOn.value }" @click="sdk.toggleShuffle()">
          🔀 Shuffle{{ sdk.shuffleOn.value ? ': On' : ': Off' }}
        </button>
        <div class="sp-vol-group">
          <button class="sp-btn sp-vol-icon" @click="sdk.toggleMute()" :title="sdk.muted.value ? 'Unmute' : 'Mute'">
            {{ sdk.muted.value || sdk.displayVolume.value === 0 ? '🔇' : sdk.displayVolume.value < 50 ? '🔉' : '🔊' }}
          </button>
          <div class="sp-vol-track" ref="volTrack"
            @mousedown="startVolScrub" @touchstart.passive="startVolScrub">
            <div class="sp-vol-fill" :style="{ width: sdk.displayVolume.value + '%' }"></div>
            <div class="sp-vol-thumb" :style="{ left: sdk.displayVolume.value + '%' }"></div>
          </div>
          <span class="sp-vol-pct">{{ sdk.displayVolume.value }}%</span>
        </div>
      </div>

      <!-- ── Save actions row ───────────────────────────────────────────── -->
      <div class="sp-save-row">
        <button class="sp-like-btn" :class="{ 'sp-like-btn--liked': liked }" @click="toggleLike" :disabled="likeLoading" title="Save to Liked Songs">
          {{ liked ? '♥' : '♡' }}
        </button>
        <div class="sp-add-wrap">
          <button class="sp-add-btn" @click="togglePlaylistDropdown">+ Add to Playlist</button>
          <div v-if="showPlaylistDropdown" class="sp-add-dropdown">
            <div v-if="playlistsLoading" class="sp-add-loading">Loading...</div>
            <div v-else-if="!playlists.length" class="sp-add-loading">No playlists found</div>
            <div v-for="p in playlists" :key="p.id" class="sp-add-item" @click="addToPlaylist(p.id, p.name)">
              {{ p.name }}
            </div>
          </div>
        </div>
        <button v-if="isPlaylist" class="sp-save-pl-btn" :class="{ 'sp-save-pl-btn--saved': playlistSaved }" @click="saveWholePlaylist" :disabled="playlistSaveLoading">
          {{ playlistSaved ? 'Saved' : 'Save Playlist' }}
        </button>
        <span v-if="saveMsg" class="sp-save-msg">{{ saveMsg }}</span>
      </div>

      <!-- ── Reconnect nudge (missing playlist scope) ────────────────────── -->
      <div v-if="sdk.needsReconnect.value" class="sp-reconnect-banner">
        <div class="sp-reconnect-body">
          <span class="sp-reconnect-title">⚠ Playlist queue unavailable</span>
          <span class="sp-reconnect-desc">
            Spotify now requires a new permission (<em>playlist-read-private</em>) to load track lists.
            Reconnecting takes ~5 seconds and only needs to be done once — after that your full queue loads automatically.
          </span>
          <a :href="sdk.spotifyConnectUrl.value" class="sp-reconnect-btn">Reconnect Spotify →</a>
        </div>
        <button class="sp-reconnect-dismiss" @click="sdk.dismissReconnect()" title="Dismiss">✕</button>
      </div>

      <!-- ── Scrollable playlist track list ───────────────────────────────── -->
      <div v-if="isPlaylist && displayTracks.length" class="sp-tracklist" ref="tracklistEl">
        <div class="sp-tracklist-header" @click="localListOpen = !localListOpen">
          <span>Queue ({{ displayTracks.length }})</span>
          <span class="sp-tracklist-arrow">{{ localListOpen ? '▲' : '▼' }}</span>
        </div>
        <div v-show="localListOpen">
          <div
            v-for="(t, i) in displayTracks"
            :key="t.uri"
            class="sp-track-row"
            :class="{ 'sp-track-row--active': t.uri === sdk.currentTrackUri.value }"
            @click="sdk.playTrackFromList(t)"
          >
            <span class="sp-track-row-num">{{ i + 1 }}</span>
            <div class="sp-track-row-info">
              <span class="sp-track-row-name">{{ t.name }}</span>
              <span class="sp-track-row-artist">{{ t.artist }}</span>
            </div>
            <span class="sp-track-row-dur">{{ sdk.fmtMs(t.duration) }}</span>
          </div>
        </div>
      </div>

      <div class="sp-footer">
        <span class="sp-brand">Powered by Spotify</span>
        <button class="sp-disconnect-btn" @click="sdk.disconnect()">⏏ Disconnect</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useSpotifySDK } from '../composables/useSpotifySDK.js';
import { useAudioCoordinator } from '../composables/useAudioCoordinator.js';

const props = defineProps({
  mediaUrl:        { type: String,  default: '' },
  isPlaylist:      { type: Boolean, default: false },
  autoPlay:        { type: Boolean, default: false },
  defaultListOpen: { type: Boolean, default: true  },
  startPosition:   { type: Number,  default: 0     },
  startTrackUri:   { type: String,  default: ''    },
  lazyConnect:     { type: Boolean, default: false },
});

const emit = defineEmits(['will-connect']);
const sdk = useSpotifySDK();

// ── Audio coordinator: signal when Spotify starts, pause when others start ───
const { signalPlay: spSignalPlay } = useAudioCoordinator({
  onShouldPause: () => {
    // Another player started — pause Spotify SDK
    if (isActive.value && !sdk.paused.value) {
      sdk.pause();
    }
  },
});

const progressBar = ref(null);
const volTrack    = ref(null);
const tracklistEl = ref(null);

const isSecureCtx = window.isSecureContext;

// Is THIS component's URL the one currently playing in the singleton?
const isActive = computed(() => sdk.currentMediaUrl.value === props.mediaUrl);

// Derive display state
const state = computed(() => {
  if (isActive.value) {
    // Our URL is the active one — show singleton state
    const s = sdk.sdkState.value;
    if (s === 'idle') return 'inactive';
    return s; // connecting | ready | unavailable | needs-connect
  }
  // Not our URL — check for global errors
  if (sdk.sdkState.value === 'needs-connect') return 'needs-connect';
  if (sdk.sdkState.value === 'unavailable' && !sdk.currentMediaUrl.value) return 'unavailable';
  return 'inactive';
});

// ── Preview track info for inactive card ─────────────────────────────────────
const localTracks = ref([]);
const localMeta   = ref({ name: '', owner: '' });
const localListOpen = ref(props.defaultListOpen);
const previewTrack = ref({ name: '', artist: '', art: '' });

// Show THIS playlist's tracks — use global SDK tracks when active, local cache otherwise
const displayTracks = computed(() => {
  if (isActive.value && sdk.playlistTracks.value.length) return sdk.playlistTracks.value;
  return localTracks.value;
});

// Keep localTracks in sync when this is the active player
watch(() => sdk.playlistTracks.value, (tracks) => {
  if (isActive.value && tracks?.length) {
    localTracks.value = tracks;
  }
});

// ── Restore saved position on mount (survives page refresh) ──────────────────
const restoredPosition = ref(0);
const restoredTrackUri = ref('');

onMounted(() => {
  // Load saved position from localStorage if no explicit start position was passed
  if (!props.startPosition && !props.startTrackUri) {
    const saved = sdk.loadSavedPosition(props.mediaUrl);
    if (saved) {
      restoredPosition.value = saved.positionMs || 0;
      restoredTrackUri.value = saved.trackUri || '';
    }
  }

  if (props.isPlaylist) {
    const cached = sdk.loadCachedTracks(props.mediaUrl);
    if (cached?.tracks?.length) {
      localTracks.value = cached.tracks;
      const resumeUri = props.startTrackUri || restoredTrackUri.value;
      const t = (resumeUri && cached.tracks.find(t => t.uri === resumeUri)) || cached.tracks[0];
      if (t) previewTrack.value = { name: t.name, artist: t.artist, art: t.art };
    }
    // Background fetch for preview — also populates localTracks
    sdk.preloadTracks(props.mediaUrl);
  }

  // Auto-play on mount if requested
  if (props.autoPlay) {
    connectAndPlay();
  }
});

// ── Watch for mediaUrl changes (e.g. navigating between posts) ──────────────
watch(() => props.mediaUrl, (newUrl, oldUrl) => {
  if (!newUrl || newUrl === oldUrl) return;
  // If the SDK is actively playing a different URL, switch to the new one
  if (sdk.sdkState.value === 'ready' && sdk.currentMediaUrl.value && sdk.currentMediaUrl.value !== newUrl) {
    sdk.play(newUrl, {
      isPlaylist:    props.isPlaylist,
      autoPlay:      false, // don't auto-play, show preview card
      startPosition: 0,
      startTrackUri: '',
    });
  }
});

// ── Auto-scroll active track ─────────────────────────────────────────────────
watch(() => sdk.currentTrackUri.value, async () => {
  if (!tracklistEl.value) return;
  await nextTick();
  const active = tracklistEl.value.querySelector('.sp-track-row--active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

// Signal other players to pause whenever Spotify resumes/starts playing
watch(() => sdk.paused.value, (paused) => {
  if (!paused && isActive.value) spSignalPlay();
});

// ── Connect and play ─────────────────────────────────────────────────────────
const connectAndPlay = () => {
  emit('will-connect');
  sdk.play(props.mediaUrl, {
    isPlaylist:    props.isPlaylist,
    autoPlay:      true,
    startPosition: props.startPosition || restoredPosition.value,
    startTrackUri: props.startTrackUri || restoredTrackUri.value,
  });
};

const handleRetry = () => {
  sdk.retryConnect(props.mediaUrl, {
    isPlaylist:    props.isPlaylist,
    autoPlay:      true,
    startPosition: props.startPosition || restoredPosition.value,
    startTrackUri: props.startTrackUri || restoredTrackUri.value,
  });
};

// ── Progress scrubbing ───────────────────────────────────────────────────────
const startScrub = (e) => {
  e.preventDefault();
  const bar = progressBar.value;
  if (!bar) return;
  const doScrub = (x) => {
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    sdk.seek(Math.floor(pct * sdk.duration.value));
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

// ── Volume scrubbing ─────────────────────────────────────────────────────────
const startVolScrub = (e) => {
  e.preventDefault();
  const vt = volTrack.value;
  if (!vt) return;
  const doVol = (x) => {
    const rect = vt.getBoundingClientRect();
    sdk.setVolume(Math.round(Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * 100));
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

// ── Save actions ────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('jwtToken')}` });

const liked = ref(false);
const likeLoading = ref(false);
const playlists = ref([]);
const playlistsLoading = ref(false);
const showPlaylistDropdown = ref(false);
const playlistSaved = ref(false);
const playlistSaveLoading = ref(false);
const saveMsg = ref('');
let saveMsgTimer = null;

const flashMsg = (msg) => {
  saveMsg.value = msg;
  clearTimeout(saveMsgTimer);
  saveMsgTimer = setTimeout(() => { saveMsg.value = ''; }, 2500);
};

const currentTrackId = computed(() => {
  const uri = sdk.currentTrackUri.value || '';
  return uri.replace('spotify:track:', '');
});

const toggleLike = async () => {
  if (!currentTrackId.value || likeLoading.value) return;
  likeLoading.value = true;
  try {
    const res = await fetch(`${API}/api/spotify/save-track`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds: [currentTrackId.value] }),
    });
    if (res.ok) { liked.value = true; flashMsg('Saved to Liked Songs'); }
    else if (res.status === 403) { flashMsg('Reconnect Spotify to save tracks'); sdk.needsReconnect.value = true; }
    else flashMsg('Failed to save');
  } catch { flashMsg('Failed to save'); }
  finally { likeLoading.value = false; }
};

// Reset liked state when track changes
watch(currentTrackId, () => { liked.value = false; });

const togglePlaylistDropdown = async () => {
  showPlaylistDropdown.value = !showPlaylistDropdown.value;
  if (showPlaylistDropdown.value && !playlists.value.length) {
    playlistsLoading.value = true;
    try {
      const res = await fetch(`${API}/api/spotify/playlists`, { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        playlists.value = data.playlists || [];
      }
    } catch { /* silent */ }
    finally { playlistsLoading.value = false; }
  }
};

const addToPlaylist = async (playlistId, name) => {
  const uri = sdk.currentTrackUri.value;
  if (!uri) return;
  showPlaylistDropdown.value = false;
  try {
    const res = await fetch(`${API}/api/spotify/playlist/${playlistId}/add`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackUris: [uri] }),
    });
    if (res.ok) flashMsg(`Added to ${name}`);
    else if (res.status === 409) flashMsg('Already in playlist');
    else flashMsg('Failed to add');
  } catch { flashMsg('Failed to add'); }
};

const saveWholePlaylist = async () => {
  if (playlistSaved.value || playlistSaveLoading.value) return;
  const m = props.mediaUrl.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/);
  if (!m) return flashMsg('Could not detect playlist ID');
  playlistSaveLoading.value = true;
  try {
    const res = await fetch(`${API}/api/spotify/save-playlist`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId: m[2] }),
    });
    if (res.ok) { playlistSaved.value = true; flashMsg('Playlist saved to library'); }
    else flashMsg('Failed to save playlist');
  } catch { flashMsg('Failed to save playlist'); }
  finally { playlistSaveLoading.value = false; }
};

// Close dropdown when clicking outside
const onDocClick = (e) => {
  if (showPlaylistDropdown.value && !e.target.closest('.sp-add-wrap')) {
    showPlaylistDropdown.value = false;
  }
};
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));

// ── Expose for parent components (backward compatible) ───────────────────────
defineExpose({
  position:        sdk.position,
  currentTrackUri: sdk.currentTrackUri,
  paused:          sdk.paused,
  setHandOffMode:  () => {}, // no-op — singleton player stays alive
});
</script>

<style scoped>
.sp-wrap { width: 100%; margin-top: 12px; box-sizing: border-box; overflow: hidden; }

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

/* ── Unavailable card ── */
.sp-unavail { align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 28px 24px; }

/* ── Inactive preview (lazyConnect mode) ── */
.sp-inactive { gap: 16px; }
.sp-meta-owner { font-size: 0.78rem; color: #1db954; margin-top: 2px; font-weight: 600; }
.sp-inactive-play {
  width: 100%; padding: 12px;
  border-radius: 28px;
  background: #1db954; color: #000;
  border: none; font-size: 1rem; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background 0.15s, transform 0.1s;
  letter-spacing: 0.02em;
}
.sp-inactive-play:hover { background: #1ed760; transform: scale(1.02); }

/* ── Loading ── */
.sp-loading {
  align-items: center; justify-content: center;
  flex-direction: row; gap: 14px; min-height: 100px;
}

/* ── Needs connect ── */
.sp-needs-connect {
  align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 28px 24px;
}
.sp-connect-icon { font-size: 2.2rem; }
.sp-connect-title { font-size: 1rem; font-weight: 700; color: #fff; }
.sp-connect-sub { font-size: 0.8rem; color: #666; margin-top: -4px; }
.sp-connect-btn {
  display: inline-block; margin-top: 6px;
  padding: 10px 24px; border-radius: 24px;
  background: #1db954; color: #000;
  font-size: 0.9rem; font-weight: 700; text-decoration: none;
  transition: background 0.15s, transform 0.1s;
}
.sp-connect-btn:hover { background: #1ed760; transform: scale(1.03); }
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
.sp-controls { display: flex; align-items: center; justify-content: center; gap: 8px; }
.sp-btn {
  background: none; border: none; color: #aaa; cursor: pointer;
  border-radius: 50%; transition: color 0.15s, background 0.15s, transform 0.15s;
  line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sp-btn:hover { color: #fff; background: #2a2a2a; }
.sp-btn--skip { font-size: 1.3rem; padding: 7px; width: 40px; height: 40px; }
.sp-btn--play { width: 50px; height: 50px; font-size: 1.2rem; background: #1db954; color: #000; }
.sp-btn--play:hover { background: #1ed760; color: #000; transform: scale(1.06); }

/* ── Shuffle + Volume row ── */
.sp-extra-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.sp-shuffle-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 20px; border: 1.5px solid #333;
  background: #1a1a1a; color: #aaa; font-size: 0.8rem; font-weight: 600;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.sp-shuffle-pill:hover { background: #2a2a2a; color: #fff; border-color: #555; }
.sp-shuffle-pill--on { background: rgba(29,185,84,0.15); color: #1db954; border-color: #1db954; }
.sp-shuffle-pill--on:hover { background: rgba(29,185,84,0.25); color: #1ed760; }

.sp-vol-group { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 100px; }
.sp-vol-icon { font-size: 1.1rem; padding: 5px; width: 34px; height: 34px; flex-shrink: 0; }
.sp-vol-track {
  position: relative; flex: 1;
  height: 6px; background: #333; border-radius: 3px; cursor: pointer;
}
.sp-vol-fill  { height: 100%; background: #1db954; border-radius: 3px; pointer-events: none; }
.sp-vol-thumb {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 14px; height: 14px; background: #fff; border-radius: 50%;
  pointer-events: none; transition: transform 0.1s;
}
.sp-vol-track:hover .sp-vol-fill  { background: #1ed760; }
.sp-vol-track:hover .sp-vol-thumb { transform: translate(-50%, -50%) scale(1.2); }
.sp-vol-pct { font-size: 0.75rem; color: #888; min-width: 30px; text-align: right; font-variant-numeric: tabular-nums; flex-shrink: 0; }

/* ── Reconnect banner ── */
.sp-reconnect-banner {
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.3); border-radius: 10px;
  padding: 12px 14px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
}
.sp-reconnect-body {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
}
.sp-reconnect-title {
  font-size: 0.8rem; font-weight: 700; color: #f59e0b;
}
.sp-reconnect-desc {
  font-size: 0.76rem; color: #aaa; line-height: 1.5;
}
.sp-reconnect-desc em { color: #888; font-style: normal; font-family: monospace; }
.sp-reconnect-btn {
  display: inline-block; margin-top: 4px;
  padding: 7px 16px; border-radius: 20px;
  background: #1db954; color: #000;
  font-size: 0.78rem; font-weight: 700;
  text-decoration: none; transition: background 0.15s, transform 0.1s;
  align-self: flex-start;
}
.sp-reconnect-btn:hover { background: #1ed760; transform: scale(1.03); }
.sp-reconnect-dismiss {
  background: none; border: 1px solid rgba(245,158,11,0.4); border-radius: 6px;
  font-size: 0.72rem; cursor: pointer; padding: 2px 7px; line-height: 1.6;
  transition: background 0.15s, color 0.15s; flex-shrink: 0;
  color: #f59e0b;
}
.sp-reconnect-dismiss:hover { background: rgba(245,158,11,0.2); }

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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  position: sticky;
  top: 0;
  background: #121212;
  cursor: pointer;
  user-select: none;
}
.sp-tracklist-header:hover { color: #aaa; }
.sp-tracklist-arrow { font-size: 0.6rem; }

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

/* ── Footer (branding + disconnect) ── */
.sp-footer {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  margin-top: -4px;
}
.sp-brand { font-size: 0.68rem; color: #444; }
.sp-disconnect-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: 1px solid #4a1a1a; color: #e11d48;
  font-size: 0.75rem; font-weight: 600; border-radius: 6px;
  cursor: pointer; padding: 4px 10px;
  transition: background 0.15s, color 0.15s;
}
.sp-disconnect-btn:hover { background: #e11d48; color: #fff; }

/* ── Save actions row ── */
.sp-save-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sp-like-btn {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #888;
  font-size: 1.1rem;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.sp-like-btn:hover { color: #ff69b4; background: #3a3a3a; transform: scale(1.1); }
.sp-like-btn--liked { color: #ff69b4; background: #3a1a2a; border-color: #ff69b4; }
.sp-like-btn--liked:hover { background: #4a1a2a; }

.sp-add-wrap {
  position: relative;
}

.sp-add-btn {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.sp-add-btn:hover { background: #3a3a3a; color: #fff; }

.sp-add-dropdown {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  max-height: 200px;
  overflow-y: auto;
  background: #1a1a1a;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  z-index: 10;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.sp-add-dropdown::-webkit-scrollbar { width: 4px; }
.sp-add-dropdown::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

.sp-add-item {
  padding: 9px 14px;
  font-size: 0.8rem;
  color: #ccc;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s;
}
.sp-add-item:hover { background: #2a2a2a; color: #1db954; }

.sp-add-loading {
  padding: 12px 14px;
  font-size: 0.78rem;
  color: #666;
  text-align: center;
}

.sp-save-pl-btn {
  background: transparent;
  border: 1px solid #1db954;
  color: #1db954;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.sp-save-pl-btn:hover { background: #1db954; color: #000; }
.sp-save-pl-btn--saved { background: #1db954; color: #000; cursor: default; }

.sp-save-msg {
  font-size: 0.72rem;
  color: #1db954;
  font-weight: 600;
  white-space: nowrap;
  animation: sp-fade-msg 2.5s ease forwards;
}
@keyframes sp-fade-msg {
  0%, 70% { opacity: 1; }
  100%    { opacity: 0; }
}

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
@media (max-width: 400px) {
  .sp-card { padding: 10px; gap: 10px; }
  .sp-art  { width: 52px; height: 52px; }
  .sp-track-name { font-size: 0.85rem; }
  .sp-track-artist { font-size: 0.75rem; }
  .sp-btn--play  { width: 40px; height: 40px; }
  .sp-btn--skip  { width: 30px; height: 30px; }
  .sp-vol-track  { display: none; }
  .sp-connect-title { font-size: 0.9rem; }
  .sp-connect-sub   { font-size: 0.75rem; }
  .sp-inactive-play { font-size: 0.85rem; padding: 8px 16px; }
  .sp-add-btn, .sp-save-pl-btn { font-size: 0.72rem; padding: 6px 10px; }
  .sp-like-btn { width: 32px; height: 32px; font-size: 1rem; }
}
</style>
