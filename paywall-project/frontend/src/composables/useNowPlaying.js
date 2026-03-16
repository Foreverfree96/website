import { ref, computed } from 'vue';

// Module-level singletons — persist across route changes
const nowPlaying   = ref(null);
// shape: { url, type, isPlaylist, position, playlistIndex }

// Saved when mini player closes so in-post player can resume from same spot
const lastPosition = ref({ url: null, position: 0, playlistIndex: 0 });

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
      };
    }
    nowPlaying.value = null;
  };

  return { nowPlaying, isActive, popOut, close, lastPosition };
}
