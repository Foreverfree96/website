// =============================================================================
// useSpotifySDK.js — Singleton Spotify Web Playback SDK composable
//
// ONE Spotify.Player lives at module scope for the entire app session.
// Components never create/destroy players — they call play(url) and the
// composable either creates the player (first time) or switches context
// via Spotify REST API (subsequent calls). No handoff, no step-down, no races.
// =============================================================================

import { ref, computed } from 'vue';

const API = import.meta.env.VITE_API_URL;

// ── Shared cross-instance state (window) ─────────────────────────────────────
if (!window._sp) window._sp = {
  tokenCache:           null,
  tokenFetchPromise:    null,
  oauthRedirecting:     false,
  reconnectAttempted:   false,
  userDisconnected:     false,
  fetchingPlaylists:    new Map(),
  playlistBackoffUntil: 0,
};
const _w = window._sp;

// ── Persisted prefs ──────────────────────────────────────────────────────────
const _savedVol     = parseFloat(localStorage.getItem('sp_volume') ?? '70');
const _savedShuffle = localStorage.getItem('sp_shuffle') === 'true';

// ── Singleton non-reactive state ─────────────────────────────────────────────
let player            = null;
let deviceId          = null;
let token             = null;
let ticker            = null;
let tokenRefresher    = null;
let posSaver          = null;
let connectTimeout    = null;
let firstStateReceived = false;
let fullTracksFetched  = false;
let _pendingPlay       = null; // { mediaUrl, isPlaylist, startPosition, startTrackUri }
let _isPlaylist        = false; // tracks whether current URL is a playlist
let _wakeLock          = null; // Screen Wake Lock to prevent sleep during playback

// ── Singleton reactive state ─────────────────────────────────────────────────
const sdkState        = ref('idle');
const statusMsg       = ref('');
const paused          = ref(true);
const position        = ref(0);
const duration        = ref(0);
const volume          = ref(_savedVol);
const muted           = ref(false);
const shuffleOn       = ref(_savedShuffle);
const track           = ref({ name: '', artist: '', album: '', art: '' });
const currentTrackUri = ref('');
const currentMediaUrl = ref('');
const playlistTracks  = ref([]);
const listOpen        = ref(true);
const needsReconnect  = ref(false);
let _reconnectDismissed = false; // once dismissed, don't re-trigger this session
const playlistMeta    = ref({ name: '', owner: '' });

// ── Computed ─────────────────────────────────────────────────────────────────
const progressPct    = computed(() => duration.value > 0 ? Math.min(100, (position.value / duration.value) * 100) : 0);
const displayVolume  = computed(() => muted.value ? 0 : volume.value);
const spotifyConnectUrl = computed(() => {
  const jwt = localStorage.getItem('jwtToken');
  const returnTo = encodeURIComponent(window.location.href);
  return `${API}/api/spotify/login?token=${jwt}&returnTo=${returnTo}`;
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMs = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── Wake Lock (prevent screen sleep during playback) ──────────────────────
const acquireWakeLock = async () => {
  if (_wakeLock || !('wakeLock' in navigator)) return;
  try { _wakeLock = await navigator.wakeLock.request('screen'); }
  catch { /* permission denied or not supported */ }
};
const releaseWakeLock = () => {
  if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }
};
// Re-acquire wake lock when tab becomes visible again (lock auto-releases on hide)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !paused.value && !_wakeLock) acquireWakeLock();
  });
}

