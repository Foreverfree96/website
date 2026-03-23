<template>
  <div class="media-embed" v-if="mediaUrl">

    <!-- Popped out overlay -->
    <div v-if="isPoppedOut" class="embed-popped-static">
      <span>♫ Playing in mini player</span>
      <button class="embed-popin-btn" @click="popIn()" title="Return to post">↙ Pop back in</button>
    </div>

    <!-- Channel/Profile embed cards -->
    <template v-else-if="isChannelEmbed">
      <div class="channel-card" @click="openChannel">
        <img v-if="channelData.avatar" :src="channelData.avatar" class="channel-avatar" alt="" />
        <div class="channel-info">
          <span class="channel-name">{{ channelData.title || extractChannelName }}</span>
          <span v-if="channelData.subscriberCount" class="channel-subs">{{ formatCount(channelData.subscriberCount) }} subscribers</span>
          <span v-if="channelData.followerCount" class="channel-subs">{{ formatCount(channelData.followerCount) }} followers</span>
          <div class="channel-meta">
            <span v-if="channelData.isLive" class="channel-live">LIVE</span>
            <span class="channel-platform">{{ channelPlatformLabel }}</span>
          </div>
          <span v-if="channelData.streamTitle" class="channel-stream-title">{{ channelData.streamTitle }}</span>
        </div>
        <span class="channel-arrow">→</span>
      </div>
    </template>

    <template v-else>
      <!-- Twitch channel header for stream/clip embeds -->
      <div v-if="embedType === 'twitch' && twitchChannel.title" class="twitch-header" @click="openChannel">
        <img v-if="twitchChannel.avatar" :src="twitchChannel.avatar" class="twitch-header-avatar" alt="" />
        <div class="twitch-header-info">
          <span class="twitch-header-name">{{ twitchChannel.title }}</span>
          <span v-if="twitchChannel.followerCount" class="twitch-header-followers">{{ formatCount(twitchChannel.followerCount) }} followers</span>
        </div>
        <span v-if="twitchChannel.isLive" class="channel-live">LIVE</span>
        <span class="twitch-header-badge">Twitch</span>
      </div>

      <!-- Actual embed -->
      <div class="embed-wrap">
        <!-- Spotify: SDK player — shows preview card until user clicks Play -->
        <SpotifyPlayer
          v-if="embedType === 'spotify'"
          ref="spotifyPlayerRef"
          :key="embedKey"
          :mediaUrl="mediaUrl"
          :isPlaylist="isPlaylist"
          :autoPlay="autoplayOnPopIn"
          :defaultListOpen="false"
          :startPosition="spStartPosition"
          :startTrackUri="spStartTrackUri"
          :lazyConnect="true"
          @will-connect="onSpotifyWillConnect"
        />

        <!-- All other platforms: iframe -->
        <iframe
          v-else-if="embedUrl && embedType !== 'spotify'"
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

        <a v-else-if="!embedUrl" :href="mediaUrl" target="_blank" rel="noopener noreferrer" class="link-card">
          <span class="link-card__icon">{{ platformIcon }}</span>
          <span class="link-card__text">{{ platformLabel }}<br /><small>{{ mediaUrl }}</small></span>
        </a>

        <!-- Click-to-play guard — non-Spotify only (Spotify uses its own preview card) -->
        <div v-if="embedUrl && embedType !== 'spotify' && !active" class="embed-guard" @click="activate">
          <div class="embed-guard-inner">
            <img v-if="ytThumb" :src="ytThumb" class="embed-guard-thumb" />
            <img v-else-if="twitchThumb" :src="twitchThumb" class="embed-guard-thumb embed-guard-thumb--twitch" />
            <div class="embed-guard-play">▶</div>
          </div>
        </div>
      </div>

      <!-- Controls bar — shuffle (YT playlists) + pop-out -->
      <div v-if="embedType === 'spotify' || (active && embedUrl)" class="embed-controls-bar">
        <button
          v-if="embedType === 'youtube' && isPlaylist"
          class="embed-shuffle-btn"
          :class="{ 'embed-shuffle-btn--on': ytShuffleOn }"
          @click.stop="ytShuffleOn = !ytShuffleOn"
          :title="ytShuffleOn ? 'Shuffle on' : 'Shuffle off'"
        >🔀</button>
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
import SpotifyPlayer from './SpotifyPlayer.vue';

const props = defineProps({
  mediaUrl:  { type: String, default: '' },
  embedType: { type: String, default: '' },
});

