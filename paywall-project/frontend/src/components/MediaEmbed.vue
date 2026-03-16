<template>
  <div class="media-embed" v-if="mediaUrl">

    <!-- Popped out overlay -->
    <div v-if="isPoppedOut" class="embed-popped-static">
      <span>♫ Playing in mini player</span>
    </div>

    <!-- Actual embed -->
    <div v-else class="embed-wrap">

      <!-- Iframe (all platforms) -->
      <iframe
        v-if="embedUrl"
        :key="embedKey"
        :src="active ? embedUrl : ''"
        frameborder="0"
        class="embed-iframe"
        :class="iframeClass"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen
      />

      <!-- Link card fallback -->
      <a v-else :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
        <span class="link-card__icon">{{ platformIcon }}</span>
        <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
      </a>

      <!-- Click-to-activate guard (prevents autoplay until user clicks) -->
      <div v-if="embedUrl && !active" class="embed-guard" @click="activate">
        <div class="embed-guard-inner">
          <img v-if="ytThumb" :src="ytThumb" class="embed-guard-thumb" />
          <div class="embed-guard-play">▶</div>
        </div>
      </div>

      <!-- Pop-out button -->
      <button v-if="active && embedUrl" class="embed-popout-btn" @click.stop="popOutEmbed" title="Pop out to mini player">↗ Mini</button>

    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useNowPlaying } from '../composables/useNowPlaying.js';

const props = defineProps({
  mediaUrl:  { type: String, default: '' },
  embedType: { type: String, default: '' },
});

const { nowPlaying, popOut } = useNowPlaying();

const active   = ref(false);
const embedKey = ref(0);

const isPoppedOut = computed(() => nowPlaying.value?.url === props.mediaUrl);

const isPlaylist = computed(() => {
  const url = props.mediaUrl;
  if (/[?&]list=/.test(url) && !/[?&]v=/.test(url) && !/youtu\.be\//.test(url)) return true;
  if (/open\.spotify\.com\/(playlist|album)\//.test(url)) return true;
  if (/music\.apple\.com.*\/(album|playlist)\//.test(url)) return true;
  if (/soundcloud\.com\/.+\/sets\//.test(url)) return true;
  return false;
});

// ── Embed URL per platform ────────────────────────────────────────────────────
const embedUrl = computed(() => {
  const { mediaUrl: url, embedType: type } = props;
  if (!url) return '';

  if (type === 'youtube') {
    const listMatch    = url.match(/[?&]list=([^&]+)/);
    const videoIdMatch = url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)|youtube\.com\/shorts\/([^?&/]+)/);
    const videoId      = videoIdMatch?.[1] || videoIdMatch?.[2] || videoIdMatch?.[3] || null;
    if (listMatch && (isPlaylist.value || !videoId))
      return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&autoplay=1`;
    if (videoId && listMatch)
      return `https://www.youtube.com/embed/${videoId}?list=${listMatch[1]}&autoplay=1`;
    if (videoId)
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
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

  if (type === 'applemusic') {
    return url.replace('music.apple.com', 'embed.music.apple.com');
  }

  return '';
});

// ── YouTube thumbnail for the guard ──────────────────────────────────────────
const ytThumb = computed(() => {
  if (props.embedType !== 'youtube') return null;
  const m = props.mediaUrl.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)/);
  const id = m?.[1] || m?.[2];
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
});

// ── Iframe height class ───────────────────────────────────────────────────────
const iframeClass = computed(() => {
  const { embedType: type } = props;
  if (type === 'spotify') return isPlaylist.value ? 'embed-iframe--playlist' : 'embed-iframe--audio';
  if (type === 'soundcloud') return isPlaylist.value ? 'embed-iframe--playlist' : 'embed-iframe--audio';
  return ''; // default height (360px video)
});

// ── Activate (user clicks guard) ──────────────────────────────────────────────
const activate = () => { active.value = true; };

// ── Pop out to mini player ────────────────────────────────────────────────────
const popOutEmbed = () => {
  if (isPoppedOut.value) return;
  popOut({ url: props.mediaUrl, type: props.embedType, isPlaylist: isPlaylist.value, position: 0 });
  // Stop the iframe by remounting with empty src
  active.value = false;
  embedKey.value++;
};

// ── Platform fallback ─────────────────────────────────────────────────────────
const platformIcon = computed(() => {
  const icons = { instagram: '📷', tiktok: '🎵', facebook: '📘', twitter: '🐦' };
  return icons[props.embedType] || '🔗';
});
const platformLabel = computed(() => {
  const labels = { instagram: 'View on Instagram', tiktok: 'View on TikTok', facebook: 'View on Facebook', twitter: 'View on Twitter/X' };
  return labels[props.embedType] || 'Open Link';
});
</script>

<style scoped>
.media-embed { width: 100%; margin-top: 12px; }

.embed-wrap { position: relative; width: 100%; }

/* Default video height */
.embed-iframe {
  width: 100%;
  height: 360px;
  border-radius: 10px;
  display: block;
  border: none;
}
.embed-iframe--audio    { height: 166px; }
.embed-iframe--playlist { height: 460px; }

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

/* Pop-out button */
.embed-popout-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  background: rgba(0,0,0,0.72);
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
.embed-popout-btn:hover { background: rgba(0,0,0,0.92); transform: scale(1.05); }

/* Popped-out state */
.embed-popped-static {
  background: #121212;
  border-radius: 10px;
  padding: 28px;
  text-align: center;
  color: #1db954;
  font-weight: 700;
  font-size: 0.95rem;
}

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
