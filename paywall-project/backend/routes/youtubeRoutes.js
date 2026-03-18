import express from "express";
import {
  getPlaylistTracks,
  searchYoutubeTracks,
  matchYoutubeTracks,
} from "../controllers/youtubeController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/playlist/:id/tracks", protect, getPlaylistTracks);
router.get("/search",              protect, searchYoutubeTracks);
router.post("/match",              protect, matchYoutubeTracks);

export default router;
