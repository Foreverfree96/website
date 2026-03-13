// =============================================================================
// backend/routes/notificationRoutes.js
//
// Express router for the notification API endpoints.
// Mounted at /api/notifications in the main server file.
//
// All routes are protected — a valid JWT is required on every request.
//
// Route overview:
//
//   GET  /              — fetch the notification feed for the current user
//   GET  /unread-count  — return the count of unread notifications (for nav badge)
//   PUT  /read-all      — mark every notification as read in one operation
//   PUT  /:id/read      — mark a single notification as read
//
// Notifications are created server-side by socketEmitter.js when a follow,
// comment, or mention event occurs. The frontend consumes the unread-count
// endpoint on load and listens for real-time updates over Socket.io.
// =============================================================================

import express from "express";
import {
  getNotifications, // GET  /             — paginated notification feed
  getUnreadCount,   // GET  /unread-count — count of unread items
  markAllRead,      // PUT  /read-all     — bulk mark-as-read
  markOneRead,      // PUT  /:id/read     — mark a single notification read
} from "../controllers/notificationController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// =============================================================================
// Notification routes — all require authentication
// =============================================================================

/**
 * GET /
 * Returns the notification feed for the authenticated user, sorted by
 * most-recent first.  The controller handles pagination if implemented.
 */
router.get("/", protect, getNotifications);

/**
 * GET /unread-count
 * Returns the number of unread notifications for the authenticated user.
 * Called on page load and after Socket.io events to keep the nav badge current.
 */
router.get("/unread-count", protect, getUnreadCount);

/**
 * PUT /read-all
 * Sets read: true on all of the authenticated user's notifications in a single
 * database operation.  Called when the user clicks "Mark all as read".
 */
router.put("/read-all", protect, markAllRead);

/**
 * PUT /:id/read
 * Mark a single notification (identified by its MongoDB ObjectId) as read.
 * Called when the user clicks an individual notification item.
 */
router.put("/:id/read", protect, markOneRead);

export default router;
