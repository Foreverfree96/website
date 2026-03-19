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
const scopeMissing = ref(false);

// Minimize / background state
const isMinimized = ref(false);
const bgStatus    = ref('');   // 'Generating...', 'Converting...', 'Done! 30 tracks', 'Error'
const bgDone      = ref(false);

// Search state
const searchQuery   = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
let _searchDebounce = null;

// ─── Available genres (categorized) ──────────────────────────────────────────
const GENRE_CATEGORIES = {
  'Popular':          ['pop', 'hip-hop', 'r-n-b', 'rap', 'trap', 'drill', 'reggaeton'],
  'Electronic':       ['electronic', 'house', 'techno', 'edm', 'dubstep', 'drum-and-bass', 'trance', 'ambient', 'lofi'],
  'Rock & Metal':     ['rock', 'alt-rock', 'indie', 'punk', 'metal', 'grunge', 'emo', 'hardcore'],
  'Chill & Acoustic': ['chill', 'acoustic', 'folk', 'singer-songwriter', 'bossa-nova'],
  'Dance & Party':    ['dance', 'disco', 'funk', 'afrobeats', 'dancehall'],
  'World & Cultural': ['latin', 'k-pop', 'j-pop', 'reggae', 'samba', 'flamenco'],
  'Classical & Jazz':  ['classical', 'jazz', 'blues', 'soul', 'gospel', 'opera'],
  'Moods':            ['sad', 'happy', 'workout', 'focus', 'sleep', 'road-trip', 'party', 'romantic'],
};

// Flat list for backwards compat
const GENRES = [...new Set(Object.values(GENRE_CATEGORIES).flat())];

