<template>
  <div class="mp-root" v-if="nowPlaying">

    <!-- ── Expanded panel (v-if so the YT div exists in DOM when visible) ── -->
    <transition name="mp-slide">
      <div v-if="expanded" class="mp-panel">

        <!-- Header -->
        <div class="mp-header">
          <span class="mp-label">♫ Now Playing</span>
          <div class="mp-header-btns">
            <button class="mp-hbtn" @click="collapse" title="Minimize">—</button>
            <button class="mp-hbtn mp-hbtn--close" @click="handleClose" title="Stop & close">✕</button>
          </div>
        </div>

        <!-- ── Preview (click to start) ── -->
        <div v-if="!playerReady" class="mp-preview">
          <div class="mp-preview-thumb-wrap">
            <img v-if="previewThumb" :src="previewThumb" class="mp-preview-thumb" />
            <div v-else class="mp-preview-icon">{{ previewIcon }}</div>
          </div>
          <div class="mp-preview-meta">
            <span class="mp-preview-type">{{ previewLabel }}</span>
          </div>
          <button class="mp-preview-play" @click="startPlay">▶ Play</button>
        </div>

        <!-- ── Player (after user clicks Play) ── -->
        <div v-if="playerReady" class="mp-body">
          <SpotifyPlayer
            v-if="nowPlaying.type === 'spotify'"
            :mediaUrl="nowPlaying.url"
            :isPlaylist="nowPlaying.isPlaylist"
            :autoPlay="true"
          />
          <!-- YouTube: IFrame API injects into this div once it exists in DOM -->
          <div v-else-if="nowPlaying.type === 'youtube'" :id="mpYtId" class="mp-yt"></div>
          <iframe
            v-else-if="nowPlaying.type === 'soundcloud'"
            ref="mpScFrame"
            :src="mpScUrl"
            frameborder="0"
            class="mp-sc"
            allow="autoplay"
          />
          <iframe
            v-else
            :src="mpFallbackUrl"
            frameborder="0"
            class="mp-fallback"
            allow="autoplay; encrypted-media; fullscreen"
          />
        </div>

        <!-- YouTube playlist shuffle bar -->
        <div v-if="playerReady && nowPlaying.type === 'youtube' && nowPlaying.isPlaylist" class="mp-yt-bar">
          <button
            class="mp-shuffle-btn"
            :class="{ 'mp-shuffle-btn--on': mpYtShuffle }"
            @click="toggleMpShuffle"
          >
            🔀 {{ mpYtShuffle ? 'Shuffle: On' : 'Shuffle: Off' }}
          </button>
        </div>

      </div>
    </transition>

    <!-- ── Bubble ── -->
    <button
      class="mp-bubble"
      :class="{ 'mp-bubble--on': expanded }"
      @click="toggleExpanded"
      :title="expanded ? 'Minimize player' : 'Open player'"
    >
      <span class="mp-ring"></span>
      ♫
    </button>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';
import SpotifyPlayer from './SpotifyPlayer.vue';

const { nowPlaying, close } = useNowPlaying();

const expanded     = ref(false);
const playerReady  = ref(false);
const mpYtShuffle  = ref(false);
const mpYtId       = 'mp-yt-' + Math.random().toString(36).slice(2, 7);
const mpScFrame    = ref(null);

let mpYtPlayer = null;
let mpScWidget = null;

// ── Global embed registry ─────────────────────────────────────────────────────
const reg = () => {
  if (!window._embedRegistry) window._embedRegistry = new Map();
  return window._embedRegistry;
};

const stopMiniPlayer = () => {
  // Save current YT position before stopping so expand resumes from same point
  if (mpYtPlayer) {
    const pos = Math.floor((mpYtPlayer.getCurrentTime?.() || 0) * 1000);
    const idx = mpYtPlayer.getPlaylistIndex?.() ?? 0;
    if (nowPlaying.value) nowPlaying.value = { ...nowPlaying.value, position: pos, playlistIndex: idx };
    mpYtPlayer.pauseVideo?.();
  }
  if (mpScWidget) mpScWidget.pause?.();
  close();
};

// ── YouTube API loader ────────────────────────────────────────────────────────
const loadYouTubeAPI = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    if (!window._ytAPIQueue) {
      window._ytAPIQueue = [];
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        window._ytAPIQueue.forEach(cb => cb(window.YT));
        window._ytAPIQueue = null;
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    if (window._ytAPIQueue) window._ytAPIQueue.push(resolve);
    else resolve(window.YT);
  });
};

