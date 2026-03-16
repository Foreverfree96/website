import { ref, computed } from 'vue';

// Module-level singleton — persists across route changes
const nowPlaying = ref(null);
// shape: { url, type, isPlaylist, position, playlistIndex }

export function useNowPlaying() {
  const isActive = computed(() => !!nowPlaying.value);

  const popOut = (data) => {
    nowPlaying.value = data;
  };

  const close = () => {
    nowPlaying.value = null;
  };

  return { nowPlaying, isActive, popOut, close };
}
