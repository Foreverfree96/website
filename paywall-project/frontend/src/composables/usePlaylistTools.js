import { ref, computed } from 'vue';

const API = import.meta.env.VITE_API_URL;
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('jwtToken')}`,
});

// ─── Module-level singleton state ────────────────────────────────────────────
const isOpen    = ref(false);
const activeTab = ref('generate'); // 'generate' | 'convert'

// Generate tab
const seedTracks      = ref([]);
const seedPlaylistUrl = ref('');
const selectedGenres  = ref([]);
const trackLimit      = ref(30);
const generatedTracks = ref([]);
const generateLoading = ref(false);

// Convert tab
const convertUrl       = ref('');
const convertDirection = ref(null); // 'yt-to-spotify' | 'spotify-to-yt'
const sourceTracks     = ref([]);
const matchedTracks    = ref([]);
const convertLoading   = ref(false);

// Shared
const resultTracks = ref([]);
const saving       = ref(false);
const saveResult   = ref(null); // { playlistUrl, name } after save
const error        = ref('');

// Search state
const searchQuery   = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
let _searchDebounce = null;

// ─── Available genres (Spotify recommendation seeds) ────────────────────────
const GENRES = [
  'acoustic', 'ambient', 'chill', 'classical', 'country', 'dance',
  'electronic', 'folk', 'funk', 'hip-hop', 'house', 'indie', 'jazz',
  'k-pop', 'latin', 'lofi', 'metal', 'pop', 'punk', 'r-n-b',
  'reggae', 'rock', 'soul', 'techno', 'trap',
];

// ─── URL detection helpers ──────────────────────────────────────────────────
const detectPlatform = (url) => {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/spotify\.com/i.test(url)) return 'spotify';
  return null;
};

const extractYoutubePlaylistId = (url) => {
  const m = url.match(/[?&]list=([^&]+)/);
  return m?.[1] || null;
};

const extractSpotifyPlaylistId = (url) => {
  const m = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return m?.[1] || null;
};

// ─── Composable ─────────────────────────────────────────────────────────────
export function usePlaylistTools() {

  const open = (tab) => {
    if (tab) activeTab.value = tab;
    isOpen.value = true;
    error.value = '';
    saveResult.value = null;
  };

  const close = () => {
    isOpen.value = false;
  };

  const reset = () => {
    seedTracks.value = [];
    seedPlaylistUrl.value = '';
    selectedGenres.value = [];
    trackLimit.value = 30;
    generatedTracks.value = [];
    generateLoading.value = false;
    convertUrl.value = '';
    convertDirection.value = null;
    sourceTracks.value = [];
    matchedTracks.value = [];
    convertLoading.value = false;
    resultTracks.value = [];
    saving.value = false;
    saveResult.value = null;
    error.value = '';
    searchQuery.value = '';
    searchResults.value = [];
  };

  // ── Seed track search ───────────────────────────────────────────────────
  const searchSeeds = (query) => {
    searchQuery.value = query;
    clearTimeout(_searchDebounce);
    if (!query.trim()) { searchResults.value = []; return; }
    searchLoading.value = true;
    _searchDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/spotify/search?q=${encodeURIComponent(query)}&limit=8`, {
          headers: headers(),
        });
        const data = await res.json();
        searchResults.value = data.tracks || [];
      } catch { searchResults.value = []; }
      searchLoading.value = false;
    }, 300);
  };

  const addSeed = (track) => {
    if (seedTracks.value.length >= 5) return;
    if (seedTracks.value.find((t) => t.id === track.id)) return;
    seedTracks.value.push(track);
    searchQuery.value = '';
    searchResults.value = [];
  };

  const removeSeed = (index) => {
    seedTracks.value.splice(index, 1);
  };

  const toggleGenre = (genre) => {
    const idx = selectedGenres.value.indexOf(genre);
    if (idx >= 0) selectedGenres.value.splice(idx, 1);
    else selectedGenres.value.push(genre);
  };

  // ── Generate playlist ─────────────────────────────────────────────────
  const generate = async () => {
    error.value = '';
    generateLoading.value = true;
    try {
      const body = {
        seedTrackIds: seedTracks.value.map((t) => t.id),
        seedTrackMeta: seedTracks.value.map((t) => ({ name: t.name, artist: t.artist })),
        genres: selectedGenres.value,
        limit: trackLimit.value,
      };

      // If user pasted a reference playlist URL
      if (seedPlaylistUrl.value) {
        const spId = extractSpotifyPlaylistId(seedPlaylistUrl.value);
        if (spId) body.seedPlaylistId = spId;
      }

      const res = await fetch(`${API}/api/spotify/generate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Generation failed');
      generatedTracks.value = data.tracks || [];
      resultTracks.value = [...generatedTracks.value];
    } catch (err) {
      error.value = err.message;
    }
    generateLoading.value = false;
  };

  // ── Convert playlist ──────────────────────────────────────────────────
  const startConvert = async () => {
    error.value = '';
    convertLoading.value = true;
    matchedTracks.value = [];
    sourceTracks.value = [];

    try {
      const platform = detectPlatform(convertUrl.value);
      if (!platform) throw new Error('Paste a valid YouTube or Spotify playlist URL');

      if (platform === 'youtube') {
        convertDirection.value = 'yt-to-spotify';
        const plId = extractYoutubePlaylistId(convertUrl.value);
        if (!plId) throw new Error('Could not find playlist ID in URL');

        // Fetch YouTube tracks
        const ytRes = await fetch(`${API}/api/youtube/playlist/${plId}/tracks`, {
          headers: headers(),
        });
        const ytData = await ytRes.json();
        if (!ytRes.ok) throw new Error(ytData.message || 'Failed to fetch YouTube playlist');
        sourceTracks.value = ytData.items || [];

        // Match to Spotify
        const matchBody = sourceTracks.value.map((t) => ({
          title: t.title,
          artist: t.channelTitle,
        }));
        const matchRes = await fetch(`${API}/api/spotify/match`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ tracks: matchBody }),
        });
        const matchData = await matchRes.json();
        if (!matchRes.ok) throw new Error(matchData.message || 'Matching failed');
        matchedTracks.value = matchData.matches || [];
        resultTracks.value = matchedTracks.value
          .filter((m) => m.bestMatch)
          .map((m) => m.bestMatch);

      } else {
        convertDirection.value = 'spotify-to-yt';
        const plId = extractSpotifyPlaylistId(convertUrl.value);
        if (!plId) throw new Error('Could not find playlist ID in URL');

        // Fetch Spotify tracks
        const spRes = await fetch(`${API}/api/spotify/playlist/${plId}/tracks`, {
          headers: headers(),
        });
        const spData = await spRes.json();
        if (!spRes.ok) throw new Error(spData.message || 'Failed to fetch Spotify playlist');
        sourceTracks.value = (spData.items || []).map((i) => ({
          title: i.track?.name || '',
          artist: i.track?.artists?.map((a) => a.name).join(', ') || '',
          uri: i.track?.uri || '',
          art: i.track?.album?.images?.[0]?.url || '',
        }));

        // Match to YouTube
        const matchBody = sourceTracks.value.map((t) => ({
          title: t.title,
          artist: t.artist,
        }));
        const matchRes = await fetch(`${API}/api/youtube/match`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ tracks: matchBody }),
        });
        const matchData = await matchRes.json();
        if (!matchRes.ok) throw new Error(matchData.message || 'Matching failed');
        matchedTracks.value = matchData.matches || [];
        resultTracks.value = matchedTracks.value
          .filter((m) => m.bestMatch)
          .map((m) => m.bestMatch);
      }
    } catch (err) {
      error.value = err.message;
    }
    convertLoading.value = false;
  };

  // Swap a matched track with an alternative
  const swapMatch = (index, newTrack) => {
    if (matchedTracks.value[index]) {
      matchedTracks.value[index].bestMatch = newTrack;
      matchedTracks.value[index].confidence = 'manual';
    }
    // Rebuild resultTracks
    resultTracks.value = matchedTracks.value
      .filter((m) => m.bestMatch)
      .map((m) => m.bestMatch);
  };

  // Remove a track from results
  const removeResult = (index) => {
    resultTracks.value.splice(index, 1);
  };

  // ── Save to Spotify ───────────────────────────────────────────────────
  const saveToSpotify = async (name) => {
    error.value = '';
    saving.value = true;
    saveResult.value = null;
    try {
      const uris = resultTracks.value
        .map((t) => t.uri)
        .filter(Boolean);
      if (!uris.length) throw new Error('No Spotify tracks to save');

      const res = await fetch(`${API}/api/spotify/playlist`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name, trackUris: uris }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'scope_missing') {
          throw new Error('Please reconnect Spotify in your profile to enable playlist creation');
        }
        throw new Error(data.message || 'Failed to save playlist');
      }
      saveResult.value = data;
    } catch (err) {
      error.value = err.message;
    }
    saving.value = false;
  };

  return {
    // State
    isOpen, activeTab,
    seedTracks, seedPlaylistUrl, selectedGenres, trackLimit,
    generatedTracks, generateLoading,
    convertUrl, convertDirection, sourceTracks, matchedTracks, convertLoading,
    resultTracks, saving, saveResult, error,
    searchQuery, searchResults, searchLoading,
    GENRES,

    // Methods
    open, close, reset,
    searchSeeds, addSeed, removeSeed, toggleGenre,
    generate, startConvert, swapMatch, removeResult,
    saveToSpotify,
  };
}