// Detect misclassified YouTube channel URLs (stored as 'youtube' instead of 'yt-channel')
const isYtChannelUrl = computed(() =>
  props.embedType === 'youtube' && props.mediaUrl &&
  (/youtube\.com\/@[^/?]+/i.test(props.mediaUrl) || /youtube\.com\/channel\/[^/?]+/i.test(props.mediaUrl)) &&
  !/[?&]v=/.test(props.mediaUrl) && !/youtu\.be\//.test(props.mediaUrl) &&
  !/\/shorts\//.test(props.mediaUrl) && !/\/watch/.test(props.mediaUrl)
);

const { nowPlaying, popOut, close: closeMiniPlayer, lastPosition, popIn } = useNowPlaying();

const active            = ref(false);
const embedKey          = ref(0);
const iframeEl          = ref(null);
const ytTime            = ref(0);   // tracked via postMessage
const ytIndex           = ref(0);   // playlist index tracked via postMessage
const ytLength          = ref(0);   // playlist length tracked via postMessage
const ytShuffleOn       = ref(false);
const startFrom         = ref(0);   // seconds — used in YT embed URL to restore position
const startIndex        = ref(0);   // playlist index to restore after pop-back-in
const autoplayOnPopIn   = ref(false); // resume playback when popping back in from mini player
const spotifyPlayerRef  = ref(null);  // ref to SpotifyPlayer in the post
const spStartPosition   = ref(0);     // ms — resume position when popping back in
const spStartTrackUri   = ref('');    // track URI — resume track when popping back in

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
    const autoplay = autoplayOnPopIn.value ? '&autoplay=1' : '';
    if (listMatch && (isPlaylist.value || !videoId)) {
      const idx   = startIndex.value > 0 ? `&index=${startIndex.value}` : '';
      const start = startFrom.value  > 0 ? `&start=${startFrom.value}`  : '';
      return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&enablejsapi=1${autoplay}${idx}${start}`;
    }
    if (videoId && listMatch)
      return `https://www.youtube.com/embed/${videoId}?list=${listMatch[1]}&enablejsapi=1${autoplay}${start}`;
    if (videoId)
      return `https://www.youtube.com/embed/${videoId}?enablejsapi=1${autoplay}${start}`;
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
    autoplayOnPopIn.value = false; // reset after iframe loads so it doesn't persist
  }
};

const onMessage = (e) => {
  if (!iframeEl.value || e.source !== iframeEl.value.contentWindow) return;
  try {
    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d.event === 'infoDelivery' && d.info) {
      if (d.info.currentTime   != null) ytTime.value  = d.info.currentTime;
      if (d.info.playlistIndex != null) ytIndex.value = d.info.playlistIndex;
      if (Array.isArray(d.info.playlist) && d.info.playlist.length > ytLength.value)
        ytLength.value = d.info.playlist.length;
      // Shuffle: intercept video-ended and jump to random track
      if (d.info.playerState === 0 && ytShuffleOn.value && ytLength.value > 1) {
        let next;
        do { next = Math.floor(Math.random() * ytLength.value); }
        while (next === ytIndex.value);
        iframeEl.value?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideoAt', args: [next] }), '*'
        );
      }
    }
  } catch { /* ignore parse errors */ }
};

onMounted(() => {
  window.addEventListener('message', onMessage);
  fetchTwitchThumb();
});
onUnmounted(() => window.removeEventListener('message', onMessage));

