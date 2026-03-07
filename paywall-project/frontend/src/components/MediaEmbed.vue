<template>
  <div class="media-embed" v-if="mediaUrl">
    <!-- YouTube -->
    <iframe v-if="embedType === 'youtube'" :src="youtubeEmbedUrl" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen class="embed-iframe" />

    <!-- Twitch -->
    <iframe v-else-if="embedType === 'twitch'" :src="twitchEmbedUrl" frameborder="0"
      allowfullscreen class="embed-iframe" />

    <!-- SoundCloud -->
    <iframe v-else-if="embedType === 'soundcloud'"
      :src="`https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaUrl)}&color=%2314532d&auto_play=false&show_artwork=true&visual=true`"
      frameborder="0" class="embed-iframe embed-iframe--audio" />

    <!-- Spotify -->
    <iframe v-else-if="embedType === 'spotify'" :src="spotifyEmbedUrl"
      frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy" class="embed-iframe embed-iframe--audio" />

    <!-- Apple Music -->
    <iframe v-else-if="embedType === 'applemusic'" :src="appleMusicEmbedUrl"
      frameborder="0" allow="autoplay *; encrypted-media *; fullscreen *"
      sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
      class="embed-iframe embed-iframe--audio" />

    <!-- Link card fallback (Instagram, TikTok, Facebook, Twitter, other) -->
    <a v-else :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
      <span class="link-card__icon">{{ platformIcon }}</span>
      <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
    </a>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  mediaUrl: { type: String, default: '' },
  embedType: { type: String, default: '' },
});

const youtubeEmbedUrl = computed(() => {
  const url = props.mediaUrl;
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  const longMatch = url.match(/[?&]v=([^&]+)/);
  const id = shortMatch?.[1] || longMatch?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : '';
});

const twitchEmbedUrl = computed(() => {
  const url = props.mediaUrl;
  const clipMatch = url.match(/twitch\.tv\/\w+\/clip\/([^/?\s]+)/);
  const channelMatch = url.match(/twitch\.tv\/([^/?\s]+)/);
  if (clipMatch) return `https://clips.twitch.tv/embed?clip=${clipMatch[1]}&parent=${window.location.hostname}`;
  if (channelMatch) return `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${window.location.hostname}`;
  return '';
});

const spotifyEmbedUrl = computed(() => {
  // https://open.spotify.com/track/ID → https://open.spotify.com/embed/track/ID
  return props.mediaUrl.replace('open.spotify.com/', 'open.spotify.com/embed/');
});

const appleMusicEmbedUrl = computed(() => {
  // https://music.apple.com/... → https://embed.music.apple.com/...
  return props.mediaUrl.replace('music.apple.com', 'embed.music.apple.com');
});

const platformIcon = computed(() => {
  const icons = { instagram: '📷', tiktok: '🎵', facebook: '📘', twitter: '🐦', other: '🔗' };
  return icons[props.embedType] || '🔗';
});

const platformLabel = computed(() => {
  const labels = { instagram: 'View on Instagram', tiktok: 'View on TikTok', facebook: 'View on Facebook', twitter: 'View on Twitter/X', other: 'Open Link' };
  return labels[props.embedType] || 'Open Link';
});
</script>

<style scoped>
.media-embed {
  width: 100%;
  margin-top: 12px;
}

.embed-iframe {
  width: 100%;
  height: 360px;
  border-radius: 10px;
  display: block;
}

.embed-iframe--audio {
  height: 166px;
}

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

.link-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.4);
  color: rgb(125,190,157);
}

.link-card__icon { font-size: 1.8rem; flex-shrink: 0; }
.link-card__text { font-size: 0.95rem; word-break: break-all; }
.link-card__text small { font-weight: 400; opacity: 0.7; }
</style>
