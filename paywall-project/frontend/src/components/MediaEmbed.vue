<template>
  <div class="media-embed" v-if="mediaUrl">

    <!-- Popped out overlay -->
    <div v-if="isPoppedOut" class="embed-popped-static">
      <span>♫ Playing in mini player</span>
      <button class="embed-popin-btn" @click="popIn()" title="Return to post">↙ Pop back in</button>
    </div>

    <template v-else>
      <!-- Actual embed -->
      <div class="embed-wrap">
        <iframe
          v-if="embedUrl"
          ref="iframeEl"
          :key="embedKey"
          :src="active ? embedUrl : ''"
          frameborder="0"
          class="embed-iframe"
          :class="iframeClass"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowfullscreen
          @load="onIframeLoad"
        />

        <a v-else :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
          <span class="link-card__icon">{{ platformIcon }}</span>
          <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
        </a>

        <!-- Click-to-play guard -->
        <div v-if="embedUrl && !active" class="embed-guard" @click="activate">
          <div class="embed-guard-inner">
            <img v-if="ytThumb" :src="ytThumb" class="embed-guard-thumb" />
            <div class="embed-guard-play">▶</div>
          </div>
        </div>
      </div>

      <!-- Pop-out button OUTSIDE the video, always visible -->
      <div v-if="active && embedUrl" class="embed-controls-bar">
        <button class="embed-popout-pill" @click.stop="popOutEmbed" title="Pop out to mini player">
          ↗ Play in Mini Player
        </button>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';

const props = defineProps({
  mediaUrl:  { type: String, default: '' },
  embedType: { type: String, default: '' },
});

const { nowPlaying, popOut, lastPosition, popIn } = useNowPlaying();

const active          = ref(false);
const embedKey        = ref(0);
const iframeEl        = ref(null);
const ytTime          = ref(0);   // tracked via postMessage
const ytIndex         = ref(0);   // playlist index tracked via postMessage
const startFrom       = ref(0);   // seconds — used in YT embed URL to restore position
const startIndex      = ref(0);   // playlist index to restore after pop-back-in

const isPoppedOut = computed(() => nowPlaying.value?.url === props.mediaUrl);

const isPlaylist = computed(() => {
  const url = props.mediaUrl;
  if (/[?&]list=/.test(url) && !/[?&]v=/.test(url) && !/youtu\.be\//.test(url)) return true;
  if (/open\.spotify\.com\/(playlist|album)\//.test(url)) return true;
  if (/music\.apple\.com.*\/(album|playlist)\//.test(url)) return true;
  if (/soundcloud\.com\/.+\/sets\//.test(url)) return true;
  return false;
});

// ── Embed URL ────────────────────────────────────────────────────────────────
const embedUrl = computed(() => {
  const { mediaUrl: url, embedType: type } = props;
  if (!url) return '';

  if (type === 'youtube') {
    const listMatch    = url.match(/[?&]list=([^&]+)/);
    const videoIdMatch = url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)|youtube\.com\/shorts\/([^?&/]+)/);
    const videoId      = videoIdMatch?.[1] || videoIdMatch?.[2] || videoIdMatch?.[3] || null;
    const start        = startFrom.value > 0 ? `&start=${startFrom.value}` : '';
    if (listMatch && (isPlaylist.value || !videoId)) {
      const idx   = startIndex.value > 0 ? `&index=${startIndex.value}` : '';
      const start = startFrom.value  > 0 ? `&start=${startFrom.value}`  : '';
      return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&enablejsapi=1${idx}${start}`;
    }
    if (videoId && listMatch)
      return `https://www.youtube.com/embed/${videoId}?list=${listMatch[1]}&enablejsapi=1${start}`;
    if (videoId)
      return `https://www.youtube.com/embed/${videoId}?enablejsapi=1${start}`;
    return '';
  }

  if (type === 'spotify') {
    const m = url.match(/open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/);
    if (!m) return '';
    return `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator`;
  }

  if (type === 'soundcloud') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%2314532d&auto_play=false&show_artwork=true&visual=true`;
  }

  if (type === 'twitch') {
    const clip = url.match(/twitch\.tv\/\w+\/clip\/([^/?]+)/);
    const ch   = url.match(/twitch\.tv\/([^/?]+)/);
    if (clip) return `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${location.hostname}`;
    if (ch)   return `https://player.twitch.tv/?channel=${ch[1]}&parent=${location.hostname}`;
    return '';
  }

  if (type === 'applemusic') return props.mediaUrl.replace('music.apple.com', 'embed.music.apple.com');

  return '';
});

// ── YouTube postMessage position tracking ────────────────────────────────────
const onIframeLoad = () => {
  if (props.embedType === 'youtube') {
    iframeEl.value?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
  }
};

const onMessage = (e) => {
  if (!iframeEl.value || e.source !== iframeEl.value.contentWindow) return;
  try {
    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d.event === 'infoDelivery' && d.info) {
      if (d.info.currentTime   != null) ytTime.value  = d.info.currentTime;
      if (d.info.playlistIndex != null) ytIndex.value = d.info.playlistIndex;
    }
  } catch { /* ignore parse errors */ }
};

onMounted(() => window.addEventListener('message', onMessage));
onUnmounted(() => window.removeEventListener('message', onMessage));

// When mini player closes/pops back in, restore position in post embed
watch(isPoppedOut, (isPopped, wasPopped) => {
  if (!wasPopped || isPopped) return;

  if (props.embedType === 'youtube') {
    const secs = Math.floor((lastPosition.value.position || 0) / 1000);
    startFrom.value  = secs > 0 ? secs : 0;
    startIndex.value = lastPosition.value.playlistIndex || 0;
    embedKey.value++;
    active.value = true;
  } else {
    embedKey.value++;
    active.value = true;
  }
});

// ── YouTube thumbnail ─────────────────────────────────────────────────────────
const ytThumb = computed(() => {
  if (props.embedType !== 'youtube') return null;
  const m = props.mediaUrl.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)/);
  const id = m?.[1] || m?.[2];
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
});

