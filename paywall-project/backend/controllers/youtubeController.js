import axios from "axios";

const API_KEY = () => process.env.YOUTUBE_API_KEY;
const BASE    = "https://www.googleapis.com/youtube/v3";

// ─── IN-MEMORY CACHE ────────────────────────────────────────────────────────
const _cache    = new Map(); // playlistId → { data, cachedAt }
const _inflight = new Map(); // playlistId → Promise
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ─── GET YOUTUBE PLAYLIST TRACKS ────────────────────────────────────────────
// GET /api/youtube/playlist/:id/tracks
export const getPlaylistTracks = async (req, res) => {
  const playlistId = req.params.id;
  if (!API_KEY()) return res.status(500).json({ message: "YouTube API key not configured" });

  // Return cached
  const cached = _cache.get(playlistId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return res.json(cached.data);

  // Deduplicate concurrent requests
  if (_inflight.has(playlistId)) {
    try { return res.json(await _inflight.get(playlistId)); }
    catch { return res.status(500).json({ message: "Failed to fetch playlist" }); }
  }

  const fetchPromise = (async () => {
    let allItems = [];
    let nextPageToken = "";

    do {
      const r = await axios.get(`${BASE}/playlistItems`, {
        params: {
          part: "snippet",
          maxResults: 50,
          playlistId,
          pageToken: nextPageToken || undefined,
          key: API_KEY(),
        },
      });

      const items = (r.data.items || [])
        .filter((i) => i.snippet?.title !== "Private video" && i.snippet?.title !== "Deleted video")
        .map((i) => ({
          title:        i.snippet.title,
          channelTitle: i.snippet.videoOwnerChannelTitle || i.snippet.channelTitle || "",
          videoId:      i.snippet.resourceId?.videoId || "",
          thumbnail:    i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url || "",
        }));

      allItems = allItems.concat(items);
      nextPageToken = r.data.nextPageToken || "";
    } while (nextPageToken);

    const data = { items: allItems };
    _cache.set(playlistId, { data, cachedAt: Date.now() });
    return data;
  })();

  _inflight.set(playlistId, fetchPromise);
  try {
    const data = await fetchPromise;
    _inflight.delete(playlistId);
    res.json(data);
  } catch (err) {
    _inflight.delete(playlistId);
    console.error("❌ YouTube playlist fetch error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to fetch playlist" });
  }
};

// ─── YOUTUBE SEARCH ─────────────────────────────────────────────────────────
// GET /api/youtube/search?q=...&limit=5
export const searchYoutubeTracks = async (req, res) => {
  try {
    if (!API_KEY()) return res.status(500).json({ message: "YouTube API key not configured" });

    const { q, limit = 5 } = req.query;
    if (!q) return res.status(400).json({ message: "Missing query parameter q" });

    const r = await axios.get(`${BASE}/search`, {
      params: {
        part: "snippet",
        type: "video",
        videoCategoryId: "10", // Music
        q,
        maxResults: Math.min(Number(limit), 20),
        key: API_KEY(),
      },
    });

    const items = (r.data.items || []).map((i) => ({
      title:        i.snippet.title,
      channelTitle: i.snippet.channelTitle || "",
      videoId:      i.id?.videoId || "",
      thumbnail:    i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url || "",
    }));

    res.json({ items });
  } catch (err) {
    console.error("❌ YouTube search error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Search failed" });
  }
};

// ─── YOUTUBE MATCH TRACKS ───────────────────────────────────────────────────
// POST /api/youtube/match
// Body: { tracks: [{ title, artist }] }
// Finds the best YouTube video for each Spotify track

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

export const matchYoutubeTracks = async (req, res) => {
  try {
    if (!API_KEY()) return res.status(500).json({ message: "YouTube API key not configured" });

    const { tracks = [] } = req.body;
    if (!tracks.length) return res.status(400).json({ message: "No tracks provided" });

    const matches = [];

    for (const src of tracks) {
      const query = `${src.title || ""} ${src.artist || ""}`.trim();

      try {
        const r = await axios.get(`${BASE}/search`, {
          params: {
            part: "snippet",
            type: "video",
            videoCategoryId: "10",
            q: query,
            maxResults: 5,
            key: API_KEY(),
          },
        });

        const candidates = (r.data.items || []).map((i) => {
          const ytTitle   = cleanTitle(i.snippet.title || "");
          const titleSim  = similarity(src.title || "", ytTitle);
          const artistSim = similarity(src.artist || "", i.snippet.channelTitle || "");
          const score     = titleSim * 0.6 + artistSim * 0.4;
          return {
            title:        i.snippet.title,
            channelTitle: i.snippet.channelTitle || "",
            videoId:      i.id?.videoId || "",
            thumbnail:    i.snippet.thumbnails?.medium?.url || "",
            url:          `https://www.youtube.com/watch?v=${i.id?.videoId}`,
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
    console.error("❌ YouTube match error:", err.response?.data || err.message);
    res.status(500).json({ message: "Matching failed" });
  }
};
