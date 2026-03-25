import { ref, computed, watch } from 'vue';
import { useNotifications } from './useNotifications.js';

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
const seedPlaylistUrls = ref([]); // array of URLs to reference
const seedArtistUrls  = ref([]); // array of artist URLs
const seedAlbumUrls   = ref([]); // array of album URLs
const selectedGenres  = ref([]);
const trackLimit      = ref(30);
const generatedTracks = ref([]);
const generateLoading = ref(false);
const generateTarget  = ref('spotify'); // 'spotify' | 'youtube' — post-generation view toggle
const generateSpotifyResults = ref([]); // Spotify tracks from generation
const generateYoutubeResults = ref([]); // YouTube-matched tracks from generation

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

// Playlist name suggestion
const suggestedName    = ref('');
const suggestingName   = ref(false);

// Progress tracking (0-100) — driven purely by backend Socket.io events
const generateProgress = ref(0);
const convertProgress  = ref(0);
let _socketListenerActive = false;
let _activeProgressRef = null; // which progress ref to update from socket
let _progressHandler = null;   // stored reference for cleanup

const _setupSocketProgress = () => {
  if (_socketListenerActive) return;
  try {
    const { getSocket } = useNotifications();
    const sock = getSocket();
    if (!sock) return;
    _progressHandler = (data) => {
      if (_activeProgressRef && typeof data.percent === 'number') {
        // Only move forward, never backward
        if (data.percent > _activeProgressRef.value) {
          _activeProgressRef.value = data.percent;
        }
      }
    };
    sock.on('playlist:progress', _progressHandler);
    _socketListenerActive = true;
  } catch { /* socket not ready yet */ }
};

const _cleanupSocketProgress = () => {
  if (!_socketListenerActive) return;
  try {
    const { getSocket } = useNotifications();
    const sock = getSocket();
    if (sock && _progressHandler) {
      sock.off('playlist:progress', _progressHandler);
    }
  } catch { /* silent */ }
  _socketListenerActive = false;
  _progressHandler = null;
};

const _startProgress = (progressRef) => {
  progressRef.value = 1;
  _activeProgressRef = progressRef;
  _setupSocketProgress();
};

const _stopProgress = (progressRef, success) => {
  progressRef.value = success ? 100 : 0;
  _activeProgressRef = null;
  _cleanupSocketProgress();
};

// Autofill state
const autofillLoading  = ref(false);
const autofillProgress = ref(''); // e.g. "3/12"

// Search state
const searchQuery   = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const searchError   = ref('');
let _searchDebounce = null;

// ─── Separate abort controllers so generate and convert can run independently ─
let _generateAbort = null;
let _convertAbort  = null;

// ─── Persist results to sessionStorage so they survive refresh ───────────────
const RESULTS_KEY = 'pt_results';

const _persistResults = () => {
  try {
    const state = {
      activeTab: activeTab.value,
      generatedTracks: generatedTracks.value,
      generateResults: generateResults.value,
      generateSpotifyResults: generateSpotifyResults.value,
      generateYoutubeResults: generateYoutubeResults.value,
      generateTarget: generateTarget.value,
      matchedTracks: matchedTracks.value,
      convertResults: convertResults.value,
      resultTracks: resultTracks.value,
      convertDirection: convertDirection.value,
      convertUrl: convertUrl.value,
      seedTracks: seedTracks.value,
      seedPlaylistUrls: seedPlaylistUrls.value,
      seedArtistUrls: seedArtistUrls.value,
      seedAlbumUrls: seedAlbumUrls.value,
      selectedGenres: selectedGenres.value,
      selectedLanguages: selectedLanguages.value,
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
    generateSpotifyResults.value = state.generateSpotifyResults || [];
    generateYoutubeResults.value = state.generateYoutubeResults || [];
    generateTarget.value = state.generateTarget || 'spotify';
    matchedTracks.value = state.matchedTracks || [];
    convertResults.value = state.convertResults || [];
    resultTracks.value = state.resultTracks || [];
    convertDirection.value = state.convertDirection || null;
    convertUrl.value = state.convertUrl || '';
    seedTracks.value = state.seedTracks || [];
    seedPlaylistUrls.value = state.seedPlaylistUrls || [];
    seedArtistUrls.value = state.seedArtistUrls || [];
    seedAlbumUrls.value = state.seedAlbumUrls || [];
    selectedGenres.value = state.selectedGenres || [];
    selectedLanguages.value = state.selectedLanguages || ['en'];
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
  'Popular':          ['pop', 'hip-hop', 'r-n-b', 'rap', 'trap', 'latin', 'afrobeats'],
  'Country':          ['country', 'country-pop', 'americana', 'bluegrass', 'southern-rock'],
  'Pop':              ['synth-pop', 'indie-pop', 'electro-pop', 'dream-pop', 'k-pop', 'j-pop', 'alt-pop'],
  'Electronic':       ['electronic', 'house', 'techno', 'edm', 'dubstep', 'drum-and-bass', 'trance', 'ambient'],
  'Rock & Metal':     ['rock', 'alt-rock', 'indie', 'punk', 'metal', 'grunge', 'hardcore'],
  'Chill & Acoustic': ['chill', 'lofi', 'acoustic', 'folk', 'singer-songwriter', 'bossa-nova'],
  'Classical & Jazz':  ['classical', 'jazz', 'blues', 'soul', 'gospel', 'opera'],
  'Moods':            ['sad', 'happy', 'emo', 'workout', 'focus', 'sleep', 'road-trip', 'romantic'],
};

// ─── Language options ────────────────────────────────────────────────────────
const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
];
const selectedLanguages = ref(['en']); // English by default

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
  // Handles: list=PLxxxxxx, list=OLAK5uy_xxxxx (YouTube Music albums)
  const listMatch = url.match(/[?&]list=([^&]+)/);
  if (listMatch) return listMatch[1];
  // YouTube Music browse format: music.youtube.com/browse/VLPLxxxxxx
  const browseMatch = url.match(/browse\/VL([A-Za-z0-9_-]+)/);
  if (browseMatch) return browseMatch[1];
  // Fallback: extract OLAK5uy_ format directly from URL
  const olakMatch = url.match(/(OLAK5uy_[A-Za-z0-9_-]+)/);
  if (olakMatch) return olakMatch[1];
  return null;
};

