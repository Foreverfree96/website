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
    const refreshed = await refreshAccessToken(userId, user.spotifyRefreshToken);
    accessToken = refreshed.accessToken;
    expiresAt   = refreshed.expiresAt;
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
export const spotifyLogin = (req, res) => {
  const { token, returnTo } = req.query;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

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
    show_dialog:   "true",
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
const MAX_BACKOFF_MS    = 60 * 1000; // cap at 60s regardless of Retry-After
const PLAYLIST_CACHE_TTL = 60 * 60 * 1000; // 1 hour

const setRateLimit = (retryAfterHeader) => {
  const secs = Math.min(parseInt(retryAfterHeader || '10', 10), 60); // cap at 60s
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

  // Respect app-wide Spotify 429 backoff
  if (Date.now() < _rateLimitedUntil) {
    return res.status(429).json({ message: 'Rate limited — try again shortly' });
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

  const parseItems = (data) =>
    (data.items || []).filter(item => item?.track?.uri);

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

    if (!result.error) {
      const auth = { Authorization: `Bearer ${result.accessToken}` };

      // 1. GET /v1/playlists/{id}/tracks — requires playlist-read-private, paginates all tracks
      try {
        const items = await fetchAllPages(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
          auth
        );
        if (items.length) return cacheAndReturn(items);
      } catch (err) {
        if (err.response?.status === 429) {
          const secs = setRateLimit(err.response.headers?.['retry-after']);
          console.error(`❌ Spotify GET /tracks failed: 429 — backing off ${secs}s`);
          throw err;
        }
        if (err.response?.status !== 403) {
          console.error("❌ Spotify GET /tracks failed:", err.response?.status, err.response?.data?.error?.message);
          throw err;
        }
        // 403 = token lacks playlist-read-private scope, fall through to parent object
      }

      // 2. GET /v1/playlists/{id} — parent object, no scope needed for public playlists
      try {
        const r = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, { headers: auth });
        const items = parseItems(r.data.tracks || {});
        if (items.length) return cacheAndReturn(items);
      } catch (err) {
        if (err.response?.status === 429) setRateLimit(err.response.headers?.['retry-after']);
        if (err.response?.status !== 403) console.error("❌ Spotify GET playlist failed:", err.response?.status);
      }
    }

    // 3. Client credentials (public playlists only) — paginate all tracks
    try {
      const appToken = await getClientCredToken();
      const auth = { Authorization: `Bearer ${appToken}` };
      const items = await fetchAllPages(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
        auth
      );
      if (items.length) return cacheAndReturn(items);
    } catch (err) {
      if (err.response?.status === 429) {
        const secs = setRateLimit(err.response.headers?.['retry-after']);
        console.error(`❌ Spotify client-cred playlist fetch failed: 429 — backing off ${secs}s`);
      } else {
        console.error("❌ Spotify client-cred playlist fetch failed:", err.response?.status);
      }
    }

    return null; // no tracks found
  })();

  _inflight.set(playlistId, fetchPromise);
  try {
    const data = await fetchPromise;
    _inflight.delete(playlistId);
    if (data) return res.json(data);
    res.status(403).json({ message: 'Reconnect Spotify to load playlist tracks (playlist-read-private scope required)' });
  } catch (err) {
    _inflight.delete(playlistId);
    const status = err.response?.status || 500;
    res.status(status).json({ message: err.response?.data?.error?.message || 'Failed to fetch tracks' });
  }
};

