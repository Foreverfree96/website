<template>
  <div class="mp-root" v-if="nowPlaying">

    <transition name="mp-slide">
      <div v-show="expanded" class="mp-panel">

        <!-- Header -->
        <div class="mp-header">
          <span class="mp-label">♫ Now Playing</span>
          <div class="mp-header-btns">
            <button class="mp-hbtn" @click="expanded = false" title="Minimize">—</button>
            <button class="mp-hbtn mp-hbtn--close" @click="handleClose" title="Stop & close">✕</button>
          </div>
        </div>

        <!-- ── Spotify: use full SDK player ──────────────────────────────── -->
        <div v-if="isSpotify" class="mp-spotify-wrap">
          <SpotifyPlayer
            ref="spotifyPlayerRef"
            :mediaUrl="nowPlaying.url"
            :isPlaylist="nowPlaying.isPlaylist || false"
            :autoPlay="false"
            :defaultListOpen="true"
            :startPosition="nowPlaying.position || 0"
            :startTrackUri="nowPlaying.trackUri || ''"
          />
        </div>

        <!-- ── All other platforms: preview → iframe ─────────────────────── -->
        <template v-else>

          <!-- Preview card -->
          <div v-if="!playerReady" class="mp-preview">
            <div class="mp-preview-thumb-wrap">
              <img v-if="previewThumb" :src="previewThumb" class="mp-preview-thumb" />
              <div v-else class="mp-preview-icon">{{ previewIcon }}</div>
            </div>
            <div class="mp-preview-meta">
              <span class="mp-preview-type">{{ previewLabel }}</span>
            </div>
            <button class="mp-preview-play" @click="playerReady = true">▶ Play</button>
          </div>

          <!-- Embed iframe -->
          <div v-else class="mp-body">
            <iframe
              :key="iframeKey"
              ref="iframeEl"
              :src="embedUrl"
              frameborder="0"
              class="mp-embed"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowfullscreen
              @load="onIframeLoad"
            />
          </div>

          <!-- YouTube playlist skip controls + queue -->
          <template v-if="playerReady && isYtPlaylist">
            <div class="mp-skip-bar">
              <button class="mp-skip-btn" @click="skipSong(-1)" title="Previous">⏮</button>
              <span class="mp-skip-label">Track {{ ytPlaylistIndex + 1 }}{{ ytPlaylistLength ? ` / ${ytPlaylistLength}` : '' }}</span>
              <button class="mp-skip-btn" @click="skipSong(1)" title="Next">⏭</button>
            </div>

            <!-- Up Next queue -->
            <div v-if="ytPlaylistLength > 1" class="mp-queue">
              <div class="mp-queue-header" @click="ytQueueOpen = !ytQueueOpen">
                <span>Queue ({{ ytPlaylistLength }} tracks)</span>
                <span class="mp-queue-arrow">{{ ytQueueOpen ? '▲' : '▼' }}</span>
              </div>
              <div v-show="ytQueueOpen" class="mp-queue-list">
                <div
                  v-for="i in ytPlaylistLength"
                  :key="i - 1"
                  class="mp-queue-row"
                  :class="{ 'mp-queue-row--active': i - 1 === ytPlaylistIndex }"
                  @click="jumpToTrack(i - 1)"
                >
                  <span class="mp-queue-num">{{ i }}</span>
                  <span class="mp-queue-name">
                    {{ ytTitles[i - 1] || `Track ${i}` }}
                    <span v-if="i - 1 === ytPlaylistIndex" class="mp-queue-playing">▶</span>
                  </span>
                </div>
              </div>
            </div>
          </template>

        </template>

      </div>
    </transition>

    <!-- Bubble -->
    <button
      class="mp-bubble"
      :class="{ 'mp-bubble--on': expanded }"
      @click="expanded = !expanded"
      :title="expanded ? 'Minimize player' : 'Open player'"
    >
      <span class="mp-ring"></span>
      ♫
    </button>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, watchEffect } from 'vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';
import SpotifyPlayer from './SpotifyPlayer.vue';

const { nowPlaying, close, popInRequested } = useNowPlaying();

