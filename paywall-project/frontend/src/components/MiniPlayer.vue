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

        <!-- Preview -->
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

        <!-- Embed player -->
        <div v-if="playerReady" class="mp-body" :class="{ 'mp-body--spotify': nowPlaying.type === 'spotify' }">
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

        <!-- YouTube playlist skip controls -->
        <div v-if="playerReady && isYtPlaylist" class="mp-skip-bar">
          <button class="mp-skip-btn" @click="skipSong(-1)" title="Previous song">⏮</button>
          <span class="mp-skip-label">Track {{ (nowPlaying.playlistIndex || 0) + 1 }}</span>
          <button class="mp-skip-btn" @click="skipSong(1)" title="Next song">⏭</button>
        </div>

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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';

const { nowPlaying, close } = useNowPlaying();

const expanded    = ref(false);
const playerReady = ref(false);
const iframeEl    = ref(null);
const ytTime      = ref(0);
const iframeKey   = ref(0);

const isYtPlaylist = computed(() =>
  nowPlaying.value?.type === 'youtube' && nowPlaying.value?.isPlaylist
);

const skipSong = (dir) => {
  if (!nowPlaying.value) return;
  const idx = Math.max(0, (nowPlaying.value.playlistIndex || 0) + dir);
  nowPlaying.value = { ...nowPlaying.value, playlistIndex: idx, position: 0 };
  ytTime.value = 0;
  iframeKey.value++;
};

// Reset when media changes or clears
watch(nowPlaying, (np, old) => {
  if (!np) {
    expanded.value    = false;
    playerReady.value = false;
  } else if (old && (old.url !== np.url || old.type !== np.type)) {
    playerReady.value = false;
  }
});

// ── YouTube postMessage position tracking ─────────────────────────────────────
const onIframeLoad = () => {
  if (nowPlaying.value?.type === 'youtube') {
    iframeEl.value?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
  }
};

const onMessage = (e) => {
  if (!iframeEl.value || e.source !== iframeEl.value.contentWindow) return;
  try {
    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d.event === 'infoDelivery' && d.info?.currentTime != null) {
      ytTime.value = d.info.currentTime;
    }
  } catch { /* ignore */ }
};

onMounted(() => window.addEventListener('message', onMessage));
onUnmounted(() => window.removeEventListener('message', onMessage));

const handleClose = () => {
  // Save YouTube position to lastPosition before closing
  if (nowPlaying.value?.type === 'youtube' && ytTime.value > 0) {
    nowPlaying.value = { ...nowPlaying.value, position: Math.floor(ytTime.value * 1000) };
  }
  playerReady.value = false;
  expanded.value    = false;
  close();
};

// ── Build embed URL for each platform ────────────────────────────────────────
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
      return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&autoplay=1&index=${playlistIndex}&enablejsapi=1`;
    }
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startSecs}&enablejsapi=1`;
    }
    return '';
  }

  if (type === 'spotify') {
    const m = url.match(/open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/);
    if (!m) return '';
    return `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&autoplay=1`;
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
  const icons = { spotify: '🎵', youtube: '▶', soundcloud: '☁', twitch: '📺', applemusic: '🎵' };
  return icons[nowPlaying.value?.type] || '♫';
});

const previewLabel = computed(() => {
  const np = nowPlaying.value;
  if (!np) return '';
  const labels = { spotify: 'Spotify', youtube: 'YouTube', soundcloud: 'SoundCloud', twitch: 'Twitch', applemusic: 'Apple Music' };
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
.mp-body--spotify .mp-embed { height: 420px; }

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
  min-width: 60px;
  text-align: center;
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