const getSpotifyUri = (url) => {
  const m = url.match(/open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
};

const spotifyFetch = (method, path, body) =>
  fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── Token ────────────────────────────────────────────────────────────────────
const fetchToken = async () => {
  const jwt = localStorage.getItem('jwtToken');
  if (!jwt) return { needsConnect: true };

  if (_w.tokenCache && Date.now() < _w.tokenCache.expiresAt - 5 * 60 * 1000) {
    return { token: _w.tokenCache.token };
  }

  if (_w.tokenFetchPromise) return _w.tokenFetchPromise;

  _w.tokenFetchPromise = (async () => {
    try {
      const res = await fetch(`${API}/api/spotify/token`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.status === 403 || res.status === 404) return { needsConnect: true };
      if (!res.ok) return { unavailable: true };
      const data = await res.json();
      const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 55 * 60 * 1000;
      _w.tokenCache = { token: data.accessToken, expiresAt };
      if (!localStorage.getItem('sp_oauth_done')) localStorage.setItem('sp_oauth_done', '1');
      return { token: data.accessToken };
    } finally {
      _w.tokenFetchPromise = null;
    }
  })();

  return _w.tokenFetchPromise;
};

// ── SDK loader ───────────────────────────────────────────────────────────────
const loadSDK = () => new Promise((resolve, reject) => {
  if (window.Spotify?.Player) { resolve(); return; }
  const timer = setTimeout(() => reject(new Error('SDK load timeout')), 8000);
  const prev = window.onSpotifyWebPlaybackSDKReady;
  window.onSpotifyWebPlaybackSDKReady = () => {
    clearTimeout(timer);
    prev?.();
    resolve();
  };
  if (!document.querySelector('script[src*="spotify-player"]')) {
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = () => { clearTimeout(timer); reject(new Error('SDK load failed')); };
    document.head.appendChild(s);
  }
});

// ── Wait for device in Spotify's Connect list ────────────────────────────────
const waitForDevice = async (maxWaitMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 3000);
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if ((data.devices || []).some(d => d.id === deviceId)) return true;
      }
    } catch { /* keep polling */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
};

// ── Track cache helpers ──────────────────────────────────────────────────────
const TRACK_CACHE_TTL = 24 * 60 * 60 * 1000;

const _playlistCacheKey = (url) => {
  const m = url.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/);
  return m ? `sp_tracks_${m[2]}` : null;
};

const loadCachedTracks = (url) => {
  try {
    const key = _playlistCacheKey(url);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { tracks, savedAt, full } = JSON.parse(raw);
    if (Date.now() - savedAt > TRACK_CACHE_TTL) { localStorage.removeItem(key); return null; }
    if (tracks.length < 2) { localStorage.removeItem(key); return null; }
    return { tracks, full: !!full };
  } catch { return null; }
};

const saveCachedTracks = (url, tracks, full = false) => {
  try {
    const key = _playlistCacheKey(url);
    if (key) localStorage.setItem(key, JSON.stringify({ tracks, savedAt: Date.now(), full }));
  } catch { /* localStorage full */ }
};

// ── Position cache helpers ───────────────────────────────────────────────────
const _posCacheKey = (url) => {
  const m = url.match(/open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/);
  return m ? `sp_pos_${m[2]}` : null;
};

const loadSavedPosition = (url) => {
  try {
    const key = _posCacheKey(url);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { trackUri, positionMs, paused: wasPaused, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem(key); return null; }
    return { trackUri, positionMs, paused: wasPaused };
  } catch { return null; }
};

const saveCurrentPosition = () => {
  try {
    const key = _posCacheKey(currentMediaUrl.value);
    if (!key || !currentTrackUri.value) return;
    localStorage.setItem(key, JSON.stringify({
      trackUri:   currentTrackUri.value,
      positionMs: position.value,
      paused:     paused.value,
      savedAt:    Date.now(),
    }));
  } catch { /* ignore */ }
};

// ── Ticker ───────────────────────────────────────────────────────────────────
const startTicker = () => {
  if (ticker) return;
  ticker = setInterval(() => {
    if (!paused.value && duration.value > 0)
      position.value = Math.min(position.value + 500, duration.value);
  }, 500);
};
const stopTicker = () => { clearInterval(ticker); ticker = null; };

