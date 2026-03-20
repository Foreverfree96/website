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
const seedPlaylistUrl = ref('');
const selectedGenres  = ref([]);
const trackLimit      = ref(30);
const generatedTracks = ref([]);
const generateLoading = ref(false);
const generateTarget  = ref('spotify'); // 'spotify' | 'youtube'

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
  // Reject track/album/artist URLs — only accept playlist URLs
  if (/\/(track|album|artist)\//.test(url)) return null;
  const m = url.match(/(?:playlist\/|spotify:playlist:)([a-zA-Z0-9]+)/);
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
    seedPlaylistUrl.value = '';
    selectedGenres.value = [];
    trackLimit.value = 30;
    generatedTracks.value = [];
    generateResults.value = [];
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

      console.log('[Generate] Sending request:', { seedTrackIds: body.seedTrackIds?.length, seedTrackMeta: body.seedTrackMeta?.length, genres: body.genres, limit: body.limit, playlist: body.seedPlaylistId || 'none' });
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

      if (generateTarget.value === 'youtube' && spTracks.length) {
        // Match Spotify recommendations to YouTube
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
          const ytTracks = (matchData.matches || [])
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
          generatedTracks.value = ytTracks;
        } else {
          // Fallback: still show Spotify results
          generatedTracks.value = spTracks;
        }
      } else {
        generatedTracks.value = spTracks;
      }

      generateResults.value = [...generatedTracks.value];
      resultTracks.value = [...generateResults.value];
      if (!generatedTracks.value.length) {
        error.value = 'No tracks found — try different inputs for better results';
        bgStatus.value = 'No results';
        _stopProgress(generateProgress, false);
      } else {
        bgStatus.value = `Done! ${generatedTracks.value.length} tracks`;
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
        _stopProgress(convertProgress, true);
        if (matchData.quotaExhausted) {
          error.value = 'YouTube API quota reached — some tracks could not be searched. Unmatched tracks can be autofilled later.';
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

    // Process one at a time — wait out rate limits instead of giving up
    let delay = 800; // start with 800ms between requests
    for (let b = 0; b < noneIndices.length; b++) {
      const idx = noneIndices[b];
      const m = matchedTracks.value[idx];
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
            delay = 800; // reset delay on success
            break;
          }
          if (res.status === 429) {
            // Parse retry-after from header or JSON body
            let retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
            if (!retryAfter) {
              try { const j = await res.json(); retryAfter = j.retryAfter || 0; } catch {}
            }
            const waitMs = Math.max(retryAfter * 1000, delay * (attempt + 2));
            autofillProgress.value = `${b + 1}/${noneIndices.length} (waiting ${Math.round(waitMs / 1000)}s)`;
            await new Promise(r => setTimeout(r, waitMs));
            delay = Math.min(delay * 1.5, 5000); // slow down future requests
            continue;
          }
          break; // other errors — skip this track
        }
        if (!data) { autofillProgress.value = `${b + 1}/${noneIndices.length}`; continue; }

        let top = null;
        if (isYt) {
          const items = data.items || [];
          if (items.length) top = { ...items[0], url: `https://www.youtube.com/watch?v=${items[0].videoId}` };
        } else {
          const tracks = data.tracks || [];
          if (tracks.length) top = tracks[0];
        }

        if (top) {
          matchedTracks.value[idx] = {
            ...matchedTracks.value[idx],
            bestMatch: top,
            confidence: 'autofill',
            alternatives: isYt
              ? (data.items || []).slice(1, 5).map(t => ({ ...t, url: `https://www.youtube.com/watch?v=${t.videoId}` }))
              : (data.tracks || []).slice(1, 5),
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
    generatedTracks, generateLoading, generateTarget, generateProgress,
    convertUrl, convertDirection, sourceTracks, matchedTracks, convertLoading, convertProgress,
    resultTracks, saving, saveResult, error, scopeMissing,
    searchQuery, searchResults, searchLoading, searchError,
    autofillLoading, autofillProgress,
    GENRES, GENRE_CATEGORIES, genreFilter,

    likedIds, userPlaylists, playlistsLoading,

    // Methods
    open, close, minimize, reset, setTab,
    searchSeeds, addSeed, removeSeed, toggleGenre, addCustomGenre,
    generate, cancelGenerate, startConvert, cancelConvert,
    swapMatch, autofillUnmatched, removeResult,
    likeTrack, fetchUserPlaylists, addToExistingPlaylist,
    saveToSpotify, saveState, restoreState,
  };
}
