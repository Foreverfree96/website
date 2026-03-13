/**
 * messageController.js
 *
 * Handles all direct-message (DM) functionality:
 *  - Listing conversations for the current user
 *  - Creating or retrieving an existing conversation with another user
 *  - Fetching paginated message history (cursor-based via "before" param)
 *  - Sending a message (with real-time Socket.io delivery)
 *  - Marking a conversation as read
 *  - Clearing all messages in a conversation (with snapshot preservation)
 *  - Unsending an individual message (sender only, snapshot preserved)
 *  - Retrieving the pre-clear snapshot
 *  - Reporting a DM conversation to moderators
 *  - Getting the total unread DM count across all conversations
 *
 * Access rules:
 *  - Only mutual followers may start or participate in conversations.
 *  - Blocked users cannot message each other.
 *  - Participants can only read/write their own conversations.
 *
 * Real-time delivery uses Socket.io; the recipient receives a "dm" event
 * on their private room. Socket failures are caught and non-fatal.
 */

import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import DmReport from "../models/dmReportModel.js";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Determines whether two users are mutual followers (each follows the other).
 * Used to gate who can start or continue a DM conversation.
 *
 * @param   {string|ObjectId} userIdA - ID of the first user
 * @param   {string|ObjectId} userIdB - ID of the second user
 * @returns {Promise<boolean>}          true if A follows B AND B follows A
 */
const areMutuals = async (userIdA, userIdB) => {
  const a = await User.findById(userIdA).select("following followers").lean();
  if (!a) return false;
  const followingSet = new Set(a.following.map(id => id.toString()));
  const followersSet = new Set(a.followers.map(id => id.toString()));
  // Both conditions must be true for a mutual follow relationship
  return followingSet.has(userIdB.toString()) && followersSet.has(userIdB.toString());
};

// ─── GET CONVERSATIONS ────────────────────────────────────────────────────────

