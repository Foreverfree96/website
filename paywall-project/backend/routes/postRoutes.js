// =============================================================================
// backend/routes/postRoutes.js
//
// Express router for all post-related API endpoints.
// Mounted at /api/posts in the main server file.
//
// Route groups:
//   Public      — no authentication; open to anonymous visitors
//   Protected   — valid JWT required via the `protect` middleware
//   Mixed       — routes that use `optionalAuth` so behaviour differs
//                 for authenticated vs anonymous users (e.g. private posts)
//
// IMPORTANT ordering note:
//   The static path "/mine" must be declared BEFORE the dynamic "/:id" route.
//   Express matches routes in registration order, so if "/:id" came first it
//   would treat the literal string "mine" as an ID and call getPost instead
//   of getMyPosts.
// =============================================================================

import express from "express";
import {
  getPosts,        // GET    /          — paginated public post feed
  getPost,         // GET    /:id       — single post (respects privacy)
  getMyPosts,      // GET    /mine      — posts authored by the logged-in user
  createPost,      // POST   /          — publish a new post
  deletePost,      // DELETE /:id       — remove a post (author or admin only)
  updatePost,      // PUT    /:id       — edit a post (author only)
  toggleLike,      // POST   /:id/like  — like or unlike a post
  getLikes,        // GET    /:id/likes — list of users who liked a post
  addComment,      // POST   /:id/comments              — add a comment
  deleteComment,   // DELETE /:id/comments/:commentId   — remove a comment
  reportPost,      // POST   /:id/report                — report a post
  reportComment,   // POST   /:id/comments/:commentId/report — report a comment
} from "../controllers/postController.js";
import { protect, optionalAuth, notRestricted } from "../middleware/auth.js";

const router = express.Router();

// =============================================================================
// Public routes
// =============================================================================

/**
 * GET /
 * Returns the paginated public post feed.
 * Private posts are excluded for unauthenticated visitors.
 */
router.get("/", getPosts);

// =============================================================================
// Protected routes — declared before /:id to avoid route shadowing
// =============================================================================

/**
 * GET /mine
 * Returns all posts authored by the currently authenticated user.
 * Must appear before GET /:id so Express does not match "mine" as an ID.
 */
router.get("/mine", protect, getMyPosts);

/**
 * POST /
 * Create and publish a new post.
 */
router.post("/", protect, notRestricted, createPost);

// =============================================================================
// Dynamic /:id routes
// (declared after /mine to prevent "mine" being matched as an ObjectId)
// =============================================================================

/**
 * GET /:id
 * Fetch a single post by its MongoDB ObjectId.
 * Uses optionalAuth so:
 *   - Authenticated subscribers/donors can see private posts they are
 *     entitled to view.
 *   - Unauthenticated visitors receive a 403 for private posts.
 */
router.get("/:id", optionalAuth, getPost);

/**
 * PUT /:id
 * Edit an existing post (restricted to the post's author).
 */
router.put("/:id", protect, updatePost);

/**
 * DELETE /:id
 * Delete a post — allowed for the post's author or an admin.
 */
router.delete("/:id", protect, deletePost);

/**
 * POST /:id/like
 * Toggle a like on a post. Calling again removes the like (idempotent toggle).
 */
router.post("/:id/like", protect, toggleLike);

/**
 * GET /:id/likes
 * Returns the list of users who have liked a post.
 * Public so like counts are visible without logging in.
 */
router.get("/:id/likes", getLikes);

/**
 * POST /:id/comments
 * Add a comment to a post. Fires comment/mention notifications via Socket.io.
 */
router.post("/:id/comments", protect, notRestricted, addComment);

/**
 * DELETE /:id/comments/:commentId
 * Remove a comment from a post (author of the comment or admin only).
 */
router.delete("/:id/comments/:commentId", protect, deleteComment);

/**
 * POST /:id/report
 * File an abuse report against a post.
 */
router.post("/:id/report", protect, reportPost);

/**
 * POST /:id/comments/:commentId/report
 * File an abuse report against a specific comment.
 */
router.post("/:id/comments/:commentId/report", protect, reportComment);

export default router;
