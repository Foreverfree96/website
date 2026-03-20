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

// Separate result tracks for each tab so they don't interfere
const generateResults = ref([]);
const convertResults  = ref([]);
const resultTracks    = ref([]); // points to whichever tab is active
const saving          = ref(false);
const saveResult      = ref(null); // { playlistUrl, name } after save
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
const searchError   = ref('');
let _searchDebounce = null;

// ─── Abort controller for in-flight generate/convert ─────────────────────────
let _activeAbort = null; // AbortController for the current operation

// ─── Persist results to sessionStorage so they survive refresh ───────────────
const RESULTS_KEY = 'pt_results';

const _persistResults = () => {
  try {
    const state = {
      activeTab: activeTab.value,
      generatedTracks: generatedTracks.value,
      generateResults: generateResults.value,
      matchedTracks: matchedTracks.value,
      convertResults: convertResults.value,
      resultTracks: resultTracks.value,
      convertDirection: convertDirection.value,
      convertUrl: convertUrl.value,
      seedTracks: seedTracks.value,
      seedPlaylistUrl: seedPlaylistUrl.value,
      selectedGenres: selectedGenres.value,
      trackLimit: trackLimit.value,
      bgStatus: bgStatus.value,
      bgDone: bgDone.value,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
};

const _restoreResults = () => {
  try {
    const raw = sessionStorage.getItem(RESULTS_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    // Only restore if saved within last 30 minutes
    if (Date.now() - state.savedAt > 30 * 60 * 1000) {
      sessionStorage.removeItem(RESULTS_KEY);
      return false;
    }
    // Only restore if there are actual results
    if (!state.generatedTracks?.length && !state.matchedTracks?.length) return false;
    activeTab.value = state.activeTab || 'generate';
    generatedTracks.value = state.generatedTracks || [];
    generateResults.value = state.generateResults || [];
    matchedTracks.value = state.matchedTracks || [];
    convertResults.value = state.convertResults || [];
    resultTracks.value = state.resultTracks || [];
    convertDirection.value = state.convertDirection || null;
    convertUrl.value = state.convertUrl || '';
    seedTracks.value = state.seedTracks || [];
    seedPlaylistUrl.value = state.seedPlaylistUrl || '';
    selectedGenres.value = state.selectedGenres || [];
    trackLimit.value = state.trackLimit || 30;
    bgStatus.value = state.bgStatus || '';
    bgDone.value = state.bgDone || false;
    isOpen.value = true;
    return true;
  } catch { return false; }
};

// Restore on module load
_restoreResults();

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
  if (/music\.youtube\.com/i.test(url)) return 'youtube-music';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/spotify\.com/i.test(url)) return 'spotify';
  return null;
};

const isYoutubePlatform = (p) => p === 'youtube' || p === 'youtube-music';

const extractYoutubePlaylistId = (url) => {
  // Standard ?list= param (works for both youtube.com and music.youtube.com)
  const listMatch = url.match(/[?&]list=([^&]+)/);
  if (listMatch) return listMatch[1];
  // YouTube Music browse format: music.youtube.com/browse/VLPLxxxxxx
  const browseMatch = url.match(/browse\/VL([A-Za-z0-9_-]+)/);
  if (browseMatch) return browseMatch[1];
  // YouTube Music playlist path: music.youtube.com/playlist?list= (already handled above)
  return null;
};

const extractSpotifyPlaylistId = (url) => {
  const m = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return m?.[1] || null;
};

// ─── Composable ─────────────────────────────────────────────────────────────
export function usePlaylistTools() {

  // Sync resultTracks to the active tab's stored results
  const syncResultTracks = () => {
    if (activeTab.value === 'generate') {
      resultTracks.value = [...generateResults.value];
    } else {
      resultTracks.value = [...convertResults.value];
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
    // Abort any in-flight generate/convert request
    if (_activeAbort) { _activeAbort.abort(); _activeAbort = null; }
    isOpen.value = false;
    isMinimized.value = false;
    bgStatus.value = '';
    bgDone.value = false;
    generateLoading.value = false;
    convertLoading.value = false;
    // Clear persisted results
    sessionStorage.removeItem(RESULTS_KEY);
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
    generateResults.value = [];
    generateLoading.value = false;
    convertUrl.value = '';
    convertDirection.value = null;
    sourceTracks.value = [];
    matchedTracks.value = [];
    convertResults.value = [];
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
  let _searchRateLimitUntil = 0;

  const searchSeeds = (query) => {
    searchQuery.value = query;
    searchError.value = '';
    clearTimeout(_searchDebounce);
    if (!query.trim()) { searchResults.value = []; searchLoading.value = false; return; }

    // Don't spam requests during rate limit
    if (Date.now() < _searchRateLimitUntil) {
      searchError.value = 'Rate limited — wait a moment';
      return;
    }

    searchLoading.value = true;
    _searchDebounce = setTimeout(async () => {
      // Re-check query hasn't been cleared during debounce
      if (!searchQuery.value.trim()) { searchLoading.value = false; return; }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${API}/api/spotify/search?q=${encodeURIComponent(searchQuery.value)}&limit=50`, {
          headers: headers(),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}));
          const retryAfter = (data.retryAfter || 5) * 1000;
          _searchRateLimitUntil = Date.now() + retryAfter;
          searchError.value = 'Rate limited — wait a moment';
          searchResults.value = [];
        } else if (!res.ok) {
          searchError.value = res.status === 401 ? 'Login required' : `Search failed (${res.status})`;
          searchResults.value = [];
        } else {
          const data = await res.json();
          searchResults.value = data.tracks || [];
          searchError.value = searchResults.value.length ? '' : 'No results found';
        }
      } catch (err) {
        searchError.value = err.name === 'AbortError' ? 'Search timed out' : 'Search failed — check connection';
        searchResults.value = [];
      }
      searchLoading.value = false;
    }, 600);
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

    // Create a shared abort controller so close() can cancel this
    if (_activeAbort) _activeAbort.abort();
    _activeAbort = new AbortController();
    const signal = _activeAbort.signal;

    try {
      if (!API) throw new Error('API URL not configured');

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
        } else if (isYoutubePlatform(platform)) {
          const ytId = extractYoutubePlaylistId(seedPlaylistUrl.value);
          if (ytId) {
            try {
              const ytRes = await fetch(`${API}/api/youtube/playlist/${ytId}/tracks`, { headers: headers(), signal });
              const ytData = await ytRes.json();
              if (ytRes.ok && ytData.items?.length) {
                const ytSeeds = ytData.items.slice(0, 10).map(t => ({
                  name: t.title,
                  artist: t.channelTitle,
                }));
                body.seedTrackMeta = [...body.seedTrackMeta, ...ytSeeds];
              }
            } catch (e) { if (e.name === 'AbortError') throw e; /* proceed without YT seeds */ }
          }
        }
      }

      const genTimeout = setTimeout(() => { if (!signal.aborted) _activeAbort?.abort(); }, 360000);
      const res = await fetch(`${API}/api/spotify/generate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal,
      });
      clearTimeout(genTimeout);
      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try { const data = await res.json(); msg = data.message || msg; } catch { /* non-JSON response */ }
        throw new Error(msg);
      }
      const data = await res.json();
      generatedTracks.value = data.tracks || [];
      generateResults.value = [...generatedTracks.value];
      resultTracks.value = [...generateResults.value];
      bgStatus.value = `Done! ${generatedTracks.value.length} tracks`;
      bgDone.value = true;
      _activeAbort = null;
      _persistResults();
    } catch (err) {
      if (err.name === 'AbortError' && !isOpen.value) return; // user closed, don't show error
      const msg = err.name === 'AbortError'
        ? 'Generation timed out — the server may be waking up, try again'
        : (err.message || 'Generation failed — check your connection');
      error.value = msg;
      bgStatus.value = 'Error';
      console.error('Playlist generate error:', err);
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

    // Create a shared abort controller so close() can cancel this
    if (_activeAbort) _activeAbort.abort();
    _activeAbort = new AbortController();
    const signal = _activeAbort.signal;

    try {
      const platform = detectPlatform(convertUrl.value);
      if (!platform) throw new Error('Paste a valid YouTube, YouTube Music, or Spotify playlist URL');

      if (isYoutubePlatform(platform)) {
        convertDirection.value = 'yt-to-spotify';
        const plId = extractYoutubePlaylistId(convertUrl.value);
        if (!plId) throw new Error('Could not find playlist ID in URL');

        // Fetch YouTube tracks
        const ytTimeout = setTimeout(() => { if (!signal.aborted) _activeAbort?.abort(); }, 360000);
        const ytRes = await fetch(`${API}/api/youtube/playlist/${plId}/tracks`, {
          headers: headers(),
          signal,
        });
        clearTimeout(ytTimeout);
        if (!ytRes.ok) {
          let msg = `YouTube fetch failed (${ytRes.status})`;
          try { const d = await ytRes.json(); msg = d.message || msg; } catch { /* non-JSON */ }
          throw new Error(msg);
        }
        const ytData = await ytRes.json();
        sourceTracks.value = ytData.items || [];

        bgStatus.value = `Matching ${sourceTracks.value.length} tracks...`;

        // Match to Spotify
        const matchBody = sourceTracks.value.map((t) => ({
          title: t.title,
          artist: t.channelTitle,
        }));
        const matchRes = await fetch(`${API}/api/spotify/match`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ tracks: matchBody }),
          signal,
        });
        if (!matchRes.ok) {
          let msg = `Matching failed (${matchRes.status})`;
          try { const d = await matchRes.json(); msg = d.message || msg; } catch { /* non-JSON */ }
          throw new Error(msg);
        }
        const matchData = await matchRes.json();
        matchedTracks.value = matchData.matches || [];
        convertResults.value = matchedTracks.value
          .filter((m) => m.bestMatch)
          .map((m) => m.bestMatch);
        resultTracks.value = [...convertResults.value];
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
          signal,
        });
        if (spRes.status === 429) {
          await new Promise(r => setTimeout(r, 3000));
          spRes = await fetch(`${API}/api/spotify/playlist/${plId}/tracks`, {
            headers: headers(),
            signal,
          });
        }
        if (!spRes.ok) {
          let msg = `Spotify fetch failed (${spRes.status})`;
          try { const d = await spRes.json(); msg = d.message || msg; } catch { /* non-JSON */ }
          if (spRes.status === 403) scopeMissing.value = true;
          throw new Error(msg);
        }
        const spData = await spRes.json();
        sourceTracks.value = (spData.items || []).map((i) => ({
          title: i.track?.name || '',
          artist: i.track?.artists?.map((a) => a.name).join(', ') || '',
          uri: i.track?.uri || '',
          art: i.track?.album?.images?.[0]?.url || '',
        }));

        bgStatus.value = `Matching ${sourceTracks.value.length} tracks...`;

        // Match to YouTube
        const matchBody = sourceTracks.value.map((t) => ({
          title: t.title,
          artist: t.artist,
        }));
        const matchRes = await fetch(`${API}/api/youtube/match`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ tracks: matchBody }),
          signal,
        });
        if (!matchRes.ok) {
          let msg = `Matching failed (${matchRes.status})`;
          try { const d = await matchRes.json(); msg = d.message || msg; } catch { /* non-JSON */ }
          throw new Error(msg);
        }
        const matchData = await matchRes.json();
        matchedTracks.value = matchData.matches || [];
        convertResults.value = matchedTracks.value
          .filter((m) => m.bestMatch)
          .map((m) => m.bestMatch);
        resultTracks.value = [...convertResults.value];
        const matched = matchedTracks.value.filter(m => m.confidence !== 'none').length;
        bgStatus.value = `Done! ${matched}/${matchedTracks.value.length} matched`;
        bgDone.value = true;
      }
      _activeAbort = null;
      _persistResults();
    } catch (err) {
      if (err.name === 'AbortError' && !isOpen.value) return; // user closed, don't show error
      const msg = err.name === 'AbortError'
        ? 'Matching timed out — try a smaller playlist'
        : (err.message || 'Conversion failed — check your connection');
      error.value = msg;
      bgStatus.value = 'Error';
      console.error('Playlist convert error:', err);
    }
    convertLoading.value = false;
  };

  // Swap a matched track with an alternative
  const swapMatch = (index, newTrack) => {
    if (matchedTracks.value[index]) {
      // Replace entire entry to ensure Vue reactivity triggers properly
      matchedTracks.value[index] = {
        ...matchedTracks.value[index],
        bestMatch: newTrack,
        confidence: 'manual',
      };
      // Force array reactivity
      matchedTracks.value = [...matchedTracks.value];
    }
    // Rebuild convertResults and resultTracks
    convertResults.value = matchedTracks.value
      .filter((m) => m.bestMatch)
      .map((m) => m.bestMatch);
    resultTracks.value = [...convertResults.value];
  };

  // Remove a track from results
  const removeResult = (index) => {
    resultTracks.value.splice(index, 1);
    // Sync back to the tab-specific store
    if (activeTab.value === 'generate') {
      generateResults.value = [...resultTracks.value];
    } else {
      convertResults.value = [...resultTracks.value];
    }
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
      if (!res.ok) {
        if (res.status === 403 || res.status === 401 || res.status === 404) {
          scopeMissing.value = true;
          error.value = 'Reconnect Spotify to access your playlists';
        }
        userPlaylists.value = [];
      } else {
        const data = await res.json();
        userPlaylists.value = data.playlists || [];
      }
    } catch { userPlaylists.value = []; }
    playlistsLoading.value = false;
  };

  const addToExistingPlaylist = async (playlistId) => {
    error.value = '';
    saving.value = true;
    try {
      const uris = resultTracks.value.map(t => t.uri).filter(Boolean);
      if (!uris.length) throw new Error('No tracks to add');
      const addController = new AbortController();
      const addTimeout = setTimeout(() => addController.abort(), 120000);
      const res = await fetch(`${API}/api/spotify/playlist/${playlistId}/add`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ trackUris: uris }),
        signal: addController.signal,
      });
      clearTimeout(addTimeout);
      if (!res.ok) {
        let msg = 'Failed to add tracks';
        try { const data = await res.json(); msg = data.message || msg; if (data.error === 'scope_missing') scopeMissing.value = true; } catch { /* non-JSON */ }
        if (res.status === 403) scopeMissing.value = true;
        throw new Error(msg);
      }
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

      const saveController = new AbortController();
      const saveTimeout = setTimeout(() => saveController.abort(), 120000);
      const res = await fetch(`${API}/api/spotify/playlist`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name, trackUris: uris }),
        signal: saveController.signal,
      });
      clearTimeout(saveTimeout);
      if (!res.ok) {
        let msg = 'Failed to save playlist';
        let isScopeProblem = false;
        try {
          const data = await res.json();
          msg = data.message || msg;
          if (data.error === 'scope_missing') isScopeProblem = true;
        } catch { /* non-JSON */ }
        if (res.status === 403 || res.status === 404) isScopeProblem = true;
        if (isScopeProblem) {
          scopeMissing.value = true;
          msg = 'Reconnect Spotify to enable playlist creation';
        }
        throw new Error(msg);
      }
      const data = await res.json();
      saveResult.value = data;
    } catch (err) {
      error.value = err.message;
    }
    saving.value = false;
  };

  // ── Persist state before Spotify reconnect redirect ─────────────────────
  const STORAGE_KEY = 'pt_saved_state';

  const saveState = () => {
    try {
      const state = {
        activeTab: activeTab.value,
        seedTracks: seedTracks.value,
        seedPlaylistUrl: seedPlaylistUrl.value,
        selectedGenres: selectedGenres.value,
        trackLimit: trackLimit.value,
        generatedTracks: generatedTracks.value,
        generateResults: generateResults.value,
        convertUrl: convertUrl.value,
        convertDirection: convertDirection.value,
        sourceTracks: sourceTracks.value,
        matchedTracks: matchedTracks.value,
        convertResults: convertResults.value,
        resultTracks: resultTracks.value,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* storage full */ }
  };

  const restoreState = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      sessionStorage.removeItem(STORAGE_KEY);
      const state = JSON.parse(raw);
      // Only restore if saved within the last 5 minutes
      if (Date.now() - state.savedAt > 5 * 60 * 1000) return false;
      activeTab.value = state.activeTab || 'generate';
      seedTracks.value = state.seedTracks || [];
      seedPlaylistUrl.value = state.seedPlaylistUrl || '';
      selectedGenres.value = state.selectedGenres || [];
      trackLimit.value = state.trackLimit || 30;
      generatedTracks.value = state.generatedTracks || [];
      generateResults.value = state.generateResults || [];
      convertUrl.value = state.convertUrl || '';
      convertDirection.value = state.convertDirection || null;
      sourceTracks.value = state.sourceTracks || [];
      matchedTracks.value = state.matchedTracks || [];
      convertResults.value = state.convertResults || [];
      resultTracks.value = state.resultTracks || [];
      isOpen.value = true;
      error.value = '';
      scopeMissing.value = false;
      return true;
    } catch { return false; }
  };

  return {
    // State
    isOpen, activeTab, isMinimized, bgStatus, bgDone,
    seedTracks, seedPlaylistUrl, selectedGenres, trackLimit,
    generatedTracks, generateLoading,
    convertUrl, convertDirection, sourceTracks, matchedTracks, convertLoading,
    resultTracks, saving, saveResult, error, scopeMissing,
    searchQuery, searchResults, searchLoading, searchError,
    GENRES, GENRE_CATEGORIES, genreFilter,

    likedIds, userPlaylists, playlistsLoading,

    // Methods
    open, close, minimize, reset, setTab,
    searchSeeds, addSeed, removeSeed, toggleGenre, addCustomGenre,
    generate, startConvert, swapMatch, removeResult,
    likeTrack, fetchUserPlaylists, addToExistingPlaylist,
    saveToSpotify, saveState, restoreState,
  };
}