// ── SoundCloud API loader ─────────────────────────────────────────────────────
const loadSCAPI = () => {
  if (window.SC?.Widget) return Promise.resolve(window.SC);
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://w.soundcloud.com/player/api.js';
    tag.onload = () => resolve(window.SC);
    document.head.appendChild(tag);
  });
};

// ── Init YouTube player (called AFTER the div exists in DOM) ──────────────────
const initYtPlayer = async (np) => {
  if (mpYtPlayer) { mpYtPlayer.destroy(); mpYtPlayer = null; }
  const YT = await loadYouTubeAPI();

  const listMatch    = np.url.match(/[?&]list=([^&]+)/);
  const videoIdMatch = np.url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)/);
  const videoId      = videoIdMatch?.[1] || videoIdMatch?.[2] || null;
  const startSecs    = Math.max(0, Math.floor((np.position || 0) / 1000));

  // Treat as playlist if it has a list param, even if isPlaylist flag isn't set
  const isList = !!(np.isPlaylist && listMatch) || (!videoId && !!listMatch);

  const playerVars = { autoplay: 1, start: startSecs };
  if (isList && listMatch) {
    Object.assign(playerVars, {
      listType: 'playlist',
      list:     listMatch[1],
      index:    np.playlistIndex || 0,
    });
  }

  // Don't attempt player creation if we have neither a videoId nor a playlist
  if (!isList && !videoId) return;

  mpYtPlayer = new YT.Player(mpYtId, {
    width: '100%',
    height: '180',
    videoId: isList ? undefined : videoId,
    playerVars,
    events: {
      onReady: () => {
        if (mpYtShuffle.value) mpYtPlayer.setShuffle(true);
      },
      onStateChange: (e) => {
        if (e.data === window.YT.PlayerState.PLAYING) {
          reg().set('mp-player', stopMiniPlayer);
        }
      },
    },
  });
};

// ── Init SoundCloud widget (called AFTER the iframe exists in DOM) ────────────
const initScWidget = async (np) => {
  if (!mpScFrame.value) return;
  const SC = await loadSCAPI();
  mpScWidget = SC.Widget(mpScFrame.value);
  mpScWidget.bind(SC.Widget.Events.READY, () => {
    if (np.position > 0) mpScWidget.seekTo(np.position);
    mpScWidget.play();
    reg().set('mp-player', stopMiniPlayer);
  });
  mpScWidget.bind(SC.Widget.Events.PLAY, () => {
    reg().set('mp-player', stopMiniPlayer);
  });
};

// ── Cleanup ───────────────────────────────────────────────────────────────────
const cleanupPlayers = () => {
  if (mpYtPlayer) { mpYtPlayer.destroy(); mpYtPlayer = null; }
  mpScWidget = null;
};

// ── Collapse: save position, destroy player, hide panel ──────────────────────
const collapse = () => {
  if (mpYtPlayer) {
    const pos = Math.floor((mpYtPlayer.getCurrentTime?.() || 0) * 1000);
    const idx = mpYtPlayer.getPlaylistIndex?.() ?? 0;
    if (nowPlaying.value) nowPlaying.value = { ...nowPlaying.value, position: pos, playlistIndex: idx };
    mpYtPlayer.destroy();
    mpYtPlayer = null;
  }
  if (mpScWidget) {
    mpScWidget.getPosition?.((ms) => {
      if (nowPlaying.value && ms > 0) nowPlaying.value = { ...nowPlaying.value, position: ms };
    });
    mpScWidget.pause?.();
    mpScWidget = null;
  }
  expanded.value = false;
  playerReady.value = false;
};

// ── Expand: show panel with preview, don't init player yet ───────────────────
const expand = () => {
  expanded.value = true;
};

// ── Start play: init the actual player after user clicks ▶ ───────────────────
const startPlay = async () => {
  playerReady.value = true;
  await nextTick(); // wait for v-if to render the div/iframe into DOM
  const np = nowPlaying.value;
  if (!np) return;
  if (np.type === 'youtube')         await initYtPlayer(np);
  else if (np.type === 'soundcloud') await initScWidget(np);
  else if (np.type !== 'spotify')    reg().set('mp-player', stopMiniPlayer);
};

// Bubble click
const toggleExpanded = () => {
  if (expanded.value) collapse();
  else expand();
};

// ── YouTube shuffle toggle ────────────────────────────────────────────────────
const toggleMpShuffle = () => {
  mpYtShuffle.value = !mpYtShuffle.value;
  mpYtPlayer?.setShuffle?.(mpYtShuffle.value);
};

