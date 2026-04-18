// =============================================================================
// backend/utils/siteLog.js
//
// General-purpose site activity logger.
// Callable from any controller (not just admin routes) to record user and
// system actions in the AdminLog collection for admin review.
//
// Auto-trims the collection to keep the last 100 entries so it doesn't grow
// unbounded. Trim runs async after each write and never blocks the caller.
// =============================================================================

import AdminLog from "../models/adminLogModel.js";

const MAX_LOGS = 10000;

/**
 * siteLog
 * Fire-and-forget — always resolves, never throws.
 *
 * @param {Object} opts
 * @param {*}      opts.userId        - ObjectId of the actor (null for system)
 * @param {string} opts.username      - Username of the actor
 * @param {string} opts.action        - Short human-readable label, e.g. "Post Created"
 * @param {*}      [opts.targetId]    - ObjectId of the target user (if any)
 * @param {string} [opts.targetUsername] - Username of the target user
 * @param {string} [opts.detail]      - Extra context (reason, duration, etc.)
 * @param {string} [opts.sourceType]  - 'post' | 'user' | 'comment' | 'dm' | 'report' | ''
 * @param {*}      [opts.sourceId]    - ObjectId of the source document
 * @param {string} [opts.sourceUrl]   - Frontend URL to navigate to (e.g. /post/:id)
 */
export const siteLog = async ({
  userId = null,
  username = "system",
  action,
  targetId = null,
  targetUsername = "",
  detail = "",
  sourceType = "",
  sourceId = null,
  sourceUrl = "",
} = {}) => {
  try {
    await AdminLog.create({
      admin: userId,
      adminUsername: username,
      action,
      targetId,
      targetUsername,
      detail,
      sourceType,
      sourceId,
      sourceUrl,
    });

    // Trim — keep only the most recent MAX_LOGS entries
    const count = await AdminLog.countDocuments();
    if (count > MAX_LOGS) {
      const old = await AdminLog.find({})
        .sort({ createdAt: -1 })
        .skip(MAX_LOGS)
        .select("_id")
        .lean();
      if (old.length) {
        await AdminLog.deleteMany({ _id: { $in: old.map((o) => o._id) } });
      }
    }
  } catch (err) {
    console.error("siteLog error:", err.message);
  }
};
