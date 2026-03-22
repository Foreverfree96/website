import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

// YouTube API key rotation — each key has its own 10k units/day quota.
// When one key is exhausted, we rotate to the next.
const _ytKeys = [];
let _ytKeyIndex = 0;
const _exhaustedUntil = new Map(); // key → timestamp when quota resets

const _loadKeys = () => {
  if (_ytKeys.length) return;
  const primary = process.env.YOUTUBE_API_KEY;
  if (primary) _ytKeys.push(primary);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`YOUTUBE_API_KEY_${i}`];
    if (k) _ytKeys.push(k);
  }
  console.log(`🔑 YouTube: ${_ytKeys.length} API key(s) loaded${_ytKeys.map((k,i) => ` [${i+1}:${k.slice(-6)}]`).join('')}`);
};

const _isExhausted = (key) => {
  const until = _exhaustedUntil.get(key);
  if (!until) return false;
  if (Date.now() > until) { _exhaustedUntil.delete(key); return false; }
  return true;
};

const API_KEY = () => {
  _loadKeys();
  for (let i = 0; i < _ytKeys.length; i++) {
    const idx = (_ytKeyIndex + i) % _ytKeys.length;
    if (!_isExhausted(_ytKeys[idx])) return _ytKeys[idx];
  }
  return null; // all keys exhausted — don't return an exhausted key
};

const _isQuotaError = (err) => {
  const reason = err.response?.data?.error?.errors?.[0]?.reason || '';
  return reason === 'quotaExceeded' || reason === 'dailyLimitExceeded';
};

const _isRateLimitError = (err) => {
  const reason = err.response?.data?.error?.errors?.[0]?.reason || '';
  return reason === 'rateLimitExceeded' || err.response?.status === 429;
};

const _rotateKey = (failedKey) => {
  _loadKeys();
  // Mark the specific key that failed, not whatever _ytKeyIndex points to
  const keyToMark = failedKey || _ytKeys[_ytKeyIndex];
  if (keyToMark) {
    _exhaustedUntil.set(keyToMark, Date.now() + 60 * 60 * 1000);
    const keyNum = _ytKeys.indexOf(keyToMark) + 1;
    console.log(`   Key #${keyNum} [${keyToMark.slice(-6)}] quota exhausted, blocked for 1h`);
  }
  // Find next available key
  for (let i = 0; i < _ytKeys.length; i++) {
    const idx = (_ytKeyIndex + i) % _ytKeys.length;
    if (!_isExhausted(_ytKeys[idx])) {
      _ytKeyIndex = idx;
      console.log(`🔄 YouTube API key rotated to key #${idx + 1} (${_ytKeys.length - _exhaustedUntil.size} available)`);
      return true;
    }
  }
  return false;
};

const BASE    = "https://www.googleapis.com/youtube/v3";