// Auto-expand and resume if there was something playing before the page refreshed
const expanded          = ref(!!nowPlaying.value);
const playerReady       = ref(false);
const iframeEl          = ref(null);
const iframeKey         = ref(0);
const ytTime            = ref(0);
const ytPlaylistIndex   = ref(0);
const ytPlaylistLength  = ref(0);
const ytCurrentTitle    = ref('');
const ytQueueOpen       = ref(false);
const ytVideoIds        = ref([]);   // video IDs from infoDelivery.playlist
const ytTitles          = ref({});   // index → title, populated via oEmbed
const spotifyPlayerRef  = ref(null);

const isSpotify   = computed(() => nowPlaying.value?.type === 'spotify');
const isYtPlaylist = computed(() =>
  nowPlaying.value?.type === 'youtube' && nowPlaying.value?.isPlaylist
);

// Reset when media changes or clears
watch(nowPlaying, (np, old) => {
  if (!np) {
    expanded.value        = false;
    playerReady.value     = false;
    ytPlaylistLength.value = 0;
    ytCurrentTitle.value  = '';
    ytQueueOpen.value     = false;
    ytVideoIds.value      = [];
    ytTitles.value        = {};
  } else if (old && (old.url !== np.url || old.type !== np.type)) {
    playerReady.value      = false;
    ytTime.value           = 0;
    ytPlaylistIndex.value  = np.playlistIndex || 0;
    ytPlaylistLength.value = 0;
    ytCurrentTitle.value   = '';
    ytQueueOpen.value      = false;
    ytVideoIds.value       = [];
    ytTitles.value         = {};
  }
});

// ── YouTube skip via postMessage API ──────────────────────────────────────────
const skipSong = (dir) => {
  if (!iframeEl.value) return;
  iframeEl.value.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: dir > 0 ? 'nextVideo' : 'previousVideo', args: [] }),
    '*'
  );
};

// ── Jump to a specific track index in the YT playlist ─────────────────────────
const jumpToTrack = (index) => {
  if (!iframeEl.value) return;
  iframeEl.value.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: 'playVideoAt', args: [index] }),
    '*'
  );
};

// ── YouTube postMessage: position + playlist tracking ─────────────────────────
const onIframeLoad = () => {
  if (nowPlaying.value?.type === 'youtube') {
    iframeEl.value?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
  }
};

const fetchYtTitles = async (videoIds) => {
  const results = {};
  await Promise.all(videoIds.slice(0, 50).map(async (id, idx) => {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      if (res.ok) { const d = await res.json(); results[idx] = d.title; }
    } catch { /* ignore */ }
  }));
  ytTitles.value = { ...ytTitles.value, ...results };
};

const onMessage = (e) => {
  if (!iframeEl.value || e.source !== iframeEl.value.contentWindow) return;
  try {
    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d.event === 'infoDelivery' && d.info) {
      if (d.info.currentTime   != null) ytTime.value          = d.info.currentTime;
      if (d.info.playlistIndex != null) ytPlaylistIndex.value = d.info.playlistIndex;
      if (d.info.videoData?.title) {
        ytCurrentTitle.value = d.info.videoData.title;
        ytTitles.value = { ...ytTitles.value, [ytPlaylistIndex.value]: d.info.videoData.title };
      }
      if (Array.isArray(d.info.playlist) && d.info.playlist.length > ytPlaylistLength.value) {
        ytPlaylistLength.value = d.info.playlist.length;
        ytVideoIds.value = d.info.playlist;
        fetchYtTitles(d.info.playlist);
      }
    }
  } catch { /* ignore */ }
};

onMounted(() => window.addEventListener('message', onMessage));
onUnmounted(() => window.removeEventListener('message', onMessage));

// Persist Spotify position every 5 s so page refresh can resume from same spot
let positionSaver = null;
watchEffect(() => {
  clearInterval(positionSaver);
  if (nowPlaying.value?.type === 'spotify' && spotifyPlayerRef.value) {
    positionSaver = setInterval(() => {
      const pos = spotifyPlayerRef.value?.position?.value;
      const uri = spotifyPlayerRef.value?.currentTrackUri?.value;
      if (pos > 0 && nowPlaying.value) {
        nowPlaying.value = {
          ...nowPlaying.value,
          position:     pos,
          resumeOnLoad: true,
          ...(uri ? { trackUri: uri } : {}),
        };
      }
    }, 5000);
  }
});
onUnmounted(() => clearInterval(positionSaver));