// ── Watch nowPlaying: cleanup when URL/type changes, reset shuffle ────────────
watch(nowPlaying, (np, old) => {
  if (old && (old.type !== np?.type || old.url !== np?.url)) {
    cleanupPlayers();
    mpYtShuffle.value = false;
    playerReady.value = false;
  }
  if (!np) {
    expanded.value = false;
    playerReady.value = false;
  }
});

// ── Preview computed ──────────────────────────────────────────────────────────
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
  const t = nowPlaying.value?.type;
  if (t === 'spotify')    return '🎵';
  if (t === 'youtube')    return '▶';
  if (t === 'soundcloud') return '☁';
  if (t === 'twitch')     return '📺';
  return '♫';
});

const previewLabel = computed(() => {
  const np = nowPlaying.value;
  if (!np) return '';
  const labels = { spotify: 'Spotify', youtube: 'YouTube', soundcloud: 'SoundCloud', twitch: 'Twitch', applemusic: 'Apple Music' };
  const platform = labels[np.type] || np.type;
  return np.isPlaylist ? `${platform} Playlist` : platform;
});

// ── Computed embed URLs ───────────────────────────────────────────────────────
const mpScUrl = computed(() => {
  const np = nowPlaying.value;
  if (!np || np.type !== 'soundcloud') return '';
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(np.url)}&color=%2314532d&auto_play=false&show_artwork=true&visual=true`;
});

const mpFallbackUrl = computed(() => {
  const np = nowPlaying.value;
  if (!np) return '';
  const { url, type } = np;
  if (type === 'twitch') {
    const clip = url.match(/twitch\.tv\/\w+\/clip\/([^/?]+)/);
    const ch   = url.match(/twitch\.tv\/([^/?]+)/);
    if (clip) return `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${location.hostname}`;
    if (ch)   return `https://player.twitch.tv/?channel=${ch[1]}&parent=${location.hostname}`;
  }
  if (type === 'applemusic') return url.replace('music.apple.com', 'embed.music.apple.com');
  return url;
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  reg().set('mp-player', stopMiniPlayer);
});

onUnmounted(() => {
  reg().delete('mp-player');
  cleanupPlayers();
});

// ── Close ─────────────────────────────────────────────────────────────────────
const handleClose = () => {
  cleanupPlayers();
  close();
};
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
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  transition: transform 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
}
.mp-bubble:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.7);
}
.mp-bubble--on {
  box-shadow: 0 0 0 3px rgba(29, 185, 84, 0.3), 0 4px 20px rgba(0, 0, 0, 0.6);
}

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
  width: 320px;
  background: #121212;
  border-radius: 16px;
  border: 1px solid #2a2a2a;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7);
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
.mp-label {
  color: #fff;
  font-weight: 700;
  font-size: 0.82rem;
  letter-spacing: 0.03em;
}
.mp-header-btns { display: flex; gap: 6px; }
.mp-hbtn {
  background: #2a2a2a;
  border: none;
  color: #bbb;
  border-radius: 6px;
  padding: 3px 9px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.4;
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
.mp-preview-thumb {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
.mp-preview-icon {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  background: #1a1a1a;
  border-radius: 8px;
}
.mp-preview-meta { text-align: center; }
.mp-preview-type { font-size: 0.8rem; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.mp-preview-play {
  width: 100%;
  padding: 11px;
  background: #1db954;
  border: none;
  border-radius: 24px;
  color: #000;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.mp-preview-play:hover { background: #1ed760; transform: scale(1.02); }

/* ── Body ── */
.mp-body { overflow-y: auto; max-height: 440px; }

.mp-yt     { width: 100%; height: 180px; display: block; background: #000; }
.mp-sc     { width: 100%; height: 166px; border: none; display: block; }
.mp-fallback { width: 100%; height: 300px; border: none; display: block; }

/* ── YouTube controls bar ── */
.mp-yt-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #1a1a1a;
  border-top: 1px solid #2a2a2a;
}

.mp-shuffle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 20px;
  border: 2px solid #444;
  background: transparent;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  color: #aaa;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  user-select: none;
}
.mp-shuffle-btn:hover { border-color: #666; color: #fff; }
.mp-shuffle-btn--on   { background: #1db954; border-color: #1db954; color: #000; }
.mp-shuffle-btn--on:hover { background: #1ed760; border-color: #1ed760; }

/* ── Slide transition ── */
.mp-slide-enter-active, .mp-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.mp-slide-enter-from, .mp-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* ── Mobile ── */
@media (max-width: 600px) {
  .mp-root { bottom: 14px; left: 14px; }
  .mp-panel { width: calc(100vw - 28px); max-width: 320px; }
}
</style>