// ── Fetch playlist tracks ────────────────────────────────────────────────────
const fetchPlaylistTracks = async (mediaUrl) => {
  const url = mediaUrl || currentMediaUrl.value;
  const playlistMatch = url.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  const albumMatch    = url.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/);
  if (!playlistMatch && !albumMatch) return;

  const isAlbum = !!albumMatch;
  const id      = (playlistMatch ?? albumMatch)[1];
  const cacheKey = `${isAlbum ? 'album' : 'playlist'}:${id}`;

  const applyTracks = (tracks) => {
    if (!tracks?.length) return false;
    // Don't apply if we've switched to a different URL since the fetch started
    if (currentMediaUrl.value !== url) return false;
    playlistTracks.value = tracks;
    fullTracksFetched = true;
    saveCachedTracks(url, tracks, true);
    localStorage.setItem('sp_playlist_ok', '1');
    _w.reconnectAttempted = true;
    needsReconnect.value = false;
    if (!currentTrackUri.value) {
      const t = tracks[0];
      if (t) track.value = { name: t.name, artist: t.artist, album: '', art: t.art };
    }
    return true;
  };

  if (_w.fetchingPlaylists.has(cacheKey)) {
    try { const tracks = await _w.fetchingPlaylists.get(cacheKey); applyTracks(tracks); }
    catch { /* ignore */ }
    return;
  }

  const parsePlaylist = (data) =>
    (data.items || [])
      .filter(item => item?.track?.uri)
      .map((item, index) => ({
        name: item.track.name || '', uri: item.track.uri,
        artist: item.track.artists?.map(a => a.name).join(', ') || '',
        duration: item.track.duration_ms || 0,
        art: item.track.album?.images?.[0]?.url || '', index,
      }));

  const parseAlbum = (data, art) =>
    (data.items || [])
      .filter(item => item?.uri)
      .map((item, index) => ({
        name: item.name || '', uri: item.uri,
        artist: item.artists?.map(a => a.name).join(', ') || '',
        duration: item.duration_ms || 0, art, index,
      }));

  // Track playlists that got 403 — don't retry these (scope issue, not transient)
  if (!_w._forbidden) _w._forbidden = new Set();
  if (_w._forbidden.has(cacheKey)) {
    if (!_reconnectDismissed && !_w.reconnectAttempted && !localStorage.getItem('sp_playlist_ok')) needsReconnect.value = true;
    return;
  }

  let got403 = false;

  const doFetch = async () => {
    if (isAlbum) {
      if (!token) return null;
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const arRes = await fetch(`https://api.spotify.com/v1/albums/${id}`, { headers }).catch(() => null);
        const albumArt = arRes?.ok ? (await arRes.json()).images?.[0]?.url || '' : '';
        let allItems = [];
        let nextUrl = `https://api.spotify.com/v1/albums/${id}/tracks?limit=50`;
        while (nextUrl) {
          const trRes = await fetch(nextUrl, { headers });
          if (!trRes.ok) break;
          const data = await trRes.json();
          allItems = allItems.concat(data.items || []);
          nextUrl = data.next || null;
        }
        if (allItems.length) {
          const tracks = parseAlbum({ items: allItems }, albumArt);
          if (tracks.length) return tracks;
        }
      } catch { /* ignore */ }
      return null;
    }

    if (Date.now() < _w.playlistBackoffUntil) return null;
    const jwt = localStorage.getItem('jwtToken');
    if (jwt) {
      try {
        const res = await fetch(`${API}/api/spotify/playlist/${id}/tracks`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (res.ok) {
          const data = await res.json();
          const tracks = parsePlaylist(data);
          if (tracks.length) return tracks;
        }
        if (res.status === 403) got403 = true;
        if (res.status === 429) _w.playlistBackoffUntil = Date.now() + 60 * 1000;
      } catch (e) {
        console.error('Playlist tracks fetch failed:', e.message);
      }
    }
    // Fallback: try direct Spotify API with user token (skip if backend already 403'd — same token)
    if (token && !got403) {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        let allItems = [];
        let nextUrl = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;
        while (nextUrl) {
          const r = await fetch(nextUrl, { headers });
          if (!r.ok) { if (r.status === 403) got403 = true; break; }
          const data = await r.json();
          allItems = allItems.concat((data.items || []).filter(item => item?.track?.uri));
          nextUrl = data.next || null;
        }
        if (allItems.length) {
          return allItems.map((item, index) => ({
            name: item.track.name || '', uri: item.track.uri,
            artist: item.track.artists?.map(a => a.name).join(', ') || '',
            duration: item.track.duration_ms || 0,
            art: item.track.album?.images?.[0]?.url || '', index,
          }));
        }
      } catch { /* fallback failed */ }
    }
    return null;
  };

  const promise = doFetch();
  _w.fetchingPlaylists.set(cacheKey, promise);
  try {
    const tracks = await promise;
    _w.fetchingPlaylists.delete(cacheKey);
    if (applyTracks(tracks)) return;
    // If 403, mark as forbidden — don't retry
    if (got403) {
      _w._forbidden.add(cacheKey);
      if (!_reconnectDismissed && !_w.reconnectAttempted) needsReconnect.value = true;
      return;
    }
    // Retry once after 3s only for non-403 failures
    setTimeout(async () => {
      if (fullTracksFetched) return;
      if (currentMediaUrl.value !== url) return;
      const retry = await doFetch();
      if (applyTracks(retry)) return;
      if (got403) { _w._forbidden.add(cacheKey); if (!_reconnectDismissed && !_w.reconnectAttempted) needsReconnect.value = true; return; }
      if (!_reconnectDismissed && !_w.reconnectAttempted && !localStorage.getItem('sp_playlist_ok')) needsReconnect.value = true;
    }, 3000);
  } catch {
    _w.fetchingPlaylists.delete(cacheKey);
    if (got403) { _w._forbidden.add(cacheKey); if (!_reconnectDismissed && !_w.reconnectAttempted) needsReconnect.value = true; return; }
    if (!_reconnectDismissed && !_w.reconnectAttempted && !localStorage.getItem('sp_playlist_ok')) needsReconnect.value = true;
  }
};