const extractSpotifyPlaylistId = (url) => {
  // Reject track/album/artist URLs — only accept playlist URLs
  if (/\/(track|album|artist)\//.test(url)) return null;
  const m = url.match(/(?:playlist\/|spotify:playlist:)([a-zA-Z0-9]+)/);
  return m?.[1] || null;
};

const extractSpotifyTrackId = (url) => {
  const m = url.match(/(?:track\/|spotify:track:)([a-zA-Z0-9]+)/);
  return m?.[1] || null;
};

const extractSpotifyArtistId = (url) => {
  const m = url.match(/(?:artist\/|spotify:artist:)([a-zA-Z0-9]+)/);
  return m?.[1] || null;
};

const extractSpotifyAlbumId = (url) => {
  const m = url.match(/(?:album\/|spotify:album:)([a-zA-Z0-9]+)/);
  return m?.[1] || null;
};

const extractYoutubeVideoId = (url) => {
  const m = url.match(/youtu\.be\/([^?&/]+)|[?&]v=([^&]+)|youtube\.com\/shorts\/([^?&/]+)/);
  return m?.[1] || m?.[2] || m?.[3] || null;
};

/** Detect whether a URL is a single track (not a playlist) */
const isSingleTrackUrl = (url) => {
  if (!url) return false;
  // Spotify single track
  if (/open\.spotify\.com\/track\//.test(url)) return true;
  // YouTube single video (no list= param, or has v= without being a playlist-only URL)
  if ((/youtube\.com|youtu\.be/i.test(url)) && !(/[?&]list=/.test(url) && !/[?&]v=/.test(url))) {
    if (extractYoutubeVideoId(url)) return true;
  }
  return false;
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

  const setGenerateTarget = (target) => {
    generateTarget.value = target;
    const results = target === 'youtube' ? generateYoutubeResults.value : generateSpotifyResults.value;
    if (results.length) {
      generatedTracks.value = results;
      generateResults.value = [...results];
      resultTracks.value = [...results];
    }
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
    // Abort any in-flight generate/convert requests
    if (_generateAbort) { _generateAbort.abort(); _generateAbort = null; }
    if (_convertAbort)  { _convertAbort.abort();  _convertAbort = null; }
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
    seedPlaylistUrls.value = [];
    selectedGenres.value = [];
    trackLimit.value = 30;
    generatedTracks.value = [];
    generateResults.value = [];
    generateSpotifyResults.value = [];
    generateYoutubeResults.value = [];
    generateLoading.value = false;
    generateTarget.value = 'spotify';
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
    selectedLanguages.value = ['en'];
    isMinimized.value = false;
    bgStatus.value = '';
    bgDone.value = false;
    autofillLoading.value = false;
    autofillProgress.value = '';
  };

  // ── Seed track search (dual-source: Spotify + YouTube) ──────────────────
  let _searchRateLimitUntil = 0;

  const searchSeeds = (query) => {
    searchQuery.value = query;
    searchError.value = '';
    clearTimeout(_searchDebounce);
    if (!query.trim() || query.trim().length < 2) { searchResults.value = []; searchLoading.value = false; return; }

    searchLoading.value = true;
    _searchDebounce = setTimeout(async () => {
      if (!searchQuery.value.trim()) { searchLoading.value = false; return; }

      // Check rate limit right before fetching (not when keystroke fires)
      if (Date.now() < _searchRateLimitUntil) {
        searchError.value = 'Rate limited — wait a moment';
        searchLoading.value = false;
        return;
      }

      const q = encodeURIComponent(searchQuery.value);
      const hdrs = headers();

      // Guard: skip API calls if not logged in
      const jwt = localStorage.getItem('jwtToken');
      if (!jwt) {
        searchError.value = 'Log in to search';
        searchLoading.value = false;
        return;
      }

      // Search Spotify and YouTube in parallel with separate timeouts
      // so a slow Spotify cold-start doesn't kill YouTube results
      const spPromise = (async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 20000);
          const r = await fetch(`${API}/api/spotify/search?q=${q}&limit=20`, { headers: hdrs, signal: ctrl.signal });
          clearTimeout(t);
          if (r.status === 429) {
            const d = await r.json().catch(() => ({}));
            _searchRateLimitUntil = Date.now() + (d.retryAfter || 5) * 1000;
            return [];
          }
          if (r.status === 401) {
            console.warn('[SeedSearch] Spotify 401 — JWT may be expired');
            return [];
          }
          if (!r.ok) return [];
          const d = await r.json();
          return (d.tracks || []).map(t => ({ ...t, _source: 'spotify' }));
        } catch { return []; }
      })();

      const ytPromise = (async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const r = await fetch(`${API}/api/youtube/search?q=${q}&limit=15`, { headers: hdrs, signal: ctrl.signal });
          clearTimeout(t);
          if (!r.ok) return [];
          const d = await r.json();
          return (d.items || []).map(t => ({
            id:      `yt_${t.videoId}`,
            name:    t.title,
            artist:  t.channelTitle,
            art:     t.thumbnail,
            videoId: t.videoId,
            _source: 'youtube',
          }));
        } catch { return []; }
      })();

      // Show results as they arrive — don't wait for both
      let spTracks = [], ytTracks = [];
      const first = await Promise.race([
        spPromise.then(r => { spTracks = r; return 'sp'; }),
        ytPromise.then(r => { ytTracks = r; return 'yt'; }),
      ]);

      // Show first results immediately
      if (searchQuery.value.trim()) {
        searchResults.value = [...spTracks, ...ytTracks];
      }

      // Wait for the other one
      if (first === 'sp') ytTracks = await ytPromise;
      else spTracks = await spPromise;

      // Final combined results (check query hasn't changed)
      if (searchQuery.value.trim()) {
        searchResults.value = [...spTracks, ...ytTracks];
        searchError.value = (spTracks.length || ytTracks.length) ? '' : 'No results found';
      }
      searchLoading.value = false;
    }, 800);
  };

  const addSeed = (track) => {
    if (seedTracks.value.length >= 5) return;
    if (seedTracks.value.find((t) => t.id === track.id)) return;
    seedTracks.value.push({
      id:      track.id,
      name:    track.name,
      artist:  track.artist,
      art:     track.art,
      uri:     track.uri || '',
      videoId: track.videoId || '',
      _source: track._source || 'spotify',
    });
    searchQuery.value = '';
    searchResults.value = [];
  };

  const removeSeed = (index) => {
    seedTracks.value.splice(index, 1);
  };

  const cancelGenerate = () => {
    if (_generateAbort) { _generateAbort.abort(); _generateAbort = null; }
    generateLoading.value = false;
    _stopProgress(generateProgress, false);
    bgStatus.value = '';
    bgDone.value = false;
  };

  const cancelConvert = () => {
    if (_convertAbort) { _convertAbort.abort(); _convertAbort = null; }
    convertLoading.value = false;
    _stopProgress(convertProgress, false);
    bgStatus.value = '';
    bgDone.value = false;
  };

  const toggleGenre = (genre) => {
    const idx = selectedGenres.value.indexOf(genre);
    if (idx >= 0) selectedGenres.value.splice(idx, 1);
    else selectedGenres.value.push(genre);
  };

  const toggleLanguage = (code) => {
    const idx = selectedLanguages.value.indexOf(code);
    if (idx >= 0) {
      // Don't allow deselecting all — keep at least one
      if (selectedLanguages.value.length > 1) selectedLanguages.value.splice(idx, 1);
    } else {
      selectedLanguages.value.push(code);
    }
  };

  const addCustomGenre = (text) => {
    const g = text.trim().toLowerCase();
    if (!g || selectedGenres.value.includes(g)) return;
    selectedGenres.value.push(g);
  };

  // ── Reference playlist URLs ──────────────────────────────────────────────
  const addSeedPlaylistUrl = (url) => {
    const trimmed = url.trim();
    if (!trimmed || seedPlaylistUrls.value.includes(trimmed)) return;
    seedPlaylistUrls.value.push(trimmed);
  };

  const removeSeedPlaylistUrl = (index) => {
    seedPlaylistUrls.value.splice(index, 1);
  };

  // ── Reference artist URLs ─────────────────────────────────────────────
  const addSeedArtistUrl = (url) => {
    const trimmed = url.trim();
    if (!trimmed || seedArtistUrls.value.includes(trimmed)) return;
    const artistId = extractSpotifyArtistId(trimmed);
    if (!artistId) { alert('Invalid Spotify artist URL'); return; }
    seedArtistUrls.value.push(trimmed);
  };

  const removeSeedArtistUrl = (index) => {
    seedArtistUrls.value.splice(index, 1);
  };

  // ── Reference album URLs ──────────────────────────────────────────────
  const addSeedAlbumUrl = (url) => {
    const trimmed = url.trim();
    if (!trimmed || seedAlbumUrls.value.includes(trimmed)) return;
    const albumId = extractSpotifyAlbumId(trimmed);
    if (!albumId) { alert('Invalid Spotify album URL'); return; }
    seedAlbumUrls.value.push(trimmed);
  };

  const removeSeedAlbumUrl = (index) => {
    seedAlbumUrls.value.splice(index, 1);
  };

  // ── Generate playlist ─────────────────────────────────────────────────
  const generate = async () => {
    if (convertLoading.value) {
      error.value = 'A conversion is in progress — please wait for it to finish.';
      return;
    }
    error.value = '';
    generateLoading.value = true;
    bgStatus.value = 'Generating...';
    bgDone.value = false;
    _startProgress(generateProgress);

    // Own abort controller — doesn't cancel a running convert
    if (_generateAbort) _generateAbort.abort();
    _generateAbort = new AbortController();
    const signal = _generateAbort.signal;

    try {
      if (!API) throw new Error('API URL not configured');

      const body = {
        seedTrackIds: seedTracks.value.filter(t => !t.id.startsWith('yt_')).map(t => t.id),
        seedTrackMeta: seedTracks.value.map((t) => ({ name: t.name, artist: t.artist })),
        genres: selectedGenres.value,
        languages: selectedLanguages.value,
        limit: trackLimit.value,
      };

      // Extract artist IDs from artist URLs
      const seedArtistIds = [];
      for (const url of seedArtistUrls.value) {
        const artistId = extractSpotifyArtistId(url);
        if (artistId) seedArtistIds.push(artistId);
      }
      if (seedArtistIds.length) body.seedArtistIds = seedArtistIds;

      // Extract album IDs from album URLs
      const seedAlbumIds = [];
      for (const url of seedAlbumUrls.value) {
        const albumId = extractSpotifyAlbumId(url);
        if (albumId) seedAlbumIds.push(albumId);
      }
      if (seedAlbumIds.length) body.seedAlbumIds = seedAlbumIds;

      // If user pasted URL(s) — process each one
      const seedPlaylistIds = [];
      if (seedPlaylistUrls.value.length) {
        for (const url of seedPlaylistUrls.value) {
          const platform = detectPlatform(url);

          // ── Single track URL handling ──
          if (isSingleTrackUrl(url)) {
            if (platform === 'spotify') {
              const trackId = extractSpotifyTrackId(url);
              if (trackId) {
                try {
                  bgStatus.value = 'Fetching track info...';
                  const tRes = await fetch(`${API}/api/spotify/search?q=&trackId=${trackId}`, { headers: headers(), signal });
                  if (tRes.ok) {
                    const tData = await tRes.json();
                    const t = tData.track;
                    if (t) {
                      if (!body.seedTrackIds.includes(trackId)) body.seedTrackIds.push(trackId);
                      body.seedTrackMeta.push({ name: t.name, artist: t.artist || t.artists?.[0]?.name || '' });
                    }
                  }
                } catch (e) { if (e.name === 'AbortError') throw e; }
              }
            } else if (isYoutubePlatform(platform)) {
              const videoId = extractYoutubeVideoId(url);
              if (videoId) {
                try {
                  bgStatus.value = 'Fetching video info...';
                  const vRes = await fetch(`${API}/api/youtube/search?q=&videoId=${videoId}`, { headers: headers(), signal });
                  if (vRes.ok) {
                    const vData = await vRes.json();
                    const item = vData.item || vData.items?.[0];
                    if (item) {
                      let artist = (item.channelTitle || '')
                        .replace(/\s*-\s*topic$/i, '').replace(/\s*VEVO$/i, '')
                        .replace(/\s*Official$/i, '').replace(/\s*Music$/i, '')
                        .replace(/\s*Records$/i, '').trim();
                      let name = item.title || '';
                      const dash = name.match(/^(.+?)\s*[-–—]\s+(.+)$/);
                      if (dash) { name = dash[2].replace(/\s*[\(\[].*[\)\]]$/g, '').trim(); if (!artist) artist = dash[1].trim(); }
                      body.seedTrackMeta.push({ name, artist });
                    }
                  }
                } catch (e) { if (e.name === 'AbortError') throw e; }
              }
            }
          }
          // ── Playlist URL handling ──
          else if (platform === 'spotify') {
            const spId = extractSpotifyPlaylistId(url);
            if (spId) seedPlaylistIds.push(spId);
          } else if (isYoutubePlatform(platform)) {
            const ytId = extractYoutubePlaylistId(url);
            if (ytId) {
              try {
                bgStatus.value = 'Fetching playlist tracks...';
                const ytRes = await fetch(`${API}/api/youtube/playlist/${ytId}/tracks`, { headers: headers(), signal });
                const ytData = await ytRes.json();
                if (ytRes.ok && ytData.items?.length) {
                  // Sample more tracks when playlist is the only input
                  const isOnlyInput = !body.seedTrackIds.length && !body.genres.length;
                  const sampleSize = isOnlyInput ? Math.min(ytData.items.length, 20) : 10;
                  const sampled = ytData.items.sort(() => Math.random() - 0.5).slice(0, sampleSize);
                  const ytSeeds = sampled.map(t => {
                    // Clean YouTube channel names
                    let artist = (t.channelTitle || '')
                      .replace(/\s*-\s*topic$/i, '')
                      .replace(/\s*VEVO$/i, '')
                    .replace(/\s*Official$/i, '')
                    .replace(/\s*Music$/i, '')
                    .replace(/\s*Records$/i, '')
                    .trim();
                  let name = t.title || '';
                  // Try to extract artist from "Artist - Song" title pattern
                  const dash = name.match(/^(.+?)\s*[-–—]\s+(.+)$/);
                  if (dash) {
                    name = dash[2].replace(/\s*[\(\[].*[\)\]]$/g, '').trim();
                    if (!artist) artist = dash[1].trim();
                  }
                  return { name, artist };
                });
                body.seedTrackMeta = [...body.seedTrackMeta, ...ytSeeds];
                bgStatus.value = `Generating from ${ytSeeds.length} seed tracks...`;
              } else {
                throw new Error('Could not fetch playlist tracks — check the URL');
              }
            } catch (e) {
              if (e.name === 'AbortError') throw e;
              // If playlist is the only input and it failed, show error instead of proceeding empty
              if (!body.seedTrackIds.length && !body.genres.length && !body.seedTrackMeta.length) {
                throw e;
              }
            }
          }
        }
      }

      // Add seed playlist IDs if any were collected
      if (seedPlaylistIds.length) body.seedPlaylistIds = seedPlaylistIds;

      console.log('[Generate] Sending request:', { seedTrackIds: body.seedTrackIds?.length, seedTrackMeta: body.seedTrackMeta?.length, genres: body.genres, limit: body.limit, playlists: body.seedPlaylistIds?.length || 'none' });
      const genTimeout = setTimeout(() => { if (!signal.aborted) _generateAbort?.abort(); }, 360000);
      const res = await fetch(`${API}/api/spotify/generate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal,
      });
      clearTimeout(genTimeout);
      console.log('[Generate] Response status:', res.status);
      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try { const data = await res.json(); msg = data.message || msg; } catch { /* non-JSON response */ }
        console.error('[Generate] Server error:', msg);
        throw new Error(msg);
      }
      const data = await res.json();
      const spTracks = data.tracks || [];
      console.log('[Generate] Got', spTracks.length, 'tracks from backend');

      // Store Spotify results
      generateSpotifyResults.value = spTracks;

      // Always match to YouTube too (don't block on failure)
      let ytTracks = [];
      if (spTracks.length) {
        try {
          bgStatus.value = `Matching ${spTracks.length} tracks to YouTube...`;
          const matchBody = spTracks.map(t => ({ title: t.name, artist: t.artist }));
          const matchRes = await fetch(`${API}/api/youtube/match`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ tracks: matchBody }),
            signal,
          });
          if (matchRes.ok) {
            const matchData = await matchRes.json();
            ytTracks = (matchData.matches || [])
              .filter(m => m.bestMatch)
              .map(m => ({
                id:      m.bestMatch.videoId,
                name:    m.bestMatch.title,
                artist:  m.bestMatch.channelTitle,
                art:     m.bestMatch.thumbnail,
                url:     m.bestMatch.url,
                videoId: m.bestMatch.videoId,
                _source: 'youtube',
              }));
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          console.warn('[Generate] YouTube matching failed:', e.message);
        }
      }
      generateYoutubeResults.value = ytTracks;

      // Show whichever platform is currently selected
      const activeResults = generateTarget.value === 'youtube' ? ytTracks : spTracks;
      generatedTracks.value = activeResults.length ? activeResults : spTracks;
      generateResults.value = [...generatedTracks.value];
      resultTracks.value = [...generateResults.value];

      if (!spTracks.length) {
        error.value = 'No tracks found — try different inputs for better results';
        bgStatus.value = 'No results';
        _stopProgress(generateProgress, false);
      } else {
        const ytNote = ytTracks.length ? ` (${ytTracks.length} YouTube)` : '';
        bgStatus.value = `Done! ${spTracks.length} Spotify${ytNote}`;
        _stopProgress(generateProgress, true);
      }
      bgDone.value = true;
      _generateAbort = null;
      _persistResults();
    } catch (err) {
      _stopProgress(generateProgress, false);
      if (err.name === 'AbortError' && !isOpen.value) return;
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
    if (generateLoading.value) {
      error.value = 'A playlist is being generated — please wait for it to finish.';
      return;
    }
    error.value = '';
    convertLoading.value = true;
    bgStatus.value = 'Converting...';
    bgDone.value = false;
    matchedTracks.value = [];
    sourceTracks.value = [];
    _startProgress(convertProgress);

    // Own abort controller — doesn't cancel a running generate
    if (_convertAbort) _convertAbort.abort();
    _convertAbort = new AbortController();
    const signal = _convertAbort.signal;

    try {
      const platform = detectPlatform(convertUrl.value);
      if (!platform) throw new Error('Paste a valid YouTube, YouTube Music, or Spotify playlist URL');

      if (isYoutubePlatform(platform)) {
        convertDirection.value = 'yt-to-spotify';
        const plId = extractYoutubePlaylistId(convertUrl.value);
        if (!plId) throw new Error('Could not find playlist ID in URL');

        // Fetch YouTube tracks
        const ytTimeout = setTimeout(() => { if (!signal.aborted) _convertAbort?.abort(); }, 360000);
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
        _stopProgress(convertProgress, true);

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
          if (spRes.status === 403) {
            // Don't flag scopeMissing for spotify-to-yt — user doesn't need Spotify connected
            // Public playlists work via client credentials; 403 likely means private playlist
            msg = 'Could not access this playlist — it may be private. Try a public playlist URL.';
          }
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
          // On 429 (quota exhausted), still show the source tracks as unmatched
          // so the user can autofill later when quota resets
          if (matchRes.status === 429) {
            let msg = '';
            try { const d = await matchRes.json(); msg = d.message || ''; } catch {}
            matchedTracks.value = sourceTracks.value.map(t => ({
              source: t,
              bestMatch: null,
              confidence: 'none',
              alternatives: [],
            }));
            convertResults.value = [];
            resultTracks.value = [];
            error.value = msg || 'YouTube API quota exhausted — try autofilling later when quota resets';
            bgStatus.value = `0/${sourceTracks.value.length} matched (quota exhausted)`;
            bgDone.value = true;
            _stopProgress(convertProgress, true);
          } else {
            let msg = `Matching failed (${matchRes.status})`;
            try { const d = await matchRes.json(); msg = d.message || msg; } catch {}
            throw new Error(msg);
          }
        } else {
          const matchData = await matchRes.json();
          matchedTracks.value = matchData.matches || [];
          convertResults.value = matchedTracks.value
            .filter((m) => m.bestMatch)
            .map((m) => m.bestMatch);
          resultTracks.value = [...convertResults.value];
          const matched = matchedTracks.value.filter(m => m.confidence !== 'none').length;
          bgStatus.value = `Done! ${matched}/${matchedTracks.value.length} matched`;
          bgDone.value = true;
          _stopProgress(convertProgress, true);
          if (matchData.quotaExhausted) {
            error.value = 'YouTube API quota reached — some tracks could not be searched. Unmatched tracks can be autofilled later.';
          }
        }
      }
      _convertAbort = null;
      _persistResults();
    } catch (err) {
      _stopProgress(convertProgress, false);
      if (err.name === 'AbortError' && !isOpen.value) return;
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

  // Autofill — automatically search & fill all unmatched ("none") tracks
  const autofillUnmatched = async () => {
    const noneIndices = matchedTracks.value
      .map((m, i) => (m.confidence === 'none' ? i : -1))
      .filter(i => i >= 0);
    if (!noneIndices.length) return;

    autofillLoading.value = true;
    autofillProgress.value = `0/${noneIndices.length}`;
    const isYt = convertDirection.value === 'spotify-to-yt';
    let filled = 0;

    // Process one at a time with proper rate limit handling
    // YouTube search = 100 quota units each, so space them out more
    let delay = isYt ? 2500 : 1200;
    let consecutive429s = 0;
    for (let b = 0; b < noneIndices.length; b++) {
      const idx = noneIndices[b];
      const m = matchedTracks.value[idx];
      // Guard: index may be stale if list changed during async work
      if (!m || !m.source) {
        autofillProgress.value = `${b + 1}/${noneIndices.length}`;
        continue;
      }
      const q = [m.source.title, m.source.artist || m.source.channelTitle]
        .filter(Boolean).join(' ').trim();
      if (!q) { autofillProgress.value = `${b + 1}/${noneIndices.length}`; continue; }

      try {
        const endpoint = isYt
          ? `${API}/api/youtube/search?q=${encodeURIComponent(q)}&limit=5`
          : `${API}/api/spotify/search?q=${encodeURIComponent(q)}&limit=5`;

        let data = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch(endpoint, { headers: headers() });
          if (res.ok) {
            data = await res.json();
            consecutive429s = 0;
            // Gradually ease delay back down after sustained success, not instant reset
            if (delay > (isYt ? 2500 : 1200)) delay = Math.max(isYt ? 2500 : 1200, Math.floor(delay * 0.75));
            break;
          }
          if (res.status === 429) {
            consecutive429s++;
            // Parse retry-after: prefer header, then JSON body
            let retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
            if (!retryAfter) {
              try { const j = await res.json(); retryAfter = j.retryAfter || 0; } catch {}
            }
            // If quota exhausted (retryAfter > 300s), stop autofill entirely
            if (retryAfter > 300) {
              autofillProgress.value = `Stopped — API quota exhausted`;
              matchedTracks.value = [...matchedTracks.value];
              convertResults.value = matchedTracks.value.filter(m => m.bestMatch).map(m => m.bestMatch);
              resultTracks.value = [...convertResults.value];
              autofillLoading.value = false;
              _persistResults();
              return;
            }
            // Wait the FULL retry-after period (minimum 5s)
            const waitSecs = Math.max(retryAfter || 5, 5);
            autofillProgress.value = `${b + 1}/${noneIndices.length} (rate limited, waiting ${waitSecs}s)`;
            await new Promise(r => setTimeout(r, waitSecs * 1000));
            delay = Math.min(delay * 2, 15000); // back off future requests
            // After 5 consecutive 429s, give up — quota is likely gone
            if (consecutive429s >= 5) {
              autofillProgress.value = `Stopped — too many rate limits`;
              matchedTracks.value = [...matchedTracks.value];
              convertResults.value = matchedTracks.value.filter(m => m.bestMatch).map(m => m.bestMatch);
              resultTracks.value = [...convertResults.value];
              autofillLoading.value = false;
              _persistResults();
              return;
            }
            continue;
          }
          // Server error (500 = quota exhausted, etc) — retry once after delay
          if (attempt === 0 && res.status >= 500) {
            autofillProgress.value = `${b + 1}/${noneIndices.length} (retrying...)`;
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          break; // other errors — skip this track
        }
        if (!data) { autofillProgress.value = `${b + 1}/${noneIndices.length}`; continue; }

        let top = null;
        let sortedAlts = [];
        if (isYt) {
          const items = (data.items || []).map(t => {
            let score = 0;
            const raw = (t.title || '').toLowerCase();
            // Prefer explicit
            if (/\bexplicit\b/.test(raw) || /\(e\)/.test(raw)) score += 0.05;
            if (/\bclean\b/.test(raw) && !/clean\s*bandit/i.test(raw)) score -= 0.05;
            // Prefer audio/topic channels
            if (/\s-\s*topic$/i.test(t.channelTitle || '')) score += 0.10;
            else if (/official\s*audio/i.test(raw)) score += 0.08;
            else if (/\baudio\b/i.test(raw)) score += 0.06;
            // Penalize live
            if (/\b(live\s+(at|in|from|on|version|session|performance|recording)|[\(\[]live[\)\]]|- live\b|live$)/i.test(t.title || '')) score -= 0.10;
            // Penalize covers, remixes, etc.
            if (/\b(react|reaction|review|cover|tutorial|karaoke|instrumental|remix|concert|interview)\b/i.test(raw)) score -= 0.08;
            if (/\b(sped\s*up|slowed|reverb|8d|nightcore|bass\s*boost)/i.test(raw)) score -= 0.06;
            return { ...t, url: `https://www.youtube.com/watch?v=${t.videoId}`, _score: score };
          });
          items.sort((a, b) => b._score - a._score);
          if (items.length) { top = items[0]; sortedAlts = items.slice(1, 5); }
        } else {
          const tracks = (data.tracks || []).map(t => {
            let score = 0;
            // Prefer explicit
            if (t.explicit) score += 0.05;
            else score -= 0.02;
            // Penalize live
            const name = t.name || '';
            const album = t.album || '';
            if (/\b(live\s+(at|in|from|on|version|session|performance|recording)|[\(\[]live[\)\]]|- live\b|live$)/i.test(name)) score -= 0.10;
            else if (/\b(live\s+(at|in|from|on)|[\(\[]live[\)\]]|- live\b|live$)/i.test(album)) score -= 0.06;
            return { ...t, _score: score };
          });
          tracks.sort((a, b) => b._score - a._score);
          if (tracks.length) { top = tracks[0]; sortedAlts = tracks.slice(1, 5); }
        }

        if (top && matchedTracks.value[idx]) {
          matchedTracks.value[idx] = {
            ...matchedTracks.value[idx],
            bestMatch: top,
            confidence: 'autofill',
            alternatives: sortedAlts,
          };
          filled++;
        }
      } catch { /* skip failed searches */ }
      autofillProgress.value = `${b + 1}/${noneIndices.length}`;
      if (b < noneIndices.length - 1) await new Promise(r => setTimeout(r, delay));
    }

    // Force reactivity
    matchedTracks.value = [...matchedTracks.value];
    convertResults.value = matchedTracks.value
      .filter((m) => m.bestMatch)
      .map((m) => m.bestMatch);
    resultTracks.value = [...convertResults.value];

    autofillProgress.value = `Done! ${filled}/${noneIndices.length} filled`;
    autofillLoading.value = false;
    _persistResults();
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

  let _playlistsFetchPromise = null;
  const fetchUserPlaylists = async () => {
    // Dedup concurrent calls
    if (_playlistsFetchPromise) return _playlistsFetchPromise;
    playlistsLoading.value = true;
    _playlistsFetchPromise = (async () => {
      try {
        const res = await fetch(`${API}/api/spotify/playlists`, { headers: headers() });
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') || '3', 10);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          const res2 = await fetch(`${API}/api/spotify/playlists`, { headers: headers() });
          if (res2.ok) { const d = await res2.json(); userPlaylists.value = d.playlists || []; }
        } else if (!res.ok) {
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
      _playlistsFetchPromise = null;
    })();
    return _playlistsFetchPromise;
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

  // ── Suggest playlist name based on track vibes ─────────────────────────
  const suggestName = async () => {
    suggestingName.value = true;
    suggestedName.value = '';
    try {
      const tracks = generateSpotifyResults.value.length
        ? generateSpotifyResults.value
        : resultTracks.value;

      // Send track IDs — backend will fetch artist genres from Spotify
      const trackIds = tracks.map(t => {
        const uri = t.uri || '';
        return uri.replace('spotify:track:', '');
      }).filter(Boolean).slice(0, 50);

      const res = await fetch(`${API}/api/spotify/playlist-name`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ trackIds }),
      });
      if (res.ok) {
        const data = await res.json();
        suggestedName.value = data.name || '';
      }
    } catch { /* silent */ }
    suggestingName.value = false;
    return suggestedName.value;
  };

  // ── Suggest name for an existing playlist by ID ─────────────────────
  const suggestNameForPlaylist = async (playlistId) => {
    suggestingName.value = true;
    suggestedName.value = '';
    try {
      const res = await fetch(`${API}/api/spotify/playlist-name`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ playlistId }),
      });
      if (res.ok) {
        const data = await res.json();
        suggestedName.value = data.name || '';
      }
    } catch { /* silent */ }
    suggestingName.value = false;
    return suggestedName.value;
  };

  // ── Rename an existing Spotify playlist ────────────────────────────
  const renamingPlaylist = ref(false);
  const renamePlaylist = async (playlistId, newName) => {
    error.value = '';
    renamingPlaylist.value = true;
    try {
      const res = await fetch(`${API}/api/spotify/playlist/${playlistId}/rename`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) { error.value = 'Reconnect Spotify to rename playlists'; scopeMissing.value = true; }
        else error.value = data.message || 'Failed to rename';
        renamingPlaylist.value = false;
        return false;
      }
      renamingPlaylist.value = false;
      return true;
    } catch {
      error.value = 'Failed to rename playlist';
      renamingPlaylist.value = false;
      return false;
    }
  };

  // ── Save to Spotify ───────────────────────────────────────────────────
  const saveToSpotify = async (name) => {
    error.value = '';
    scopeMissing.value = false;
    saving.value = true;
    saveResult.value = null;
    try {
      // Use Spotify results directly (not resultTracks which may show YouTube view)
      const spTracks = generateSpotifyResults.value.length
        ? generateSpotifyResults.value
        : resultTracks.value;
      const uris = spTracks
        .map((t) => t.uri)
        .filter(Boolean);
      if (!uris.length) throw new Error('No Spotify tracks to save');

      const saveController = new AbortController();
      const saveTimeout = setTimeout(() => saveController.abort(), 120000);
      const doSave = async () => {
        const r = await fetch(`${API}/api/spotify/playlist`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ name, trackUris: uris }),
          signal: saveController.signal,
        });
        return r;
      };
      let res = await doSave();
      clearTimeout(saveTimeout);
      // Auto-retry once on 429
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('retry-after') || '4', 10);
        await new Promise(r => setTimeout(r, wait * 1000));
        res = await doSave();
      }
      if (!res.ok) {
        let msg = 'Failed to save playlist';
        let isScopeProblem = false;
        try {
          const data = await res.json();
          msg = data.message || msg;
          if (data.error === 'scope_missing') isScopeProblem = true;
        } catch { /* non-JSON */ }
        if (res.status === 403 || res.status === 404) isScopeProblem = true;
        if (res.status === 429) msg = 'Spotify rate limited — wait a moment and try again';
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

  // ── YouTube save ─────────────────────────────────────────────────────────
  const ytSaving          = ref(false);
  const ytSaveResult      = ref(null);  // { playlistUrl, name, added, total }
  const ytUserPlaylists   = ref([]);
  const ytPlaylistsLoading = ref(false);
  const ytScopeMissing    = ref(false);

  const fetchUserYouTubePlaylists = async () => {
    ytPlaylistsLoading.value = true;
    try {
      const res = await fetch(`${API}/api/youtube/playlists`, { headers: headers() });
      if (!res.ok) {
        if (res.status === 404 || res.status === 401) ytScopeMissing.value = true;
        ytUserPlaylists.value = [];
      } else {
        const data = await res.json();
        ytUserPlaylists.value = data.playlists || [];
      }
    } catch { ytUserPlaylists.value = []; }
    ytPlaylistsLoading.value = false;
  };

  const saveToYouTube = async (name) => {
    error.value = '';
    ytScopeMissing.value = false;
    ytSaving.value = true;
    ytSaveResult.value = null;
    try {
      // Use YouTube results directly (not resultTracks which may show Spotify view)
      const ytTracks = generateYoutubeResults.value.length
        ? generateYoutubeResults.value
        : resultTracks.value;
      const videoIds = ytTracks
        .map(t => (t.videoId || t.id || '').trim())
        .filter(v => v.length > 0);
      if (!videoIds.length) throw new Error('No YouTube videos to save');
      console.log(`[YT Save] Sending ${videoIds.length} videoIds (from ${ytTracks.length} result tracks)`);

      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 300000); // 5min for large playlists
      const res = await fetch(`${API}/api/youtube/playlist`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name, videoIds }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (!res.ok) {
        let msg = 'Failed to save playlist';
        try {
          const data = await res.json();
          msg = data.message || msg;
        } catch {}
        if (res.status === 404 || res.status === 401) {
          ytScopeMissing.value = true;
          msg = 'Connect YouTube to save playlists';
        }
        throw new Error(msg);
      }
      const data = await res.json();
      ytSaveResult.value = data;
    } catch (err) {
      error.value = err.message;
    }
    ytSaving.value = false;
  };

  const addToExistingYouTubePlaylist = async (playlistId) => {
    error.value = '';
    ytSaving.value = true;
    try {
      const videoIds = resultTracks.value
        .map(t => (t.videoId || t.id || '').trim())
        .filter(v => v.length > 0);
      if (!videoIds.length) throw new Error('No videos to add');

      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 300000);
      const res = await fetch(`${API}/api/youtube/playlist/${playlistId}/add`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ videoIds }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (!res.ok) {
        let msg = 'Failed to add videos';
        try { const data = await res.json(); msg = data.message || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const pl = ytUserPlaylists.value.find(p => p.id === playlistId);
      ytSaveResult.value = {
        playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
        name: pl?.name || 'Playlist',
        added: data.added,
        total: data.total,
      };
    } catch (err) {
      error.value = err.message;
    }
    ytSaving.value = false;
  };

  // ── Persist state before Spotify reconnect redirect ─────────────────────
  const STORAGE_KEY = 'pt_saved_state';

  const saveState = () => {
    try {
      const state = {
        activeTab: activeTab.value,
        seedTracks: seedTracks.value,
        seedPlaylistUrls: seedPlaylistUrls.value,
        selectedGenres: selectedGenres.value,
        trackLimit: trackLimit.value,
        generatedTracks: generatedTracks.value,
        generateResults: generateResults.value,
        generateSpotifyResults: generateSpotifyResults.value,
        generateYoutubeResults: generateYoutubeResults.value,
        generateTarget: generateTarget.value,
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
      seedPlaylistUrls.value = state.seedPlaylistUrls || [];
      selectedGenres.value = state.selectedGenres || [];
      trackLimit.value = state.trackLimit || 30;
      generatedTracks.value = state.generatedTracks || [];
      generateResults.value = state.generateResults || [];
      generateSpotifyResults.value = state.generateSpotifyResults || [];
      generateYoutubeResults.value = state.generateYoutubeResults || [];
      generateTarget.value = state.generateTarget || 'spotify';
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
    seedTracks, seedPlaylistUrls, seedArtistUrls, seedAlbumUrls, selectedGenres, trackLimit,
    generatedTracks, generateLoading, generateTarget, generateProgress,
    generateSpotifyResults, generateYoutubeResults,
    convertUrl, convertDirection, sourceTracks, matchedTracks, convertLoading, convertProgress,
    resultTracks, saving, saveResult, error, scopeMissing,
    searchQuery, searchResults, searchLoading, searchError,
    autofillLoading, autofillProgress,
    GENRES, GENRE_CATEGORIES, genreFilter,
    LANGUAGE_OPTIONS, selectedLanguages,

    likedIds, userPlaylists, playlistsLoading,
    ytSaving, ytSaveResult, ytUserPlaylists, ytPlaylistsLoading, ytScopeMissing,
    suggestedName, suggestingName, renamingPlaylist,

    // Methods
    open, close, minimize, reset, setTab, setGenerateTarget,
    searchSeeds, addSeed, removeSeed, toggleGenre, addCustomGenre, toggleLanguage,
    addSeedPlaylistUrl, removeSeedPlaylistUrl,
    addSeedArtistUrl, removeSeedArtistUrl,
    addSeedAlbumUrl, removeSeedAlbumUrl,
    generate, cancelGenerate, startConvert, cancelConvert,
    swapMatch, autofillUnmatched, removeResult,
    likeTrack, fetchUserPlaylists, addToExistingPlaylist,
    saveToSpotify, suggestName, suggestNameForPlaylist, renamePlaylist,
    saveState, restoreState,
    saveToYouTube, addToExistingYouTubePlaylist, fetchUserYouTubePlaylists,
  };
}
