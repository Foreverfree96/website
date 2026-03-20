import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-modify-playback-state",
  "user-read-playback-state",
  "streaming",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-modify",
].join(" ");

// ─── CLIENT CREDENTIALS TOKEN (app-level, no user scopes needed) ──────────────
// Used as fallback for fetching public playlist data when the user's token
// is missing playlist scopes (connected before those scopes were added).
let _clientCredCache = null; // { token, expiresAt }

const getClientCredToken = async () => {
  if (_clientCredCache && Date.now() < _clientCredCache.expiresAt - 60_000) {
    return _clientCredCache.token;
  }
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const { access_token, expires_in } = res.data;
  _clientCredCache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
};

// ─── SHARED HELPER: refresh access token ──────────────────────────────────────
const refreshAccessToken = async (userId, refreshToken) => {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const { access_token, refresh_token: new_refresh_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000);
  const update = { spotifyAccessToken: access_token, spotifyTokenExpiry: expiresAt };
  // Spotify may rotate the refresh token — persist it if provided
  if (new_refresh_token) update.spotifyRefreshToken = new_refresh_token;
  await User.findByIdAndUpdate(userId, update);
  return { accessToken: access_token, expiresAt };
};

// ─── SHARED HELPER: get valid access token (refresh if expired or near-expiry) ─
// requirePremium=true  → used for playback endpoints (SDK requires Premium)
// requirePremium=false → used for non-playback endpoints like playlist tracks
const getValidToken = async (userId, requirePremium = true) => {
  const user = await User.findById(userId).select(
    "+spotifyAccessToken +spotifyRefreshToken spotifyTokenExpiry spotifyIsPremium spotifyId"
  );
  if (!user?.spotifyId) return { error: 404, message: "Spotify not connected" };
  if (requirePremium && !user.spotifyIsPremium) return { error: 403, message: "Spotify Premium required" };

  let accessToken = user.spotifyAccessToken;
  let expiresAt   = user.spotifyTokenExpiry;

  // Proactively refresh if expired or expiring within 5 minutes
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (!expiresAt || expiresAt < fiveMinFromNow) {
    try {
      const refreshed = await refreshAccessToken(userId, user.spotifyRefreshToken);
      accessToken = refreshed.accessToken;
      expiresAt   = refreshed.expiresAt;
    } catch (err) {
      console.error("❌ Spotify token refresh failed:", err.response?.data || err.message);
      return { error: 401, message: "Spotify session expired — please reconnect" };
    }
  }

  return { accessToken, expiresAt };
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Only redirect back to our own frontend domain to prevent open-redirect attacks
const isSafeReturn = (url) => {
  try {
    const parsed   = new URL(url);
    const frontend = new URL(process.env.FRONTEND_URL);
    return parsed.hostname === frontend.hostname;
  } catch { return false; }
};

const appendSpotifyParams = (baseUrl, params) => {
  const u = new URL(baseUrl);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
};

// ─── SPOTIFY LOGIN ────────────────────────────────────────────────────────────
export const spotifyLogin = async (req, res) => {
  const { token, returnTo, force } = req.query;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

  // Always show consent dialog so Spotify prompts for any newly-added scopes.
  // Without this, Spotify auto-redirects with cached scopes and new
  // permissions (like playlist-read-private) are never granted.
  const showDialog = "true";

  // Encode userId + safe returnTo URL in state so callback can redirect back.
  // Use base64url (not base64) — regular base64 has +/= chars that URL encoding mangles.
  const safeReturn = returnTo && isSafeReturn(returnTo) ? returnTo : '';
  const state = Buffer.from(JSON.stringify({ id: userId, ret: safeReturn })).toString('base64url');

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    scope:         SCOPES,
    redirect_uri:  process.env.SPOTIFY_REDIRECT_URI,
    state,
    show_dialog:   showDialog,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
};

// ─── SPOTIFY CALLBACK ─────────────────────────────────────────────────────────
export const spotifyCallback = async (req, res) => {
  const { code, state: rawState, error } = req.query;

  // Decode state — try base64url first (new format), fall back to legacy plain userId
  let userId, returnTo;
  try {
    const decoded = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
    userId   = decoded.id;
    returnTo = decoded.ret && isSafeReturn(decoded.ret) ? decoded.ret : '';
  } catch {
    userId   = rawState; // legacy: state was just the userId string
    returnTo = '';
  }

  const fallback = `${process.env.FRONTEND_URL}/profile`;

  if (error || !code || !userId) {
    return res.redirect(appendSpotifyParams(returnTo || fallback, { spotify: 'error' }));
  }

  try {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    // Retry once on invalid_grant — Render cold starts can cause the first
    // attempt to fail if the instance wasn't warm when Spotify hit the callback.
    let tokenRes;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        tokenRes = await axios.post(
          "https://accounts.spotify.com/api/token",
          new URLSearchParams({
            grant_type:   "authorization_code",
            code,
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
          }),
          { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" } }
        );
        break;
      } catch (e) {
        if (attempt === 0 && e.response?.data?.error === "invalid_grant") {
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        throw e;
      }
    }

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const profileRes = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: spotifyId, product, display_name } = profileRes.data;
    const isPremium = product === "premium";

    await User.findByIdAndUpdate(userId, {
      spotifyId,
      spotifyDisplayName:  display_name || null,
      spotifyIsPremium:    isPremium,
      spotifyAccessToken:  access_token,
      spotifyRefreshToken: refresh_token,
      spotifyTokenExpiry:  new Date(Date.now() + expires_in * 1000),
    });

    const dest = returnTo || fallback;
    res.redirect(appendSpotifyParams(dest, { spotify: 'connected', premium: String(isPremium) }));
  } catch (err) {
    console.error("❌ Spotify OAuth error:", err.response?.data || err.message);
    res.redirect(appendSpotifyParams(returnTo || fallback, { spotify: 'error' }));
  }
};

