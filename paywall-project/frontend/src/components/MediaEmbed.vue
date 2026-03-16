<template>
  <div class="media-embed" v-if="mediaUrl">

    <!-- ── YouTube ───────────────────────────────────────────────────────────
         Playlists:     IFrame API — shuffle + playlist-index memory
         Single videos: IFrame API — timestamp memory via playerVars.start
    ──────────────────────────────────────────────────────────────────────── -->
    <template v-if="embedType === 'youtube'">
      <!-- Playlist -->
      <div v-if="isPlaylist" class="embed-wrap embed-wrap--yt-pl">
        <div :id="playerId" class="embed-iframe"></div>
        <div v-if="isPoppedOut" class="embed-popped-overlay">
          <span>♫ Playing in mini player</span>
        </div>
        <div class="embed-controls">
          <button class="shuffle-btn" :class="{ 'shuffle-btn--on': ytShuffle }" @click="toggleYouTubeShuffle">
            🔀 {{ ytShuffle ? 'Shuffle: On' : 'Shuffle: Off' }}
          </button>
          <button v-if="!isPoppedOut" class="embed-popout-pill" @click.stop="popOutEmbed" title="Pop out to mini player">↗ Mini</button>
        </div>
      </div>
      <!-- Single video -->
      <div v-else class="embed-wrap">
        <div :id="singleId" class="embed-iframe"></div>
        <div v-if="guardActive && !isPoppedOut" class="embed-guard" @click="onSingleYtClick" title="Click to play" />
        <div v-if="isPoppedOut" class="embed-popped-overlay">
          <span>♫ Playing in mini player</span>
        </div>
        <button v-if="!guardActive && !isPoppedOut" class="embed-popout-btn" @click.stop="popOutEmbed" title="Pop out to mini player">↗</button>
      </div>
    </template>

    <!-- ── Twitch ─────────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'twitch'" class="embed-wrap">
      <iframe :key="`twitch-${resetKey}`" :src="twitchEmbedUrl"
        frameborder="0" allowfullscreen class="embed-iframe" />
      <div v-if="guardActive && !isPoppedOut" class="embed-guard" @click="activateEmbed" title="Click to play" />
      <div v-if="isPoppedOut" class="embed-popped-overlay"><span>♫ Playing in mini player</span></div>
      <button v-if="!guardActive && !isPoppedOut" class="embed-popout-btn" @click.stop="popOutEmbed" title="Pop out to mini player">↗</button>
    </div>

    <!-- ── SoundCloud ─────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'soundcloud'" class="embed-wrap">
      <iframe ref="scIframe" :key="`sc-${resetKey}`"
        :src="`https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaUrl)}&color=%2314532d&auto_play=false&show_artwork=true&visual=true`"
        frameborder="0" :class="['embed-iframe', isPlaylist ? 'embed-iframe--playlist' : 'embed-iframe--audio']" />
      <div v-if="guardActive && !isPoppedOut" class="embed-guard" @click="onSCClick" title="Click to play" />
      <div v-if="isPoppedOut" class="embed-popped-overlay"><span>♫ Playing in mini player</span></div>
      <button v-if="!guardActive && !isPoppedOut" class="embed-popout-btn" @click.stop="popOutEmbed" title="Pop out to mini player">↗</button>
    </div>

    <!-- ── Spotify ─────────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'spotify'" class="embed-spotify-wrap">
      <div v-if="isPoppedOut" class="embed-popped-static">
        <span>♫ Playing in mini player</span>
      </div>
      <!-- SpotifyPlayer handles Premium detection; unmounts when popped out so
           the mini player's SpotifyPlayer can own the SDK device exclusively -->
      <SpotifyPlayer v-else :mediaUrl="mediaUrl" :isPlaylist="isPlaylist" />
      <div class="embed-controls" v-if="!isPoppedOut">
        <button class="embed-popout-pill" @click.stop="popOutEmbed" title="Pop out to mini player">↗ Mini</button>
      </div>
    </div>

    <!-- ── Apple Music ────────────────────────────────────────────────────── -->
    <div v-else-if="embedType === 'applemusic'" class="embed-wrap">
      <iframe :key="`am-${resetKey}`" :src="appleMusicEmbedUrl"
        frameborder="0" allow="autoplay *; encrypted-media *; fullscreen *"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        :class="['embed-iframe', isPlaylist ? 'embed-iframe--playlist' : 'embed-iframe--audio']" />
      <div v-if="guardActive && !isPoppedOut" class="embed-guard" @click="activateEmbed" title="Click to play" />
      <div v-if="isPoppedOut" class="embed-popped-overlay"><span>♫ Playing in mini player</span></div>
      <button v-if="!guardActive && !isPoppedOut" class="embed-popout-btn" @click.stop="popOutEmbed" title="Pop out to mini player">↗</button>
    </div>

    <!-- ── Link card fallback ─────────────────────────────────────────────── -->
    <a v-else :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
      <span class="link-card__icon">{{ platformIcon }}</span>
      <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
    </a>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import SpotifyPlayer from './SpotifyPlayer.vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';

const { nowPlaying, popOut, lastPosition } = useNowPlaying();

// True when this embed's URL is currently playing in the mini player
const isPoppedOut = computed(() => nowPlaying.value?.url === props.mediaUrl);

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

};

// Called when the guard over a single YouTube video is clicked
const onSingleYtClick = () => {
  activateEmbed();
  ytSinglePlayer?.playVideo?.();
};

// Called when the guard over a SoundCloud embed is clicked
const onSCClick = () => {
  activateEmbed();
  scWidget?.play?.();
};