// ─── SPOTIFY DISCONNECT ───────────────────────────────────────────────────────
export const spotifyDisconnect = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $unset: {
        spotifyId:           1,
        spotifyDisplayName:  1,
        spotifyAccessToken:  1,
        spotifyRefreshToken: 1,
        spotifyTokenExpiry:  1,
      },
      spotifyIsPremium: false,
    });
    res.json({ message: "Spotify disconnected" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SPOTIFY SEARCH TRACKS ──────────────────────────────────────────────────
// GET /api/spotify/search?q=...&limit=10
export const searchTracks = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q) return res.status(400).json({ message: "Missing query parameter q" });

    let token;
    const result = await getValidToken(req.user.id, false);
    token = result.error ? await getClientCredToken() : result.accessToken;

    const r = await axios.get("https://api.spotify.com/v1/search", {
      params: { q, type: "track", limit: Math.min(Number(limit), 50) },
      headers: { Authorization: `Bearer ${token}` },
    });

    const tracks = (r.data.tracks?.items || []).map((t) => ({
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
    res.status(err.response?.status || 500).json({ message: "Search failed" });
  }
};

// ─── SPOTIFY GENERATE PLAYLIST ──────────────────────────────────────────────
// POST /api/spotify/generate
// Body: { seedTrackIds: [], seedPlaylistId?, genres: [], limit: 30 }
//
// Spotify deprecated /recommendations in Nov 2024. This uses a search-based
// approach: fetch seed track artists, build varied search queries from
// artist names + genres, collect and deduplicate results.
export const generatePlaylist = async (req, res) => {
  try {
    let { seedTrackIds = [], seedTrackMeta = [], seedPlaylistId, genres = [], limit = 30 } = req.body;
    limit = Math.max(1, Math.min(Number(limit) || 30, 100));

    let token;
    const result = await getValidToken(req.user.id, false);
    token = result.error ? await getClientCredToken() : result.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    // Collect artist names from seed tracks
    const seedArtists = [];
    const seedTrackUris = new Set();

    // Use frontend-provided metadata as initial artist source
    seedTrackMeta.forEach((m) => {
      const artist = (m.artist || "").split(",")[0].trim();
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
        } catch { items = []; }
      }
      if (items?.length) {
        const shuffled = items.sort(() => Math.random() - 0.5);
        shuffled.slice(0, 3).forEach((i) => {
          const artist = i.track?.artists?.[0]?.name;
          if (artist && !seedArtists.includes(artist)) seedArtists.push(artist);
          if (i.track?.id) seedTrackIds.push(i.track.id);
        });
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

    if (!seedArtists.length && !genres.length && !uniqueIds.length) {
      return res.status(400).json({ message: "Provide at least one seed track or genre" });
    }

    // If we have track IDs but no artist names (lookup failed), use track names as search queries
    if (!seedArtists.length && seedTrackMeta.length) {
      seedTrackMeta.forEach((m) => {
        if (m.name) seedArtists.push(m.name);
      });
    }

    // Build diverse search queries
    // Spotify search supports: artist:Name, year:YYYY, but NOT genre: filter.
    // Use genre words as plain text mixed with artist names for variety.
    const queries = [];

    // Artist-based queries
    seedArtists.forEach((artist) => {
      queries.push(artist);
      genres.forEach((g) => queries.push(`${artist} ${g}`));
    });

    // Genre-only queries (plain text — Spotify matches against track/artist/album metadata)
    genres.forEach((g) => {
      queries.push(g);
      queries.push(`${g} music`);
      queries.push(`${g} hits`);
    });

    // Add cross-pollination queries for more variety
    if (seedArtists.length >= 2) {
      queries.push(`${seedArtists[0]} ${seedArtists[1]}`);
    }
    if (queries.length < 4 && seedArtists.length) {
      const years = ['2023', '2024', '2025'];
      seedArtists.slice(0, 2).forEach((artist) => {
        const yr = years[Math.floor(Math.random() * years.length)];
        queries.push(`${artist} ${yr}`);
      });
    }

    // Deduplicate and shuffle for variety
    const uniqueQueries = [...new Set(queries)];
    uniqueQueries.sort(() => Math.random() - 0.5);

    // Search in batches until we have enough tracks
    const seenIds = new Set(uniqueIds); // exclude seed tracks from results
    const collected = [];
    const perQuery = Math.ceil((limit + 10) / Math.max(uniqueQueries.length, 1));

    for (const q of uniqueQueries) {
      if (collected.length >= limit) break;
      try {
        const offset = Math.floor(Math.random() * 20);
        const r = await axios.get("https://api.spotify.com/v1/search", {
          params: { q, type: "track", limit: Math.min(perQuery + 5, 50), offset },
          headers: auth,
        });
        const items = r.data.tracks?.items || [];
        for (const t of items) {
          if (collected.length >= limit) break;
          if (seenIds.has(t.id)) continue;
          seenIds.add(t.id);
          collected.push({
            id:          t.id,
            uri:         t.uri,
            name:        t.name,
            artist:      t.artists?.map((a) => a.name).join(", ") || "",
            album:       t.album?.name || "",
            art:         t.album?.images?.[0]?.url || "",
            duration_ms: t.duration_ms,
          });
        }
      } catch (e) {
        console.error(`❌ Spotify search query "${q}" failed:`, e.response?.status || e.message);
      }
    }

    // Shuffle final results so tracks from different queries are mixed
    collected.sort(() => Math.random() - 0.5);

    console.log(`✅ Generate: ${uniqueQueries.length} queries → ${collected.length} tracks (requested ${limit})`);
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
    .replace(/\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video)|lyrics?|audio|hd|hq|remaster(ed)?|live|visuali[sz]er|explicit|clean|mv|m\/v|4k|video\s*oficial)[\)\]]/gi, "")
    .replace(/\s*[\(\[]feat\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\|.*$/, "")
    .trim();

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

const similarity = (a, b) => {
  if (!a || !b) return 0;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;
  const maxLen = Math.max(al.length, bl.length);
  return maxLen ? 1 - levenshtein(al, bl) / maxLen : 0;
};

export const matchTracks = async (req, res) => {
  try {
    const { tracks = [] } = req.body;
    if (!tracks.length) return res.status(400).json({ message: "No tracks provided" });

    let token;
    const result = await getValidToken(req.user.id, false);
    token = result.error ? await getClientCredToken() : result.accessToken;

    const auth = { Authorization: `Bearer ${token}` };
    const matches = [];

    for (const src of tracks) {
      const cleaned = cleanTitle(src.title || "");
      const query = `${cleaned} ${src.artist || ""}`.trim();

      try {
        const r = await axios.get("https://api.spotify.com/v1/search", {
          params: { q: query, type: "track", limit: 5 },
          headers: auth,
        });

        const candidates = (r.data.tracks?.items || []).map((t) => {
          const titleSim  = similarity(cleaned, t.name);
          const artistSim = similarity(src.artist || "", t.artists?.[0]?.name || "");
          let durationBonus = 0;
          if (src.duration_ms && t.duration_ms) {
            const diff = Math.abs(src.duration_ms - t.duration_ms);
            durationBonus = diff < 5000 ? 1 : diff < 15000 ? 0.5 : 0;
          }
          const score = titleSim * 0.5 + artistSim * 0.4 + durationBonus * 0.1;
          return {
            id:          t.id,
            uri:         t.uri,
            name:        t.name,
            artist:      t.artists?.map((a) => a.name).join(", ") || "",
            album:       t.album?.name || "",
            art:         t.album?.images?.[0]?.url || "",
            duration_ms: t.duration_ms,
            score,
          };
        });

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0] || null;
        const confidence = !best ? "none" : best.score >= 0.85 ? "exact" : best.score >= 0.55 ? "close" : "none";

        matches.push({
          source: src,
          bestMatch: best,
          confidence,
          alternatives: candidates.slice(1, 4),
        });
      } catch {
        matches.push({ source: src, bestMatch: null, confidence: "none", alternatives: [] });
      }
    }

    res.json({ matches });
  } catch (err) {
    console.error("❌ Spotify match error:", err.response?.data || err.message);
    res.status(500).json({ message: "Matching failed" });
  }
};
