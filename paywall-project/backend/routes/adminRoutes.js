// =============================================================================
// backend/routes/adminRoutes.js
//
// Express router for the admin moderation panel API endpoints.
// Mounted at /api/admin in the main server file.
//
// Access control:
//   Every route in this file requires BOTH:
//     1. A valid JWT (protect)  — the request must be authenticated
//     2. Admin role (isAdmin)   — req.user.isAdmin must be true
//   Both guards are applied globally via `router.use(protect, isAdmin)` so
//   individual route definitions stay clean.
//
// Route overview:
//
//   Content moderation:
//     GET    /reported                              — posts that users have reported
//     GET    /flagged                               — posts manually flagged by admins
//     GET    /reported-comments                     — comments that have been reported
//     DELETE /posts/:id                             — hard-delete a post
//     DELETE /posts/:id/comments/:commentId         — hard-delete a comment
//     PUT    /posts/:id/clear-reports               — dismiss reports on a post
//     PUT    /posts/:id/comments/:commentId/clear-reports — dismiss reports on a comment
//     PUT    /posts/:id/flag                        — toggle the flagged status of a post
//
//   User management:
//     GET    /users                                 — list all registered users
//     DELETE /users/:userId                         — delete a user account
//
//   DM report management:
//     GET    /dm-reports                            — list all filed DM abuse reports
//     PUT    /dm-reports/:reportId                  — update a DM report's status
// =============================================================================

import express from "express";
import { protect, isAdmin } from "../middleware/auth.js";
import {
  getReportedPosts,      // GET    /reported                     — posts with report entries
  getFlaggedPosts,       // GET    /flagged                      — admin-flagged posts
  adminDeletePost,       // DELETE /posts/:id                    — remove a post entirely
  adminDeleteComment,    // DELETE /posts/:id/comments/:cId      — remove a comment entirely
  clearReports,          // PUT    /posts/:id/clear-reports       — dismiss post reports
  adminFlagPost,         // PUT    /posts/:id/flag               — flag/unflag a post
  getUsers,              // GET    /users                        — full user list
  getReportedComments,   // GET    /reported-comments            — comments with reports
  clearCommentReports,   // PUT    /posts/:id/comments/:cId/clear-reports
  adminDeleteUser,       // DELETE /users/:userId                — remove a user account
  restrictUser,          // PUT    /users/:userId/restrict        — timed restriction
  banUser,               // PUT    /users/:userId/ban             — permanent ban + email block
  getDmReports,          // GET    /dm-reports                   — all DM abuse reports
  updateDmReportStatus,  // PUT    /dm-reports/:reportId         — set report status
  getAnalytics,          // GET    /analytics                    — platform-wide metrics
} from "../controllers/adminController.js";

const router = express.Router();

// =============================================================================
// Global auth + role guard
// =============================================================================

/**
 * Apply protect then isAdmin to every route registered on this router.
 * - protect  verifies the JWT and attaches req.user (401 if missing/invalid).
 * - isAdmin  checks req.user.isAdmin === true (403 if the user is not an admin).
 *
 * Any request that fails either check never reaches the route handler.
 */
router.use(protect, isAdmin);

// =============================================================================
// Content moderation routes
// =============================================================================

/**
 * GET /reported
 * Returns posts that have at least one entry in their `reports` array.
 * Admins use this queue to review and act on user-submitted reports.
 */
router.get("/reported", getReportedPosts);

/**
 * GET /flagged
 * Returns posts whose moderationStatus is "flagged".
 * Posts can be flagged manually by an admin via PUT /posts/:id/flag.
 */
router.get("/flagged", getFlaggedPosts);

/**
 * GET /reported-comments
 * Returns posts that contain at least one comment with report entries,
 * so admins can review comment-level abuse reports.
 */
router.get("/reported-comments", getReportedComments);

/**
 * DELETE /posts/:id
 * Permanently delete a post and all its associated comments and reports.
 */
router.delete("/posts/:id", adminDeletePost);

/**
 * DELETE /posts/:id/comments/:commentId
 * Remove a specific comment from a post without deleting the post itself.
 */
router.delete("/posts/:id/comments/:commentId", adminDeleteComment);

/**
 * PUT /posts/:id/clear-reports
 * Dismiss all filed reports on a post (clears the reports array and resets
 * moderationStatus to "approved").  Used after reviewing a false report.
 */
router.put("/posts/:id/clear-reports", clearReports);

/**
 * PUT /posts/:id/comments/:commentId/clear-reports
 * Dismiss all reports filed against a specific comment.
 */
router.put("/posts/:id/comments/:commentId/clear-reports", clearCommentReports);

/**
 * PUT /posts/:id/flag
 * Toggle the flagged/approved moderation status of a post.
 * Flagged posts are hidden from the public feed pending admin action.
 */
router.put("/posts/:id/flag", adminFlagPost);

// =============================================================================
// User management routes
// =============================================================================

/**
 * GET /users
 * Returns a list of all registered user accounts with basic profile info.
 * Used by the admin panel to search, review, and manage users.
 */
router.get("/users", getUsers);

/**
 * DELETE /users/:userId
 * Permanently delete a user account and all content associated with it.
 */
router.delete("/users/:userId", adminDeleteUser);
router.put("/users/:userId/restrict", restrictUser);
router.put("/users/:userId/ban", banUser);

// =============================================================================
// DM report management routes
// =============================================================================

/**
 * GET /dm-reports
 * Returns all DM abuse reports filed by users, including the embedded
 * message snapshots and the current review status.
 */
router.get("/dm-reports", getDmReports);

/**
 * PUT /dm-reports/:reportId
 * Update the status of a DM report (pending → reviewed | dismissed).
 * Called when an admin has finished reviewing the report.
 */
router.put("/dm-reports/:reportId", updateDmReportStatus);

// =============================================================================
// Analytics
// =============================================================================

/**
 * GET /analytics
 * Returns aggregated platform metrics: user counts, post counts, moderation
 * queue sizes, DM report totals, and social graph stats.
 */
router.get("/analytics", getAnalytics);

export default router;
