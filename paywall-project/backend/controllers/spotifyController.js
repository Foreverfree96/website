import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

const SCOPES = "user-read-private user-read-email";

// ─── SPOTIFY LOGIN ────────────────────────────────────────────────────────────
// GET /api/spotify/login?token=JWT
// Validates the JWT from the query string (needed because this is a browser
// redirect, not an XHR request so auth headers can't be sent), then redirects
// to Spotify's authorization page with the user's ID encoded in `state`.

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
// GET /api/spotify/callback
// Spotify redirects here after the user grants (or denies) access.
// Exchanges the code for tokens, fetches the profile to check premium,
// saves everything to the User document, then redirects back to the frontend.

export const spotifyCallback = async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error || !code || !userId) {
    return res.redirect(`${process.env.FRONTEND_URL}/profile?spotify=error`);
  }

  try {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          Authorization:  `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const profileRes = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: spotifyId, product, display_name } = profileRes.data;
    const isPremium = product === "premium";

    await User.findByIdAndUpdate(userId, {
      spotifyId,
      spotifyDisplayName: display_name || null,
      spotifyIsPremium:   isPremium,
      spotifyAccessToken:  access_token,
      spotifyRefreshToken: refresh_token,
      spotifyTokenExpiry:  new Date(Date.now() + expires_in * 1000),
    });

    res.redirect(
      `${process.env.FRONTEND_URL}/profile?spotify=connected&premium=${isPremium}`
    );
  } catch (err) {
    console.error("❌ Spotify OAuth error:", err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/profile?spotify=error`);
  }
};

// ─── SPOTIFY STATUS ───────────────────────────────────────────────────────────
// GET /api/spotify/status  (protected)

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
      tokenExpired: user.spotifyTokenExpiry
        ? user.spotifyTokenExpiry < new Date()
        : true,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SPOTIFY DISCONNECT ───────────────────────────────────────────────────────
// DELETE /api/spotify/disconnect  (protected)

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
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
