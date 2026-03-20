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
    .replace(/\s*[\(\[](official\s*(video|audio|music\s*video|lyric\s*video)|lyrics?|audio|hd|hq|remaster(ed)?|live|visuali[sz]er|explicit|clean|mv|m\/v|4k|video\s*oficial|original mix|radio edit|extended mix|slowed|sped up|reverb|bass boosted|nightcore)[\)\]]/gi, "")
    .replace(/\s*[\(\[]feat\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[]ft\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[]prod\.?[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*[\(\[]with\s+[^\)\]]*[\)\]]/gi, "")
    .replace(/\s+feat\.?\s+[^-|]+/i, "")
    .replace(/\s+ft\.?\s+[^-|]+/i, "")
    .replace(/\s+prod\.?\s+(by\s+)?[^-|]+/i, "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*\/\/\s*.*$/, "")
    .replace(/\s*#\w+/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

const wordSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const aw = new Set(normalize(a).split(" ").filter(Boolean));
  const bw = new Set(normalize(b).split(" ").filter(Boolean));
  if (!aw.size || !bw.size) return 0;
  let overlap = 0;
  for (const w of aw) if (bw.has(w)) overlap++;
  return overlap / Math.min(aw.size, bw.size);
};

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

const similarity = (a, b) => {
  if (!a || !b) return 0;
  const cs = charSimilarity(a, b);
  const ws = wordSimilarity(a, b);
  const cb = containsBonus(a, b);
  return Math.min(1, Math.max(cs, ws * 0.9) + cb);
};

// Clean Spotify artist names for better YouTube search
const cleanArtistForYT = (artist) => {
  if (!artist) return "";
  return artist
    .split(",")[0]
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*VEVO$/i, "")
    .replace(/\s*Official$/i, "")
    .trim();
};

export const matchYoutubeTracks = async (req, res) => {
  try {
    if (!API_KEY()) return res.status(500).json({ message: "YouTube API key not configured" });

    const { tracks = [] } = req.body;
    if (!tracks.length) return res.status(400).json({ message: "No tracks provided" });

    // Process all tracks — timeout guard fills remainder with no-match if needed
    const capped = tracks;
    console.log(`🔍 Matching ${capped.length} tracks to YouTube...`);
    const startTime = Date.now();
    const TIMEOUT_MS = 290000; // ~5 min for large playlists (up to 1000 tracks)

    let _quotaExhausted = false;

    const searchYT = async (query) => {
      if (_quotaExhausted) return [];
      try {
        const r = await axios.get(`${BASE}/search`, {
          params: {
            part: "snippet",
            type: "video",
            q: query,
            maxResults: 15,
            key: API_KEY(),
          },
        });
        return r.data.items || [];
      } catch (e) {
        if (e.response?.status === 403) {
          const reason = e.response?.data?.error?.errors?.[0]?.reason || '';
          if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') {
            console.error('❌ YouTube API quota exhausted — stopping match');
            _quotaExhausted = true;
            return [];
          }
        }
        console.error(`❌ YouTube search failed for "${query}":`, e.response?.status || e.message);
        return [];
      }
    };

    const matchOne = async (src) => {
      const rawTitle = (src.title || "").trim();
      const title = cleanTitle(rawTitle);
      const artist = cleanArtistForYT(src.artist || "");
      if (!title && !artist) return { source: src, bestMatch: null, confidence: "none", alternatives: [] };

      // Build multiple search queries for better coverage
      const queries = [];
      if (title && artist) {
        queries.push(`${artist} ${title}`);               // Most natural: "Drake Hotline Bling"
        queries.push(`${artist} - ${title}`);              // Dash format common on YouTube
        queries.push(`${title} ${artist}`);                // Reversed
        queries.push(`${artist} ${title} official audio`); // Official audio
        queries.push(`${artist} ${title} lyrics`);         // Lyrics video (often available)
      }
      if (title) {
        queries.push(`${title} official audio`);
        queries.push(title);
      }
      // Short title + artist (helps with long titles)
      if (title && artist) {
        const shortTitle = title.split(/\s+/).slice(0, 3).join(' ');
        if (shortTitle !== title) queries.push(`${artist} ${shortTitle}`);
      }
      const maxQ = capped.length > 500 ? 1 : capped.length > 200 ? 2 : capped.length > 50 ? 3 : 4;
      const uniqueQueries = [...new Set(queries)].slice(0, maxQ);

      let allItems = [];
      for (const query of uniqueQueries) {
        if (_quotaExhausted) break;
        const items = await searchYT(query);
        allItems = allItems.concat(items);
        // Only stop early if we have plenty of results from 2+ queries
        if (allItems.length >= 10 && uniqueQueries.indexOf(query) >= 1) break;
      }

      // Deduplicate by videoId
      const seenVids = new Set();
      const items = allItems.filter(i => {
        const vid = i.id?.videoId;
        if (!vid || seenVids.has(vid)) return false;
        seenVids.add(vid);
        return true;
      });

      const allCandidates = items.map((i) => {
        const rawYtTitle = i.snippet.title || "";
        const ytTitle   = cleanTitle(rawYtTitle);
        const channelName = (i.snippet.channelTitle || "")
          .replace(/\s*-\s*topic$/i, "")
          .replace(/\s*VEVO$/i, "")
          .replace(/\s*Official$/i, "")
          .replace(/\s*Music$/i, "")
          .trim();

        // Check title similarity multiple ways
        const titleSim = similarity(title, ytTitle);
        // Try "title artist" combined against YT title (YT titles often include both)
        const combinedSim = artist ? similarity(`${title} ${artist}`, ytTitle) : 0;
        // Try "artist title" order too
        const reverseSim = artist ? similarity(`${artist} ${title}`, ytTitle) : 0;
        // Check if the YT title contains "Artist - Song" pattern and extract
        const ytParts = ytTitle.match(/^(.+?)\s*[-–—]\s+(.+)$/);
        let parsedSim = 0;
        if (ytParts) {
          // Try both orders: "Artist - Song" and "Song - Artist"
          parsedSim = Math.max(
            similarity(title, ytParts[2]) * 0.7 + (artist ? similarity(artist, ytParts[1]) * 0.3 : 0.15),
            similarity(title, ytParts[1]) * 0.7 + (artist ? similarity(artist, ytParts[2]) * 0.3 : 0.15)
          );
        }
        const bestTitleSim = Math.max(titleSim, combinedSim, reverseSim, parsedSim);

        // Artist similarity — check channel name and also if artist appears in YT title
        let artistSim = 0.5;
        if (artist) {
          const channelSim = similarity(artist, channelName);
          const inTitleSim = normalize(ytTitle).includes(normalize(artist)) ? 0.8 : 0;
          artistSim = Math.max(channelSim, inTitleSim);
        }

        const score = artist
          ? bestTitleSim * 0.6 + artistSim * 0.4
          : bestTitleSim * 0.9 + 0.1;

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
      const confidence = !best ? "none"
        : best.score >= 0.6 ? "exact"
        : best.score >= 0.3 ? "close"
        : best.score >= 0.1 ? "similar"
        : "none";

      // Always return alternatives so user can swap
      return { source: src, bestMatch: best, confidence, alternatives: allCandidates.slice(1, 7) };
    };

    // Dynamic batch size & delay based on playlist size
    const matches = [];
    const BATCH = capped.length > 200 ? 10 : capped.length > 50 ? 8 : 5;
    const DELAY = capped.length > 200 ? 100 : 300;
    for (let i = 0; i < capped.length; i += BATCH) {
      if (_quotaExhausted || Date.now() - startTime > TIMEOUT_MS) {
        const reason = _quotaExhausted ? 'quota exhausted' : 'timeout';
        console.log(`⏱ YouTube match stopped (${reason}) after ${matches.length}/${capped.length} tracks`);
        // Fill remaining with no-match
        for (let j = i; j < capped.length; j++) {
          matches.push({ source: capped[j], bestMatch: null, confidence: "none", alternatives: [] });
        }
        break;
      }
      const batch = capped.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(matchOne));
      matches.push(...results);
      if (i + BATCH < capped.length) await new Promise(r => setTimeout(r, DELAY));
    }

    const exact = matches.filter(m => m.confidence === 'exact').length;
    const close = matches.filter(m => m.confidence === 'close').length;
    console.log(`✅ YouTube matched ${capped.length} tracks: ${exact} exact, ${close} close, ${capped.length - exact - close} none${_quotaExhausted ? ' (quota exhausted)' : ''}`);
    res.json({ matches, quotaExhausted: _quotaExhausted });
  } catch (err) {
    console.error("❌ YouTube match error:", err.response?.data || err.message);
    res.status(500).json({ message: "Matching failed" });
  }
};
