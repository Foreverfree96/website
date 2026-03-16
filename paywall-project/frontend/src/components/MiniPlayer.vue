<template>
  <div class="mp-root" v-if="nowPlaying">

    <!-- ── Expanded panel ──────────────────────────────────────────────── -->
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

        <!-- Player content -->
        <div class="mp-body">
          <SpotifyPlayer
            v-if="nowPlaying.type === 'spotify'"
            :mediaUrl="nowPlaying.url"
            :isPlaylist="nowPlaying.isPlaylist"
          />
          <div
            v-else-if="nowPlaying.type === 'youtube'"
            :id="mpYtId"
            class="mp-yt"
          ></div>
          <iframe
            v-else-if="nowPlaying.type === 'soundcloud'"
            ref="mpScFrame"
            :src="mpScUrl"
            frameborder="0"
            class="mp-sc"
            allow="autoplay"
          />
          <!-- Twitch / Apple Music / fallback -->
          <iframe
            v-else
            :src="mpFallbackUrl"
            frameborder="0"
            class="mp-fallback"
            allow="autoplay; encrypted-media; fullscreen"
          />
        </div>

      </div>
    </transition>

    <!-- ── Bubble button ───────────────────────────────────────────────── -->
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';
import SpotifyPlayer from './SpotifyPlayer.vue';

const { nowPlaying, close } = useNowPlaying();

const expanded  = ref(false);
const mpYtId    = 'mp-yt-' + Math.random().toString(36).slice(2, 7);
const mpScFrame = ref(null);

let mpYtPlayer = null;
let mpScWidget = null;

// ── Global embed registry ─────────────────────────────────────────────────────
const reg = () => {
  if (!window._embedRegistry) window._embedRegistry = new Map();
  return window._embedRegistry;
};

const stopMiniPlayer = () => {
  if (mpYtPlayer) mpYtPlayer.pauseVideo?.();
  if (mpScWidget) mpScWidget.pause?.();
  close();
};

// ── YouTube IFrame API loader (shared global queue) ───────────────────────────
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

// ── SoundCloud Widget API loader ──────────────────────────────────────────────
const loadSCAPI = () => {
  if (window.SC?.Widget) return Promise.resolve(window.SC);
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://w.soundcloud.com/player/api.js';
    tag.onload = () => resolve(window.SC);
    document.head.appendChild(tag);
  });
};

// ── Init YouTube player in mini panel ────────────────────────────────────────
const initYtPlayer = async (np) => {
  if (mpYtPlayer) { mpYtPlayer.destroy(); mpYtPlayer = null; }
  const YT = await loadYouTubeAPI();

  const listMatch    = np.url.match(/[?&]list=([^&]+)/);
  const videoIdMatch = np.url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)/);
  const videoId      = videoIdMatch?.[1] || videoIdMatch?.[2] || null;
  const startSecs    = Math.max(0, Math.floor((np.position || 0) / 1000));

  const playerVars = { autoplay: 1, start: startSecs };
  if (np.isPlaylist && listMatch) {
    Object.assign(playerVars, {
      listType: 'playlist',
      list: listMatch[1],
      index: np.playlistIndex || 0,
    });
  }

  mpYtPlayer = new YT.Player(mpYtId, {
    width: '100%',
    height: '170',
    videoId: np.isPlaylist ? undefined : videoId,
    playerVars,
    events: {
      onStateChange: (e) => {
        if (e.data === window.YT.PlayerState.PLAYING) {
          reg().set('mp-player', stopMiniPlayer);
        }
      },
    },
  });
};

// ── Init SoundCloud widget in mini panel ─────────────────────────────────────
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

// ── Cleanup active players ────────────────────────────────────────────────────
const cleanupPlayers = () => {
  if (mpYtPlayer) { mpYtPlayer.destroy(); mpYtPlayer = null; }
  mpScWidget = null;
};

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

// ── Watch nowPlaying — init appropriate player ────────────────────────────────
watch(nowPlaying, async (np, old) => {
  // Type or URL changed — destroy the old player
  if (old && (old.type !== np?.type || old.url !== np?.url)) {
    cleanupPlayers();
  }

  if (!np) {
    expanded.value = false;
    return;
  }

  expanded.value = true;
  await nextTick();

  if (np.type === 'youtube') {
    await initYtPlayer(np);
  } else if (np.type === 'soundcloud') {
    await initScWidget(np);
  } else if (np.type !== 'spotify') {
    // Twitch / Apple / fallback iframe — just register in registry so exclusive-play works
    reg().set('mp-player', stopMiniPlayer);
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  reg().set('mp-player', stopMiniPlayer);

  // Handle case where nowPlaying was already set before this component mounted
  const np = nowPlaying.value;
  if (np) {
    expanded.value = true;
    await nextTick();
    if (np.type === 'youtube') await initYtPlayer(np);
    else if (np.type === 'soundcloud') await initScWidget(np);
  }
});

onUnmounted(() => {
  reg().delete('mp-player');
  cleanupPlayers();
});

// ── Close handler ─────────────────────────────────────────────────────────────
const handleClose = () => {
  cleanupPlayers();
  close();
};
</script>

<style scoped>
/* ── Root — fixed bottom-left, above page content ── */
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
  border-color: #1db954;
  box-shadow: 0 0 0 3px rgba(29, 185, 84, 0.25), 0 4px 20px rgba(0, 0, 0, 0.6);
}

/* Pulsing green ring */
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

/* ── Expanded panel ── */
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

.mp-header-btns {
  display: flex;
  gap: 6px;
}

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

/* ── Player body ── */
.mp-body {
  overflow-y: auto;
  max-height: 440px;
}

/* YouTube div — IFrame API injects its own iframe here */
.mp-yt {
  width: 100%;
  height: 170px;
  display: block;
  background: #000;
}

/* SoundCloud embed */
.mp-sc {
  width: 100%;
  height: 166px;
  border: none;
  display: block;
}

/* Twitch / Apple / fallback */
.mp-fallback {
  width: 100%;
  height: 300px;
  border: none;
  display: block;
}

/* ── Slide-up transition ── */
.mp-slide-enter-active,
.mp-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.mp-slide-enter-from,
.mp-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* ── Mobile: shift bubble so it doesn't overlap chat widget ── */
@media (max-width: 600px) {
  .mp-root {
    bottom: 14px;
    left: 14px;
  }
  .mp-panel {
    width: calc(100vw - 28px);
    max-width: 320px;
  }
}
</style>
