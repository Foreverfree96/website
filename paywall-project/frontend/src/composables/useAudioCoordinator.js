// =============================================================================
// useAudioCoordinator.js
//
// Global audio playback coordinator — ensures only one audio source plays at
// a time across the entire app (in-post YouTube, in-post Spotify, MiniPlayer).
//
// Each player instance gets a unique ID. When a player starts playing, it calls
// signalPlay() which dispatches a window event. All other players listen for
// this event and pause themselves if the ID doesn't match their own.
// =============================================================================

import { onUnmounted } from 'vue';

let _idCounter = 0;

const EVENT_NAME = 'app:audio-play';

/**
 * @param {Object} opts
 * @param {Function} opts.onShouldPause — called when another player starts playing
 * @returns {{ signalPlay: Function, playerId: string }}
 */
export function useAudioCoordinator({ onShouldPause } = {}) {
  const playerId = `player-${++_idCounter}`;

  const handler = (e) => {
    if (e.detail?.id !== playerId && onShouldPause) {
      onShouldPause();
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  onUnmounted(() => window.removeEventListener(EVENT_NAME, handler));

  const signalPlay = () => {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { id: playerId } }));
  };

  return { signalPlay, playerId };
}
