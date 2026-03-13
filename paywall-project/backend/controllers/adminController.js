/**
 * adminController.js
 *
 * Handles all moderation and admin-panel operations.
 * Every route in this controller is protected by both the standard `protect`
 * middleware (JWT auth) and the `isAdmin` middleware (admin role check).
 *
 * Responsibilities:
 *  - Viewing reported posts and auto-flagged posts
 *  - Viewing posts that have reported comments
 *  - Clearing post/comment reports (approving content)
 *  - Manually flagging a post
 *  - Deleting any post or any comment regardless of ownership
 *  - Listing all registered users
 *  - Deleting a user and cascading their content/relationships
 *  - Reviewing and updating the status of DM reports
 *
 * The enrichPosts helper centralises the population of reporter usernames and
 * report reasons, since Mongoose cannot .populate() into arrays of raw IDs
 * stored outside of ref fields.
 */

import Post from "../models/postModel.js";
import User from "../models/userModel.js";
import Notification from "../models/notificationModel.js";
import DmReport from "../models/dmReportModel.js";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Enriches an array of raw (lean) post documents with human-readable
 * reporter usernames and report reasons for both posts and their comments.
 *
 * Because reportedBy stores raw ObjectIds (not populated refs), a single
 * batch User lookup is performed to build a username map, then each post
 * and comment's arrays are re-mapped to include the username.
 *
 * Deleted users are shown as "deleted" to avoid breaking the admin UI.
 *
 * @param   {Object[]} posts - Array of lean post documents from Mongoose
 * @returns {Promise<Object[]>} Enriched post array with reportedByUsers,
 *                              populated reports, and populated comment reports
 */