// ── Start playback on existing device ────────────────────────────────────────
const startPlayback = async (mediaUrl, opts = {}) => {
  const { startPosition = 0, startTrackUri = '', isPlaylist = false, waitForDev = true } = opts;
  const uri = getSpotifyUri(mediaUrl);
  if (!uri) return;

  if (waitForDev) {
    const found = await waitForDevice();
    if (!found) { sdkState.value = 'unavailable'; return; }
  }

  const isTrack  = uri.startsWith('spotify:track:');
  const offset   = startTrackUri ? { uri: startTrackUri } : { position: 0 };
  const body     = isTrack
    ? { uris: [uri], position_ms: startPosition }
    : { context_uri: uri, offset, position_ms: startPosition };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`, body);
      if (res.ok || res.status === 204) break;
      if ((res.status === 404 || res.status === 503) && attempt < 2) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      break;
    } catch {
      if (attempt < 2) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }

  // Restore saved shuffle preference (defaults to off for first-time users)
  await spotifyFetch('PUT', `/me/player/shuffle?state=${_savedShuffle}&device_id=${deviceId}`).catch(() => {});
  shuffleOn.value = _savedShuffle;
};

// ── SDK event handlers (attached ONCE, never re-attached) ────────────────────
const onReady = async ({ device_id }) => {
  deviceId = device_id;
  clearTimeout(connectTimeout);
  sdkState.value = 'ready';

  // Start pending playback if any
  if (_pendingPlay) {
    const pp = _pendingPlay;
    _pendingPlay = null;
    await startPlayback(pp.mediaUrl, {
      startPosition: pp.startPosition,
      startTrackUri: pp.startTrackUri,
      isPlaylist:    pp.isPlaylist,
      waitForDev:    true,
    });
  } else if (_pendingUris) {
    const pu = _pendingUris;
    _pendingUris = null;
    const found = await waitForDevice();
    if (found) {
      const body = { uris: pu.uris };
      if (pu.startTrackUri) body.offset = { uri: pu.startTrackUri };
      if (pu.startPosition > 0) body.position_ms = pu.startPosition;
      await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`, body).catch(() => {});
    }
  }

  // Start token refresher
  clearInterval(tokenRefresher);
  tokenRefresher = setInterval(async () => {
    _w.tokenCache = null;
    const result = await fetchToken();
    if (result.token) token = result.token;
  }, 45 * 60 * 1000);
};