/**
 * GET /api/messages  (protected)
 *
 * Returns all conversations the authenticated user is part of, sorted by
 * most-recently-messaged first. Each item includes the other participant's
 * username and the current user's unread count for that thread.
 *
 * Responds with an array of:
 *  { _id, other: { _id, username }, lastMessage, lastMessageAt, unread }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getConversations = async (req, res) => {
  try {
    const convos = await Conversation.find({ participants: req.user.id })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "username")
      .lean();

    // Shape each conversation document for the frontend:
    // - Identify the "other" participant (not the current user)
    // - Extract the current user's unread count from the unread map
    const result = convos.map(c => {
      const other = c.participants.find(p => p._id.toString() !== req.user.id);
      const unread = c.unread?.[req.user.id] || 0;
      return { _id: c._id, other, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt, unread };
    });

    res.json(result);
  } catch (err) {
    console.error("❌ getConversations:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET OR CREATE CONVERSATION ───────────────────────────────────────────────

/**
 * POST /api/messages  (protected)
 *
 * Retrieves an existing 1:1 conversation between the current user and
 * the specified recipient, or creates one if it doesn't exist yet.
 *
 * Prerequisites enforced before creation:
 *  1. recipientId must be provided and must not be the current user's ID
 *  2. The two users must be mutual followers
 *  3. Neither user may have the other blocked
 *
 * Body params:
 *  @param {string} recipientId - MongoDB ObjectId of the other participant
 *
 * Responds with:
 *  { _id, other: { _id, username }, lastMessage, lastMessageAt, unread }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getOrCreateConversation = async (req, res) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId) return res.status(400).json({ message: "recipientId required" });
    if (recipientId === req.user.id) return res.status(400).json({ message: "Cannot message yourself" });

    // Enforce mutual-follow rule before allowing any DM
    const mutual = await areMutuals(req.user.id, recipientId);
    if (!mutual) return res.status(403).json({ message: "You can only message mutual followers" });

    // Check if either user has blocked the other — if so, deny
    const [me, them] = await Promise.all([
      User.findById(req.user.id).select("blockedUsers").lean(),
      User.findById(recipientId).select("blockedUsers").lean(),
    ]);
    const blocked = me?.blockedUsers?.map(id => id.toString()).includes(recipientId) ||
                    them?.blockedUsers?.map(id => id.toString()).includes(req.user.id);
    if (blocked) return res.status(403).json({ message: "Cannot message this user" });

    // Look for an existing conversation with exactly these two participants
    let convo = await Conversation.findOne({
      participants: { $all: [req.user.id, recipientId], $size: 2 },
    }).populate("participants", "username");

    // Create a new conversation if none exists
    if (!convo) {
      convo = await Conversation.create({ participants: [req.user.id, recipientId] });
      await convo.populate("participants", "username");
    }

    const other = convo.participants.find(p => p._id.toString() !== req.user.id);
    res.json({ _id: convo._id, other, lastMessage: convo.lastMessage, lastMessageAt: convo.lastMessageAt, unread: convo.unread?.[req.user.id] || 0 });
  } catch (err) {
    console.error("❌ getOrCreateConversation:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET MESSAGES ─────────────────────────────────────────────────────────────

/**
 * GET /api/messages/:conversationId  (protected)
 *
 * Returns paginated messages for a conversation, in chronological order
 * (oldest first — the array is fetched newest-first then reversed).
 * Cursor-based pagination: pass `before` (ISO date string) to load
 * older messages than that point.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *
 * Query params:
 *  @param {string} [before] - ISO date; return only messages older than this
 *  @param {number} [limit=40] - Messages to fetch (max 100)
 *
 * Responds with an array of message documents (sorted oldest-first).
 * Each message includes sender { _id, username }.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getMessages = async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.conversationId).lean();
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    // Verify the requester is a participant in this conversation
    if (!convo.participants.map(p => p.toString()).includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });

    const { before } = req.query;
    // Cap limit at 100 to prevent excessively large payloads
    const limit = Math.min(parseInt(req.query.limit) || 40, 100);
    const filter = { conversation: convo._id };

    // Cursor: if "before" is supplied, only return messages older than that timestamp
    if (before) filter.createdAt = { $lt: new Date(before) };

    // Fetch newest-first (for efficient pagination from the bottom), then reverse for display
    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "username")
      .lean();

    res.json(messages.reverse()); // return in chronological order
  } catch (err) {
    console.error("❌ getMessages:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────

/**
 * POST /api/messages/:conversationId  (protected)
 *
 * Sends a new message in the specified conversation.
 * After saving the message, the conversation's preview fields and the
 * recipient's unread counter are updated atomically, then a real-time
 * "dm" event is emitted to the recipient's Socket.io room.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *
 * Body params:
 *  @param {string} body - The message text (required, non-empty)
 *
 * Responds 201 with the saved message document (sender populated).
 * The real-time emit happens after the response and is non-fatal.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const sendMessage = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ message: "Message cannot be empty" });

    const convo = await Conversation.findById(req.params.conversationId);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    const participantIds = convo.participants.map(p => p.toString());
    if (!participantIds.includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });

    // Persist the message document
    const msg = await Message.create({ conversation: convo._id, sender: req.user.id, body: body.trim() });
    await msg.populate("sender", "username");

    // ── Update conversation metadata ─────────────────────────────────────────
    const recipientId = participantIds.find(id => id !== req.user.id);

    // Handle both Map and plain-object representations of the unread field
    const currentUnread = convo.unread?.get ? (convo.unread.get(recipientId) || 0) : (convo.unread?.[recipientId] || 0);

    // Preview text truncated to 80 chars to keep the conversation list compact
    convo.lastMessage = body.trim().slice(0, 80);
    convo.lastMessageAt = msg.createdAt;

    // Increment unread count for the recipient only
    convo.unread = { ...Object.fromEntries(convo.unread || []), [recipientId]: currentUnread + 1 };
    await convo.save();

    res.status(201).json(msg);

    // ── Real-time delivery via Socket.io ─────────────────────────────────────
    // Emit after the response so the sender's request is not delayed
    try {
      const { getIo } = await import("../utils/socketEmitter.js");
      getIo()?.to(recipientId).emit("dm", {
        conversationId: convo._id,
        message: {
          _id: msg._id,
          sender: { _id: req.user.id, username: req.user.username },
          body: msg.body,
          createdAt: msg.createdAt,
          read: false,
        },
      });
    } catch { /* non-fatal — message is already persisted */ }
  } catch (err) {
    console.error("❌ sendMessage:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── MARK CONVERSATION READ ───────────────────────────────────────────────────

/**
 * PUT /api/messages/:conversationId/read  (protected)
 *
 * Marks all unread messages in the conversation as read from the perspective
 * of the authenticated user. Resets their unread counter to 0 and updates
 * the read flag on all individual message documents.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *
 * Responds with: { ok: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const markConversationRead = async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.conversationId);
    if (!convo) return res.status(404).json({ message: "Not found" });
    if (!convo.participants.map(p => p.toString()).includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });

    // Reset this user's unread counter in the conversation document
    const unreadMap = Object.fromEntries(convo.unread || []);
    unreadMap[req.user.id] = 0;
    convo.unread = unreadMap;
    await convo.save();

    // Mark all individual message documents from the other participant as read
    await Message.updateMany(
      { conversation: convo._id, sender: { $ne: req.user.id }, read: false },
      { $set: { read: true } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ markConversationRead:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CLEAR CONVERSATION ───────────────────────────────────────────────────────

/**
 * DELETE /api/messages/:conversationId/clear  (protected)
 *
 * Deletes all messages in a conversation for both participants.
 * Before deleting, saves the 20 most recent messages as a snapshot on the
 * conversation document for moderation purposes (in case of a DM report).
 *
 * After the response, emits a "conversation_cleared" event to the other
 * participant's Socket.io room so their UI can react immediately.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *
 * Responds with: { ok: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const clearConversation = async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.conversationId);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    if (!convo.participants.map(p => p.toString()).includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });

    // ── Snapshot the last 20 messages before wiping ──────────────────────────
    // This gives moderators evidence to act on if a DM report is filed later
    const recentMsgs = await Message.find({ conversation: convo._id })
      .sort({ createdAt: -1 }).limit(20)
      .populate("sender", "username").lean();

    // Reverse to store them oldest-first in the snapshot
    convo.clearedSnapshot = recentMsgs.reverse().map(m => ({
      sender: m.sender._id,
      senderUsername: m.sender.username,
      body: m.body,
      sentAt: m.createdAt,
    }));

    // Delete all message documents for this conversation
    await Message.deleteMany({ conversation: convo._id });

    // Reset conversation metadata
    convo.lastMessage = "";
    convo.lastMessageAt = new Date();
    convo.unread = new Map();
    await convo.save();

    res.json({ ok: true });

    // ── Notify the other participant in real-time ────────────────────────────
    try {
      const { getIo } = await import("../utils/socketEmitter.js");
      const otherId = convo.participants.map(p => p.toString()).find(id => id !== req.user.id);
      if (otherId) {
        getIo()?.to(otherId).emit("conversation_cleared", { conversationId: convo._id.toString() });
      }
    } catch { /* non-fatal */ }
  } catch (err) {
    console.error("❌ clearConversation:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UNSEND MESSAGE ───────────────────────────────────────────────────────────

/**
 * DELETE /api/messages/:conversationId/:messageId  (protected, sender only)
 *
 * Permanently deletes a single message. Only the message's original sender
 * may unsend it. Before deletion, the message is appended to the conversation's
 * clearedSnapshot (up to a rolling window of 25 entries) for moderation purposes.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *  @param {string} messageId      - MongoDB ObjectId of the message to unsend
 *
 * Responds with: { ok: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const unsendMessage = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    if (!convo.participants.map(p => p.toString()).includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });

    const msg = await Message.findById(messageId).populate("sender", "username");
    if (!msg) return res.status(404).json({ message: "Message not found" });

    // Only the original sender can unsend a message
    if (msg.sender._id.toString() !== req.user.id)
      return res.status(403).json({ message: "Cannot unsend someone else's message" });

    // ── Append to snapshot before deleting ──────────────────────────────────
    const snap = {
      sender: msg.sender._id,
      senderUsername: msg.sender.username,
      body: msg.body,
      sentAt: msg.createdAt,
    };
    // Keep a rolling window of the last 25 entries
    convo.clearedSnapshot = [...(convo.clearedSnapshot || []), snap].slice(-25);
    await convo.save();

    await msg.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ unsendMessage:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET CLEARED SNAPSHOT ─────────────────────────────────────────────────────

/**
 * GET /api/messages/:conversationId/snapshot  (protected)
 *
 * Returns the stored snapshot of messages that existed before the last
 * clearConversation or unsendMessage call. Used by moderators or support
 * to review what was said in a conversation even after messages are deleted.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *
 * Responds with an array of snapshot entries:
 *  [{ sender, senderUsername, body, sentAt }]
 *  Returns an empty array if no snapshot exists.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getClearedSnapshot = async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.conversationId).lean();
    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    if (!convo.participants.map(p => p.toString()).includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });
    res.json(convo.clearedSnapshot || []);
  } catch (err) {
    console.error("❌ getClearedSnapshot:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── REPORT DM ────────────────────────────────────────────────────────────────

/**
 * POST /api/messages/:conversationId/report  (protected)
 *
 * Submits a moderation report for a DM conversation. The reporter provides
 * a reason and selects up to 25 message snapshots as evidence. The reported
 * user is determined by identifying the other participant in the conversation.
 *
 * Route params:
 *  @param {string} conversationId - MongoDB ObjectId of the conversation
 *
 * Body params:
 *  @param {string}   reason   - Description of the violation (required)
 *  @param {Object[]} messages - Array of message snapshot objects (1–25 items)
 *
 * Responds with: { message: "Report submitted. Thank you." }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const reportDm = async (req, res) => {
  try {
    const { reason, messages: msgSnapshots } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: "A reason is required." });
    if (!Array.isArray(msgSnapshots) || msgSnapshots.length === 0)
      return res.status(400).json({ message: "Select at least one message." });
    if (msgSnapshots.length > 25)
      return res.status(400).json({ message: "You can select up to 25 messages." });

    const convo = await Conversation.findById(req.params.conversationId).lean();
    if (!convo) return res.status(404).json({ message: "Conversation not found" });
    if (!convo.participants.map(p => p.toString()).includes(req.user.id))
      return res.status(403).json({ message: "Not a participant" });

    // Identify the other participant as the reported user
    const reportedUserId = convo.participants.find(p => p.toString() !== req.user.id);

    await DmReport.create({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      conversationId: convo._id,
      reason: reason.trim(),
      messages: msgSnapshots.slice(0, 25), // enforce the 25-message cap at DB level too
    });

    res.json({ message: "Report submitted. Thank you." });
  } catch (err) {
    console.error("❌ reportDm:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET UNREAD COUNT ─────────────────────────────────────────────────────────

/**
 * GET /api/messages/unread-count  (protected)
 *
 * Returns the total number of unread DMs across all of the authenticated
 * user's conversations. Used to display the notification badge in the nav.
 *
 * Responds with: { count: number }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getUnreadCount = async (req, res) => {
  try {
    const convos = await Conversation.find({ participants: req.user.id }).lean();

    // Sum the unread counts for this user across all conversations
    // The unread field can be stored as either a Map or a plain object depending
    // on how Mongoose serialised it, so both cases are handled
    const total = convos.reduce((sum, c) => {
      const val = c.unread instanceof Map
        ? (c.unread.get(req.user.id) || 0)
        : (c.unread?.[req.user.id] || 0);
      return sum + val;
    }, 0);

    res.json({ count: total });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
