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

  // Normalise items from both old format (.track) and new Dev Mode format (.item)
  const parseItems = (data, label = '') => {
    const raw = data.items || [];
    const normalised = raw.map(entry => {
      // New Dev Mode format uses .item instead of .track
      if (entry?.item && !entry?.track) {
        return { ...entry, track: entry.item };
      }
      return entry;
    });
    const valid = normalised.filter(item => item?.track?.uri);
    if (raw.length !== valid.length) {
      console.log(`   ${label} parseItems: ${raw.length} raw → ${valid.length} valid`);
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

      // 1. GET /v1/playlists/{id}/items — Dev Mode (Feb 2026+) endpoint, owner/collaborator only
      try {
        console.log(`   [1] Trying user-token GET /items for ${playlistId}...`);
        const items = await fetchAllPages(
          `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`,
          auth
        );
        if (items.length) return cacheAndReturn(items);
        console.log(`   [1] /items returned 0 items`);
      } catch (err) {
        console.error(`   [1] /items failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
        if (err.response?.status === 429) setRateLimit(err.response.headers?.['retry-after']);
      }

      // 2. GET /v1/playlists/{id}/tracks — legacy endpoint (Extended Quota / pre-Feb 2026)
      try {
        console.log(`   [2] Trying user-token GET /tracks for ${playlistId}...`);
        const items = await fetchAllPages(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
          auth
        );
        if (items.length) return cacheAndReturn(items);
        console.log(`   [2] /tracks returned 0 items`);
      } catch (err) {
        console.error(`   [2] /tracks failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
        if (err.response?.status === 429) setRateLimit(err.response.headers?.['retry-after']);
      }

      // 3. GET /v1/playlists/{id} — parent object with embedded tracks
      try {
        console.log(`   [3] Trying user-token GET /playlists/${playlistId}...`);
        const r = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, { headers: auth });
        // Dev Mode may strip tracks; check both .tracks and .items
        const tracksObj = r.data.tracks || r.data.items || {};
        const firstItems = parseItems(tracksObj);
        const nextUrl = tracksObj.next || null;
        let allItems = firstItems;
        if (nextUrl) {
          const remaining = await fetchAllPages(nextUrl, auth);
          allItems = allItems.concat(remaining);
        }
        if (allItems.length) return cacheAndReturn(allItems);
        console.log(`   [3] Parent object returned 0 items`);
      } catch (err) {
        console.error(`   [3] Parent object failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
        if (err.response?.status === 429) setRateLimit(err.response.headers?.['retry-after']);
      }
    }

    // 4. Client credentials — try /items then /tracks
    try {
      console.log(`   [4] Trying client-creds for ${playlistId}...`);
      const appToken = await getClientCredToken();
      const ccAuth = { Authorization: `Bearer ${appToken}` };
      // Try /items first (Dev Mode)
      let items = [];
      try {
        items = await fetchAllPages(
          `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`,
          ccAuth
        );
      } catch { /* fall through to /tracks */ }
      if (!items.length) {
        items = await fetchAllPages(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
          ccAuth
        );
      }
      if (items.length) return cacheAndReturn(items);
      console.log(`   [4] Client-creds returned 0 items`);
    } catch (err) {
      console.error(`   [4] Client-creds failed:`, err.response?.status, err.response?.data?.error?.message || err.message);
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
    console.error(`❌ Playlist ${playlistId}: no tracks found (all 4 methods failed)`);
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
let _searchCcRateLimitUntil = 0;   // client-creds bucket
let _searchUserRateLimitUntil = 0; // per-user bucket (keyed globally for simplicity)

export const searchTracks = async (req, res) => {
  try {
    const { q, limit = 50, trackId } = req.query;

    // Single track lookup by ID — used when generating from a pasted track URL
    if (trackId) {
      const result = await getValidToken(req.user.id, false);
      const token = result.error ? await getClientCredToken() : result.accessToken;
      try {
        const r = await axios.get(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const t = r.data;
        return res.json({ track: { id: t.id, uri: t.uri, name: t.name, artist: t.artists?.map(a => a.name).join(', ') || '', album: t.album?.name || '', art: t.album?.images?.[0]?.url || '' } });
      } catch (e) {
        return res.status(e.response?.status || 500).json({ message: "Track not found" });
      }
    }

    if (!q) return res.status(400).json({ message: "Missing query parameter q" });

    const doSearch = async (t) => {
      const r = await axios.get("https://api.spotify.com/v1/search", {
        params: { q, type: "track", limit: Math.min(Number(limit), 50) },
        headers: { Authorization: `Bearer ${t}` },
      });
      return r.data.tracks?.items || [];
    };

    // Build token buckets — user token first (each user = separate rate limit), then client creds
    const buckets = [];
    if (req.user?.id && Date.now() >= _searchUserRateLimitUntil) {
      const userResult = await getValidToken(req.user.id, false);
      if (!userResult.error) buckets.push({ token: userResult.accessToken, label: 'user', limitRef: 'user' });
    }
    if (Date.now() >= _searchCcRateLimitUntil) {
      buckets.push({ token: await getClientCredToken(), label: 'client-creds', limitRef: 'cc' });
    }
    if (!buckets.length) {
      const soonest = Math.min(_searchUserRateLimitUntil, _searchCcRateLimitUntil);
      const retryAfter = Math.max(1, Math.ceil((soonest - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ tracks: [], retryAfter, message: 'Rate limited — try again shortly' });
    }

    let items;
    for (const bucket of buckets) {
      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          items = await doSearch(bucket.token);
          success = true;
          break;
        } catch (e) {
          if (e.response?.status === 429) {
            const secs = Math.min(parseInt(e.response.headers?.['retry-after'] || '3', 10), 15);
            if (bucket.limitRef === 'user') _searchUserRateLimitUntil = Date.now() + secs * 1000;
            else _searchCcRateLimitUntil = Date.now() + secs * 1000;
            // Try next bucket instead of waiting
            break;
          } else if (e.response?.status === 401 || e.response?.status === 403) {
            if (bucket.limitRef === 'cc') _clientCredCache = null;
            if (attempt === 0) {
              // Refresh and retry once
              bucket.token = bucket.limitRef === 'cc'
                ? await getClientCredToken()
                : (await getValidToken(req.user.id, false)).accessToken;
              if (bucket.token) continue;
            }
            break; // try next bucket
          } else {
            console.error(`❌ Search error (${bucket.label}):`, e.response?.status || e.message);
            break;
          }
        }
      }
      if (success) break;
    }

    if (!items) {
      // All buckets failed
      const soonest = Math.min(
        _searchUserRateLimitUntil || Infinity,
        _searchCcRateLimitUntil || Infinity
      );
      const retryAfter = soonest < Infinity ? Math.max(1, Math.ceil((soonest - Date.now()) / 1000)) : 5;
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ tracks: [], retryAfter, message: 'Rate limited — try again shortly' });
    }

    const tracks = (items || []).map((t) => ({
      id:          t.id,
      uri:         t.uri,
      name:        t.name,
      artist:      t.artists?.map((a) => a.name).join(", ") || "",
      album:       t.album?.name || "",
      art:         t.album?.images?.[0]?.url || "",
      duration_ms: t.duration_ms,
      explicit:    !!t.explicit,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("❌ Spotify search error:", err.response?.data || err.message);
    if (err.response?.status === 429) {
      const secs = Math.min(parseInt(err.response.headers?.['retry-after'] || '5', 10), 10);
      _searchCcRateLimitUntil = Date.now() + secs * 1000;
      res.set('Retry-After', String(secs));
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
    let { seedTrackIds = [], seedTrackMeta = [], seedPlaylistId, genres = [], languages = ['en'], limit = 30 } = req.body;
    limit = Math.max(1, Math.min(Number(limit) || 30, 100));
    if (!Array.isArray(languages) || !languages.length) languages = ['en'];

    console.log(`🎵 Generate request: ${seedTrackIds.length} trackIds, ${seedTrackMeta.length} meta, ${genres.length} genres, limit=${limit}, playlist=${seedPlaylistId || 'none'}`);
    if (seedTrackMeta.length) console.log(`   Meta:`, seedTrackMeta.slice(0, 3).map(m => `${m.name} - ${m.artist}`));

    // Try user token first, fall back to client creds if unavailable
    const result = await getValidToken(req.user.id, false);
    const userToken = result.error ? null : result.accessToken;
    const ccToken = await getClientCredToken();
    const fallbackToken = userToken || ccToken;
    console.log(`   Token: ${userToken ? 'user-token' : 'client-creds-fallback'}`);
    const auth = { Authorization: `Bearer ${fallbackToken}` };

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
        try {
          const r = await axios.get(
            `https://api.spotify.com/v1/playlists/${seedPlaylistId}/tracks?limit=100`,
            { headers: auth }
          );
          items = (r.data.items || []).filter((i) => i?.track?.id);
        } catch (e) {
          console.error(`❌ Playlist seed fetch failed:`, e.response?.status || e.message);
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
    const TIMEOUT_MS = 180000; // 3 min — allows time for rate-limit waits
    const seenIds = new Set(uniqueIds); // exclude seed tracks from results
    const collected = [];
    const artistCount = new Map(); // track how many songs per primary artist
    const MAX_PER_ARTIST = 2;
    const overflow = []; // tracks that exceed the per-artist cap (used as backfill)

    // Language market codes for Spotify API and search keywords
    const LANG_MARKETS = { en: 'US', fr: 'FR', es: 'ES', ar: 'SA', ja: 'JP', ko: 'KR' };
    const LANG_KEYWORDS = { en: null, fr: 'french', es: 'spanish', ar: 'arabic', ja: 'japanese', ko: 'korean' };
    const hasEnglish = languages.includes('en');
    const nonEnglishLangs = languages.filter(l => l !== 'en');
    const onlyEnglish = hasEnglish && !nonEnglishLangs.length;
    const onlyNonEnglish = !hasEnglish && nonEnglishLangs.length > 0;
    // Market code for Spotify API — use the first selected language's market
    const primaryMarket = onlyNonEnglish
      ? (LANG_MARKETS[nonEnglishLangs[0]] || 'US')
      : 'US';

    // Chill/lofi diversity keywords — not just "chill" in the title
    const CHILL_DIVERSE = ['chill vibes', 'relaxing', 'mellow', 'laid back', 'downtempo', 'ambient chill', 'easy listening', 'soft', 'calm'];
    const LOFI_DIVERSE = ['lofi hip hop', 'lofi beats', 'lofi chill', 'chillhop', 'study beats', 'lofi jazz'];

    // Build base queries from seeds and genres (language-neutral)
    const baseQueries = [];

    seedArtists.forEach(artist => baseQueries.push(artist));

    seedTrackMeta.slice(0, 5).forEach(m => {
      const name = (m.name || '').replace(/\s*[\(\[].*[\)\]]$/g, '').trim();
      const artist = cleanArtist(m.artist);
      if (name && artist) baseQueries.push(`${artist} ${name}`);
      else if (name) baseQueries.push(name);
    });

    seedArtists.slice(0, 3).forEach(artist => {
      genres.slice(0, 2).forEach(g => baseQueries.push(`${artist} ${g}`));
    });

    genres.forEach(g => {
      if (g === 'chill') {
        const picks = CHILL_DIVERSE.sort(() => Math.random() - 0.5).slice(0, 3);
        picks.forEach(q => baseQueries.push(q));
      } else if (g === 'lofi') {
        const picks = LOFI_DIVERSE.sort(() => Math.random() - 0.5).slice(0, 3);
        picks.forEach(q => baseQueries.push(q));
      } else {
        baseQueries.push(g);
        baseQueries.push(`${g} hits`);
        baseQueries.push(`best ${g}`);
      }
    });

    if (seedArtists.length >= 2) baseQueries.push(`${seedArtists[0]} ${seedArtists[1]}`);

    // Apply language enforcement — tag queries with language keywords
    // so Spotify returns results ONLY in the selected language(s)
    const queries = [];
    if (onlyEnglish) {
      // English only — use base queries as-is (market=US handles it)
      baseQueries.forEach(q => queries.push(q));
    } else if (onlyNonEnglish) {
      // Non-English only — prefix every query with the language keyword
      // and add dedicated language queries to ensure results match
      for (const lang of nonEnglishLangs) {
        const kw = LANG_KEYWORDS[lang];
        if (!kw) continue;
        baseQueries.forEach(q => queries.push(`${kw} ${q}`));
        queries.push(`${kw} music`);
        queries.push(`${kw} hits`);
        queries.push(`top ${kw} songs`);
        genres.slice(0, 2).forEach(g => queries.push(`${kw} ${g}`));
      }
    } else {
      // Mixed (English + other) — split: base queries for English,
      // language-tagged queries for non-English languages
      baseQueries.forEach(q => queries.push(q));
      for (const lang of nonEnglishLangs) {
        const kw = LANG_KEYWORDS[lang];
        if (!kw) continue;
        // Add proportional language-specific queries
        seedArtists.slice(0, 2).forEach(a => queries.push(`${kw} ${a}`));
        queries.push(`${kw} music`);
        queries.push(`${kw} hits`);
        genres.slice(0, 2).forEach(g => queries.push(`${kw} ${g}`));
      }
    }

    // Deduplicate and cap — allow more queries when we need more tracks
    const maxQueries = limit > 50 ? 16 : limit > 20 ? 12 : 10;
    const uniqueQueries = [...new Set(queries)].slice(0, maxQueries);
    uniqueQueries.sort(() => Math.random() - 0.5);

    const perQuery = Math.ceil((limit + 10) / Math.max(uniqueQueries.length, 1));

    console.log(`   Queries (${uniqueQueries.length}): ${uniqueQueries.slice(0, 6).join(' | ')}${uniqueQueries.length > 6 ? ' ...' : ''}`);
    console.log(`   perQuery=${perQuery}, rateLimited=${Date.now() < _rateLimitedUntil ? 'YES until ' + new Date(_rateLimitedUntil).toISOString() : 'no'}`);

    // Resilient search — uses client creds token (separate rate limit bucket from match)
    // Falls back to user token if client creds fail
    const doSearch = async (query) => {
      const offset = Math.floor(Math.random() * 5);
      const searchLimit = Math.min(perQuery + 5, 50);
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          // Use client creds for generate searches — keeps rate limit separate from match (user token)
          const ccToken = await getClientCredToken();
          const r = await axios.get("https://api.spotify.com/v1/search", {
            params: { q: query, type: "track", limit: searchLimit, offset, market: primaryMarket },
            headers: { Authorization: `Bearer ${ccToken}` },
          });
          return r.data.tracks?.items || [];
        } catch (e) {
          const status = e.response?.status;

          if (status === 400) {
            const clean = query.replace(/[^\w\s'-]/g, '').trim();
            if (clean && clean !== query) {
              try {
                const ccToken = await getClientCredToken();
                const r2 = await axios.get("https://api.spotify.com/v1/search", {
                  params: { q: clean, type: "track", limit: searchLimit, offset: 0 },
                  headers: { Authorization: `Bearer ${ccToken}` },
                });
                return r2.data.tracks?.items || [];
              } catch { return []; }
            }
            return [];
          }

          if (status === 401 || status === 403) {
            _clientCredCache = null; // force refresh
            if (attempt < 2) continue;
            return [];
          }

          // 429: wait for cooldown
          if (status === 429 && attempt < 3) {
            const secs = Math.min(parseInt(e.response.headers?.['retry-after'] || '3', 10), 15);
            console.log(`   ⏳ Generate search rate-limited, waiting ${secs}s...`);
            await new Promise(r => setTimeout(r, secs * 1000 + 500));
            continue;
          }

          if (attempt < 2) console.error(`   ⚠ Search "${query}" attempt ${attempt}: ${status || e.message}`);
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

      let items = await doSearch(uniqueQueries[qi]);

      // Filter out parody, karaoke, cover, tribute, and unverified music
      const JUNK_RE = /\b(parody|karaoke|tribute|8[- ]?bit|midi|cover|lullaby|music box|ringtone|made famous|in the style of|originally performed)\b/i;
      items = items.filter(t => {
        if (!t?.id) return false;
        const name = t.name || '';
        const album = t.album?.name || '';
        if (JUNK_RE.test(name) || JUNK_RE.test(album)) return false;
        // Filter very low popularity tracks (likely spam/unverified)
        if (typeof t.popularity === 'number' && t.popularity < 15) return false;
        return true;
      });

      // Sort by popularity so we pick the most popular tracks first
      items.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

      let added = 0;
      for (const t of items) {
        if (collected.length >= limit) break;
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);

        const primaryArtist = (t.artists?.[0]?.name || '').toLowerCase();
        const count = artistCount.get(primaryArtist) || 0;
        const track = {
          id: t.id, uri: t.uri, name: t.name,
          artist: t.artists?.map(a => a.name).join(', ') || '',
          album: t.album?.name || '', art: t.album?.images?.[0]?.url || '',
          duration_ms: t.duration_ms, popularity: t.popularity || 0,
        };

        if (count >= MAX_PER_ARTIST) {
          overflow.push(track); // save for backfill if we can't fill enough
          continue;
        }
        artistCount.set(primaryArtist, count + 1);
        collected.push(track);
        added++;
      }
      if (qi < 3 || added === 0) console.log(`   Query ${qi}: "${uniqueQueries[qi]}" → ${items.length} results, +${added} new`);

      // Emit progress
      const queryPct = 10 + ((qi + 1) / uniqueQueries.length) * 70;
      const fillPct = 10 + (collected.length / limit) * 70;
      emitProgress(Math.max(queryPct, fillPct), `Found ${collected.length} tracks...`);

      // Short delay to stay under per-second limits
      if (qi < uniqueQueries.length - 1 && collected.length < limit) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Backfill from overflow if we didn't reach the limit (relax the cap)
    if (collected.length < limit && overflow.length) {
      overflow.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      for (const t of overflow) {
        if (collected.length >= limit) break;
        collected.push(t);
      }
    }

    emitProgress(90, 'Finalizing...');

    // Weighted shuffle — popular tracks float higher but still randomized
    // Also spread artists apart so the same artist doesn't appear back-to-back
    collected.sort((a, b) => {
      const pa = (a.popularity || 0) + Math.random() * 40;
      const pb = (b.popularity || 0) + Math.random() * 40;
      return pb - pa;
    });

    // Post-shuffle: spread same-artist tracks apart
    for (let i = 1; i < collected.length; i++) {
      const prevArtist = (collected[i - 1].artist || '').split(',')[0].trim().toLowerCase();
      const curArtist  = (collected[i].artist || '').split(',')[0].trim().toLowerCase();
      if (prevArtist && prevArtist === curArtist) {
        // Find the nearest different-artist track to swap with
        for (let j = i + 1; j < Math.min(i + 6, collected.length); j++) {
          const swapArtist = (collected[j].artist || '').split(',')[0].trim().toLowerCase();
          if (swapArtist !== prevArtist) {
            [collected[i], collected[j]] = [collected[j], collected[i]];
            break;
          }
        }
      }
    }

    emitProgress(100, `Done! ${collected.length} tracks`);
    console.log(`✅ Generate: ${collected.length} tracks (requested ${limit}) [user-token]`);
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

    // Force refresh to ensure we have latest scopes
    const result = await getValidToken(req.user.id, true);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const auth = { Authorization: `Bearer ${result.accessToken}` };

    // Get Spotify user ID — also verify token identity matches
    const user = await User.findById(req.user.id).select("spotifyId");
    if (!user?.spotifyId) return res.status(400).json({ message: "Spotify not connected" });

    // Verify the token actually belongs to this Spotify user
    try {
      const me = await axios.get("https://api.spotify.com/v1/me", { headers: auth });
      console.log(`🔑 Create playlist: token user=${me.data.id}, stored spotifyId=${user.spotifyId}`);
      if (me.data.id !== user.spotifyId) {
        // Fix the mismatch — update stored ID to match the token
        console.log(`⚠️ Fixing spotifyId mismatch: ${user.spotifyId} → ${me.data.id}`);
        await User.findByIdAndUpdate(req.user.id, { spotifyId: me.data.id });
        user.spotifyId = me.data.id;
      }
    } catch (e) {
      console.error(`❌ /me check failed:`, e.response?.status, e.response?.data);
    }

    // Create the playlist — Dev Mode (Feb 2026) uses /me/playlists instead of /users/{id}/playlists
    let playlistId;
    try {
      let r;
      try {
        // Try Dev Mode endpoint first
        r = await axios.post(
          `https://api.spotify.com/v1/me/playlists`,
          { name, description, public: false },
          { headers: { ...auth, "Content-Type": "application/json" } }
        );
      } catch (e) {
        if (e.response?.status === 403 || e.response?.status === 404) {
          // Fallback to legacy endpoint (Extended Quota Mode)
          r = await axios.post(
            `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`,
            { name, description, public: false },
            { headers: { ...auth, "Content-Type": "application/json" } }
          );
        } else throw e;
      }
      playlistId = r.data.id;
      console.log(`✅ Playlist created: ${playlistId} (${name})`);
    } catch (err) {
      console.error(`❌ Spotify create playlist failed:`, err.response?.status, err.response?.data);
      if (err.response?.status === 403) {
        return res.status(403).json({
          error: "scope_missing",
          message: "Reconnect Spotify to enable playlist creation",
        });
      }
      throw err;
    }

    // Add tracks in batches of 100 — Dev Mode uses /items, legacy uses /tracks
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100);
      try {
        await axios.post(
          `https://api.spotify.com/v1/playlists/${playlistId}/items`,
          { uris: batch },
          { headers: { ...auth, "Content-Type": "application/json" } }
        );
      } catch (e) {
        if (e.response?.status === 403 || e.response?.status === 404) {
          await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            { uris: batch },
            { headers: { ...auth, "Content-Type": "application/json" } }
          );
        } else throw e;
      }
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

    // Two tokens — user token + client creds — two separate rate limit buckets
    // Start with user token; on 429, swap to client creds (fresh bucket)
    const userResult = await getValidToken(req.user.id, false);
    const userToken = userResult.error ? null : userResult.accessToken;
    let ccToken = await getClientCredToken();
    // Track which token we're currently using
    let currentToken = userToken || ccToken;
    let usingUserToken = !!userToken;
    const auth = { Authorization: `Bearer ${currentToken}` };

    console.log(`🔍 Matching ${tracks.length} tracks to Spotify... [${usingUserToken ? 'user-token' : 'client-creds'}]`);

    // Pause tracking for rate limits
    let _matchPausedUntil = 0;

    const searchSpotify = async (query) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (_matchPausedUntil > Date.now()) {
          await new Promise(r => setTimeout(r, _matchPausedUntil - Date.now() + 200));
        }
        try {
          const q = attempt === 0 ? query : query.replace(/[^\w\s'-]/g, '').trim();
          if (!q) return [];
          const r = await axios.get("https://api.spotify.com/v1/search", {
            params: { q, type: "track", limit: 10 },
            headers: auth,
          });
          return r.data.tracks?.items || [];
        } catch (e) {
          const status = e.response?.status;
          if (status === 400 && attempt === 0) continue;

          // On 401: refresh current token
          if (status === 401 && attempt < 2) {
            if (usingUserToken) {
              try {
                const refreshed = await getValidToken(req.user.id, true);
                if (!refreshed.error) { currentToken = refreshed.accessToken; auth.Authorization = `Bearer ${currentToken}`; continue; }
              } catch {}
            }
            ccToken = await getClientCredToken();
            currentToken = ccToken; usingUserToken = false;
            auth.Authorization = `Bearer ${currentToken}`;
            continue;
          }

          // 429: swap token bucket, then wait reduced time
          if (status === 429 && attempt < 3) {
            const secs = parseInt(e.response.headers?.['retry-after'] || '5', 10);
            // Try swapping to the other token bucket first
            if (usingUserToken && ccToken) {
              usingUserToken = false; currentToken = ccToken;
              auth.Authorization = `Bearer ${currentToken}`;
              console.log(`   ⏳ Match: user-token rate-limited, swapped to client-creds`);
              await new Promise(r => setTimeout(r, 500)); // brief pause
              continue;
            } else if (!usingUserToken && userToken) {
              usingUserToken = true; currentToken = userToken;
              auth.Authorization = `Bearer ${currentToken}`;
              console.log(`   ⏳ Match: client-creds rate-limited, swapped to user-token`);
              await new Promise(r => setTimeout(r, 500));
              continue;
            }
            // Both buckets exhausted — have to wait
            const waitMs = Math.min(secs, 30) * 1000 + 500;
            _matchPausedUntil = Date.now() + waitMs;
            console.log(`   ⏳ Match: both tokens rate-limited, waiting ${Math.round(waitMs / 1000)}s`);
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

      // Build search queries — most precise first to minimize API calls
      const queries = [];
      for (const interp of uniqueInterps) {
        if (interp.title && interp.artist) {
          // Most precise: Spotify search operators
          queries.push(`track:${interp.title} artist:${interp.artist}`);
          // Plain combined — reliable fallback
          queries.push(`${interp.artist} ${interp.title}`);
        }
      }
      // Title-only (catches wrong/noisy artist names from YouTube channels)
      for (const interp of uniqueInterps) {
        if (interp.title) queries.push(interp.title);
      }
      // Short title + artist for very long titles
      if (cleaned && artist && cleaned.split(/\s+/).length > 4) {
        const shortTitle = cleaned.split(/\s+/).slice(0, 3).join(' ');
        queries.push(`${artist} ${shortTitle}`);
      }

      // Dedupe queries — keep it lean to avoid rate limits
      const maxQ = tracks.length > 100 ? 2 : 3;
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

            let score = hasArtist
              ? bestTitleSim * 0.5 + bestArtistSim * 0.4 + durationBonus * 0.1
              : bestTitleSim * 0.85 + durationBonus * 0.15;

            // Prefer explicit versions — penalize clean versions
            if (t.explicit) score += 0.05;
            else if (!t.explicit && allCandidates.length > 0) score -= 0.02;

            // Penalize live versions — we want studio recordings
            const trackName = t.name || "";
            const albumName = t.album?.name || "";
            const isLiveTrack = /\b(live\s+(at|in|from|on|version|session|performance|recording)|[\(\[]live[\)\]]|- live\b|live$)/i.test(trackName);
            const isLiveAlbum = /\b(live\s+(at|in|from|on)|[\(\[]live[\)\]]|- live\b|live$)/i.test(albumName);
            if (isLiveTrack) score -= 0.10;
            else if (isLiveAlbum) score -= 0.06;

            return {
              id:          t.id,
              uri:         t.uri,
              name:        t.name,
              artist:      spAllArtists,
              album:       t.album?.name || "",
              art:         t.album?.images?.[0]?.url || "",
              duration_ms: t.duration_ms,
              explicit:    !!t.explicit,
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

    // Emit real-time progress via Socket.io
    const { getIo } = await import("../utils/socketEmitter.js");
    const io = getIo();
    const userId = req.user.id;
    const emitProgress = (pct, status) => {
      io?.to(userId).emit('playlist:progress', { percent: Math.round(pct), status });
    };

    // Process tracks one at a time — Spotify rate limits are strict even with client creds
    const startTime = Date.now();
    const TIMEOUT_MS = 290000; // ~5 min for large playlists
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
      // If paused from a 429, wait it out before next track
      if (_matchPausedUntil > Date.now()) {
        await new Promise(r => setTimeout(r, _matchPausedUntil - Date.now() + 200));
      }
      const result = await matchOne(tracks[i]);
      matches.push(result);

      const pct = 5 + (matches.length / tracks.length) * 90;
      emitProgress(pct, `Matched ${matches.length}/${tracks.length}...`);

      // Small delay between tracks
      if (i < tracks.length - 1) await new Promise(r => setTimeout(r, 100));
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

// PUT /api/spotify/save-playlist
// Body: { playlistId: "spotify_playlist_id" }
// Follows (saves) a playlist to the user's Spotify library
export const savePlaylist = async (req, res) => {
  try {
    const { playlistId } = req.body;
    if (!playlistId) return res.status(400).json({ message: "No playlist ID provided" });

    const result = await getValidToken(req.user.id, false);
    if (result.error) return res.status(result.error).json({ message: result.message });

    await axios.put(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/followers`,
      { public: false },
      { headers: { Authorization: `Bearer ${result.accessToken}`, "Content-Type": "application/json" } }
    );

    res.json({ saved: true });
  } catch (err) {
    if (err.response?.status === 403) {
      return res.status(403).json({ error: "scope_missing", message: "Reconnect Spotify to save playlists" });
    }
    console.error("❌ Spotify save playlist error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to save playlist" });
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

    // Add in batches of 100 — Dev Mode uses /items, legacy uses /tracks
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100);
      try {
        await axios.post(
          `https://api.spotify.com/v1/playlists/${playlistId}/items`,
          { uris: batch },
          { headers: auth }
        );
      } catch (e) {
        if (e.response?.status === 403 || e.response?.status === 404) {
          await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            { uris: batch },
            { headers: auth }
          );
        } else throw e;
      }
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