const onStateChanged = (s) => {
  if (!s) return;
  firstStateReceived = true;

  paused.value    = s.paused;
  position.value  = s.position;
  duration.value  = s.duration;
  shuffleOn.value = s.shuffle;

  const t = s.track_window?.current_track;
  if (t) {
    currentTrackUri.value = t.uri;
    track.value = {
      name:   t.name,
      artist: t.artists?.map(a => a.name).join(', ') || '',
      album:  t.album?.name || '',
      art:    t.album?.images?.[0]?.url || '',
    };
  }

  // Update Media Session for lock screen / background audio controls
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:   track.value.name,
      artist:  track.value.artist,
      album:   track.value.album,
      artwork: track.value.art
        ? [{ src: track.value.art, sizes: '300x300', type: 'image/jpeg' }]
        : [],
    });
    navigator.mediaSession.playbackState = s.paused ? 'paused' : 'playing';
  }

  // Wake lock: acquire while playing, release when paused
  if (!s.paused) acquireWakeLock();
  else releaseWakeLock();

  // SDK track_window merge — grow tracklist as user listens
  const expectedUri = getSpotifyUri(currentMediaUrl.value);
  const contextMatch = expectedUri ? (s.context?.uri === expectedUri) : true;
  if (_isPlaylist && s.track_window && !fullTracksFetched && expectedUri && contextMatch) {
    const windowTracks = [
      ...(s.track_window.previous_tracks || []),
      ...(t ? [t] : []),
      ...(s.track_window.next_tracks || []),
    ].filter(Boolean).map(tr => ({
      name: tr.name || '', uri: tr.uri,
      artist: tr.artists?.map(a => a.name).join(', ') || '',
      duration: tr.duration_ms || 0,
      art: tr.album?.images?.[0]?.url || '',
    }));

    if (windowTracks.length) {
      const existing    = playlistTracks.value;
      const existingMap = new Map(existing.map(tr => [tr.uri, tr]));
      windowTracks.forEach(tr => {
        const prev = existingMap.get(tr.uri);
        existingMap.set(tr.uri, (prev?.index != null && tr.index == null) ? { ...tr, index: prev.index } : tr);
      });
      const merged = Array.from(existingMap.values());
      if (existing.length < 5 || !existing.length) {
        playlistTracks.value = merged;
      } else {
        const curIdx = existing.findIndex(tr => tr.uri === t?.uri);
        const newEntries = windowTracks.filter(tr => !existing.some(e => e.uri === tr.uri));
        if (newEntries.length) {
          const insertAt = curIdx >= 0 ? curIdx : existing.length;
          const updated = [...existing];
          updated.splice(insertAt, 0, ...newEntries);
          playlistTracks.value = updated;
        }
      }
    }
  }

  // If playlist is playing but we still have very few tracks, re-fetch (but not if 403'd)
  if (_isPlaylist && !fullTracksFetched && playlistTracks.value.length < 10 && currentMediaUrl.value) {
    const plMatch = currentMediaUrl.value.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/);
    const ck = plMatch ? `${plMatch[1]}:${plMatch[2]}` : null;
    const isForbidden = ck && _w._forbidden?.has(ck);
    if (!isForbidden && !_w._retryScheduled) {
      _w._retryScheduled = true;
      setTimeout(() => {
        _w._retryScheduled = false;
        if (!fullTracksFetched && playlistTracks.value.length < 10) {
          fetchPlaylistTracks(currentMediaUrl.value);
        }
      }, 2000);
    }
  }

  if (!s.paused) {
    startTicker();
    if (!posSaver) posSaver = setInterval(saveCurrentPosition, 5000);
  } else {
    stopTicker();
    clearInterval(posSaver); posSaver = null;
    saveCurrentPosition();
  }
};

const onNotReady = () => {
  if (sdkState.value === 'ready') sdkState.value = 'connecting';
};

