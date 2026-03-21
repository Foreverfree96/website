import express from "express";
import {
  getPlaylistTracks,
  searchYoutubeTracks,
  matchYoutubeTracks,
  getChannelInfo,
  youtubeAuth,
  youtubeCallback,
  youtubeStatus,
  youtubeDisconnect,
  createYouTubePlaylist,
  addToYouTubePlaylist,
  getYouTubePlaylists,
} from "../controllers/youtubeController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// OAuth (public — browser redirect flow)
router.get("/auth",     youtubeAuth);
router.get("/callback", youtubeCallback);

// Protected
router.get("/status",             protect, youtubeStatus);
router.delete("/disconnect",      protect, youtubeDisconnect);
router.get("/playlists",          protect, getYouTubePlaylists);
router.post("/playlist",          protect, createYouTubePlaylist);
router.post("/playlist/:id/add",  protect, addToYouTubePlaylist);

// Existing read-only routes
router.get("/playlist/:id/tracks", protect, getPlaylistTracks);
router.get("/search",              protect, searchYoutubeTracks);
router.post("/match",              protect, matchYoutubeTracks);
router.get("/channel/:identifier", protect, getChannelInfo);

export default router;
