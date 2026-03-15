// Public tracking routes — no auth required.
// These are fire-and-forget endpoints called silently by the frontend.
import express from "express";
import { trackPageView, trackDownload } from "../controllers/trackController.js";

const router = express.Router();

router.post("/pageview",  trackPageView);
router.post("/download",  trackDownload);

export default router;