// ── Iframe height class ───────────────────────────────────────────────────────
const iframeClass = computed(() => {
  const { embedType: type } = props;
  if (type === 'spotify')    return isPlaylist.value ? 'embed-iframe--playlist' : 'embed-iframe--audio';
  if (type === 'soundcloud') return isPlaylist.value ? 'embed-iframe--playlist' : 'embed-iframe--audio';
  return '';
});

// ── Activate ──────────────────────────────────────────────────────────────────
const activate = () => { active.value = true; };

// ── Pop out ───────────────────────────────────────────────────────────────────
const popOutEmbed = () => {
  if (isPoppedOut.value) return;
  const posMs  = props.embedType === 'youtube' ? Math.floor(ytTime.value * 1000) : 0;
  const idxVal = props.embedType === 'youtube' ? ytIndex.value : 0;
  popOut({ url: props.mediaUrl, type: props.embedType, isPlaylist: isPlaylist.value, position: posMs, playlistIndex: idxVal });
  active.value = false;
  embedKey.value++;
};

// ── Link card ─────────────────────────────────────────────────────────────────
const platformIcon  = computed(() => ({ instagram: '📷', tiktok: '🎵', facebook: '📘', twitter: '🐦' })[props.embedType] || '🔗');
const platformLabel = computed(() => ({ instagram: 'View on Instagram', tiktok: 'View on TikTok', facebook: 'View on Facebook', twitter: 'View on Twitter/X' })[props.embedType] || 'Open Link');
</script>

<style scoped>
.media-embed { width: 100%; margin-top: 12px; }

.embed-wrap { position: relative; width: 100%; }

.embed-iframe {
  width: 100%;
  height: 460px;
  border-radius: 10px;
  display: block;
  border: none;
}
.embed-iframe--audio    { height: 200px; }
.embed-iframe--playlist { height: 560px; }

/* Click-to-play guard */
.embed-guard {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
}
.embed-guard-inner {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.embed-guard-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.7;
}
.embed-guard-play {
  position: relative;
  z-index: 1;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  color: #fff;
  transition: transform 0.15s, background 0.15s;
}
.embed-guard:hover .embed-guard-play { background: #1db954; transform: scale(1.1); }

/* Controls bar — OUTSIDE the video, always visible */
.embed-controls-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.embed-popout-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-radius: 24px;
  border: none;
  background: #1db954;
  color: #000;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  letter-spacing: 0.01em;
  box-shadow: 0 2px 10px rgba(29,185,84,0.45);
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
}
.embed-popout-pill:hover { background: #1ed760; transform: scale(1.04); box-shadow: 0 4px 16px rgba(29,185,84,0.55); }

/* Popped-out state */
.embed-popped-static {
  background: #121212;
  border-radius: 10px;
  padding: 20px 28px;
  text-align: center;
  color: #1db954;
  font-weight: 700;
  font-size: 0.95rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.embed-popin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 24px;
  border: 1.5px solid #1db954;
  background: transparent;
  color: #1db954;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.embed-popin-btn:hover { background: #1db954; color: #000; transform: scale(1.04); }

/* Link card */
.link-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: #000;
  border: 3.5px solid #14532d; border-radius: 10px;
  text-decoration: none; color: pink; font-weight: 600;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.link-card:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.4); color: rgb(125,190,157); }
.link-card__icon { font-size: 1.8rem; flex-shrink: 0; }
.link-card__text { font-size: 0.95rem; word-break: break-all; }
.link-card__text small { font-weight: 400; opacity: 0.7; }
</style>
