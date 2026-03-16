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
].join(" ");

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

// ─── SPOTIFY LOGIN ────────────────────────────────────────────────────────────
export const spotifyLogin = (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    scope:         SCOPES,
    redirect_uri:  process.env.SPOTIFY_REDIRECT_URI,
    state:         userId,
    show_dialog:   "true",
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
};

// ─── SPOTIFY CALLBACK ─────────────────────────────────────────────────────────
export const spotifyCallback = async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error || !code || !userId) {
    return res.redirect(`${process.env.FRONTEND_URL}/profile?spotify=error`);
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

    res.redirect(`${process.env.FRONTEND_URL}/profile?spotify=connected&premium=${isPremium}`);
  } catch (err) {
    console.error("❌ Spotify OAuth error:", err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/profile?spotify=error`);
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

// ─── SPOTIFY PLAYLIST TRACKS ──────────────────────────────────────────────────
// GET /api/spotify/playlist/:id/tracks  (protected)
// Proxies the Spotify playlist-tracks call through the backend so the browser
// never needs the playlist-read-private scope directly — the stored server-side
// token (which has the full scope set) is used instead.
export const getPlaylistTracks = async (req, res) => {
  try {
    const result = await getValidToken(req.user.id, false);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const response = await axios.get(
      `https://api.spotify.com/v1/playlists/${req.params.id}/tracks?limit=100&fields=items(track(name,uri,duration_ms,artists(name),album(images)))`,
      { headers: { Authorization: `Bearer ${result.accessToken}` } }
    );
    res.json(response.data);
  } catch (err) {
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
