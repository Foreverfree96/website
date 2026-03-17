import { ref, computed, watch } from 'vue';

const STORAGE_KEY = 'nowPlaying';

// Restore from localStorage on page load
const _saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
})();

// Module-level singletons — persist across route changes
const nowPlaying   = ref(_saved || null);
// shape: { url, type, isPlaylist, position, playlistIndex }

// Saved when mini player closes so in-post player can resume from same spot
const lastPosition = ref({ url: null, position: 0, playlistIndex: 0, trackUri: '' });

// Set to true by MediaEmbed "pop back in" button; MiniPlayer watches this,
// saves current position, then calls close() so the post embed can resume.
const popInRequested = ref(false);

// Persist nowPlaying to localStorage whenever it changes
watch(nowPlaying, (val) => {
  if (val) localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
  else     localStorage.removeItem(STORAGE_KEY);
}, { deep: true });

export function useNowPlaying() {
  const isActive = computed(() => !!nowPlaying.value);

  const popOut = (data) => {
    nowPlaying.value = data;
  };

  const close = () => {
    // Save last known position before clearing so in-post player can sync
    if (nowPlaying.value) {
      lastPosition.value = {
        url:           nowPlaying.value.url,
        position:      nowPlaying.value.position      || 0,
        playlistIndex: nowPlaying.value.playlistIndex || 0,
        trackUri:      nowPlaying.value.trackUri      || '',
        paused:        nowPlaying.value.paused        || false,
      };
    }
    nowPlaying.value = null;
  };

  // Called by the in-post "Pop back in" button — MiniPlayer handles the rest
  const popIn = () => { popInRequested.value = true; };

  return { nowPlaying, isActive, popOut, close, lastPosition, popIn, popInRequested };
}