// When mini player closes/pops back in, restore position in post embed
watch(isPoppedOut, (isPopped, wasPopped) => {
  if (!wasPopped || isPopped) return;

  if (props.embedType === 'youtube') {
    const secs = Math.floor((lastPosition.value.position || 0) / 1000);
    startFrom.value      = secs > 0 ? secs : 0;
    startIndex.value     = lastPosition.value.playlistIndex || 0;
    autoplayOnPopIn.value = true; // resume playback in the post embed
    embedKey.value++;
    active.value = true;
  } else if (props.embedType === 'spotify') {
    // Resume at the track + position that was playing in the mini player.
    // Only auto-play if it was actually playing when popped back (respect paused state).
    spStartPosition.value = lastPosition.value.position || 0;
    spStartTrackUri.value = lastPosition.value.trackUri || '';
    autoplayOnPopIn.value = !lastPosition.value.paused;
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

// ── Twitch thumbnail + channel info (for stream/clip embeds) ─────────────────
const twitchThumb = ref(null);
const twitchChannel = ref({ title: '', avatar: '', followerCount: '', isLive: false, streamTitle: '' });

const fetchTwitchThumb = async () => {
  if (props.embedType !== 'twitch') return;
  const m = props.mediaUrl.match(/twitch\.tv\/([^/?]+)/);
  if (!m) return;
  try {
    const token = localStorage.getItem('jwtToken');
    const res = await fetch(`${API}/api/twitch/channel/${encodeURIComponent(m[1])}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      twitchThumb.value = data.avatar || null;
      twitchChannel.value = data;
    }
  } catch { /* silent */ }
};

// ── Iframe height class ───────────────────────────────────────────────────────
const iframeClass = computed(() => {
  const { embedType: type } = props;
  if (type === 'spotify')    return isPlaylist.value ? 'embed-iframe--playlist' : 'embed-iframe--audio';
  if (type === 'soundcloud') return isPlaylist.value ? 'embed-iframe--playlist' : 'embed-iframe--audio';
  return '';
});

// ── Activate (non-Spotify embeds) ─────────────────────────────────────────────
const activate = () => { active.value = true; };

// ── Spotify conflict guard ─────────────────────────────────────────────────────
// Fired by SpotifyPlayer just before it connects the SDK.
// If MiniPlayer is running a different Spotify URL, close it so the UI updates.
// The singleton SDK player stays alive — no handoff needed.
const onSpotifyWillConnect = () => {
  if (nowPlaying.value?.type === 'spotify' && nowPlaying.value?.url !== props.mediaUrl) {
    closeMiniPlayer();
  }
};

// ── Pop out ───────────────────────────────────────────────────────────────────
const popOutEmbed = () => {
  if (isPoppedOut.value) return;
  let posMs    = 0;
  let trackUri = '';
  const idxVal = props.embedType === 'youtube' ? ytIndex.value : 0;
  if (props.embedType === 'youtube') {
    posMs = Math.floor(ytTime.value * 1000);
  } else if (props.embedType === 'spotify' && spotifyPlayerRef.value) {
    posMs    = spotifyPlayerRef.value.position?.value       || 0;
    trackUri = spotifyPlayerRef.value.currentTrackUri?.value || '';
    // No setHandOffMode needed — singleton player stays alive
  }
  const wasPlaying = props.embedType === 'spotify'
    ? !(spotifyPlayerRef.value?.paused?.value ?? true)
    : true;
  popOut({ url: props.mediaUrl, type: props.embedType, isPlaylist: isPlaylist.value, position: posMs, playlistIndex: idxVal, resumeOnLoad: wasPlaying, trackUri });
  active.value = false;
  embedKey.value++;
};

// ── Link card ─────────────────────────────────────────────────────────────────
const platformIcon  = computed(() => ({ instagram: '📷', tiktok: '🎵', facebook: '📘', twitter: '🐦' })[props.embedType] || '🔗');
const platformLabel = computed(() => ({ instagram: 'View on Instagram', tiktok: 'View on TikTok', facebook: 'View on Facebook', twitter: 'View on Twitter/X' })[props.embedType] || 'Open Link');

// ── Channel/Profile embed logic ──────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL;
const isChannelEmbed = computed(() => ['yt-channel', 'twitch-channel', 'kick-channel'].includes(props.embedType) || isYtChannelUrl.value);
const channelData = ref({ title: '', avatar: '', subscriberCount: '', followerCount: '', videoCount: '', isLive: false, streamTitle: '' });

const channelPlatformLabel = computed(() => {
  if (isYtChannelUrl.value) return 'YouTube Channel';
  return ({ 'yt-channel': 'YouTube Channel', 'twitch-channel': 'Twitch Channel', 'kick-channel': 'Kick Channel' })[props.embedType] || 'Channel';
});

const extractChannelName = computed(() => {
  const url = props.mediaUrl;
  // YouTube @handle
  const ytHandle = url.match(/youtube\.com\/@([^/?]+)/);
  if (ytHandle) return `@${ytHandle[1]}`;
  // Twitch
  const twitch = url.match(/twitch\.tv\/([^/?]+)/);
  if (twitch) return twitch[1];
  // Kick
  const kick = url.match(/kick\.com\/([^/?]+)/);
  if (kick) return kick[1];
  return 'Channel';
});

const formatCount = (n) => {
  const num = Number(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return String(num);
};

const openChannel = () => { window.open(props.mediaUrl, '_blank'); };

const fetchChannelData = async () => {
  const token = localStorage.getItem('jwtToken');
  if (props.embedType === 'yt-channel' || isYtChannelUrl.value) {
    const url = props.mediaUrl;
    const handle = url.match(/youtube\.com\/@([^/?]+)/);
    const channelId = url.match(/youtube\.com\/channel\/([^/?]+)/);
    const identifier = handle ? `@${handle[1]}` : channelId?.[1];
    if (!identifier) return;
    try {
      const res = await fetch(`${API}/api/youtube/channel/${encodeURIComponent(identifier)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) channelData.value = await res.json();
    } catch { /* silent */ }
  } else if (props.embedType === 'twitch-channel') {
    const url = props.mediaUrl;
    const m = url.match(/twitch\.tv\/([^/?]+)/);
    const username = m?.[1];
    if (!username) return;
    try {
      const res = await fetch(`${API}/api/twitch/channel/${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) channelData.value = await res.json();
    } catch { /* silent */ }
  }
};

watch([() => props.embedType, isYtChannelUrl], ([type, isYtCh]) => {
  if (type === 'yt-channel' || type === 'twitch-channel' || isYtCh) fetchChannelData();
}, { immediate: true });
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
.embed-guard-thumb--twitch {
  object-fit: contain;
  opacity: 0.4;
  width: 50%;
  height: auto;
  inset: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
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
.embed-guard:hover .embed-guard-play { background: #9146ff; transform: scale(1.1); }

/* Controls bar — OUTSIDE the video, always visible */
.embed-controls-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.embed-shuffle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: #1a1a1a;
  color: #aaa;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0.6;
  transition: background 0.15s, opacity 0.15s, transform 0.1s;
}
.embed-shuffle-btn:hover { opacity: 1; background: #2a2a2a; transform: scale(1.08); }
.embed-shuffle-btn--on { background: #1db954; color: #000; opacity: 1; }
.embed-shuffle-btn--on:hover { background: #1ed760; }

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

/* ── Channel embed card ── */
.channel-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: #000;
  border: 3.5px solid #14532d;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.channel-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.4); }

.channel-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid #14532d;
}

.channel-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.channel-name {
  color: pink;
  font-weight: 700;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-subs {
  color: rgb(125, 190, 157);
  font-size: 0.82rem;
  font-weight: 600;
}

.channel-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.channel-platform {
  color: #888;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.channel-live {
  background: #dc2626;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  animation: live-pulse 2s infinite;
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* ── Twitch header (above stream/clip embed) ── */
.twitch-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #0e0e10;
  border: 1px solid #2a2a2a;
  border-radius: 10px 10px 0 0;
  cursor: pointer;
  transition: background 0.15s;
}
.twitch-header:hover { background: #18181b; }
.twitch-header + .embed-wrap .embed-iframe { border-radius: 0 0 10px 10px; }
.twitch-header + .embed-wrap .embed-guard { border-radius: 0 0 10px 10px; }

.twitch-header-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid #9146ff;
}

.twitch-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}

.twitch-header-name {
  color: #efeff1;
  font-weight: 700;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.twitch-header-followers {
  color: #adadb8;
  font-size: 0.75rem;
  font-weight: 600;
}

.twitch-header-badge {
  color: #9146ff;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.channel-stream-title {
  color: #aaa;
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.channel-arrow {
  color: pink;
  font-size: 1.4rem;
  font-weight: 700;
  flex-shrink: 0;
}

/* ── Mobile / Tablet ── */
@media (max-width: 768px) {
  .embed-iframe          { height: 320px; }
  .embed-iframe--playlist { height: 420px; }
  .embed-popped-static   { padding: 16px 20px; font-size: 0.88rem; }
}
@media (max-width: 480px) {
  .embed-iframe          { height: 240px; border-radius: 8px; }
  .embed-iframe--audio   { height: 160px; }
  .embed-iframe--playlist { height: 360px; }
  .embed-guard-play      { width: 52px; height: 52px; font-size: 1.3rem; }
  .embed-popout-pill     { padding: 7px 14px; font-size: 0.82rem; }
  .embed-popin-btn       { padding: 6px 14px; font-size: 0.8rem; }
  .link-card             { padding: 10px 14px; gap: 10px; }
  .link-card__text       { font-size: 0.85rem; }
}
@media (max-width: 360px) {
  .embed-iframe          { height: 200px; }
  .embed-iframe--playlist { height: 320px; }
}
</style>
