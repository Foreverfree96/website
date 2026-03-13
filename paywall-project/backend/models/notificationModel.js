// =============================================================================
// backend/models/notificationModel.js
//
// Mongoose schema and model for the Notification collection.
//
// A Notification is a real-time alert delivered to a user when someone
// interacts with them or their content.  Supported notification types:
//
//   "follow"  — another user started following the recipient
//   "comment" — someone commented on a post authored by the recipient
//   "mention" — the recipient was @mentioned in a comment
//
// Notifications are created server-side (see backend/utils/socketEmitter.js
// and the relevant controller actions) and pushed to the client over
// Socket.io so the nav badge updates without a page refresh.
//
// Index:
//   { recipient, read, createdAt: -1 }
//   Optimises the two most common queries:
//     1. Fetch all unread notifications for a user (recipient + read: false)
//     2. Fetch the notification feed sorted newest-first (recipient + createdAt)
// =============================================================================

import mongoose from "mongoose";

// -----------------------------------------------------------------------------
// Schema Definition
// -----------------------------------------------------------------------------

/**
 * notificationSchema — defines the shape of a single notification document.
 *
 * `timestamps: true` adds createdAt / updatedAt.  The createdAt value is used
 * for the "X minutes ago" display on the notifications page.
 */
const notificationSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Targeting
    // ------------------------------------------------------------------

    /** The user who should receive and see this notification. */
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ------------------------------------------------------------------
    // Event type
    // ------------------------------------------------------------------

    /**
     * Identifies what triggered this notification so the frontend can
     * render the correct icon and message template:
     *
     *   "follow"  → "@alice started following you"
     *   "comment" → "@bob commented on your post"
     *   "mention" → "@carol mentioned you in a comment"
     */
    type: { type: String, enum: ["follow", "mention", "comment"], required: true },

    // ------------------------------------------------------------------
    // Actor
    // ------------------------------------------------------------------

    /** The user whose action triggered this notification (e.g. the follower, commenter). */
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ------------------------------------------------------------------
    // Context
    // ------------------------------------------------------------------

    /**
     * The post associated with this notification.
     * null for "follow" notifications (no post involved).
     * Set to the relevant Post ObjectId for "comment" and "mention".
     */
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },

    // ------------------------------------------------------------------
    // Read state
    // ------------------------------------------------------------------

    /**
     * Whether the recipient has read/acknowledged this notification.
     * Drives the unread badge count shown in the navigation bar.
     * Flipped to true individually via markOneRead or in bulk via markAllRead.
     */
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Indexes
// -----------------------------------------------------------------------------

/**
 * Compound index covering recipient + read + createdAt.
 *
 * Serves two query patterns efficiently:
 *   - Unread count:  { recipient: id, read: false }
 *   - Notification feed: { recipient: id } sorted by createdAt DESC
 *
 * Descending createdAt ensures MongoDB doesn't need an in-memory sort
 * when returning the most recent notifications first.
 */
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

// -----------------------------------------------------------------------------
// Model export
// -----------------------------------------------------------------------------

/**
 * Reuse the compiled model if already registered (hot-reload guard),
 * otherwise compile and register a new model against the "notifications" collection.
 */
const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