// ── Create player (called once, ever) ────────────────────────────────────────
const createPlayer = async () => {
  sdkState.value = 'connecting';
  statusMsg.value = 'Connecting...';

  clearTimeout(connectTimeout);
  connectTimeout = setTimeout(() => {
    if (sdkState.value !== 'ready') sdkState.value = 'unavailable';
  }, 15000);

  player = new window.Spotify.Player({
    name: 'Site Player',
    getOAuthToken: async (cb) => {
      const result = await fetchToken();
      if (result.token) { token = result.token; cb(result.token); }
    },
    volume: volume.value / 100,
  });

  player.addListener('ready', onReady);
  player.addListener('player_state_changed', onStateChanged);
  player.addListener('not_ready', onNotReady);
  player.addListener('initialization_error', () => { clearTimeout(connectTimeout); sdkState.value = 'unavailable'; });
  player.addListener('authentication_error', () => {
    if (sdkState.value !== 'ready') { clearTimeout(connectTimeout); sdkState.value = 'unavailable'; }
  });
  player.addListener('account_error', () => {
    if (sdkState.value !== 'ready') {
      clearTimeout(connectTimeout);
      if (_w.userDisconnected) { sdkState.value = 'needs-connect'; return; }
      const alreadyConnected = localStorage.getItem('sp_oauth_done') || sessionStorage.getItem('sp_oauth_done') || localStorage.getItem('sp_playlist_ok');
      if (alreadyConnected) { sdkState.value = 'unavailable'; return; }
      const jwt = localStorage.getItem('jwtToken');
      if (jwt && !_w.oauthRedirecting) { _w.oauthRedirecting = true; window.location.href = spotifyConnectUrl.value; return; }
      sdkState.value = 'needs-connect';
    }
  });

  await player.connect();

  // Register Media Session action handlers for lock screen / notification area controls
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play',          () => player?.resume());
    navigator.mediaSession.setActionHandler('pause',         () => player?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prev());
    navigator.mediaSession.setActionHandler('nexttrack',     () => next());
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) seek(d.seekTime * 1000);
    });
  }
};

// ── Core: play(url, opts) ────────────────────────────────────────────────────
const play = async (mediaUrl, opts = {}) => {
  const { isPlaylist = false, autoPlay = true, startPosition = 0, startTrackUri = '' } = opts;

  if (!window.isSecureContext) { sdkState.value = 'unavailable'; return; }

  // Process OAuth return if needed
  const route = new URL(window.location.href);
  if (route.searchParams.get('spotify') === 'connected') {
    _w.tokenCache = null;
    _w.tokenFetchPromise = null;
    _w.reconnectAttempted = true;
    _w.oauthRedirecting = false;
    _w.userDisconnected = false;
    if (_w._forbidden) _w._forbidden.clear(); // clear 403 cache on reconnect
    localStorage.setItem('sp_oauth_done', '1');
    sessionStorage.setItem('sp_oauth_done', '1');
  }
  if (localStorage.getItem('sp_oauth_done') || sessionStorage.getItem('sp_oauth_done')) _w.reconnectAttempted = true;

  _isPlaylist = isPlaylist;
  const prevUrl = currentMediaUrl.value;
  currentMediaUrl.value = mediaUrl;

  // Clear stale tracks immediately when switching URLs so onStateChanged
  // can't merge old track_window data into the wrong playlist
  if (mediaUrl !== prevUrl) {
    playlistTracks.value = [];
    fullTracksFetched = false;
  }

  // Case 1: No player yet — full init
  if (!player) {
    sdkState.value = 'connecting';
    statusMsg.value = 'Connecting...';

    try {
      const [tokenResult] = await Promise.all([fetchToken(), loadSDK()]);
      if (tokenResult.needsConnect) {
        clearTimeout(connectTimeout);
        // After explicit disconnect, always show "Connect Spotify" button
        if (_w.userDisconnected) { sdkState.value = 'needs-connect'; return; }
        const alreadyDone = localStorage.getItem('sp_oauth_done') || sessionStorage.getItem('sp_oauth_done');
        if (alreadyDone) { sdkState.value = 'unavailable'; return; }
        const jwt = localStorage.getItem('jwtToken');
        if (jwt && !_w.oauthRedirecting) { _w.oauthRedirecting = true; window.location.href = spotifyConnectUrl.value; return; }
        sdkState.value = _w.oauthRedirecting ? 'idle' : 'needs-connect';
        return;
      }
      if (tokenResult.unavailable) { sdkState.value = 'unavailable'; return; }
      token = tokenResult.token;

      // Load cached tracks while SDK connects
      if (isPlaylist) {
        const cached = loadCachedTracks(mediaUrl);
        if (cached?.tracks?.length) {
          playlistTracks.value = cached.tracks;
          fullTracksFetched = !!cached.full; // only trust cache if it was a full API fetch
          const t = (startTrackUri && cached.tracks.find(t => t.uri === startTrackUri)) || cached.tracks[0];
          if (t) {
            track.value = { name: t.name, artist: t.artist, album: '', art: t.art };
            if (!currentTrackUri.value) currentTrackUri.value = t.uri;
          }
        }
        fetchPlaylistTracks(mediaUrl);
      }

      _pendingPlay = autoPlay ? { mediaUrl, isPlaylist, startPosition, startTrackUri } : null;
      await createPlayer();
    } catch {
      sdkState.value = 'unavailable';
    }
    return;
  }

  // Case 2: Player exists, same URL — just resume
  if (mediaUrl === prevUrl && sdkState.value === 'ready') {
    if (autoPlay && paused.value) player.resume().catch(() => {});
    return;
  }

  // Case 3: Player exists, different URL — switch context via REST
  if (sdkState.value !== 'ready') {
    // Player is connecting or errored — queue it
    _pendingPlay = autoPlay ? { mediaUrl, isPlaylist, startPosition, startTrackUri } : null;
    return;
  }

  // Reset state for new playlist (tracks already cleared above on URL change)
  position.value = startPosition;

  if (isPlaylist) {
    // Clear forbidden cache for this playlist so a fresh attempt is made
    const plMatch = mediaUrl.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/);
    if (plMatch && _w._forbidden) _w._forbidden.delete(`${plMatch[1]}:${plMatch[2]}`);

    const cached = loadCachedTracks(mediaUrl);
    if (cached?.tracks?.length) {
      playlistTracks.value = cached.tracks;
      fullTracksFetched = !!cached.full;
    }
    fetchPlaylistTracks(mediaUrl);
  }

  if (autoPlay) {
    await startPlayback(mediaUrl, {
      startPosition,
      startTrackUri,
      isPlaylist,
      waitForDev: false, // device already registered
    });
  }
};