// ─── SPOTIFY STATUS ───────────────────────────────────────────────────────────
export const spotifyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "spotifyId spotifyDisplayName spotifyIsPremium spotifyTokenExpiry"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      connected:    !!user.spotifyId,
      displayName:  user.spotifyDisplayName || null,
      isPremium:    user.spotifyIsPremium || false,
      tokenExpired: user.spotifyTokenExpiry ? user.spotifyTokenExpiry < new Date() : true,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SPOTIFY GET TOKEN ────────────────────────────────────────────────────────
// GET /api/spotify/token  (protected)
// Returns a fresh access token for the Web Playback SDK.
// Only available to Premium users with a linked account.

export const spotifyGetToken = async (req, res) => {
  try {
    const result = await getValidToken(req.user.id);
    if (result.error) return res.status(result.error).json({ message: result.message });
    res.json({ accessToken: result.accessToken, expiresAt: result.expiresAt });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SPOTIFY SHUFFLE OFF ──────────────────────────────────────────────────────
export const spotifyShuffleOff = async (req, res) => {
  try {
    const result = await getValidToken(req.user.id);
    if (result.error) return res.status(204).end();

    await axios.put(
      "https://api.spotify.com/v1/me/player/shuffle?state=false",
      {},
      { headers: { Authorization: `Bearer ${result.accessToken}` } }
    );
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
};

// ─── SERVER-SIDE PLAYLIST CACHE ───────────────────────────────────────────────
// Once any user with the right scope fetches a playlist successfully, the result
// is cached here for 1 hour so everyone else benefits without needing the scope.
const _playlistCache    = new Map(); // playlistId → { data, cachedAt }
const _inflight         = new Map(); // playlistId → Promise — deduplicates concurrent requests
let _rateLimitedUntil   = 0;         // app-wide timestamp — Spotify rate limits are per-app, not per-playlist
const MAX_BACKOFF_MS    = 10 * 1000; // cap at 10s regardless of Retry-After
const PLAYLIST_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const setRateLimit = (retryAfterHeader) => {
  const secs = Math.min(parseInt(retryAfterHeader || '5', 10), 10); // cap at 10s
  _rateLimitedUntil = Date.now() + secs * 1000;
  return secs;
};

const getCachedPlaylist = (id) => {
  const entry = _playlistCache.get(id);
  if (entry && Date.now() - entry.cachedAt < PLAYLIST_CACHE_TTL) return entry.data;
  return null;
};

// ─── SPOTIFY PLAYLIST TRACKS ──────────────────────────────────────────────────
// GET /api/spotify/playlist/:id/tracks  (protected)
export const getPlaylistTracks = async (req, res) => {
  const playlistId = req.params.id;

  // Return cached result if available and looks complete (>= 20 tracks)
  const cached = getCachedPlaylist(playlistId);
  if (cached && (cached.items?.length ?? 0) >= 20) return res.json(cached);
  if (cached) _playlistCache.delete(playlistId); // stale partial — re-fetch

  // Respect app-wide Spotify 429 backoff — wait it out if under 15s
  if (Date.now() < _rateLimitedUntil) {
    const waitMs = _rateLimitedUntil - Date.now();
    if (waitMs > 15000) {
      return res.status(429).json({ message: 'Rate limited — try again shortly' });
    }
    await new Promise(r => setTimeout(r, waitMs + 200));
  }

  // Deduplicate concurrent requests for the same playlist.
  // If a fetch is already in flight, wait for it instead of firing another.
  if (_inflight.has(playlistId)) {
    try {
      const data = await _inflight.get(playlistId);
      return res.json(data);
    } catch {
      return res.status(500).json({ message: 'Failed to fetch tracks' });
    }
  }

  // Helper: normalise to { items: [...] } shape and cache
  const cacheAndReturn = (items) => {
    const data = { items };
    _playlistCache.set(playlistId, { data, cachedAt: Date.now() });
    return data;
  };

  const parseItems = (data, label = '') => {
    const raw = data.items || [];
    const valid = raw.filter(item => item?.track?.uri);
    if (raw.length !== valid.length) {
      console.log(`   ${label} parseItems: ${raw.length} raw → ${valid.length} valid (${raw.length - valid.length} filtered: ${raw.filter(i => !i?.track?.uri).slice(0, 3).map(i => i?.track === null ? 'null track' : `no uri: ${i?.track?.name || 'unknown'}`).join(', ')})`);
    }
    return valid;
  };

  // Paginate through ALL tracks — Spotify returns max 100 per page
  const fetchAllPages = async (firstUrl, headers) => {
    let nextUrl  = firstUrl;
    let allItems = [];
    while (nextUrl) {
      const r = await axios.get(nextUrl, { headers });
      allItems = allItems.concat(parseItems(r.data));
      nextUrl  = r.data.next || null;
    }
    return allItems;
  };

  // Wrap the actual fetch in a promise stored in _inflight so concurrent
  // requests can await the same work instead of each calling Spotify.
  const fetchPromise = (async () => {
    const result = await getValidToken(req.user.id, false);
    console.log(`   Token status: ${result.error ? 'FAILED (' + result.message + ')' : 'valid'}`);

    if (!result.error) {
      const auth = { Authorization: `Bearer ${result.accessToken}` };

      // 1. GET /v1/playlists/{id}/tracks — requires playlist-read-private, paginates all tracks
      try {
        console.log(`   [1] Trying user-token GET /tracks for ${playlistId}...`);
        const items = await fetchAllPages(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
          auth
        );
        if (items.length) return cacheAndReturn(items);
        console.log(`   [1] User-token returned 0 items`);
      } catch (err) {
        console.error(`   [1] User-token failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
        if (err.response?.status === 429) {
          setRateLimit(err.response.headers?.['retry-after']);
          // Don't throw — fall through to try other methods
        } else if (err.response?.status !== 403) {
          // Unexpected error — still fall through
        }
      }

      // 2. GET /v1/playlists/{id} — parent object, then paginate remaining tracks
      try {
        console.log(`   [2] Trying user-token GET /playlists/${playlistId}...`);
        const r = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, { headers: auth });
        const firstItems = parseItems(r.data.tracks || {});
        const nextUrl = r.data.tracks?.next || null;
        let allItems = firstItems;
        if (nextUrl) {
          const remaining = await fetchAllPages(nextUrl, auth);
          allItems = allItems.concat(remaining);
        }
        if (allItems.length) return cacheAndReturn(allItems);
        console.log(`   [2] Parent object returned 0 items`);
      } catch (err) {
        console.error(`   [2] Parent object failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
        if (err.response?.status === 429) setRateLimit(err.response.headers?.['retry-after']);
      }
    }

    // 3. Client credentials (public playlists only) — paginate all tracks
    try {
      console.log(`   [3] Trying client-creds for ${playlistId}...`);
      const appToken = await getClientCredToken();
      const auth = { Authorization: `Bearer ${appToken}` };
      const items = await fetchAllPages(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
        auth
      );
      if (items.length) return cacheAndReturn(items);
      console.log(`   [3] Client-creds returned 0 items`);
    } catch (err) {
      console.error(`   [3] Client-creds failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
      if (err.response?.status === 429) setRateLimit(err.response.headers?.['retry-after']);
    }

    return null; // no tracks found
  })();

  _inflight.set(playlistId, fetchPromise);
  try {
    const data = await fetchPromise;
    _inflight.delete(playlistId);
    if (data) {
      console.log(`✅ Playlist ${playlistId}: returning ${data.items?.length || 0} tracks`);
      return res.json(data);
    }
    console.error(`❌ Playlist ${playlistId}: no tracks found (all 3 methods failed)`);
    // Check if rate-limited — give accurate error instead of always blaming scope
    if (Date.now() < _rateLimitedUntil) {
      return res.status(429).json({ message: 'Spotify rate limited — try again in a few seconds' });
    }
    res.status(403).json({ message: 'Could not load playlist — try reconnecting Spotify or check the URL' });
  } catch (err) {
    _inflight.delete(playlistId);
    const status = err.response?.status || 500;
    res.status(status).json({ message: err.response?.data?.error?.message || 'Failed to fetch tracks' });
  }
};

// ─── SPOTIFY DISCONNECT ───────────────────────────────────────────────────────
export const spotifyDisconnect = async (req, res) => {
  try {
    // Clear all Spotify fields from the user's profile.
    // Note: Spotify does NOT provide a token revocation API, so the app
    // will remain on the user's authorized apps page (spotify.com/account/apps)
    // until they manually remove it. This is a Spotify platform limitation.
    await User.findByIdAndUpdate(req.user.id, {
      $unset: {
        spotifyId:           1,
        spotifyDisplayName:  1,
        spotifyAccessToken:  1,
        spotifyRefreshToken: 1,
        spotifyTokenExpiry:  1,
      },
      $set: { spotifyIsPremium: false },
    });
    res.json({ message: "Spotify disconnected" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SPOTIFY SEARCH TRACKS ──────────────────────────────────────────────────
// GET /api/spotify/search?q=...&limit=10
let _searchRateLimitUntil = 0; // separate rate limit for search — not blocked by playlist/generate 429s

export const searchTracks = async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    if (!q) return res.status(400).json({ message: "Missing query parameter q" });

    // Only respect search-specific rate limit, not the global one
    if (Date.now() < _searchRateLimitUntil) {
      const retryAfter = Math.ceil((_searchRateLimitUntil - Date.now()) / 1000);
      return res.status(429).json({ tracks: [], retryAfter, message: 'Rate limited' });
    }

    // Try user token first, then client credentials
    let token;
    const result = await getValidToken(req.user.id, false);
    token = result.error ? null : result.accessToken;

    const doSearch = async (t) => {
      const r = await axios.get("https://api.spotify.com/v1/search", {
        params: { q, type: "track", limit: Math.min(Number(limit), 50) },
        headers: { Authorization: `Bearer ${t}` },
      });
      return r.data.tracks?.items || [];
    };

    let items;
    try {
      items = await doSearch(token || await getClientCredToken());
    } catch (e) {
      if (e.response?.status === 429) {
        const secs = Math.min(parseInt(e.response.headers?.['retry-after'] || '5', 10), 10);
        _searchRateLimitUntil = Date.now() + secs * 1000;
        // Fallback to client credentials if user token was rate-limited
        if (token) {
          try { items = await doSearch(await getClientCredToken()); }
          catch { items = []; }
        } else {
          return res.status(429).json({ tracks: [], retryAfter: secs, message: 'Rate limited — try again shortly' });
        }
      } else if (e.response?.status === 401 || e.response?.status === 403) {
        // Token expired/invalid — try client creds
        try { items = await doSearch(await getClientCredToken()); }
        catch { items = []; }
      } else {
        console.error('❌ Search unexpected error:', e.response?.status || e.message);
        items = [];
      }
    }

    const tracks = (items || []).map((t) => ({
      id:          t.id,
      uri:         t.uri,
      name:        t.name,
      artist:      t.artists?.map((a) => a.name).join(", ") || "",
      album:       t.album?.name || "",
      art:         t.album?.images?.[0]?.url || "",
      duration_ms: t.duration_ms,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("❌ Spotify search error:", err.response?.data || err.message);
    if (err.response?.status === 429) {
      const secs = Math.min(parseInt(err.response.headers?.['retry-after'] || '5', 10), 10);
      _searchRateLimitUntil = Date.now() + secs * 1000;
      return res.status(429).json({ tracks: [], retryAfter: secs, message: 'Rate limited — try again shortly' });
    }
    res.status(err.response?.status || 500).json({ message: "Search failed" });
  }
};

// ─── SPOTIFY GENERATE PLAYLIST ──────────────────────────────────────────────
// POST /api/spotify/generate
// Body: { seedTrackIds: [], seedPlaylistId?, genres: [], limit: 30 }
//
// Search-based playlist generation: fetch seed track artists, build varied
// search queries from artist names + genres, collect and deduplicate results.
export const generatePlaylist = async (req, res) => {
  try {
    let { seedTrackIds = [], seedTrackMeta = [], seedPlaylistId, genres = [], limit = 30 } = req.body;
    limit = Math.max(1, Math.min(Number(limit) || 30, 100));

    console.log(`🎵 Generate request: ${seedTrackIds.length} trackIds, ${seedTrackMeta.length} meta, ${genres.length} genres, limit=${limit}, playlist=${seedPlaylistId || 'none'}`);
    if (seedTrackMeta.length) console.log(`   Meta:`, seedTrackMeta.slice(0, 3).map(m => `${m.name} - ${m.artist}`));

    // Prefer user token (no content restrictions); fall back to client creds only if not connected
    const result = await getValidToken(req.user.id, false);
    let token = result.error ? null : result.accessToken;
    let usingClientCreds = false;
    if (!token) {
      token = await getClientCredToken();
      usingClientCreds = true;
    }
    console.log(`   Token: ${usingClientCreds ? 'client-creds' : 'user-token'} (${token ? 'valid' : 'NULL'})`);
    const auth = { Authorization: `Bearer ${token}` };

    // Clean YouTube channel names helper
    const cleanArtist = (raw) => (raw || "")
      .split(",")[0]
      .replace(/\s*-\s*topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .replace(/\s*Music$/i, '')
      .replace(/\s*Records$/i, '')
      .trim();

    // Collect artist names from seed tracks
    const seedArtists = [];
    const seedTrackUris = new Set();

    // Use frontend-provided metadata as initial artist source
    seedTrackMeta.forEach((m) => {
      const artist = cleanArtist(m.artist);
      if (artist && !seedArtists.includes(artist)) seedArtists.push(artist);
    });

    // If a reference playlist is provided, pull tracks from it
    if (seedPlaylistId) {
      const cached = getCachedPlaylist(seedPlaylistId);
      let items = cached?.items;
      if (!items) {
        // Try user token first, then client credentials as fallback
        for (const tryToken of [token, null]) {
          try {
            const t = tryToken || await getClientCredToken();
            const r = await axios.get(
              `https://api.spotify.com/v1/playlists/${seedPlaylistId}/tracks?limit=100`,
              { headers: { Authorization: `Bearer ${t}` } }
            );
            items = (r.data.items || []).filter((i) => i?.track?.id);
            if (items.length) break;
          } catch (e) {
            if (tryToken && (e.response?.status === 403 || e.response?.status === 401)) continue; // try client creds
            console.error(`❌ Playlist seed fetch failed:`, e.response?.status || e.message);
          }
        }
        if (!items) items = [];
      }
      if (items?.length) {
        // If reference playlist is the main/only input, sample more aggressively
        const isStandalone = !seedTrackIds.length && !genres.length && !seedTrackMeta.length;
        const sampleSize = isStandalone ? Math.min(items.length, 15) : 5;
        const shuffled = items.sort(() => Math.random() - 0.5);
        shuffled.slice(0, sampleSize).forEach((i) => {
          const artist = i.track?.artists?.[0]?.name;
          if (artist && !seedArtists.includes(artist)) seedArtists.push(artist);
          if (i.track?.id) seedTrackIds.push(i.track.id);
        });
        // For standalone, also extract track names for search queries
        if (isStandalone) {
          shuffled.slice(0, 8).forEach((i) => {
            const name = i.track?.name;
            if (name) {
              seedTrackMeta.push({ name, artist: i.track?.artists?.[0]?.name || "" });
            }
          });
        }
      }
    }

    // Fetch artist info from seed track IDs
    const uniqueIds = [...new Set(seedTrackIds)].slice(0, 5);
    if (uniqueIds.length) {
      try {
        const r = await axios.get(`https://api.spotify.com/v1/tracks`, {
          params: { ids: uniqueIds.join(",") },
          headers: auth,
        });
        (r.data.tracks || []).forEach((t) => {
          seedTrackUris.add(t.uri);
          const artist = t.artists?.[0]?.name;
          if (artist && !seedArtists.includes(artist)) seedArtists.push(artist);
        });
      } catch { /* proceed with what we have */ }
    }

    // Use seed track metadata names/artists as search queries when no artist names resolved
    if (!seedArtists.length && seedTrackMeta.length) {
      seedTrackMeta.forEach((m) => {
        const artist = cleanArtist(m.artist);
        if (artist && !seedArtists.includes(artist)) seedArtists.push(artist);
        else if (m.name && !seedArtists.includes(m.name)) seedArtists.push(m.name);
      });
    }

    console.log(`   Seeds resolved: ${seedArtists.length} artists [${seedArtists.slice(0, 5).join(', ')}], ${uniqueIds.length} trackIds, ${genres.length} genres`);

    if (!seedArtists.length && !genres.length && !uniqueIds.length) {
      return res.status(400).json({ message: "Provide at least one seed track or genre" });
    }

    const startTime = Date.now();
    const TIMEOUT_MS = 120000; // 2 min — allows time for rate-limit waits
    const seenIds = new Set(uniqueIds); // exclude seed tracks from results
    const collected = [];

    // Build diverse search queries — prioritize simple artist names first
    const queries = [];

    // Simple artist queries first (most reliable)
    seedArtists.forEach(artist => queries.push(artist));

    // Track name + artist combos (good for finding similar tracks)
    seedTrackMeta.slice(0, 5).forEach(m => {
      const name = (m.name || '').replace(/\s*[\(\[].*[\)\]]$/g, '').trim();
      const artist = cleanArtist(m.artist);
      if (name && artist) queries.push(`${artist} ${name}`);
      else if (name) queries.push(name);
    });

    // Artist + genre cross queries
    seedArtists.slice(0, 3).forEach(artist => {
      genres.slice(0, 2).forEach(g => queries.push(`${artist} ${g}`));
    });

    // Genre-only queries
    genres.forEach(g => {
      queries.push(g);
      queries.push(`${g} hits`);
      queries.push(`best ${g}`);
    });

    // Cross-pollination
    if (seedArtists.length >= 2) queries.push(`${seedArtists[0]} ${seedArtists[1]}`);

    // Deduplicate and cap — allow more queries when we need more tracks
    const maxQueries = limit > 50 ? 16 : limit > 20 ? 12 : 10;
    const uniqueQueries = [...new Set(queries)].slice(0, maxQueries);
    uniqueQueries.sort(() => Math.random() - 0.5);

    const perQuery = Math.ceil((limit + 10) / Math.max(uniqueQueries.length, 1));

    console.log(`   Queries (${uniqueQueries.length}): ${uniqueQueries.slice(0, 6).join(' | ')}${uniqueQueries.length > 6 ? ' ...' : ''}`);
    console.log(`   perQuery=${perQuery}, rateLimited=${Date.now() < _rateLimitedUntil ? 'YES until ' + new Date(_rateLimitedUntil).toISOString() : 'no'}`);

    // Resilient search — switch tokens on 429, wait for rate limit to clear
    const doSearch = async (query) => {
      let _switchedToken = false;
      const offset = Math.floor(Math.random() * 5);
      const searchLimit = Math.min(perQuery + 5, 50);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const r = await axios.get("https://api.spotify.com/v1/search", {
            params: { q: query, type: "track", limit: searchLimit, offset },
            headers: auth,
          });
          return r.data.tracks?.items || [];
        } catch (e) {
          const status = e.response?.status;
          if (attempt < 2) console.error(`   ⚠ Search "${query}" attempt ${attempt}: ${status || e.message}`);

          if (status === 400) {
            const clean = query.replace(/[^\w\s'-]/g, '').trim();
            if (clean && clean !== query) {
              try {
                const r2 = await axios.get("https://api.spotify.com/v1/search", {
                  params: { q: clean, type: "track", limit: searchLimit, offset: 0 },
                  headers: auth,
                });
                return r2.data.tracks?.items || [];
              } catch { return []; }
            }
            return [];
          }

          // On 429/401/403: switch to the OTHER token type first (free retry, no wait)
          if ((status === 429 || status === 401 || status === 403) && !_switchedToken) {
            try {
              if (usingClientCreds) {
                const userResult = await getValidToken(req.user.id, false);
                if (!userResult.error) {
                  console.log(`   Switching to user-token after ${status}`);
                  auth.Authorization = `Bearer ${userResult.accessToken}`;
                  usingClientCreds = false;
                  _switchedToken = true;
                  continue; // immediate retry with other token
                }
              } else {
                console.log(`   Switching to client-creds after ${status}`);
                const appToken = await getClientCredToken();
                auth.Authorization = `Bearer ${appToken}`;
                usingClientCreds = true;
                _switchedToken = true;
                continue;
              }
            } catch { /* switch failed */ }
          }

          // Both tokens rate-limited — actually wait for the cooldown
          if (status === 429 && attempt < 4) {
            const secs = parseInt(e.response.headers?.['retry-after'] || '5', 10);
            const waitMs = Math.min(secs, 30) * 1000 + 500;
            setRateLimit(e.response.headers?.['retry-after']);
            console.log(`   ⏳ Both tokens rate-limited, waiting ${Math.round(waitMs / 1000)}s...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }

          return [];
        }
      }
      return [];
    };

    // Emit real-time progress via Socket.io
    const { getIo } = await import("../utils/socketEmitter.js");
    const io = getIo();
    const userId = req.user.id;
    const emitProgress = (pct, status) => {
      io?.to(userId).emit('playlist:progress', { percent: Math.round(pct), status });
    };

    emitProgress(10, 'Searching...');

    for (let qi = 0; qi < uniqueQueries.length; qi++) {
      if (collected.length >= limit) break;
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.log(`   ⏱ Timeout after ${qi}/${uniqueQueries.length} queries, ${collected.length} tracks`);
        break;
      }

      if (Date.now() < _rateLimitedUntil) {
        const waitMs = Math.min(_rateLimitedUntil - Date.now(), 8000);
        if (Date.now() - startTime + waitMs > TIMEOUT_MS) {
          console.log(`   ⏱ Rate limit wait (${waitMs}ms) would exceed timeout, breaking`);
          break;
        }
        emitProgress(10 + (qi / uniqueQueries.length) * 70, 'Waiting for rate limit...');
        await new Promise(r => setTimeout(r, waitMs + 100));
      }

      const items = await doSearch(uniqueQueries[qi]);
      let added = 0;
      for (const t of items) {
        if (collected.length >= limit) break;
        if (!t?.id || seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        collected.push({
          id: t.id, uri: t.uri, name: t.name,
          artist: t.artists?.map(a => a.name).join(', ') || '',
          album: t.album?.name || '', art: t.album?.images?.[0]?.url || '',
          duration_ms: t.duration_ms,
        });
        added++;
      }
      if (qi < 3 || added === 0) console.log(`   Query ${qi}: "${uniqueQueries[qi]}" → ${items.length} results, +${added} new`);

      // Emit progress: 10-80% based on query progress, or track fill %
      const queryPct = 10 + ((qi + 1) / uniqueQueries.length) * 70;
      const fillPct = 10 + (collected.length / limit) * 70;
      emitProgress(Math.max(queryPct, fillPct), `Found ${collected.length} tracks...`);

      if (qi < uniqueQueries.length - 1 && collected.length < limit) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    emitProgress(90, 'Finalizing...');

    // Shuffle final results so tracks from different sources are mixed
    collected.sort(() => Math.random() - 0.5);

    emitProgress(100, `Done! ${collected.length} tracks`);
    console.log(`✅ Generate: ${collected.length} tracks (requested ${limit}) [${usingClientCreds ? 'client-creds' : 'user-token'}]`);
    res.json({ tracks: collected });
  } catch (err) {
    console.error("❌ Spotify generate error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Generation failed" });
  }
};

// ─── SPOTIFY CREATE PLAYLIST ────────────────────────────────────────────────
// POST /api/spotify/playlist
// Body: { name, description?, trackUris: ["spotify:track:xxx", ...] }
export const createPlaylist = async (req, res) => {
  try {
    const { name, description = "", trackUris = [] } = req.body;
    if (!name) return res.status(400).json({ message: "Playlist name is required" });
    if (!trackUris.length) return res.status(400).json({ message: "No tracks provided" });

    const result = await getValidToken(req.user.id, false);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const auth = { Authorization: `Bearer ${result.accessToken}` };

    // Get Spotify user ID
    const user = await User.findById(req.user.id).select("spotifyId");
    if (!user?.spotifyId) return res.status(400).json({ message: "Spotify not connected" });

    // Create the playlist
    let playlistId;
    try {
      const r = await axios.post(
        `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`,
        { name, description, public: false },
        { headers: { ...auth, "Content-Type": "application/json" } }
      );
      playlistId = r.data.id;
    } catch (err) {
      if (err.response?.status === 403) {
        return res.status(403).json({
          error: "scope_missing",
          message: "Reconnect Spotify to enable playlist creation",
        });
      }
      throw err;
    }

    // Add tracks in batches of 100
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100);
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: batch },
        { headers: { ...auth, "Content-Type": "application/json" } }
      );
    }

    res.json({
      playlistId,
      playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
      name,
    });
  } catch (err) {
    console.error("❌ Spotify create playlist error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to create playlist" });
  }
};

// ─── SPOTIFY MATCH TRACKS ───────────────────────────────────────────────────
// POST /api/spotify/match
// Body: { tracks: [{ title, artist, duration_ms? }] }

const cleanTitle = (title) =>
  title
    // Bracketed tags
    .replace(/\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video)|lyrics?|audio|hd|hq|remaster(ed)?|live|visuali[sz]er|explicit|clean|mv|m\/v|4k|video\s*oficial|original mix|radio edit|extended mix|slowed|sped up|reverb|bass boosted|nightcore)[\)\]]/gi, "")
    .replace(/\s*[\(\[]feat\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[]ft\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[]prod\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[]with\s+[^\)\]]*[\)\]]/gi, "")
    // Non-bracketed feat/ft — only strip the featured artist part, keep before it
    .replace(/\s+feat\.?\s+[^-|]+/i, "")
    .replace(/\s+ft\.?\s+[^-|]+/i, "")
    .replace(/\s+prod\.?\s+(by\s+)?[^-|]+/i, "")
    // Channel/platform noise
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*\/\/\s*.*$/, "")
    .replace(/\s*#\w+/g, "")
    // HTML entities
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// Normalize for comparison — strip all non-alphanumeric
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

// Word-level similarity — handles word order differences
const wordSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const aw = new Set(normalize(a).split(" ").filter(Boolean));
  const bw = new Set(normalize(b).split(" ").filter(Boolean));
  if (!aw.size || !bw.size) return 0;
  let overlap = 0;
  for (const w of aw) if (bw.has(w)) overlap++;
  // Jaccard-ish but weighted toward the smaller set (source title)
  return overlap / Math.min(aw.size, bw.size);
};

// Substring containment — if one fully contains the other
const containsBonus = (a, b) => {
  const an = normalize(a);
  const bn = normalize(b);
  if (an.includes(bn) || bn.includes(an)) return 0.3;
  return 0;
};

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
};

const charSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const al = normalize(a);
  const bl = normalize(b);
  if (al === bl) return 1;
  const maxLen = Math.max(al.length, bl.length);
  return maxLen ? 1 - levenshtein(al, bl) / maxLen : 0;
};

// Combined similarity — takes the best of char-level, word-level, and containment
const similarity = (a, b) => {
  if (!a || !b) return 0;
  const cs = charSimilarity(a, b);
  const ws = wordSimilarity(a, b);
  const cb = containsBonus(a, b);
  return Math.min(1, Math.max(cs, ws * 0.9) + cb);
};

export const matchTracks = async (req, res) => {
  try {
    const { tracks = [] } = req.body;
    if (!tracks.length) return res.status(400).json({ message: "No tracks provided" });

    // Prefer user token (avoids explicit content 400s from client creds)
    const result = await getValidToken(req.user.id, false);
    let token = result.error ? null : result.accessToken;
    let usingClientCreds = !token;
    if (!token) token = await getClientCredToken();
    const auth = { Authorization: `Bearer ${token}` };

    console.log(`🔍 Matching ${tracks.length} tracks to Spotify... [${usingClientCreds ? 'client-creds' : 'user-token'}]`);

    const searchSpotify = async (query) => {
      let _switched = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const q = attempt === 0 ? query : query.replace(/[^\w\s'-]/g, '').trim();
          if (!q) return [];
          const r = await axios.get("https://api.spotify.com/v1/search", {
            params: { q, type: "track", limit: 30 },
            headers: auth,
          });
          return r.data.tracks?.items || [];
        } catch (e) {
          const status = e.response?.status;
          if (status === 400 && attempt === 0) continue;

          // On 429/401/403: switch to the OTHER token type first
          if ((status === 429 || status === 401 || status === 403) && !_switched) {
            try {
              if (usingClientCreds) {
                const userResult = await getValidToken(req.user.id, false);
                if (!userResult.error) {
                  auth.Authorization = `Bearer ${userResult.accessToken}`;
                  usingClientCreds = false;
                  _switched = true;
                  continue;
                }
              } else {
                const appToken = await getClientCredToken();
                auth.Authorization = `Bearer ${appToken}`;
                usingClientCreds = true;
                _switched = true;
                continue;
              }
            } catch { /* switch failed */ }
          }

          // Both tokens rate-limited — wait for cooldown
          if (status === 429 && attempt < 4) {
            const secs = parseInt(e.response.headers?.['retry-after'] || '5', 10);
            const waitMs = Math.min(secs, 30) * 1000 + 500;
            setRateLimit(e.response.headers?.['retry-after']);
            if (attempt < 2) console.log(`   ⏳ Match: both tokens rate-limited, waiting ${Math.round(waitMs / 1000)}s for "${query}"...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          if (attempt < 2 && status !== 400) {
            console.error(`❌ Match search failed for "${query}":`, status || e.message);
          }
          return [];
        }
      }
      return [];
    };

    // Clean YouTube channel names that aren't real artist names
    const cleanArtist = (artist) => {
      if (!artist) return "";
      return artist
        .replace(/\s*-\s*topic$/i, "")
        .replace(/\s*VEVO$/i, "")
        .replace(/\s*Official$/i, "")
        .replace(/\s*Music$/i, "")
        .replace(/\s*Records$/i, "")
        .replace(/\s*TV$/i, "")
        .replace(/\s*Channel$/i, "")
        .replace(/&amp;/g, "&")
        .split(/[,×]/)[0] // take first artist, but keep & (could be part of name)
        .trim();
    };

    // Extract artist from title patterns like "Artist - Song" or "Song - Artist"
    const extractArtistFromTitle = (title) => {
      const m = title.match(/^(.+?)\s*[-–—]\s+(.+)$/);
      if (!m) return null;
      // Could be "Artist - Title" or "Title - Artist" — return both sides
      return { side1: m[1].trim(), side2: m[2].trim() };
    };

    const matchOne = async (src) => {
      const rawTitle = src.title || "";
      const cleaned = cleanTitle(rawTitle);
      const artist = cleanArtist(src.artist || "");

      // Try to extract artist/title from "Artist - Song" patterns
      const extracted = extractArtistFromTitle(cleaned);

      // Build multiple interpretations of what the title/artist might be
      const interpretations = [];
      if (extracted) {
        interpretations.push({ title: extracted.side2, artist: artist || extracted.side1 });
        interpretations.push({ title: extracted.side1, artist: artist || extracted.side2 });
      }
      interpretations.push({ title: cleaned, artist });
      if (!artist && !extracted) interpretations.push({ title: cleaned, artist: "" });

      // Dedupe interpretations
      const interpSet = new Set();
      const uniqueInterps = interpretations.filter(i => {
        const key = `${i.title}|${i.artist}`;
        if (interpSet.has(key)) return false;
        interpSet.add(key);
        return true;
      });

      // Build search queries — multiple strategies for maximum coverage
      const queries = [];
      for (const interp of uniqueInterps) {
        if (interp.title && interp.artist) {
          // Most reliable: plain "artist title"
          queries.push(`${interp.artist} ${interp.title}`);
          // Reversed: "title artist"
          queries.push(`${interp.title} ${interp.artist}`);
          // Structured: track: + artist: operators
          queries.push(`track:${interp.title} artist:${interp.artist}`);
        }
      }
      // Title-only queries (catches cases where artist name is wrong/noisy)
      for (const interp of uniqueInterps) {
        if (interp.title) queries.push(interp.title);
      }
      // First few words of title + artist (helps with long/garbled titles)
      if (cleaned && artist) {
        const shortTitle = cleaned.split(/\s+/).slice(0, 3).join(' ');
        if (shortTitle !== cleaned) queries.push(`${artist} ${shortTitle}`);
      }
      // Raw title as last resort
      if (!queries.includes(cleaned)) queries.push(cleaned);

      // Dedupe queries — scale with playlist size
      const maxQ = tracks.length > 200 ? 2 : tracks.length > 50 ? 3 : 4;
      const uniqueQueries = [...new Set(queries)].slice(0, maxQ);

      if (!uniqueQueries.length) return { source: src, bestMatch: null, confidence: "none", alternatives: [] };

      let allCandidates = [];

      for (const query of uniqueQueries) {
        const items = await searchSpotify(query);
        if (items.length) {
          const candidates = items.map((t) => {
            const spTitle = cleanTitle(t.name || "");
            const spArtists = (t.artists || []).map(a => a.name);
            const spAllArtists = spArtists.join(", ");

            // Title similarity — try against all interpretations, take best
            let bestTitleSim = 0;
            let bestArtistSim = 0;
            for (const interp of uniqueInterps) {
              const ts = similarity(interp.title, spTitle);
              if (ts > bestTitleSim) bestTitleSim = ts;

              // Artist similarity — check against ALL Spotify artists, not just first
              if (interp.artist) {
                for (const spa of spArtists) {
                  const as = similarity(interp.artist, spa);
                  if (as > bestArtistSim) bestArtistSim = as;
                }
                // Also try against joined artist string
                const joinedSim = similarity(interp.artist, spAllArtists);
                if (joinedSim > bestArtistSim) bestArtistSim = joinedSim;
              }
            }

            // If no artist info at all, give neutral score
            const hasArtist = uniqueInterps.some(i => i.artist);
            if (!hasArtist) bestArtistSim = 0.5;

            let durationBonus = 0;
            if (src.duration_ms && t.duration_ms) {
              const diff = Math.abs(src.duration_ms - t.duration_ms);
              durationBonus = diff < 5000 ? 1 : diff < 15000 ? 0.5 : 0;
            }

            const score = hasArtist
              ? bestTitleSim * 0.5 + bestArtistSim * 0.4 + durationBonus * 0.1
              : bestTitleSim * 0.85 + durationBonus * 0.15;

            return {
              id:          t.id,
              uri:         t.uri,
              name:        t.name,
              artist:      spAllArtists,
              album:       t.album?.name || "",
              art:         t.album?.images?.[0]?.url || "",
              duration_ms: t.duration_ms,
              score,
            };
          });
          allCandidates = allCandidates.concat(candidates);
          // Stop early if we have a strong match — save API calls
          if (allCandidates.length >= 3 && candidates.some(c => c.score >= 0.65)) break;
        }
      }

      // Deduplicate by track ID
      const seen = new Set();
      allCandidates = allCandidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      allCandidates.sort((a, b) => b.score - a.score);

      const best = allCandidates[0] || null;
      const confidence = !best ? "none"
        : best.score >= 0.65 ? "exact"
        : best.score >= 0.35 ? "close"
        : best.score >= 0.1 ? "similar"
        : "none";

      // Always return alternatives so user can swap — even low scores are useful as options
      return { source: src, bestMatch: best, confidence, alternatives: allCandidates.slice(1, 7) };
    };

    // Wait out rate limit if active (up to 10s), otherwise proceed
    if (Date.now() < _rateLimitedUntil) {
      const waitMs = _rateLimitedUntil - Date.now();
      if (waitMs > 10000) {
        return res.status(429).json({ message: "Rate limited — try again shortly" });
      }
      await new Promise(r => setTimeout(r, waitMs + 200));
    }

    // Emit real-time progress via Socket.io
    const { getIo } = await import("../utils/socketEmitter.js");
    const io = getIo();
    const userId = req.user.id;
    const emitProgress = (pct, status) => {
      io?.to(userId).emit('playlist:progress', { percent: Math.round(pct), status });
    };

    // Process tracks sequentially to avoid flooding Spotify API
    const startTime = Date.now();
    const TIMEOUT_MS = 290000; // ~5 min for large playlists (up to 1000 tracks)
    const matches = [];
    emitProgress(5, `Matching ${tracks.length} tracks...`);
    for (let i = 0; i < tracks.length; i++) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.log(`⏱ Spotify match timeout after ${matches.length}/${tracks.length} tracks`);
        for (let j = i; j < tracks.length; j++) {
          matches.push({ source: tracks[j], bestMatch: null, confidence: "none", alternatives: [] });
        }
        break;
      }
      if (Date.now() < _rateLimitedUntil) {
        const waitMs = Math.min(_rateLimitedUntil - Date.now(), 10000);
        if (Date.now() - startTime + waitMs > TIMEOUT_MS) break;
        await new Promise(r => setTimeout(r, waitMs + 200));
      }
      const result = await matchOne(tracks[i]);
      matches.push(result);

      const pct = 5 + (matches.length / tracks.length) * 90;
      emitProgress(pct, `Matched ${matches.length}/${tracks.length}...`);

      // Small delay between tracks to stay under rate limits
      if (i < tracks.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    const exact = matches.filter(m => m.confidence === 'exact').length;
    const close = matches.filter(m => m.confidence === 'close').length;
    emitProgress(100, `Done! ${exact + close}/${tracks.length} matched`);
    console.log(`✅ Matched ${tracks.length} tracks: ${exact} exact, ${close} close, ${tracks.length - exact - close} none`);

    res.json({ matches });
  } catch (err) {
    console.error("❌ Spotify match error:", err.response?.data || err.message);
    res.status(500).json({ message: "Matching failed" });
  }
};

// ─── SPOTIFY SAVE TRACK (Like) ──────────────────────────────────────────────
// PUT /api/spotify/save-track
// Body: { trackIds: ["id1", "id2"] }
export const saveTrack = async (req, res) => {
  try {
    const { trackIds = [] } = req.body;
    if (!trackIds.length) return res.status(400).json({ message: "No track IDs provided" });

    const result = await getValidToken(req.user.id, false);
    if (result.error) return res.status(result.error).json({ message: result.message });

    await axios.put(
      "https://api.spotify.com/v1/me/tracks",
      { ids: trackIds.slice(0, 50) },
      { headers: { Authorization: `Bearer ${result.accessToken}`, "Content-Type": "application/json" } }
    );

    res.json({ saved: true });
  } catch (err) {
    if (err.response?.status === 403) {
      return res.status(403).json({ error: "scope_missing", message: "Reconnect Spotify to save tracks" });
    }
    console.error("❌ Spotify save track error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to save track" });
  }
};

// ─── SPOTIFY GET USER PLAYLISTS ─────────────────────────────────────────────
// GET /api/spotify/playlists
export const getUserPlaylists = async (req, res) => {
  try {
    const result = await getValidToken(req.user.id, false);
    if (result.error) {
      return res.status(result.error).json({
        message: result.message,
        error: result.error === 404 ? "not_connected" : "auth_failed",
      });
    }

    const r = await axios.get("https://api.spotify.com/v1/me/playlists", {
      params: { limit: 50 },
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });

    const playlists = (r.data.items || []).map((p) => ({
      id:    p.id,
      name:  p.name,
      image: p.images?.[0]?.url || "",
      tracks: p.tracks?.total || 0,
    }));

    res.json({ playlists });
  } catch (err) {
    console.error("❌ Spotify get playlists error:", err.response?.data || err.message);
    if (err.response?.status === 403) {
      return res.status(403).json({ error: "scope_missing", message: "Reconnect Spotify to access playlists" });
    }
    res.status(err.response?.status || 500).json({ message: "Failed to fetch playlists" });
  }
};

// ─── SPOTIFY ADD TO EXISTING PLAYLIST ───────────────────────────────────────
// POST /api/spotify/playlist/:id/add
// Body: { trackUris: ["spotify:track:xxx", ...] }
export const addToPlaylist = async (req, res) => {
  try {
    const { trackUris = [] } = req.body;
    const playlistId = req.params.id;
    if (!trackUris.length) return res.status(400).json({ message: "No tracks provided" });

    const result = await getValidToken(req.user.id, false);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const auth = { Authorization: `Bearer ${result.accessToken}`, "Content-Type": "application/json" };

    // Add in batches of 100
    for (let i = 0; i < trackUris.length; i += 100) {
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: trackUris.slice(i, i + 100) },
        { headers: auth }
      );
    }

    res.json({ added: true });
  } catch (err) {
    if (err.response?.status === 403) {
      return res.status(403).json({ error: "scope_missing", message: "Reconnect Spotify to modify playlists" });
    }
    console.error("❌ Spotify add to playlist error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to add tracks" });
  }
};
