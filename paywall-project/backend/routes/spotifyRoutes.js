import express from "express";
import {
  spotifyLogin,
  spotifyCallback,
  spotifyStatus,
  spotifyGetToken,
  spotifyShuffleOff,
  spotifyDisconnect,
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
router.delete("/disconnect", protect, spotifyDisconnect);

export default router;