// Genre search filter
const genreFilter = ref('');

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

  // Sync resultTracks to the active tab's data
  const syncResultTracks = () => {
    if (activeTab.value === 'generate') {
      resultTracks.value = [...generatedTracks.value];
    } else {
      resultTracks.value = matchedTracks.value
        .filter(m => m.bestMatch)
        .map(m => m.bestMatch);
    }
  };

  const setTab = (tab) => {
    activeTab.value = tab;
    error.value = '';
    saveResult.value = null;
    syncResultTracks();
  };

  const open = (tab) => {
    if (isOpen.value && isMinimized.value) {
      // Restore from minimized
      isMinimized.value = false;
      return;
    }
    if (tab) activeTab.value = tab;
    isOpen.value = true;
    isMinimized.value = false;
    error.value = '';
    saveResult.value = null;
  };

  const close = () => {
    isOpen.value = false;
    isMinimized.value = false;
    bgStatus.value = '';
    bgDone.value = false;
  };

  const minimize = () => {
    isMinimized.value = true;
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
    scopeMissing.value = false;
    searchQuery.value = '';
    searchResults.value = [];
    genreFilter.value = '';
    isMinimized.value = false;
    bgStatus.value = '';
    bgDone.value = false;
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

  const addCustomGenre = (text) => {
    const g = text.trim().toLowerCase();
    if (!g || selectedGenres.value.includes(g)) return;
    selectedGenres.value.push(g);
  };

  // ── Generate playlist ─────────────────────────────────────────────────
  const generate = async () => {
    error.value = '';
    generateLoading.value = true;
    bgStatus.value = 'Generating...';
    bgDone.value = false;
    try {
      const body = {
        seedTrackIds: seedTracks.value.map((t) => t.id),
        seedTrackMeta: seedTracks.value.map((t) => ({ name: t.name, artist: t.artist })),
        genres: selectedGenres.value,
        limit: trackLimit.value,
      };

      // If user pasted a reference playlist URL (Spotify or YouTube)
      if (seedPlaylistUrl.value) {
        const platform = detectPlatform(seedPlaylistUrl.value);
        if (platform === 'spotify') {
          const spId = extractSpotifyPlaylistId(seedPlaylistUrl.value);
          if (spId) body.seedPlaylistId = spId;
        } else if (platform === 'youtube') {
          // Fetch YouTube playlist tracks and use them as seed metadata
          const ytId = extractYoutubePlaylistId(seedPlaylistUrl.value);
          if (ytId) {
            try {
              const ytRes = await fetch(`${API}/api/youtube/playlist/${ytId}/tracks`, { headers: headers() });
              const ytData = await ytRes.json();
              if (ytRes.ok && ytData.items?.length) {
                const ytSeeds = ytData.items.slice(0, 10).map(t => ({
                  name: t.title,
                  artist: t.channelTitle,
                }));
                body.seedTrackMeta = [...body.seedTrackMeta, ...ytSeeds];
              }
            } catch { /* proceed without YT seeds */ }
          }
        }
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
      bgStatus.value = `Done! ${generatedTracks.value.length} tracks`;
      bgDone.value = true;
    } catch (err) {
      error.value = err.message;
      bgStatus.value = 'Error';
    }
    generateLoading.value = false;
  };

  // ── Convert playlist ──────────────────────────────────────────────────
  const startConvert = async () => {
    error.value = '';
    convertLoading.value = true;
    bgStatus.value = 'Converting...';
    bgDone.value = false;
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
        const matched = matchedTracks.value.filter(m => m.confidence !== 'none').length;
        bgStatus.value = `Done! ${matched}/${matchedTracks.value.length} matched`;
        bgDone.value = true;

      } else {
        convertDirection.value = 'spotify-to-yt';
        const plId = extractSpotifyPlaylistId(convertUrl.value);
        if (!plId) throw new Error('Could not find playlist ID in URL');

        // Fetch Spotify tracks (retry once on 429 after short delay)
        let spRes = await fetch(`${API}/api/spotify/playlist/${plId}/tracks`, {
          headers: headers(),
        });
        if (spRes.status === 429) {
          await new Promise(r => setTimeout(r, 3000));
          spRes = await fetch(`${API}/api/spotify/playlist/${plId}/tracks`, {
            headers: headers(),
          });
        }
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
        const ytMatchController = new AbortController();
        const ytMatchTimeout = setTimeout(() => ytMatchController.abort(), 35000);
        const matchRes = await fetch(`${API}/api/youtube/match`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ tracks: matchBody }),
          signal: ytMatchController.signal,
        });
        clearTimeout(ytMatchTimeout);
        const matchData = await matchRes.json();
        if (!matchRes.ok) throw new Error(matchData.message || 'Matching failed');
        matchedTracks.value = matchData.matches || [];
        resultTracks.value = matchedTracks.value
          .filter((m) => m.bestMatch)
          .map((m) => m.bestMatch);
        const matched = matchedTracks.value.filter(m => m.confidence !== 'none').length;
        bgStatus.value = `Done! ${matched}/${matchedTracks.value.length} matched`;
        bgDone.value = true;
      }
    } catch (err) {
      error.value = err.name === 'AbortError' ? 'Matching timed out — try a smaller playlist' : err.message;
      bgStatus.value = 'Error';
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

  // ── Like track (save to Liked Songs) ──────────────────────────────────
  const likedIds = ref(new Set());

  const likeTrack = async (trackId) => {
    if (!trackId || likedIds.value.has(trackId)) return;
    try {
      const res = await fetch(`${API}/api/spotify/save-track`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ trackIds: [trackId] }),
      });
      if (res.ok) likedIds.value = new Set([...likedIds.value, trackId]);
    } catch { /* silent */ }
  };

  // ── Fetch user playlists ──────────────────────────────────────────────
  const userPlaylists = ref([]);
  const playlistsLoading = ref(false);

  const fetchUserPlaylists = async () => {
    playlistsLoading.value = true;
    try {
      const res = await fetch(`${API}/api/spotify/playlists`, { headers: headers() });
      const data = await res.json();
      userPlaylists.value = data.playlists || [];
    } catch { userPlaylists.value = []; }
    playlistsLoading.value = false;
  };

  const addToExistingPlaylist = async (playlistId) => {
    error.value = '';
    saving.value = true;
    try {
      const uris = resultTracks.value.map(t => t.uri).filter(Boolean);
      if (!uris.length) throw new Error('No tracks to add');
      const res = await fetch(`${API}/api/spotify/playlist/${playlistId}/add`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ trackUris: uris }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to add tracks');
      const pl = userPlaylists.value.find(p => p.id === playlistId);
      saveResult.value = { playlistUrl: `https://open.spotify.com/playlist/${playlistId}`, name: pl?.name || 'Playlist' };
    } catch (err) {
      error.value = err.message;
    }
    saving.value = false;
  };

  // ── Save to Spotify ───────────────────────────────────────────────────
  const saveToSpotify = async (name) => {
    error.value = '';
    scopeMissing.value = false;
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
          throw Object.assign(new Error('Reconnect Spotify to enable playlist creation'), { scopeMissing: true });
        }
        throw new Error(data.message || 'Failed to save playlist');
      }
      saveResult.value = data;
    } catch (err) {
      error.value = err.message;
      if (err.scopeMissing) scopeMissing.value = true;
    }
    saving.value = false;
  };

  return {
    // State
    isOpen, activeTab, isMinimized, bgStatus, bgDone,
    seedTracks, seedPlaylistUrl, selectedGenres, trackLimit,
    generatedTracks, generateLoading,
    convertUrl, convertDirection, sourceTracks, matchedTracks, convertLoading,
    resultTracks, saving, saveResult, error, scopeMissing,
    searchQuery, searchResults, searchLoading,
    GENRES, GENRE_CATEGORIES, genreFilter,

    likedIds, userPlaylists, playlistsLoading,

    // Methods
    open, close, minimize, reset, setTab,
    searchSeeds, addSeed, removeSeed, toggleGenre, addCustomGenre,
    generate, startConvert, swapMatch, removeResult,
    likeTrack, fetchUserPlaylists, addToExistingPlaylist,
    saveToSpotify,
  };
}
