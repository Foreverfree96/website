import express from "express";
import {
  spotifyLogin,
  spotifyCallback,
  spotifyStatus,
  spotifyGetToken,
  spotifyShuffleOff,
  spotifyDisconnect,
  getPlaylistTracks,
  searchTracks,
  generatePlaylist,
  createPlaylist,
  matchTracks,
  saveTrack,
  savePlaylist,
  getUserPlaylists,
  addToPlaylist,
  generatePlaylistName,
  renamePlaylist,
} from "../controllers/spotifyController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Public — token passed as query param (browser redirect, no auth header possible)
router.get("/login",    spotifyLogin);
router.get("/callback", spotifyCallback);

// Protected — standard JWT header auth
router.get("/status",       protect, spotifyStatus);
router.get("/token",        protect, spotifyGetToken);
router.post("/shuffle-off", protect, spotifyShuffleOff);
router.delete("/disconnect",             protect, spotifyDisconnect);
router.get("/playlist/:id/tracks",      getPlaylistTracks);
router.get("/search",                  protect, searchTracks);
router.post("/generate",               protect, generatePlaylist);
router.post("/playlist",               protect, createPlaylist);
router.post("/match",                  protect, matchTracks);
router.put("/save-track",              protect, saveTrack);
router.put("/save-playlist",           protect, savePlaylist);
router.get("/playlists",               protect, getUserPlaylists);
router.post("/playlist/:id/add",       protect, addToPlaylist);
router.post("/playlist-name",          protect, generatePlaylistName);
router.put("/playlist/:id/rename",     protect, renamePlaylist);

export default router;