// ── Controls ─────────────────────────────────────────────────────────────────
const togglePlay = () => {
  if (!firstStateReceived && currentMediaUrl.value) {
    startPlayback(currentMediaUrl.value, { waitForDev: false }).catch(() => {});
  } else {
    player?.togglePlay();
  }
};

const next = () => player?.nextTrack();

let _lastPrevAt = 0;
const prev = async () => {
  const now = Date.now();
  const doubleTap = now - _lastPrevAt < 700;
  _lastPrevAt = now;
  if (doubleTap && position.value < 2000) {
    player?.previousTrack();
  } else {
    position.value = 0;
    await spotifyFetch('PUT', `/me/player/seek?position_ms=0&device_id=${deviceId}`).catch(() => {});
  }
};

const seek = (ms) => {
  position.value = ms;
  player?.seek(ms);
};

const setVolume = (val) => {
  volume.value = Math.round(val);
  muted.value = false;
  localStorage.setItem('sp_volume', volume.value);
  player?.setVolume(volume.value / 100);
};

let prevVol = _savedVol;
const toggleMute = () => {
  muted.value = !muted.value;
  if (muted.value) { prevVol = volume.value; player?.setVolume(0); }
  else             { player?.setVolume(prevVol / 100); }
};

const toggleShuffle = async () => {
  shuffleOn.value = !shuffleOn.value;
  localStorage.setItem('sp_shuffle', shuffleOn.value);
  await spotifyFetch('PUT', `/me/player/shuffle?state=${shuffleOn.value}&device_id=${deviceId}`).catch(() => {});
};

const playTrackFromList = async (t) => {
  const contextUri = getSpotifyUri(currentMediaUrl.value);
  if (!contextUri) {
    await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`, { uris: [t.uri] }).catch(() => {});
    return;
  }
  const pos = t.index ?? playlistTracks.value.findIndex(tr => tr.uri === t.uri);
  const body = pos >= 0
    ? { context_uri: contextUri, offset: { position: pos }, position_ms: 0 }
    : { context_uri: contextUri, offset: { uri: t.uri }, position_ms: 0 };
  await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`, body).catch(() => {});
};