// ─── IN-MEMORY CACHE ────────────────────────────────────────────────────────
const _cache    = new Map(); // playlistId → { data, cachedAt }
const _inflight = new Map(); // playlistId → Promise
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ─── GET YOUTUBE PLAYLIST TRACKS ────────────────────────────────────────────
// GET /api/youtube/playlist/:id/tracks
export const getPlaylistTracks = async (req, res) => {
  const playlistId = req.params.id;
  _loadKeys();
  if (!_ytKeys.length) return res.status(500).json({ message: "YouTube API key not configured" });
  // Clear stale exhausted keys
  for (const [key, until] of _exhaustedUntil) {
    if (Date.now() > until) _exhaustedUntil.delete(key);
  }

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
      let r;
      for (let keyAttempt = 0; keyAttempt < _ytKeys.length + 2; keyAttempt++) {
        const usedKey = API_KEY();
        try {
          r = await axios.get(`${BASE}/playlistItems`, {
            params: {
              part: "snippet",
              maxResults: 50,
              playlistId,
              pageToken: nextPageToken || undefined,
              key: usedKey,
            },
          });
          break;
        } catch (e) {
          if (_isQuotaError(e) && _rotateKey(usedKey)) continue;
          if (_isRateLimitError(e)) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw e;
        }
      }
      if (!r) throw new Error('All YouTube API keys exhausted');

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
    _loadKeys();
    if (!_ytKeys.length) return res.status(500).json({ message: "YouTube API key not configured" });

    // Clear stale exhausted keys
    for (const [key, until] of _exhaustedUntil) {
      if (Date.now() > until) _exhaustedUntil.delete(key);
    }

    if (!API_KEY()) {
      // All keys currently exhausted — find the soonest recovery
      let soonest = Infinity;
      for (const until of _exhaustedUntil.values()) soonest = Math.min(soonest, until);
      const retryAfter = Math.max(1, Math.ceil((soonest - Date.now()) / 1000));
      return res.status(429)
        .set('Retry-After', String(retryAfter))
        .json({ message: "YouTube API quota exhausted", retryAfter });
    }

    const { q, limit = 5 } = req.query;
    if (!q) return res.status(400).json({ message: "Missing query parameter q" });

    let r;
    let keyRotations = 0, rateLimitRetries = 0;
    while (keyRotations < _ytKeys.length && rateLimitRetries < 5) {
      const usedKey = API_KEY();
      if (!usedKey) break;
      try {
        r = await axios.get(`${BASE}/search`, {
          params: { part: "snippet", type: "video", videoCategoryId: "10", q, maxResults: Math.min(Number(limit), 20), key: usedKey },
        });
        break;
      } catch (e) {
        if (_isQuotaError(e)) {
          keyRotations++;
          if (_rotateKey(usedKey)) continue;
          break;
        }
        if (_isRateLimitError(e)) {
          rateLimitRetries++;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw e;
      }
    }
    if (!r) {
      // All keys exhausted during this request
      let soonest = Infinity;
      for (const until of _exhaustedUntil.values()) soonest = Math.min(soonest, until);
      const retryAfter = Math.max(1, Math.ceil((soonest - Date.now()) / 1000));
      return res.status(429)
        .set('Retry-After', String(retryAfter))
        .json({ message: "YouTube API quota exhausted", retryAfter });
    }

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
    _loadKeys();
    if (!_ytKeys.length) return res.status(500).json({ message: "YouTube API key not configured" });
    // Clear stale exhausted keys
    for (const [key, until] of _exhaustedUntil) {
      if (Date.now() > until) _exhaustedUntil.delete(key);
    }

    const id = req.params.identifier;
    const isHandle = id.startsWith('@');

    let r;
    for (let keyAttempt = 0; keyAttempt < _ytKeys.length + 2; keyAttempt++) {
      const usedKey = API_KEY();
      if (!usedKey) break;
      try {
        const params = {
          part: "snippet,statistics",
          key: usedKey,
        };
        if (isHandle) params.forHandle = id.replace('@', '');
        else params.id = id;
        r = await axios.get(`${BASE}/channels`, { params });
        break;
      } catch (e) {
        if (_isQuotaError(e) && _rotateKey(usedKey)) continue;
        if (_isRateLimitError(e)) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw e;
      }
    }
    if (!r) throw new Error('All YouTube API keys exhausted');

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

// Normalize for comparison — more aggressive, strips &/and differences
const deepNormalize = (s) =>
  s.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[''´`]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const matchYoutubeTracks = async (req, res) => {
  try {
    _loadKeys();
    if (!_ytKeys.length) return res.status(500).json({ message: "YouTube API key not configured" });

    const { tracks = [] } = req.body;
    if (!tracks.length) return res.status(400).json({ message: "No tracks provided" });

    console.log(`🔍 Matching ${tracks.length} tracks to YouTube...`);
    const startTime = Date.now();
    const TIMEOUT_MS = 290000; // ~5 min for large playlists (up to 1000 tracks)

    // Clear stale exhausted keys before starting — they may have recovered
    for (const [key, until] of _exhaustedUntil) {
      if (Date.now() > until) _exhaustedUntil.delete(key);
    }
    const available = _ytKeys.length - _exhaustedUntil.size;
    console.log(`   Keys available: ${available}/${_ytKeys.length}`);

    let _quotaExhausted = false;

    const searchYT = async (query) => {
      if (_quotaExhausted) return [];
      // Separate counters for key rotations vs rate-limit retries
      let keyRotations = 0;
      let rateLimitRetries = 0;
      const MAX_RATE_RETRIES = 5;
      while (keyRotations < _ytKeys.length && rateLimitRetries < MAX_RATE_RETRIES) {
        const usedKey = API_KEY();
        if (!usedKey) break;
        try {
          const r = await axios.get(`${BASE}/search`, {
            params: { part: "snippet", type: "video", q: query, maxResults: 15, key: usedKey },
          });
          return r.data.items || [];
        } catch (e) {
          const reason = e.response?.data?.error?.errors?.[0]?.reason || '';
          if (e.response?.status === 403 && _isQuotaError(e)) {
            keyRotations++;
            if (_rotateKey(usedKey)) {
              console.log(`   Rotated away from key [${usedKey.slice(-6)}]. Retrying "${query}"...`);
              continue; // try next key
            }
            console.error(`❌ YouTube API quota exhausted — all ${_ytKeys.length} keys used (${_exhaustedUntil.size} exhausted)`);
            _quotaExhausted = true;
            return [];
          }
          if (_isRateLimitError(e)) {
            rateLimitRetries++;
            // Per-second rate limit — wait and retry with same key
            const wait = Math.min(parseInt(e.response?.headers?.['retry-after'] || '2', 10), 10);
            console.log(`   Rate limited on "${query}", waiting ${wait}s (retry ${rateLimitRetries}/${MAX_RATE_RETRIES})...`);
            await new Promise(r => setTimeout(r, wait * 1000));
            continue;
          }
          // Log the full error for debugging unknown 403s
          console.error(`❌ YouTube search failed for "${query}": status=${e.response?.status} reason=${reason} data=${JSON.stringify(e.response?.data?.error?.errors?.[0] || {})}`);
          return [];
        }
      }
      // Only mark quota exhausted if all keys were actually rotated through
      if (keyRotations >= _ytKeys.length) {
        _quotaExhausted = true;
      }
      return [];
    };

    const matchOne = async (src) => {
      const rawTitle = (src.title || "").trim();
      const title = cleanTitle(rawTitle);
      const artist = cleanArtistForYT(src.artist || "");
      // Keep the full artist string (all featured artists) for secondary matching
      const fullArtist = (src.artist || "").replace(/\s*-\s*topic$/i, "").trim();
      if (!title && !artist) return { source: src, bestMatch: null, confidence: "none", alternatives: [] };

      // Build search queries — prioritize finding audio-only versions
      const queries = [];
      if (title && artist) {
        // Best: "Artist Title audio" to surface Topic channels and official audio
        queries.push(`${artist} ${title} audio`);
        // Standard format: "Artist - Title"
        queries.push(`${artist} - ${title}`);
        // Plain combined fallback
        queries.push(`${artist} ${title}`);
      }
      if (title) {
        queries.push(title); // title-only fallback
      }
      // If the artist has featured artists, try just the primary artist
      if (title && fullArtist && fullArtist !== artist) {
        queries.push(`${artist} ${title}`);
      }
      // Short title + artist for very long titles
      if (title && artist && title.split(/\s+/).length > 4) {
        const shortTitle = title.split(/\s+/).slice(0, 3).join(' ');
        queries.push(`${artist} ${shortTitle}`);
      }

      const maxQ = tracks.length > 500 ? 1 : tracks.length > 200 ? 2 : tracks.length > 50 ? 3 : 4;
      const uniqueQueries = [...new Set(queries)].slice(0, maxQ);

      let allItems = [];
      for (let qi = 0; qi < uniqueQueries.length; qi++) {
        if (_quotaExhausted) break;
        const items = await searchYT(uniqueQueries[qi]);
        allItems = allItems.concat(items);
        // Log first 3 tracks to verify search is returning results
        if (matches.length < 3 && qi === 0) {
          console.log(`   Search "${uniqueQueries[qi]}" → ${items.length} results${items[0] ? ` [top: "${items[0].snippet?.title}"]` : ''}`);
        }
        // Stop early if we have plenty of results
        if (allItems.length >= 10 && qi >= 1) break;
        if (qi < uniqueQueries.length - 1) await new Promise(r => setTimeout(r, 150));
      }

      // Deduplicate by videoId
      const seenVids = new Set();
      const items = allItems.filter(i => {
        const vid = i.id?.videoId;
        if (!vid || seenVids.has(vid)) return false;
        seenVids.add(vid);
        return true;
      });

      // Deep-normalized versions for scoring
      const dnTitle  = deepNormalize(title);
      const dnArtist = artist ? deepNormalize(artist) : '';
      const dnFull   = fullArtist ? deepNormalize(fullArtist) : dnArtist;

      const allCandidates = items.map((i) => {
        const rawYtTitle = i.snippet.title || "";
        const ytTitle   = cleanTitle(rawYtTitle);
        const rawChannel = i.snippet.channelTitle || "";
        const channelName = rawChannel
          .replace(/\s*-\s*topic$/i, "")
          .replace(/\s*VEVO$/i, "")
          .replace(/\s*Official$/i, "")
          .replace(/\s*Music$/i, "")
          .trim();
        const isTopic = /\s-\s*topic$/i.test(rawChannel);

        // Deep normalized YT title for comparison
        const dnYtTitle = deepNormalize(ytTitle);
        const dnChannel = deepNormalize(channelName);

        // ── Title similarity ──────────────────────────────────────
        const titleSim = similarity(title, ytTitle);
        const combinedSim = artist ? similarity(`${title} ${artist}`, ytTitle) : 0;
        const reverseSim  = artist ? similarity(`${artist} ${title}`, ytTitle) : 0;

        // Parse "Side1 - Side2" format in YouTube title
        const ytParts = ytTitle.match(/^(.+?)\s*[-–—]\s+(.+)$/);
        let parsedSim = 0;
        if (ytParts) {
          parsedSim = Math.max(
            similarity(title, ytParts[2]) * 0.7 + (artist ? similarity(artist, ytParts[1]) * 0.3 : 0.15),
            similarity(title, ytParts[1]) * 0.7 + (artist ? similarity(artist, ytParts[2]) * 0.3 : 0.15)
          );
        }

        // Deep-normalized exact containment check (catches &/and, accent differences)
        let deepBonus = 0;
        if (dnTitle && dnYtTitle.includes(dnTitle)) deepBonus = Math.max(deepBonus, 0.15);
        if (dnArtist && dnYtTitle.includes(dnArtist)) deepBonus = Math.max(deepBonus, 0.1);

        const bestTitleSim = Math.min(1, Math.max(titleSim, combinedSim, reverseSim, parsedSim) + deepBonus);

        // ── Artist similarity ─────────────────────────────────────
        let artistSim = 0.5; // neutral when no artist info
        if (artist) {
          const channelSim = similarity(artist, channelName);
          const deepChannelSim = dnArtist === dnChannel ? 1 : 0;
          // Check if any of the source artists appear in the YT title or channel
          const inTitle   = dnYtTitle.includes(dnArtist) ? 0.85 : 0;
          const fullInTitle = dnFull !== dnArtist && dnYtTitle.includes(dnFull) ? 0.7 : 0;
          artistSim = Math.max(channelSim, deepChannelSim, inTitle, fullInTitle);
          // Topic channels are auto-generated by YouTube for official artists — strong signal
          if (isTopic && channelSim > 0.5) artistSim = Math.max(artistSim, 0.95);
        }

        let score = artist
          ? bestTitleSim * 0.55 + artistSim * 0.45
          : bestTitleSim * 0.9 + 0.1;

        // ── Bonuses / penalties ───────────────────────────────────
        const lowerRaw = rawYtTitle.toLowerCase();

        // Explicit preference
        if (/\bexplicit\b/.test(lowerRaw) || /\(e\)/.test(lowerRaw)) score += 0.05;
        if (/\bclean\b/.test(lowerRaw) && !/clean\s*bandit/i.test(rawYtTitle)) score -= 0.05;

        // ── Audio-only / non-video preference ───────────────────
        // Topic channels are auto-generated by YouTube with clean audio — strongest signal
        if (isTopic) score += 0.10;
        // "Official Audio" = label posted by the artist/label, audio-only
        else if (/official\s*audio/i.test(rawYtTitle)) score += 0.08;
        // "Audio" in title/parens = likely audio-only upload
        else if (/\baudio\b/i.test(rawYtTitle)) score += 0.06;
        // VEVO = official artist channel, usually music videos but high quality
        else if (/vevo$/i.test(rawChannel)) score += 0.04;
        // "Official Music Video" = correct song but it's a video
        else if (/official\s*music\s*video/i.test(rawYtTitle)) score += 0.02;
        // "Official Video" / "Music Video" = video content
        else if (/official\s*video|music\s*video/i.test(rawYtTitle)) score += 0.01;

        // Penalize "lyrics" videos — they're the right song but not official audio
        if (/\blyric(s)?\b/i.test(rawYtTitle) && !isTopic) score -= 0.03;
        // Penalize music videos slightly when an audio-only version likely exists
        if (/\b(music\s*video|official\s*video|mv)\b/i.test(rawYtTitle) && !isTopic) score -= 0.02;

        // Penalize likely non-music content
        if (/\b(react|reaction|review|cover|tutorial|karaoke|instrumental|remix|live\s+(at|in|from)|concert|interview)\b/i.test(rawYtTitle)) {
          score -= 0.08;
        }
        // Penalize "sped up", "slowed", "8d audio" etc.
        if (/\b(sped\s*up|slowed|reverb|8d|nightcore|bass\s*boost)/i.test(rawYtTitle)) score -= 0.06;

        return {
          title:        i.snippet.title,
          channelTitle: rawChannel,
          videoId:      i.id?.videoId || "",
          thumbnail:    i.snippet.thumbnails?.medium?.url || "",
          url:          `https://www.youtube.com/watch?v=${i.id?.videoId}`,
          score,
        };
      });
      allCandidates.sort((a, b) => b.score - a.score);

      const best = allCandidates[0] || null;
      const confidence = !best ? "none"
        : best.score >= 0.55 ? "exact"
        : best.score >= 0.3  ? "close"
        : best.score >= 0.1  ? "similar"
        : "none";

      // Debug: log non-exact matches to diagnose scoring
      if (confidence !== 'exact' && best) {
        console.log(`   ⚠ ${confidence} [${best.score.toFixed(3)}] "${title}" by "${artist}" → "${best.title}" (${best.channelTitle}) | items=${items.length} queries=${uniqueQueries.length}`);
      } else if (!best) {
        console.log(`   ⚠ none: "${title}" by "${artist}" | items=${items.length} queries=${uniqueQueries.length}`);
      }

      return { source: src, bestMatch: best, confidence, alternatives: allCandidates.slice(1, 7) };
    };

    // Emit real-time progress via Socket.io
    const { getIo } = await import("../utils/socketEmitter.js");
    const io = getIo();
    const userId = req.user?.id;
    const emitProgress = (pct, status) => {
      if (userId) io?.to(userId).emit('playlist:progress', { percent: Math.round(pct), status });
    };

    // Dynamic batch size & delay — keep concurrency low to avoid per-second rate limits
    // Each matchOne does up to 4 search queries, so BATCH * maxQ = total concurrent requests
    const matches = [];
    const BATCH = tracks.length > 200 ? 3 : tracks.length > 50 ? 2 : 2;
    const DELAY = tracks.length > 200 ? 500 : 800;
    emitProgress(5, `Matching ${tracks.length} tracks...`);
    for (let i = 0; i < tracks.length; i += BATCH) {
      if (_quotaExhausted || Date.now() - startTime > TIMEOUT_MS) {
        const reason = _quotaExhausted ? 'quota exhausted' : 'timeout';
        console.log(`⏱ YouTube match stopped (${reason}) after ${matches.length}/${tracks.length} tracks`);
        for (let j = i; j < tracks.length; j++) {
          matches.push({ source: tracks[j], bestMatch: null, confidence: "none", alternatives: [] });
        }
        break;
      }
      const batch = tracks.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(matchOne));
      matches.push(...results);

      const pct = 5 + (matches.length / tracks.length) * 90;
      emitProgress(pct, `Matched ${matches.length}/${tracks.length}...`);

      if (i + BATCH < tracks.length) await new Promise(r => setTimeout(r, DELAY));
    }

    const exact = matches.filter(m => m.confidence === 'exact').length;
    const close = matches.filter(m => m.confidence === 'close').length;
    emitProgress(100, `Done! ${exact + close}/${tracks.length} matched`);
    console.log(`✅ YouTube matched ${tracks.length} tracks: ${exact} exact, ${close} close, ${tracks.length - exact - close} none${_quotaExhausted ? ' (quota exhausted)' : ''}`);
    res.json({ matches, quotaExhausted: _quotaExhausted });
  } catch (err) {
    console.error("❌ YouTube match error:", err.response?.data || err.message);
    res.status(500).json({ message: "Matching failed" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE OAUTH + PLAYLIST WRITE
// ═══════════════════════════════════════════════════════════════════════════════

const YT_SCOPE = "https://www.googleapis.com/auth/youtube";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const isSafeReturn = (url) => {
  try {
    const parsed   = new URL(url);
    const frontend = new URL(process.env.FRONTEND_URL);
    return parsed.hostname === frontend.hostname;
  } catch { return false; }
};

const refreshYouTubeToken = async (userId, refreshToken) => {
  const res = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
    client_id:     process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

  const { access_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000);
  await User.findByIdAndUpdate(userId, {
    youtubeAccessToken: access_token,
    youtubeTokenExpiry: expiresAt,
  });
  return { accessToken: access_token, expiresAt };
};

const getValidYouTubeToken = async (userId) => {
  const user = await User.findById(userId).select(
    "+youtubeAccessToken +youtubeRefreshToken youtubeTokenExpiry youtubeChannelId"
  );
  if (!user?.youtubeChannelId) return { error: 404, message: "YouTube not connected" };

  let accessToken = user.youtubeAccessToken;
  let expiresAt   = user.youtubeTokenExpiry;

  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (!expiresAt || expiresAt < fiveMinFromNow) {
    try {
      const refreshed = await refreshYouTubeToken(userId, user.youtubeRefreshToken);
      accessToken = refreshed.accessToken;
      expiresAt   = refreshed.expiresAt;
    } catch (err) {
      console.error("❌ YouTube token refresh failed:", err.response?.data || err.message);
      return { error: 401, message: "YouTube session expired — please reconnect" };
    }
  }

  return { accessToken, expiresAt };
};

// ─── YOUTUBE AUTH ─────────────────────────────────────────────────────────────
// GET /api/youtube/auth?token=JWT&returnTo=...
export const youtubeAuth = async (req, res) => {
  const { token, returnTo } = req.query;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

  const safeReturn = returnTo && isSafeReturn(returnTo) ? returnTo : '';
  const state = Buffer.from(JSON.stringify({ id: userId, ret: safeReturn })).toString('base64url');

  const params = new URLSearchParams({
    client_id:     process.env.YOUTUBE_CLIENT_ID,
    redirect_uri:  process.env.YOUTUBE_REDIRECT_URI,
    response_type: "code",
    scope:         YT_SCOPE,
    access_type:   "offline",
    prompt:        "consent",
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

// ─── YOUTUBE CALLBACK ─────────────────────────────────────────────────────────
// GET /api/youtube/callback
export const youtubeCallback = async (req, res) => {
  const { code, state: rawState, error } = req.query;

  let userId, returnTo;
  try {
    const decoded = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
    userId   = decoded.id;
    returnTo = decoded.ret && isSafeReturn(decoded.ret) ? decoded.ret : '';
  } catch {
    userId   = rawState;
    returnTo = '';
  }

  const fallback = `${process.env.FRONTEND_URL}/profile`;
  const dest = returnTo || fallback;

  if (error || !code || !userId) {
    const u = new URL(dest);
    u.searchParams.set('youtube', 'error');
    return res.redirect(u.toString());
  }

  try {
    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      client_id:     process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      redirect_uri:  process.env.YOUTUBE_REDIRECT_URI,
    }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Fetch the user's channel info
    let channelId = "", displayName = "";
    try {
      const channelRes = await axios.get(`${BASE}/channels`, {
        params: { part: "snippet", mine: true },
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const ch = channelRes.data.items?.[0];
      channelId   = ch?.id || "";
      displayName = ch?.snippet?.title || "";
    } catch (chErr) {
      console.error("⚠️ Channel fetch failed (proceeding anyway):", chErr.response?.status || chErr.message);
    }

    // If no channel found, use a placeholder so connected status is truthy
    if (!channelId) channelId = `oauth_${userId}`;

    const update = {
      youtubeChannelId:    channelId,
      youtubeDisplayName:  displayName || "YouTube User",
      youtubeAccessToken:  access_token,
      youtubeTokenExpiry:  new Date(Date.now() + expires_in * 1000),
    };
    // Only overwrite refresh_token if Google returned a new one
    if (refresh_token) update.youtubeRefreshToken = refresh_token;

    await User.findByIdAndUpdate(userId, update);

    console.log(`✅ YouTube connected for user ${userId}: channel=${channelId} (${displayName})`);

    const u = new URL(dest);
    u.searchParams.set('youtube', 'connected');
    res.redirect(u.toString());
  } catch (err) {
    console.error("❌ YouTube OAuth error:", err.response?.data || err.message);
    const u = new URL(dest);
    u.searchParams.set('youtube', 'error');
    res.redirect(u.toString());
  }
};

// ─── YOUTUBE KEY HEALTH CHECK ─────────────────────────────────────────────────
// GET /api/youtube/key-health
// Tests each API key with a cheap videos.list call (1 unit) to see which are alive
export const youtubeKeyHealth = async (req, res) => {
  _loadKeys();
  // Clear stale entries first
  for (const [key, until] of _exhaustedUntil) {
    if (Date.now() > until) _exhaustedUntil.delete(key);
  }

  const results = [];
  for (let i = 0; i < _ytKeys.length; i++) {
    const key = _ytKeys[i];
    const entry = { key: i + 1, suffix: key.slice(-6), status: 'unknown' };

    // Check in-memory exhaustion
    const until = _exhaustedUntil.get(key);
    if (until) {
      entry.exhaustedFor = `${Math.ceil((until - Date.now()) / 60000)}m remaining`;
    }

    // Test with a cheap API call (videos.list with part=id costs 1 unit)
    try {
      await axios.get(`${BASE}/videos`, {
        params: { part: "id", id: "dQw4w9WgXcQ", key },
      });
      entry.status = 'active';
      // If it was marked exhausted but actually works, clear it
      if (until) {
        _exhaustedUntil.delete(key);
        entry.exhaustedFor = 'cleared (key is alive)';
      }
    } catch (e) {
      const reason = e.response?.data?.error?.errors?.[0]?.reason || '';
      if (_isQuotaError(e)) {
        entry.status = 'quota_exhausted';
        entry.reason = reason;
      } else if (_isRateLimitError(e)) {
        entry.status = 'rate_limited';
        entry.reason = reason;
      } else {
        entry.status = 'error';
        entry.reason = reason || `${e.response?.status || e.message}`;
      }
    }
    results.push(entry);
  }

  const active = results.filter(r => r.status === 'active').length;
  console.log(`🔑 Key health check: ${active}/${_ytKeys.length} active`);
  res.json({
    totalKeys: _ytKeys.length,
    activeKeys: active,
    currentKeyIndex: _ytKeyIndex + 1,
    keys: results,
  });
};

// ─── YOUTUBE STATUS ───────────────────────────────────────────────────────────
// GET /api/youtube/status
export const youtubeStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "youtubeChannelId youtubeDisplayName youtubeTokenExpiry"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      connected:    !!user.youtubeChannelId,
      displayName:  user.youtubeDisplayName || null,
      channelId:    user.youtubeChannelId || null,
      tokenExpired: user.youtubeTokenExpiry ? user.youtubeTokenExpiry < new Date() : true,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── YOUTUBE DISCONNECT ───────────────────────────────────────────────────────
// DELETE /api/youtube/disconnect
export const youtubeDisconnect = async (req, res) => {
  try {
    // Try revoking the token with Google
    const user = await User.findById(req.user.id).select("+youtubeAccessToken");
    if (user?.youtubeAccessToken) {
      try {
        await axios.post(`https://oauth2.googleapis.com/revoke?token=${user.youtubeAccessToken}`);
      } catch { /* revoke is best-effort */ }
    }

    await User.findByIdAndUpdate(req.user.id, {
      $unset: {
        youtubeChannelId:    1,
        youtubeDisplayName:  1,
        youtubeAccessToken:  1,
        youtubeRefreshToken: 1,
        youtubeTokenExpiry:  1,
      },
    });
    res.json({ message: "YouTube disconnected" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CREATE YOUTUBE PLAYLIST ──────────────────────────────────────────────────
// POST /api/youtube/playlist
// Body: { name, description?, videoIds: ["dQw4w9WgXcQ", ...] }
export const createYouTubePlaylist = async (req, res) => {
  try {
    const { name, description = "", videoIds: rawIds = [] } = req.body;
    if (!name) return res.status(400).json({ message: "Playlist name is required" });
    const videoIds = rawIds.filter(id => typeof id === 'string' && id.trim().length > 0);
    if (!videoIds.length) return res.status(400).json({ message: "No videos provided" });
    console.log(`🎬 YouTube save: ${videoIds.length} videos (${rawIds.length} raw) to "${name}"`);

    const result = await getValidYouTubeToken(req.user.id);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const auth = { Authorization: `Bearer ${result.accessToken}`, "Content-Type": "application/json" };

    // Create the playlist
    const createRes = await axios.post(`${BASE}/playlists?part=snippet,status`, {
      snippet: { title: name, description },
      status:  { privacyStatus: "private" },
    }, { headers: auth });

    const playlistId = createRes.data.id;
    console.log(`✅ YouTube playlist created: ${playlistId} (${name})`);

    // Add videos one at a time (YouTube API doesn't support batch inserts)
    let added = 0;
    let skipped = 0;
    const failed = [];
    for (let i = 0; i < videoIds.length; i++) {
      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await axios.post(`${BASE}/playlistItems?part=snippet`, {
            snippet: {
              playlistId,
              resourceId: { kind: "youtube#video", videoId: videoIds[i] },
            },
          }, { headers: auth });
          added++;
          success = true;
          break;
        } catch (e) {
          const reason = e.response?.data?.error?.errors?.[0]?.reason || '';
          if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
            console.log(`⚠️ YouTube quota exhausted after adding ${added}/${videoIds.length} videos`);
            return res.json({
              playlistId,
              playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
              name,
              added,
              total: videoIds.length,
              skipped,
              partial: true,
              message: `Quota reached — ${added}/${videoIds.length} videos added`,
            });
          }
          if (reason === 'videoNotFound') {
            console.log(`   Skipping video ${videoIds[i]}: not found`);
            skipped++;
            success = true; // don't retry
            break;
          }
          if (reason === 'duplicate') {
            console.log(`   Skipping video ${videoIds[i]}: already in playlist`);
            added++; // count as added since it's there
            success = true;
            break;
          }
          // Retry once on transient errors
          if (attempt === 0) {
            console.log(`   Retrying video ${videoIds[i]} (${e.response?.status} ${reason})`);
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          console.error(`   Failed to add video ${videoIds[i]}:`, e.response?.status, reason);
          failed.push(videoIds[i]);
        }
      }
      // Small delay between inserts to avoid per-user rate limits
      if (i < videoIds.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`✅ YouTube playlist ${playlistId}: ${added}/${videoIds.length} videos added (${skipped} skipped, ${failed.length} failed)`);
    res.json({
      playlistId,
      playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      name,
      added,
      total: videoIds.length,
      skipped,
      failed: failed.length,
      partial: added < videoIds.length - skipped,
    });
  } catch (err) {
    console.error("❌ YouTube create playlist error:", err.response?.data || err.message);
    if (err.response?.status === 403) {
      const reason = err.response?.data?.error?.errors?.[0]?.reason || '';
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        return res.status(429).json({ message: "YouTube API quota exhausted — try again tomorrow" });
      }
      return res.status(403).json({ message: "Reconnect YouTube to enable playlist creation" });
    }
    res.status(err.response?.status || 500).json({ message: "Failed to create playlist" });
  }
};

// ─── ADD TO EXISTING YOUTUBE PLAYLIST ─────────────────────────────────────────
// POST /api/youtube/playlist/:id/add
// Body: { videoIds: ["dQw4w9WgXcQ", ...] }
export const addToYouTubePlaylist = async (req, res) => {
  try {
    const { videoIds: rawIds = [] } = req.body;
    const playlistId = req.params.id;
    const videoIds = rawIds.filter(id => typeof id === 'string' && id.trim().length > 0);
    if (!videoIds.length) return res.status(400).json({ message: "No videos provided" });

    const result = await getValidYouTubeToken(req.user.id);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const auth = { Authorization: `Bearer ${result.accessToken}`, "Content-Type": "application/json" };

    let added = 0;
    let skipped = 0;
    for (let i = 0; i < videoIds.length; i++) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await axios.post(`${BASE}/playlistItems?part=snippet`, {
            snippet: {
              playlistId,
              resourceId: { kind: "youtube#video", videoId: videoIds[i] },
            },
          }, { headers: auth });
          added++;
          break;
        } catch (e) {
          const reason = e.response?.data?.error?.errors?.[0]?.reason || '';
          if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
            return res.json({ added, total: videoIds.length, skipped, partial: true, message: `Quota reached — ${added}/${videoIds.length} added` });
          }
          if (reason === 'videoNotFound') { skipped++; break; }
          if (reason === 'duplicate') { added++; break; }
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          console.error(`   Failed to add video ${videoIds[i]}:`, e.response?.status, reason);
        }
      }
      if (i < videoIds.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    res.json({ added, total: videoIds.length, skipped, partial: added < videoIds.length - skipped });
  } catch (err) {
    console.error("❌ YouTube add to playlist error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to add videos" });
  }
};

// ─── GET USER'S YOUTUBE PLAYLISTS ─────────────────────────────────────────────
// GET /api/youtube/playlists
export const getYouTubePlaylists = async (req, res) => {
  try {
    const result = await getValidYouTubeToken(req.user.id);
    if (result.error) return res.status(result.error).json({ message: result.message });

    const r = await axios.get(`${BASE}/playlists`, {
      params: { part: "snippet,contentDetails", mine: true, maxResults: 50 },
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });

    const playlists = (r.data.items || []).map((p) => ({
      id:     p.id,
      name:   p.snippet.title,
      image:  p.snippet.thumbnails?.medium?.url || p.snippet.thumbnails?.default?.url || "",
      tracks: p.contentDetails?.itemCount || 0,
    }));

    res.json({ playlists });
  } catch (err) {
    console.error("❌ YouTube get playlists error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: "Failed to fetch playlists" });
  }
};
