<template>
  <!--
    Only renders anything if a mediaUrl was actually provided.
    This lets the parent always include <MediaEmbed> in its template
    without worrying about empty containers.
  -->
  <div class="media-embed" v-if="mediaUrl">
    <!-- ── YouTube ────────────────────────────────────────────────────────── -->
    <!--
      youtubeEmbedUrl converts the user-facing watch URL (or short URL or
      Shorts URL) into the /embed/ form that iframes require.
    -->
    <iframe v-if="embedType === 'youtube'" :src="youtubeEmbedUrl" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen class="embed-iframe" />

    <!-- ── Twitch ─────────────────────────────────────────────────────────── -->
    <!--
      twitchEmbedUrl handles both live channel links and clip links.
      The `parent` param must match the domain the embed is hosted on.
    -->
    <iframe v-else-if="embedType === 'twitch'" :src="twitchEmbedUrl" frameborder="0"
      allowfullscreen class="embed-iframe" />

    <!-- ── SoundCloud ─────────────────────────────────────────────────────── -->
    <!--
      SoundCloud uses a widget URL that accepts the original track/set URL
      as an encoded `url` query parameter — no separate ID extraction needed.
    -->
    <iframe v-else-if="embedType === 'soundcloud'"
      :src="`https://w.soundcloud.com/player/?url=${encodeURIComponent(mediaUrl)}&color=%2314532d&auto_play=false&show_artwork=true&visual=true`"
      frameborder="0" class="embed-iframe embed-iframe--audio" />

    <!-- ── Spotify ────────────────────────────────────────────────────────── -->
    <!--
      spotifyEmbedUrl converts open.spotify.com URLs to open.spotify.com/embed/
      via a simple string replace (see computed below).
    -->
    <iframe v-else-if="embedType === 'spotify'" :src="spotifyEmbedUrl"
      frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy" class="embed-iframe embed-iframe--audio" />

    <!-- ── Apple Music ────────────────────────────────────────────────────── -->
    <!--
      appleMusicEmbedUrl swaps music.apple.com for embed.music.apple.com.
      The sandbox attribute is required by Apple's embed documentation.
    -->
    <iframe v-else-if="embedType === 'applemusic'" :src="appleMusicEmbedUrl"
      frameborder="0" allow="autoplay *; encrypted-media *; fullscreen *"
      sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
      class="embed-iframe embed-iframe--audio" />

    <!-- ── Link card fallback (Instagram, TikTok, Facebook, Twitter, other) -->
    <!--
      Platforms that cannot be embedded in an iframe (due to X-Frame-Options
      or no official embed API) are shown as a styled external link card.
      platformIcon and platformLabel provide per-platform labelling.
    -->
    <a v-else :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
      <span class="link-card__icon">{{ platformIcon }}</span>
      <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
    </a>
  </div>
</template>

<script setup>
// =============================================================================
// MediaEmbed.vue — universal media embed component
//
// Given a raw URL and an embedType string (set by the post creator at upload
// time), renders the appropriate embeddable player or a link card fallback.
//
// Supported embed types with inline players:
//   youtube     — standard watch links, youtu.be short links, /shorts/ links
//   twitch      — live channel links and clip links
//   soundcloud  — any SoundCloud track or playlist URL
//   spotify     — any Spotify track, album, or playlist URL
//   applemusic  — any Apple Music URL
//
// Link card fallback (no inline player):
//   instagram, tiktok, facebook, twitter, other
//
// Props:
//   mediaUrl  (String) — the original URL entered by the post creator
//   embedType (String) — platform key string, e.g. 'youtube', 'spotify'
// =============================================================================

import { computed } from 'vue';

// ── Props ──────────────────────────────────────────────────────────────────────

const props = defineProps({
  mediaUrl:  { type: String, default: '' },
  embedType: { type: String, default: '' },
});

// ── Computed embed URLs ────────────────────────────────────────────────────────

/**
 * Converts any recognised YouTube URL format into the embeddable /embed/ID URL.
 *
 * Patterns handled:
 *   youtu.be/ID           — short share URL
 *   youtube.com/watch?v=ID — standard watch URL (v param anywhere in query string)
 *   youtube.com/shorts/ID  — Shorts URL
 *
 * Returns an empty string if no valid video ID is found, which prevents
 * the iframe from loading a broken URL.
 */
const youtubeEmbedUrl = computed(() => {
  const url = props.mediaUrl;
  const shortMatch  = url.match(/youtu\.be\/([^?&/]+)/);
  const longMatch   = url.match(/[?&]v=([^&]+)/);
  const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/);
  // Use the first match found — short link wins over watch link over shorts
  const id = shortMatch?.[1] || longMatch?.[1] || shortsMatch?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : '';
});

/**
 * Converts a Twitch channel or clip URL into its embeddable form.
 *
 * Twitch requires the `parent` parameter to equal the domain the embed is
 * hosted on — window.location.hostname provides this dynamically so the
 * embed works on both localhost and production without code changes.
 *
 * Patterns handled:
 *   twitch.tv/channelname/clip/clipID — clip embed URL
 *   twitch.tv/channelname              — live channel player URL
 */
const twitchEmbedUrl = computed(() => {
  const url = props.mediaUrl;
  const clipMatch    = url.match(/twitch\.tv\/\w+\/clip\/([^/?\s]+)/);
  const channelMatch = url.match(/twitch\.tv\/([^/?\s]+)/);
  if (clipMatch)    return `https://clips.twitch.tv/embed?clip=${clipMatch[1]}&parent=${window.location.hostname}`;
  if (channelMatch) return `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${window.location.hostname}`;
  return '';
});

/**
 * Converts a Spotify share URL to the embeddable widget URL.
 * Example: https://open.spotify.com/track/ID
 *       → https://open.spotify.com/embed/track/ID
 * The path structure is preserved — this works for tracks, albums, and playlists.
 */
const spotifyEmbedUrl = computed(() => {
  // https://open.spotify.com/track/ID → https://open.spotify.com/embed/track/ID
  return props.mediaUrl.replace('open.spotify.com/', 'open.spotify.com/embed/');
});

/**
 * Converts an Apple Music URL to the embeddable widget URL.
 * Example: https://music.apple.com/... → https://embed.music.apple.com/...
 */
const appleMusicEmbedUrl = computed(() => {
  // https://music.apple.com/... → https://embed.music.apple.com/...
  return props.mediaUrl.replace('music.apple.com', 'embed.music.apple.com');
});

// ── Link card helpers ──────────────────────────────────────────────────────────

/**
 * Returns an emoji icon for the platform used in the link card fallback.
 * Falls back to a generic link emoji for unknown types.
 */
const platformIcon = computed(() => {
  const icons = { instagram: '📷', tiktok: '🎵', facebook: '📘', twitter: '🐦', other: '🔗' };
  return icons[props.embedType] || '🔗';
});

/**
 * Returns a human-readable label ("View on Instagram", etc.) for the link card.
 * Falls back to "Open Link" for unknown embed types.
 */
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

/* Standard video iframe — 16:9-ish tall */
.embed-iframe {
  width: 100%;
  height: 360px;
  border-radius: 10px;
  display: block;
}

/* Audio players (Spotify, SoundCloud, Apple Music) are shorter */
.embed-iframe--audio {
  height: 166px;
}

/* Link card for platforms that don't support embedding */
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
