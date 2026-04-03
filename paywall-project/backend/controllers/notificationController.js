/**
 * notificationController.js
 *
 * Handles all notification-related HTTP request logic for the authenticated user:
 *  - Fetching a paginated list of notifications (with unread count)
 *  - Getting the current unread count (used for the nav badge)
 *  - Marking all notifications as read at once
 *  - Marking a single notification as read
 *
 * Notifications are created elsewhere (in userController.toggleFollow and
 * postController.addComment / createPost) and emitted in real-time via
 * Socket.io. This controller is purely for reading and managing the
 * persisted notification documents.
 *
 * All routes are protected — req.user.id is set by the auth middleware.
 */

import Notification from "../models/notificationModel.js";
import { siteLog } from "../utils/siteLog.js";

// ─── GET NOTIFICATIONS ────────────────────────────────────────────────────────

/**
 * GET /api/notifications  (protected)
 *
 * Returns a paginated list of notifications for the authenticated user,
 * sorted newest-first, along with the total unread count.
 *
 * Each notification has its sender and related post populated so the
 * frontend can display e.g. "alice followed you" or "bob commented on
 * Your Post Title".
 *
 * Query params:
 *  @param {number} [page=1]   - Page number (1-indexed)
 *  @param {number} [limit=20] - Number of notifications per page
 *
 * Responds with:
 *  { notifications: Notification[], unreadCount: number }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit)) // pagination offset
      .limit(parseInt(limit))
      .populate("sender", "username")     // who triggered the notification
      .populate("post", "title")          // the related post title (if any)
      .lean();

    // Count unread notifications separately (cheaper than filtering the page result)
    const unreadCount = await Notification.countDocuments({ recipient: req.user.id, read: false });

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error("❌ Get Notifications Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET UNREAD COUNT ─────────────────────────────────────────────────────────

/**
 * GET /api/notifications/unread-count  (protected)
 *
 * Returns only the count of unread notifications for the authenticated user.
 * Polled periodically by the frontend to keep the nav badge up to date
 * when the user is not connected via Socket.io.
 *
 * Responds with: { count: number }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── MARK ALL READ ────────────────────────────────────────────────────────────

/**
 * PUT /api/notifications/read-all  (protected)
 *
 * Marks every unread notification for the authenticated user as read in a
 * single bulk update. Typically called when the user opens the notifications
 * page or clicks "Mark all as read".
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const markAllRead = async (req, res) => {
  try {
    // Bulk-update only the unread notifications to avoid unnecessary writes
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true } }
    );
    res.json({ message: "All notifications marked as read" });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Marked All Notifications Read" });
  } catch (err) {
    console.error("❌ Mark All Read Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── MARK ONE READ ────────────────────────────────────────────────────────────

/**
 * PUT /api/notifications/:id/read  (protected)
 *
 * Marks a single notification as read. The query filters by both the
 * notification ID and the current user's ID as the recipient to prevent
 * one user from marking another user's notifications as read.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the notification
 *
 * Responds with: { message } on success, 404 if not found.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const markOneRead = async (req, res) => {
  try {
    // Scope the lookup to the current user to prevent unauthorised access
    const notif = await Notification.findOne({ _id: req.params.id, recipient: req.user.id });
    if (!notif) return res.status(404).json({ message: "Notification not found" });

    notif.read = true;
    await notif.save();
    res.json({ message: "Marked as read" });
  } catch (err) {
    console.error("❌ Mark One Read Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE ONE NOTIFICATION ──────────────────────────────────────────────────

/**
 * DELETE /api/notifications/:id  (protected)
 *
 * Permanently deletes a single notification belonging to the current user.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const deleteOne = async (req, res) => {
  try {
    const result = await Notification.deleteOne({ _id: req.params.id, recipient: req.user.id });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error("❌ Delete Notification Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE ALL NOTIFICATIONS ─────────────────────────────────────────────────

/**
 * DELETE /api/notifications  (protected)
 *
 * Permanently deletes every notification for the authenticated user.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const deleteAll = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user.id });
    res.json({ message: "All notifications cleared" });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Deleted All Notifications" });
  } catch (err) {
    console.error("❌ Clear Notifications Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
