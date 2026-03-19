import axios from "axios";

const API_KEY = () => process.env.YOUTUBE_API_KEY;
const BASE    = "https://www.googleapis.com/youtube/v3";

// ─── IN-MEMORY CACHE ────────────────────────────────────────────────────────
const _cache    = new Map(); // playlistId → { data, cachedAt }
const _inflight = new Map(); // playlistId → Promise
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

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

    console.log(`✅ YouTube playlist ${playlistId}: fetched ${allItems.length} tracks`);
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

// ─── YOUTUBE CHANNEL INFO ───────────────────────────────────────────────────
// GET /api/youtube/channel/:identifier
// identifier can be a channel ID (UC...) or handle (@username)
export const getChannelInfo = async (req, res) => {
  try {
    if (!API_KEY()) return res.status(500).json({ message: "YouTube API key not configured" });

    const id = req.params.identifier;
    const isHandle = id.startsWith('@');

    const params = {
      part: "snippet,statistics",
      key: API_KEY(),
    };
    if (isHandle) params.forHandle = id.replace('@', '');
    else params.id = id;

    const r = await axios.get(`${BASE}/channels`, { params });
    const ch = r.data.items?.[0];
    if (!ch) return res.status(404).json({ message: "Channel not found" });

    res.json({
      id:             ch.id,
      title:          ch.snippet.title,
      description:    ch.snippet.description?.slice(0, 200) || "",
      avatar:         ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || "",
      subscriberCount: ch.statistics.subscriberCount || "0",
      videoCount:     ch.statistics.videoCount || "0",
    });
  } catch (err) {
    console.error("❌ YouTube channel info error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to fetch channel info" });
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

// Clean Spotify artist names for better YouTube search
const cleanArtistForYT = (artist) => {
  if (!artist) return "";
  // Take only the first artist from comma-separated list
  return artist.split(",")[0].trim();
};

export const matchYoutubeTracks = async (req, res) => {
  try {
    if (!API_KEY()) return res.status(500).json({ message: "YouTube API key not configured" });

    const { tracks = [] } = req.body;
    if (!tracks.length) return res.status(400).json({ message: "No tracks provided" });

    // Cap at 50 tracks
    const capped = tracks.slice(0, 50);
    console.log(`🔍 Matching ${capped.length} tracks to YouTube...`);
    const startTime = Date.now();
    const TIMEOUT_MS = 25000; // bail before Render's 30s timeout

    const searchYT = async (query) => {
      try {
        const r = await axios.get(`${BASE}/search`, {
          params: {
            part: "snippet",
            type: "video",
            videoCategoryId: "10",
            q: query,
            maxResults: 8,
            key: API_KEY(),
          },
        });
        return r.data.items || [];
      } catch (e) {
        console.error(`❌ YouTube search failed for "${query}":`, e.response?.status || e.message);
        return [];
      }
    };

    const matchOne = async (src) => {
      const title = (src.title || "").trim();
      const artist = cleanArtistForYT(src.artist || "");
      if (!title && !artist) return { source: src, bestMatch: null, confidence: "none", alternatives: [] };

      // Single query: "title artist" — keep it fast to stay within timeout
      const query = title && artist ? `${title} ${artist}` : `${title} official audio`;
      const items = await searchYT(query);

      const allCandidates = items.map((i) => {
        const ytTitle   = cleanTitle(i.snippet.title || "");
        const titleSim  = similarity(title, ytTitle);
        const channelName = (i.snippet.channelTitle || "").replace(/\s*-\s*topic$/i, "").replace(/\s*VEVO$/i, "").trim();
        const artistSim = artist ? similarity(artist, channelName) : 0.5;
        const score = artist ? titleSim * 0.65 + artistSim * 0.35 : titleSim * 0.9 + 0.1;
        return {
          title:        i.snippet.title,
          channelTitle: i.snippet.channelTitle || "",
          videoId:      i.id?.videoId || "",
          thumbnail:    i.snippet.thumbnails?.medium?.url || "",
          url:          `https://www.youtube.com/watch?v=${i.id?.videoId}`,
          score,
        };
      });
      allCandidates.sort((a, b) => b.score - a.score);

      const best = allCandidates[0] || null;
      const confidence = !best ? "none" : best.score >= 0.7 ? "exact" : best.score >= 0.35 ? "close" : "none";

      return { source: src, bestMatch: best, confidence, alternatives: allCandidates.slice(1, 4) };
    };

    // Process in parallel batches of 5 with 300ms delay (1 query per track now, so faster)
    const matches = [];
    const BATCH = 5;
    for (let i = 0; i < capped.length; i += BATCH) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.log(`⏱ YouTube match timeout after ${matches.length}/${capped.length} tracks`);
        // Fill remaining with no-match
        for (let j = i; j < capped.length; j++) {
          matches.push({ source: capped[j], bestMatch: null, confidence: "none", alternatives: [] });
        }
        break;
      }
      const batch = capped.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(matchOne));
      matches.push(...results);
      if (i + BATCH < capped.length) await new Promise(r => setTimeout(r, 300));
    }

    const exact = matches.filter(m => m.confidence === 'exact').length;
    const close = matches.filter(m => m.confidence === 'close').length;
    console.log(`✅ YouTube matched ${capped.length} tracks: ${exact} exact, ${close} close, ${capped.length - exact - close} none`);
    res.json({ matches });
  } catch (err) {
    console.error("❌ YouTube match error:", err.response?.data || err.message);
    res.status(500).json({ message: "Matching failed" });
  }
};
