<template>
  <div class="media-embed" v-if="mediaUrl">

    <!-- ── YouTube ───────────────────────────────────────────────────────────
         Playlists:     IFrame API — shuffle + playlist-index memory
         Single videos: IFrame API — timestamp memory via playerVars.start
    ──────────────────────────────────────────────────────────────────────── -->
    <template v-if="embedType === 'youtube'">
      <div v-if="isPlaylist" :id="playerId" class="embed-iframe"></div>
      <div v-else class="embed-wrap">
        <div :id="singleId" class="embed-iframe"></div>
        <div v-if="guardActive" class="embed-guard" @click="onSingleYtClick" title="Click to play" />
      </div>
      <div v-if="isPlaylist" class="embed-controls">
        <button class="shuffle-btn" :class="{ 'shuffle-btn--on': ytShuffle }" @click="toggleYouTubeShuffle">
          🔀 {{ ytShuffle ? 'Shuffle: On' : 'Shuffle: Off' }}
        </button>
      </div>
    </template>

    <!-- ── Twitch ─────────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'twitch'" class="embed-wrap">
      <iframe :key="`twitch-${resetKey}`" :src="twitchEmbedUrl"
        frameborder="0" allowfullscreen class="embed-iframe" />
      <div v-if="guardActive" class="embed-guard" @click="activateEmbed" title="Click to play" />
    </div>

    <!-- ── SoundCloud ─────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'soundcloud'" class="embed-wrap">
      <iframe ref="scIframe" :key="`sc-${resetKey}`"
        :src="`https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaUrl)}&color=%2314532d&auto_play=false&show_artwork=true&visual=true`"
        frameborder="0" :class="['embed-iframe', isPlaylist ? 'embed-iframe--playlist' : 'embed-iframe--audio']" />
      <div v-if="guardActive" class="embed-guard" @click="activateEmbed" title="Click to play" />
    </div>

    <!-- ── Spotify ─────────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'spotify'" class="embed-wrap">
      <iframe :key="`sp-${resetKey}`" :src="spotifyEmbedUrl" frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        :class="['embed-iframe', isPlaylist ? 'embed-iframe--playlist' : 'embed-iframe--audio']" />
      <div v-if="guardActive" class="embed-guard" @click="activateEmbed" title="Click to play" />
    </div>

    <!-- ── Apple Music ────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'applemusic'" class="embed-wrap">
      <iframe :key="`am-${resetKey}`" :src="appleMusicEmbedUrl"
        frameborder="0" allow="autoplay *; encrypted-media *; fullscreen *"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        :class="['embed-iframe', isPlaylist ? 'embed-iframe--playlist' : 'embed-iframe--audio']" />
      <div v-if="guardActive" class="embed-guard" @click="activateEmbed" title="Click to play" />
    </div>

    <!-- ── Link card fallback ─────────────────────────────────────────────── -->
    <a v-else :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
      <span class="link-card__icon">{{ platformIcon }}</span>
      <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
    </a>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  mediaUrl:  { type: String, default: '' },
  embedType: { type: String, default: '' },
});

// ── Instance identity ──────────────────────────────────────────────────────────
const embedId  = 'embed-'    + Math.random().toString(36).slice(2, 9);
const playerId = 'ytpl-'     + embedId;   // YouTube playlist div id
const singleId = 'ytsingle-' + embedId;   // YouTube single-video div id

// ── Exclusive-play state ───────────────────────────────────────────────────────
const guardActive = ref(true);
const resetKey    = ref(0);    // incrementing force-remounts iframes without a JS API

// ── Player references ──────────────────────────────────────────────────────────
let ytPlayer       = null;   // YouTube IFrame API — playlist
let ytSinglePlayer = null;   // YouTube IFrame API — single video
const scIframe     = ref(null);
let scWidget       = null;   // SoundCloud Widget API instance

// ── Global registry — maps embedId → stopFn ───────────────────────────────────
const registry = () => {
  if (!window._embedRegistry) window._embedRegistry = new Map();
  return window._embedRegistry;
};

// ── Stop this embed (called by other embeds via registry) ─────────────────────
const stopThisEmbed = () => {
  guardActive.value = true;

  // YouTube playlist
  if (ytPlayer) ytPlayer.stopVideo?.();

  // YouTube single — save position then pause (don't reset key; player stays alive)
  if (ytSinglePlayer) {
    const t = Math.floor(ytSinglePlayer.getCurrentTime?.() || 0);
    if (t > 0 && youtubeVideoId.value) {
      localStorage.setItem(`yt_time_${youtubeVideoId.value}`, t);
    }
    ytSinglePlayer.pauseVideo?.();
  }

  // SoundCloud — save position then pause (don't reset key; widget stays alive)
  if (scWidget) {
    scWidget.getPosition?.((ms) => {
      if (ms > 0) localStorage.setItem(`sc_pos_${props.mediaUrl}`, ms);
    });
    scWidget.pause?.();
    return; // don't remount the SC iframe
  }

  // All other embeds (Spotify, Apple Music, Twitch) — remount iframe to cut audio
  if (props.embedType !== 'youtube') resetKey.value++;
};