// ── Play an array of track URIs (no playlist/album context) ──────────────────
let _pendingUris = null;
const playUris = async (uris, trackMeta = [], opts = {}) => {
  if (!uris?.length) return;
  const { startTrackUri = '', startPosition = 0, customUrl = '' } = opts;

  if (trackMeta.length) {
    playlistTracks.value = trackMeta.map((t, i) => ({
      name: t.name || '', uri: t.uri || uris[i],
      artist: t.artist || '', duration: t.duration_ms || t.duration || 0,
      art: t.art || '', index: i,
    }));
    fullTracksFetched = true;
  }
  _isPlaylist = true;
  // Use provided customUrl (for resume) or generate a fresh one
  currentMediaUrl.value = customUrl || `custom:uris:${Date.now()}`;
  position.value = startPosition;

  if (!player || sdkState.value !== 'ready') {
    if (!player) {
      const result = await fetchToken();
      if (!result.token) { sdkState.value = 'unavailable'; return; }
      token = result.token;
      await loadSDK();
      await createPlayer();
    }
    _pendingUris = { uris, trackMeta, startTrackUri, startPosition };
    return;
  }

  const found = await waitForDevice();
  if (!found) { sdkState.value = 'unavailable'; return; }
  const body = { uris };
  if (startTrackUri) body.offset = { uri: startTrackUri };
  if (startPosition > 0) body.position_ms = startPosition;
  await spotifyFetch('PUT', `/me/player/play?device_id=${deviceId}`, body).catch(() => {});
};

// ── Disconnect ───────────────────────────────────────────────────────────────
const disconnect = async () => {
  try {
    const jwt = localStorage.getItem('jwtToken');
    await fetch(`${API}/api/spotify/disconnect`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
  } catch { /* ignore */ }

  // Clear all window-level caches
  _w.tokenCache = null;
  _w.tokenFetchPromise = null;
  _w.oauthRedirecting = false;
  _w.reconnectAttempted = false;
  _w.userDisconnected = true;
  _w.fetchingPlaylists.clear();

  // Clear all sp_* localStorage/sessionStorage
  sessionStorage.removeItem('sp_oauth_done');
  localStorage.removeItem('sp_oauth_done');
  localStorage.removeItem('sp_playlist_ok');
  localStorage.removeItem('sp_shuffle');
  localStorage.removeItem('sp_volume');
  // Clear cached tracks and positions
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sp_tracks_') || key.startsWith('sp_pos_')) localStorage.removeItem(key);
    });
  } catch { /* ignore */ }

  clearInterval(tokenRefresher); tokenRefresher = null;
  clearInterval(posSaver); posSaver = null;
  stopTicker();
  releaseWakeLock();
  player?.disconnect();
  player = null;
  deviceId = null;
  token = null;
  firstStateReceived = false;
  fullTracksFetched = false;
  _pendingPlay = null;
  _pendingUris = null;
  _isPlaylist = false;
  sdkState.value = 'idle';
  currentMediaUrl.value = '';
  currentTrackUri.value = '';
  playlistTracks.value = [];
  needsReconnect.value = false;
  track.value = { name: '', artist: '', album: '', art: '' };
  paused.value = true;
  position.value = 0;
  duration.value = 0;
};

// ── Retry connection ─────────────────────────────────────────────────────────
const retryConnect = async (mediaUrl, opts = {}) => {
  _w.tokenCache = null;
  _w.oauthRedirecting = false;
  sdkState.value = 'idle';
  // Destroy existing broken player if any
  if (player) {
    player.disconnect();
    player = null;
    deviceId = null;
  }
  await play(mediaUrl, opts);
};

const dismissReconnect = () => {
  needsReconnect.value = false;
  _reconnectDismissed = true;
};

// ── Preload tracks for inactive preview cards ────────────────────────────────
const preloadTracks = (mediaUrl) => {
  const cached = loadCachedTracks(mediaUrl);
  if (cached?.tracks?.length) return cached.tracks;
  // Fire background fetch (no token needed for playlist proxy endpoint)
  fetchPlaylistTracks(mediaUrl);
  return null;
};

// ── Export ────────────────────────────────────────────────────────────────────
export function useSpotifySDK() {
  return {
    // State
    sdkState, statusMsg, paused, position, duration, volume, muted, shuffleOn,
    track, currentTrackUri, currentMediaUrl, playlistTracks, listOpen,
    needsReconnect, playlistMeta,
    // Computed
    progressPct, displayVolume, spotifyConnectUrl,
    // Methods
    play, playUris, togglePlay, pause: () => player?.pause(), next, prev, seek, setVolume, toggleMute, toggleShuffle,
    playTrackFromList, disconnect, retryConnect, preloadTracks, dismissReconnect,
    fmtMs, loadCachedTracks, loadSavedPosition, saveCurrentPosition,
  };
}