const savePositionAndClose = () => {
  if (nowPlaying.value?.type === 'youtube' && ytTime.value > 0) {
    nowPlaying.value = { ...nowPlaying.value, position: Math.floor(ytTime.value * 1000) };
  }
  if (nowPlaying.value?.type === 'spotify' && spotifyPlayerRef.value?.position > 0) {
    nowPlaying.value = { ...nowPlaying.value, position: spotifyPlayerRef.value.position };
  }
  playerReady.value = false;
  expanded.value    = false;
  close();
};

const handleClose = savePositionAndClose;

// "Pop back in" requested by the in-post embed button
watch(popInRequested, (requested) => {
  if (!requested) return;
  popInRequested.value = false;
  savePositionAndClose();
});

// ── Build embed URL (non-Spotify platforms only) ──────────────────────────────
const embedUrl = computed(() => {
  const np = nowPlaying.value;
  if (!np) return '';
  const { url, type, isPlaylist, playlistIndex = 0, position = 0 } = np;
  const startSecs = Math.floor(position / 1000);

  if (type === 'youtube') {
    const listMatch    = url.match(/[?&]list=([^&]+)/);
    const videoIdMatch = url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)/);
    const videoId      = videoIdMatch?.[1] || videoIdMatch?.[2] || null;
    if (listMatch && (isPlaylist || !videoId)) {
      const start = startSecs > 0 ? `&start=${startSecs}` : '';
      return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&autoplay=1&index=${playlistIndex}&enablejsapi=1${start}`;
    }
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startSecs}&enablejsapi=1`;
    }
    return '';
  }

  if (type === 'soundcloud') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&show_artwork=true&visual=true&color=%231db954`;
  }

  if (type === 'twitch') {
    const clip = url.match(/twitch\.tv\/\w+\/clip\/([^/?]+)/);
    const ch   = url.match(/twitch\.tv\/([^/?]+)/);
    if (clip) return `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${location.hostname}`;
    if (ch)   return `https://player.twitch.tv/?channel=${ch[1]}&parent=${location.hostname}&autoplay=true`;
  }

  if (type === 'applemusic') {
    return url.replace('music.apple.com', 'embed.music.apple.com');
  }

  return url;
});

// ── Preview helpers ───────────────────────────────────────────────────────────
const previewThumb = computed(() => {
  const np = nowPlaying.value;
  if (!np) return null;
  if (np.type === 'youtube') {
    const m = np.url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)/);
    const id = m?.[1] || m?.[2];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }
  return null;
});

const previewIcon = computed(() => {
  const icons = { youtube: '▶', soundcloud: '☁', twitch: '📺', applemusic: '🎵' };
  return icons[nowPlaying.value?.type] || '♫';
});

const previewLabel = computed(() => {
  const np = nowPlaying.value;
  if (!np) return '';
  const labels = { youtube: 'YouTube', soundcloud: 'SoundCloud', twitch: 'Twitch', applemusic: 'Apple Music' };
  const platform = labels[np.type] || np.type;
  return np.isPlaylist ? `${platform} Playlist` : platform;
});
</script>

<style scoped>
.mp-root {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

/* ── Bubble ── */
.mp-bubble {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #121212;
  border: 2px solid #1db954;
  color: #fff;
  font-size: 1.4rem;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.6);
  transition: transform 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.mp-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.7); }
.mp-bubble--on   { box-shadow: 0 0 0 3px rgba(29,185,84,0.3), 0 4px 20px rgba(0,0,0,0.6); }

.mp-ring {
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  border: 2px solid #1db954;
  animation: mp-pulse 2.4s ease-out infinite;
  pointer-events: none;
}
@keyframes mp-pulse {
  0%   { transform: scale(0.88); opacity: 0.7; }
  70%  { transform: scale(1.18); opacity: 0; }
  100% { transform: scale(0.88); opacity: 0; }
}

/* ── Panel ── */
.mp-panel {
  width: 360px;
  background: #121212;
  border-radius: 16px;
  border: 1px solid #2a2a2a;
  box-shadow: 0 10px 40px rgba(0,0,0,0.7);
  overflow: hidden;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  overflow-x: hidden;
}