// ── Activate this embed (stop all others, remove guard) ───────────────────────
const activateEmbed = () => {
  registry().forEach((stop, id) => { if (id !== embedId) stop(); });
  guardActive.value = false;
  registry().set(embedId, stopThisEmbed);

  // Turn Spotify shuffle off when a Spotify embed is activated
  if (props.embedType === 'spotify') {
    const token = localStorage.getItem('jwtToken');
    if (token) {
      fetch(import.meta.env.VITE_API_URL + '/api/spotify/shuffle-off', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }
};

// Called when the guard over a single YouTube video is clicked
const onSingleYtClick = () => {
  activateEmbed();
  ytSinglePlayer?.playVideo?.();
};

// ── YouTube shuffle ────────────────────────────────────────────────────────────
const ytShuffle = ref(false);

const toggleYouTubeShuffle = () => {
  ytShuffle.value = !ytShuffle.value;
  ytPlayer?.setShuffle?.(ytShuffle.value);
};

// ── Playlist / album detection ─────────────────────────────────────────────────
const isPlaylist = computed(() => {
  const url = props.mediaUrl;
  if (/[?&]list=/.test(url) && !/[?&]v=/.test(url) && !/youtu\.be\//.test(url)) return true;
  if (/open\.spotify\.com\/(playlist|album)\//.test(url)) return true;
  if (/music\.apple\.com.*\/(album|playlist)\//.test(url)) return true;
  if (/soundcloud\.com\/.+\/sets\//.test(url)) return true;
  return false;
});

// ── YouTube video ID (single videos only) ─────────────────────────────────────
const youtubeVideoId = computed(() => {
  const url = props.mediaUrl;
  const shortMatch  = url.match(/youtu\.be\/([^?&/]+)/);
  const longMatch   = url.match(/[?&]v=([^&]+)/);
  const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/);
  return shortMatch?.[1] || longMatch?.[1] || shortsMatch?.[1] || null;
});

// ── Computed embed URLs ────────────────────────────────────────────────────────

const youtubeEmbedUrl = computed(() => {
  const url      = props.mediaUrl;
  const listMatch = url.match(/[?&]list=([^&]+)/);
  const videoId  = youtubeVideoId.value;
  if (videoId && !listMatch) return `https://www.youtube.com/embed/${videoId}`;
  if (videoId && listMatch)  return `https://www.youtube.com/embed/${videoId}?list=${listMatch[1]}`;
  if (listMatch)             return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}`;
  return '';
});

const twitchEmbedUrl = computed(() => {
  const url = props.mediaUrl;
  const clipMatch    = url.match(/twitch\.tv\/\w+\/clip\/([^/?\s]+)/);
  const channelMatch = url.match(/twitch\.tv\/([^/?\s]+)/);
  if (clipMatch)    return `https://clips.twitch.tv/embed?clip=${clipMatch[1]}&parent=${window.location.hostname}`;
  if (channelMatch) return `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${window.location.hostname}`;
  return '';
});

const spotifyEmbedUrl = computed(() =>
  props.mediaUrl.replace('open.spotify.com/', 'open.spotify.com/embed/')
);

const appleMusicEmbedUrl = computed(() =>
  props.mediaUrl.replace('music.apple.com', 'embed.music.apple.com')
);

const platformIcon = computed(() => {
  const icons = { instagram: '📷', tiktok: '🎵', facebook: '📘', twitter: '🐦', other: '🔗' };
  return icons[props.embedType] || '🔗';
});

const platformLabel = computed(() => {
  const labels = { instagram: 'View on Instagram', tiktok: 'View on TikTok', facebook: 'View on Facebook', twitter: 'View on Twitter/X', other: 'Open Link' };
  return labels[props.embedType] || 'Open Link';
});

// ── YouTube IFrame Player API loader ──────────────────────────────────────────
const loadYouTubeAPI = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    if (!window._ytAPIQueue) {
      window._ytAPIQueue = [];
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        window._ytAPIQueue.forEach((cb) => cb(window.YT));
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  registry().set(embedId, stopThisEmbed);

  // ── YouTube playlist ──────────────────────────────────────────────────────
  if (props.embedType === 'youtube' && isPlaylist.value) {
    const listMatch = props.mediaUrl.match(/[?&]list=([^&]+)/);
    if (!listMatch) return;

    const listId     = listMatch[1];
    const posKey     = `yt_pos_${listId}`;
    const savedIndex = parseInt(localStorage.getItem(posKey) || '0', 10);

    const YT = await loadYouTubeAPI();
    ytPlayer = new YT.Player(playerId, {
      width: '100%',
      height: '460',
      playerVars: { listType: 'playlist', list: listId, index: savedIndex, autoplay: 0, shuffle: 0 },
      events: {
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            activateEmbed();
            const idx = event.target.getPlaylistIndex();
            if (idx >= 0) localStorage.setItem(posKey, idx);
          }
        },
      },
    });
    return;
  }

  // ── YouTube single video ──────────────────────────────────────────────────
  if (props.embedType === 'youtube' && !isPlaylist.value && youtubeVideoId.value) {
    const posKey    = `yt_time_${youtubeVideoId.value}`;
    const savedTime = parseInt(localStorage.getItem(posKey) || '0', 10);

    const YT = await loadYouTubeAPI();
    ytSinglePlayer = new YT.Player(singleId, {
      width:  '100%',
      height: '360',
      videoId: youtubeVideoId.value,
      playerVars: { autoplay: 0, start: savedTime },
      events: {
        onStateChange: (event) => {
          const state = event.data;
          if (state === window.YT.PlayerState.PLAYING) {
            activateEmbed();
          }
          if (state === window.YT.PlayerState.PAUSED) {
            const t = Math.floor(event.target.getCurrentTime());
            if (t > 0) localStorage.setItem(posKey, t);
          }
          if (state === window.YT.PlayerState.ENDED) {
            localStorage.removeItem(posKey);
          }
        },
      },
    });
    return;
  }

  // ── SoundCloud ────────────────────────────────────────────────────────────
  if (props.embedType === 'soundcloud' && scIframe.value) {
    const SC     = await loadSCAPI();
    const posKey = `sc_pos_${props.mediaUrl}`;

    scWidget = SC.Widget(scIframe.value);

    scWidget.bind(SC.Widget.Events.READY, () => {
      const savedMs = parseInt(localStorage.getItem(posKey) || '0', 10);
      if (savedMs > 0) scWidget.seekTo(savedMs);
    });

    scWidget.bind(SC.Widget.Events.PLAY, () => {
      activateEmbed();
    });

    scWidget.bind(SC.Widget.Events.PAUSE, () => {
      scWidget.getPosition((ms) => {
        if (ms > 0) localStorage.setItem(posKey, ms);
      });
    });

    scWidget.bind(SC.Widget.Events.FINISH, () => {
      localStorage.removeItem(posKey);
    });
  }
});

onUnmounted(() => {
  registry().delete(embedId);
  if (ytPlayer)       { ytPlayer.destroy();       ytPlayer       = null; }
  if (ytSinglePlayer) { ytSinglePlayer.destroy();  ytSinglePlayer = null; }
  scWidget = null;
});
</script>

<style scoped>
.media-embed {
  width: 100%;
  margin-top: 12px;
}

/* Wrapper needed so the guard can be positioned absolutely over the iframe */
.embed-wrap {
  position: relative;
  width: 100%;
}

/* Transparent overlay that intercepts the very first click on an inactive embed */
.embed-guard {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: pointer;
  background: transparent;
  border-radius: 10px;
}

/* Standard video iframe — 16:9 */
.embed-iframe {
  width: 100%;
  height: 360px;
  border-radius: 10px;
  display: block;
}

/* Single track compact player */
.embed-iframe--audio { height: 166px; }

/* Playlist / album — tall to show track list */
.embed-iframe--playlist { height: 460px; }

/* Shuffle controls bar */
.embed-controls { display: flex; gap: 8px; margin-top: 8px; }

.shuffle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 20px;
  border: 2px solid #000;
  background: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  color: #000;
  transition: background 0.15s, color 0.15s;
  user-select: none;
}
.shuffle-btn:hover { background: #f3f4f6; }
.shuffle-btn--on { background: #000; color: #fff; }
.shuffle-btn--on:hover { background: #374151; }

/* Link card fallback */
.link-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: #000;
  border: 3.5px solid #14532d;
  border-radius: 10px;
  text-decoration: none;
  color: pink;
  font-weight: 600;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.link-card:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.4); color: rgb(125,190,157); }
.link-card__icon { font-size: 1.8rem; flex-shrink: 0; }
.link-card__text { font-size: 0.95rem; word-break: break-all; }
.link-card__text small { font-weight: 400; opacity: 0.7; }
</style>