// ── Pop out to mini player ────────────────────────────────────────────────────
const popOutEmbed = () => {
  if (isPoppedOut.value) return;
  const base = { url: props.mediaUrl, type: props.embedType, isPlaylist: isPlaylist.value };

  if (props.embedType === 'youtube' && isPlaylist.value && ytPlayer) {
    const idx = ytPlayer.getPlaylistIndex?.() ?? 0;
    const pos = Math.floor((ytPlayer.getCurrentTime?.() || 0) * 1000);
    popOut({ ...base, position: pos, playlistIndex: idx });
    ytPlayer.pauseVideo?.();
    guardActive.value = true;

  } else if (props.embedType === 'youtube' && !isPlaylist.value && ytSinglePlayer) {
    const pos = Math.floor((ytSinglePlayer.getCurrentTime?.() || 0) * 1000);
    popOut({ ...base, position: pos });
    ytSinglePlayer.pauseVideo?.();
    guardActive.value = true;

  } else if (props.embedType === 'soundcloud' && scWidget) {
    scWidget.getPosition?.((ms) => {
      popOut({ ...base, position: ms || 0 });
    });
    scWidget.pause?.();
    guardActive.value = true;

  } else {
    // Spotify, Twitch, Apple Music — no precise position to capture
    popOut({ ...base, position: 0 });
    guardActive.value = true;
    if (props.embedType !== 'spotify') resetKey.value++;
  }
};

// ── Resume in-post player from mini player's last position ───────────────────
// Called when isPoppedOut transitions true → false (mini player closed).
const resumeFromMini = () => {
  const lp = lastPosition.value;
  if (!lp.url || lp.url !== props.mediaUrl) return;
  const posSecs = (lp.position || 0) / 1000;

  if (props.embedType === 'youtube' && isPlaylist.value && ytPlayer) {
    const curIdx = ytPlayer.getPlaylistIndex?.() ?? 0;
    if (lp.playlistIndex !== undefined && lp.playlistIndex !== curIdx) {
      // Jump to the track the mini player was on, then seek within it
      ytPlayer.playVideoAt(lp.playlistIndex);
      setTimeout(() => { ytPlayer.seekTo(posSecs, true); ytPlayer.pauseVideo?.(); }, 900);
    } else {
      ytPlayer.seekTo(posSecs, true);
      ytPlayer.pauseVideo?.();
    }
    guardActive.value = true;
  } else if (props.embedType === 'youtube' && !isPlaylist.value && ytSinglePlayer) {
    ytSinglePlayer.seekTo(posSecs, true);
    ytSinglePlayer.pauseVideo?.();
    guardActive.value = true;
  } else if (props.embedType === 'soundcloud' && scWidget) {
    scWidget.seekTo(lp.position || 0);
    // leave paused — guard is already re-enabled from popOutEmbed
  }
};

// Watch for mini player closing so in-post player can sync to final position
watch(isPoppedOut, (isPopped, wasPopped) => {
  if (wasPopped && !isPopped) resumeFromMini();
});

// ── YouTube shuffle ────────────────────────────────────────────────────────────
const ytShuffle = ref(false);

const toggleYouTubeShuffle = () => {
  ytShuffle.value = !ytShuffle.value;
  ytPlayer?.setShuffle?.(ytShuffle.value);
  // Persist shuffle preference for this playlist
  const listMatch = props.mediaUrl.match(/[?&]list=([^&]+)/);
  if (listMatch) localStorage.setItem(`yt_shuffle_${listMatch[1]}`, ytShuffle.value);
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

    const listId       = listMatch[1];
    const posKey       = `yt_pos_${listId}`;
    const shuffleKey   = `yt_shuffle_${listId}`;
    const savedIndex   = parseInt(localStorage.getItem(posKey) || '0', 10);
    const savedShuffle = localStorage.getItem(shuffleKey) === 'true';

    // Restore saved shuffle state into the reactive ref
    ytShuffle.value = savedShuffle;

    const YT = await loadYouTubeAPI();
    ytPlayer = new YT.Player(playerId, {
      width: '100%',
      height: '460',
      playerVars: { listType: 'playlist', list: listId, index: savedIndex, autoplay: 0, shuffle: 0 },
      events: {
        onReady: () => {
          // Apply saved shuffle after player is ready
          if (savedShuffle) ytPlayer.setShuffle(true);
        },
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

/* ── Pop-out & popped-out overlay ─────────────────────────────────────────── */

/* Wrapper for YouTube playlist (needs relative positioning for overlay) */
.embed-wrap--yt-pl {
  position: relative;
}

/* Floating ↗ button over active video embeds */
.embed-popout-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 0.15s, transform 0.15s;
}
.embed-popout-btn:hover {
  background: rgba(0, 0, 0, 0.92);
  transform: scale(1.05);
}

/* Pill-style button in controls bar (YouTube playlist, Spotify) */
.embed-popout-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
.embed-popout-pill:hover { background: #f3f4f6; }

/* Semi-transparent overlay shown when embed is playing in mini player */
.embed-popped-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: #1db954;
  font-weight: 700;
  font-size: 0.95rem;
  text-align: center;
  pointer-events: all;
}

/* Static (non-absolute) popped-out state for Spotify */
.embed-popped-static {
  background: #121212;
  border-radius: 10px;
  padding: 28px;
  text-align: center;
  color: #1db954;
  font-weight: 700;
  font-size: 0.95rem;
}

/* Wrapper for Spotify section (static layout) */
.embed-spotify-wrap {
  width: 100%;
}
</style>