.mp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}
.mp-label { color: #fff; font-weight: 700; font-size: 0.82rem; letter-spacing: 0.03em; }
.mp-header-btns { display: flex; gap: 6px; }
.mp-hbtn {
  background: #2a2a2a; border: none; color: #bbb;
  border-radius: 6px; padding: 3px 9px; cursor: pointer;
  font-size: 0.88rem; font-weight: 700; line-height: 1.4;
  transition: background 0.15s, color 0.15s;
}
.mp-hbtn:hover { background: #3a3a3a; color: #fff; }
.mp-hbtn--close:hover { background: #e11d48; color: #fff; }

/* ── Spotify SDK wrapper ── */
.mp-spotify-wrap { overflow: hidden; }
.mp-spotify-wrap :deep(.sp-wrap)          { margin-top: 0; }
.mp-spotify-wrap :deep(.sp-card)          { border: none; border-radius: 0; padding: 14px; gap: 12px; }
.mp-spotify-wrap :deep(.sp-tracklist)     { max-height: 200px; }
.mp-spotify-wrap :deep(.sp-brand)         { display: none; }
.mp-spotify-wrap :deep(.sp-vol-track)     { width: 58px; min-width: 40px; }
.mp-spotify-wrap :deep(.sp-vol-pct)       { display: none; }
.mp-spotify-wrap :deep(.sp-art)           { width: 56px; height: 56px; }
.mp-spotify-wrap :deep(.sp-iframe)        { border-radius: 0; }

/* ── Preview ── */
.mp-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 20px 16px 18px;
}
.mp-preview-thumb-wrap { width: 100%; }
.mp-preview-thumb { width: 100%; height: 160px; object-fit: cover; border-radius: 8px; display: block; }
.mp-preview-icon {
  width: 100%; height: 100px;
  display: flex; align-items: center; justify-content: center;
  font-size: 3rem; background: #1a1a1a; border-radius: 8px;
}
.mp-preview-meta { text-align: center; }
.mp-preview-type { font-size: 0.8rem; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.mp-preview-play {
  width: 100%; padding: 11px;
  background: #1db954; border: none; border-radius: 24px;
  color: #000; font-size: 0.95rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.mp-preview-play:hover { background: #1ed760; transform: scale(1.02); }

/* ── Embed ── */
.mp-body { line-height: 0; }
.mp-embed { width: 100%; height: 300px; border: none; display: block; }

/* ── Skip bar (YouTube playlists) ── */
.mp-skip-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 10px 14px;
  background: #1a1a1a;
  border-top: 1px solid #2a2a2a;
}
.mp-skip-btn {
  background: #2a2a2a;
  border: none;
  color: #fff;
  font-size: 1.1rem;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.1s;
}
.mp-skip-btn:hover { background: #1db954; transform: scale(1.1); }
.mp-skip-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #888;
  min-width: 70px;
  text-align: center;
}

/* ── YouTube Queue ── */
.mp-queue {
  border-top: 1px solid #2a2a2a;
}
.mp-queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  user-select: none;
  background: #121212;
  position: sticky;
  top: 0;
}
.mp-queue-header:hover { color: #aaa; }
.mp-queue-arrow { font-size: 0.6rem; }

.mp-queue-list {
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.mp-queue-list::-webkit-scrollbar { width: 4px; }
.mp-queue-list::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

.mp-queue-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.12s;
}
.mp-queue-row:hover { background: #1a1a1a; }
.mp-queue-row--active { background: #1a2e1a; }
.mp-queue-row--active .mp-queue-name { color: #1db954; }

.mp-queue-num {
  font-size: 0.72rem;
  color: #555;
  min-width: 18px;
  text-align: right;
  flex-shrink: 0;
}
.mp-queue-name {
  flex: 1;
  font-size: 0.82rem;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.mp-queue-playing {
  font-size: 0.6rem;
  color: #1db954;
  flex-shrink: 0;
}

/* ── Slide transition ── */
.mp-slide-enter-active, .mp-slide-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.mp-slide-enter-from, .mp-slide-leave-to { opacity: 0; transform: translateY(12px); }

/* ── Mobile ── */
@media (max-width: 600px) {
  .mp-root  { bottom: 14px; left: 14px; }
  .mp-panel { width: calc(100vw - 28px); max-width: 360px; }
}
</style>
