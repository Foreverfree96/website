import express from "express";
import {
  getPosts,
  getPost,
  getMyPosts,
  createPost,
  deletePost,
  updatePost,
  toggleLike,
  addComment,
  deleteComment,
  reportPost,
} from "../controllers/postController.js";
import { protect, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// ─── Public ───────────────────────────────────────────────────────────
router.get("/", getPosts);

// ─── Protected ────────────────────────────────────────────────────────
router.get("/mine", protect, getMyPosts);
router.post("/", protect, createPost);

// ─── Public (must be after /mine to avoid :id matching "mine") ────────
router.get("/:id", optionalAuth, getPost);
router.put("/:id", protect, updatePost);
router.delete("/:id", protect, deletePost);
router.post("/:id/like", protect, toggleLike);
router.post("/:id/comments", protect, addComment);
router.delete("/:id/comments/:commentId", protect, deleteComment);
router.post("/:id/report", protect, reportPost);

export default router;
