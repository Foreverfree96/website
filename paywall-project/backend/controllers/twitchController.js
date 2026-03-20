import axios from "axios";

const CLIENT_ID     = () => process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = () => process.env.TWITCH_CLIENT_SECRET;

// ─── CLIENT CREDENTIALS TOKEN ────────────────────────────────────────────────
let _tokenCache = null; // { token, expiresAt }

const getAppToken = async () => {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token;
  }
  const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id:     CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type:    "client_credentials",
    },
  });
  const { access_token, expires_in } = res.data;
  _tokenCache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
};

// ─── IN-MEMORY CACHE ────────────────────────────────────────────────────────
const _cache    = new Map(); // username → { data, cachedAt }
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ─── GET TWITCH CHANNEL INFO ────────────────────────────────────────────────
// GET /api/twitch/channel/:username
export const getChannelInfo = async (req, res) => {
  try {
    if (!CLIENT_ID() || !CLIENT_SECRET()) {
      return res.status(500).json({ message: "Twitch API not configured" });
    }

    const username = req.params.username.toLowerCase().replace(/^@/, "");
    if (!username) return res.status(400).json({ message: "Username required" });

    // Return cached
    const cached = _cache.get(username);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return res.json(cached.data);
    }

    const token = await getAppToken();
    const headers = {
      "Client-ID": CLIENT_ID(),
      Authorization: `Bearer ${token}`,
    };

    // Fetch user info
    const userRes = await axios.get("https://api.twitch.tv/helix/users", {
      params: { login: username },
      headers,
    });

    const user = userRes.data.data?.[0];
    if (!user) return res.status(404).json({ message: "Twitch user not found" });

    // Fetch follower count
    let followerCount = "0";
    try {
      const followRes = await axios.get("https://api.twitch.tv/helix/channels/followers", {
        params: { broadcaster_id: user.id, first: 1 },
        headers,
      });
      followerCount = String(followRes.data.total || 0);
    } catch { /* follower count is optional */ }

    // Check if currently live
    let isLive = false;
    let streamTitle = "";
    try {
      const streamRes = await axios.get("https://api.twitch.tv/helix/streams", {
        params: { user_login: username },
        headers,
      });
      const stream = streamRes.data.data?.[0];
      if (stream) {
        isLive = true;
        streamTitle = stream.title || "";
      }
    } catch { /* stream check is optional */ }

    const data = {
      id:            user.id,
      title:         user.display_name,
      description:   (user.description || "").slice(0, 200),
      avatar:        user.profile_image_url || "",
      followerCount,
      isLive,
      streamTitle,
    };

    _cache.set(username, { data, cachedAt: Date.now() });
    res.json(data);
  } catch (err) {
    console.error("❌ Twitch channel info error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to fetch Twitch channel info" });
  }
};
