import express from "express";
import { getChannelInfo } from "../controllers/twitchController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/channel/:username", protect, getChannelInfo);

export default router;