const enrichPosts = async (posts) => {
  // Collect every user ID referenced across all posts and their comments
  const userIds = new Set();
  posts.forEach(p => {
    p.reportedBy?.forEach(id => userIds.add(id.toString()));
    p.reports?.forEach(r => userIds.add(r.user?.toString()));
    p.comments?.forEach(c => {
      c.reportedBy?.forEach(id => userIds.add(id.toString()));
      c.reports?.forEach(r => userIds.add(r.user?.toString()));
      userIds.add(c.author?.toString());
    });
  });

  // Single batch lookup — far cheaper than one query per user ID
  const users = await User.find({ _id: { $in: [...userIds] } }).select("username").lean();

  // Build a lookup map: "objectIdString" → "username"
  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u.username]));

  // Re-map each post to replace raw IDs with enriched objects
  return posts.map(p => ({
    ...p,
    // Array of { _id, username } for each user who reported this post
    reportedByUsers: (p.reportedBy || []).map(id => ({ _id: id, username: userMap[id.toString()] ?? "deleted" })),
    // Replace raw report objects with human-readable versions
    reports: (p.reports || []).map(r => ({
      username: userMap[r.user?.toString()] ?? "deleted",
      reason: r.reason,
      createdAt: r.createdAt,
    })),
    // Enrich each comment's report data in the same way
    comments: (p.comments || []).map(c => ({
      ...c,
      author: { _id: c.author, username: userMap[c.author?.toString()] ?? "deleted" },
      reportedBy: c.reportedBy || [],
      reportedByUsers: (c.reportedBy || []).map(id => ({ _id: id, username: userMap[id.toString()] ?? "deleted" })),
      reports: (c.reports || []).map(r => ({
        username: userMap[r.user?.toString()] ?? "deleted",
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    })),
  }));
};

// ─── GET REPORTED POSTS ───────────────────────────────────────────────────────

/**
 * GET /api/admin/reported  (admin)
 *
 * Returns all posts that have at least one user report, sorted by report
 * count (descending) then creation date. Used by moderators to prioritise
 * review of the most-reported content.
 *
 * Responds with an enriched array of post documents including reporter
 * usernames and report reasons.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getReportedPosts = async (req, res) => {
  try {
    const posts = await Post.find({ reportedBy: { $exists: true, $not: { $size: 0 } } })
      .sort({ "reportedBy": -1, createdAt: -1 }) // most-reported posts first
      .populate("author", "username email")
      .lean();
    res.json(await enrichPosts(posts));
  } catch (err) {
    console.error("❌ Admin getReportedPosts Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET FLAGGED POSTS ────────────────────────────────────────────────────────

/**
 * GET /api/admin/flagged  (admin)
 *
 * Returns all posts that have been automatically or manually flagged
 * (moderationStatus === "flagged"). These posts are hidden from the public
 * feed until an admin either approves or deletes them.
 *
 * Responds with an enriched array of post documents.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getFlaggedPosts = async (req, res) => {
  try {
    const posts = await Post.find({ moderationStatus: "flagged" })
      .sort({ createdAt: -1 })
      .populate("author", "username email")
      .lean();
    res.json(await enrichPosts(posts));
  } catch (err) {
    console.error("❌ Admin getFlaggedPosts Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET REPORTED COMMENTS ────────────────────────────────────────────────────

/**
 * GET /api/admin/reported-comments  (admin)
 *
 * Returns posts that contain at least one comment with one or more reports.
 * The response only includes the comments that have reports (other comments
 * on the same post are stripped) to keep the admin panel focused.
 *
 * Responds with an enriched array of post documents where each post's
 * comments array contains only reported comments.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getReportedComments = async (req, res) => {
  try {
    // $exists: true + .0 checks that the reportedBy array has at least one element
    const posts = await Post.find({ "comments.reportedBy.0": { $exists: true } })
      .sort({ createdAt: -1 })
      .populate("author", "username email")
      .lean();

    const enriched = await enrichPosts(posts);

    // Trim each post down to only the comments that have been reported
    const result = enriched
      .map(p => ({
        ...p,
        comments: p.comments.filter(c => c.reportedBy.length > 0),
      }))
      .filter(p => p.comments.length > 0); // drop posts that ended up with no reported comments

    res.json(result);
  } catch (err) {
    console.error("❌ Admin getReportedComments Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CLEAR COMMENT REPORTS ────────────────────────────────────────────────────

/**
 * PUT /api/admin/posts/:id/comments/:commentId/clear-reports  (admin)
 *
 * Clears all reports on a specific comment, effectively approving it.
 * The comment and its text remain intact — only the report metadata is removed.
 *
 * Route params:
 *  @param {string} id        - MongoDB ObjectId of the parent post
 *  @param {string} commentId - MongoDB ObjectId of the comment (subdocument)
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const clearCommentReports = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Wipe both the reporter list and the detailed report array
    comment.reportedBy = [];
    comment.reports = [];
    await post.save();

    res.json({ message: "Comment reports cleared" });
  } catch (err) {
    console.error("❌ clearCommentReports Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── ADMIN DELETE POST ────────────────────────────────────────────────────────

/**
 * DELETE /api/admin/posts/:id  (admin)
 *
 * Permanently deletes any post regardless of ownership.
 * Used when a reported or flagged post violates community guidelines.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const adminDeletePost = async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json({ message: "Post removed by moderator" });
  } catch (err) {
    console.error("❌ Admin deletePost Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── ADMIN DELETE COMMENT ─────────────────────────────────────────────────────

/**
 * DELETE /api/admin/posts/:id/comments/:commentId  (admin)
 *
 * Permanently removes any comment from a post regardless of who authored it.
 * Used when a reported comment violates community guidelines.
 *
 * Route params:
 *  @param {string} id        - MongoDB ObjectId of the parent post
 *  @param {string} commentId - MongoDB ObjectId of the comment (subdocument)
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const adminDeleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    comment.deleteOne();
    await post.save();
    res.json({ message: "Comment removed by moderator" });
  } catch (err) {
    console.error("❌ Admin deleteComment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CLEAR POST REPORTS ───────────────────────────────────────────────────────

/**
 * PUT /api/admin/posts/:id/clear-reports  (admin)
 *
 * Clears all reports on a post and resets its moderation status to "approved",
 * making it visible in the public feed again. Use this when a post has been
 * reviewed and found to be acceptable.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const clearReports = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Clear reporter list and re-approve the post so it re-appears in the feed
    post.reportedBy = [];
    post.moderationStatus = "approved";
    await post.save();

    res.json({ message: "Reports cleared" });
  } catch (err) {
    console.error("❌ Admin clearReports Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET ALL USERS ────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users  (admin)
 *
 * Returns a list of all registered users with key metadata for the admin panel.
 * Sorted newest-registered first. Does not expose passwords or tokens.
 *
 * Responds with an array of:
 *  { _id, username, email, createdAt, isAdmin, isSubscriber,
 *    followerCount, followingCount }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("username email createdAt isAdmin isSubscriber followers following")
      .sort({ createdAt: -1 })
      .lean();

    // Compute counts from the stored arrays rather than relying on a counter field
    const result = users.map(u => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      createdAt: u.createdAt,
      isAdmin: u.isAdmin || false,
      isSubscriber: u.isSubscriber || false,
      followerCount: u.followers?.length || 0,
      followingCount: u.following?.length || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("❌ Admin getUsers Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── ADMIN DELETE USER ────────────────────────────────────────────────────────

/**
 * DELETE /api/admin/users/:userId  (admin)
 *
 * Completely removes a user account along with all their associated data.
 * Cascade actions performed in order:
 *  1. Delete all posts authored by the user
 *  2. Delete all notifications sent to or from the user
 *  3. Remove the user's ID from all other users' followers/following arrays
 *  4. Delete the user document itself
 *
 * Protections:
 *  - Admins cannot delete their own account via this endpoint
 *  - Admins cannot delete other admin accounts
 *
 * Route params:
 *  @param {string} userId - MongoDB ObjectId of the user to delete
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const adminDeleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion via the admin panel
    if (userId === req.user.id)
      return res.status(400).json({ message: "You cannot delete your own account via the mod panel." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Prevent admins from deleting each other (escalation protection)
    if (user.isAdmin)
      return res.status(403).json({ message: "Cannot delete another moderator account." });

    // ── Cascade deletions ────────────────────────────────────────────────────

    // 1. Remove all of the user's posts
    await Post.deleteMany({ author: userId });

    // 2. Remove all notifications involving this user (as sender or recipient)
    await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });

    // 3. Pull this user's ID from every other user's followers and following lists
    await User.updateMany(
      { $or: [{ followers: userId }, { following: userId }] },
      { $pull: { followers: userId, following: userId } }
    );

    // 4. Finally delete the user document
    await user.deleteOne();

    res.json({ message: "User and all their content removed." });
  } catch (err) {
    console.error("❌ Admin deleteUser Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET DM REPORTS ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/dm-reports  (admin)
 *
 * Returns all pending DM reports submitted by users, sorted newest-first.
 * Each report includes the full reporter and reported-user profile data
 * (username, email) and the selected message snapshots as evidence.
 *
 * Responds with an array of DmReport documents.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getDmReports = async (req, res) => {
  try {
    const reports = await DmReport.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .populate("reporter", "username email")
      .populate("reportedUser", "username email")
      .lean();
    res.json(reports);
  } catch (err) {
    console.error("❌ getDmReports Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPDATE DM REPORT STATUS ──────────────────────────────────────────────────

/**
 * PUT /api/admin/dm-reports/:reportId  (admin)
 *
 * Updates the status of a DM report after an admin has reviewed it.
 * Valid status transitions: pending → "reviewed" or pending → "dismissed".
 *
 * Route params:
 *  @param {string} reportId - MongoDB ObjectId of the DmReport document
 *
 * Body params:
 *  @param {string} status - Must be "reviewed" or "dismissed"
 *
 * Responds with: { ok: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const updateDmReportStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // Only allow the two valid resolution statuses
    if (!["reviewed", "dismissed"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const report = await DmReport.findByIdAndUpdate(req.params.reportId, { status }, { new: true });
    if (!report) return res.status(404).json({ message: "Report not found" });

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ updateDmReportStatus Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── ADMIN FLAG POST ──────────────────────────────────────────────────────────

/**
 * PUT /api/admin/posts/:id/flag  (admin)
 *
 * Manually flags a post, hiding it from the public feed.
 * Unlike the auto-flag (triggered at 5 reports), this can be applied to any
 * post immediately after a single admin review.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const adminFlagPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.moderationStatus = "flagged";
    await post.save();

    res.json({ message: "Post flagged" });
  } catch (err) {
    console.error("❌ Admin flagPost Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
