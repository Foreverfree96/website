// =============================================================================
// backend/routes/messageRoutes.js
//
// Express router for all direct-message (DM) API endpoints.
// Mounted at /api/messages in the main server file.
//
// Every route in this file requires authentication — `router.use(protect)` is
// applied at the top so each individual route definition does not need to
// repeat the middleware.
//
// Route overview:
//
//   GET    /unread-count               — total unread DM count across all conversations
//   GET    /                           — list all conversations for the current user
//   POST   /                           — get or create a conversation with another user
//   GET    /:conversationId            — fetch paginated messages in a conversation
//   POST   /:conversationId            — send a new message in a conversation
//   PUT    /:conversationId/read       — mark all messages in a conversation as read
//   GET    /:conversationId/snapshot   — retrieve the cleared-history snapshot (for reports)
//   POST   /:conversationId/report     — file a DM abuse report against the other participant
//   DELETE /:conversationId/clear      — clear conversation history (saves a snapshot first)
//   DELETE /:conversationId/:messageId — unsend (delete) a single message
// =============================================================================

import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getConversations,        // GET  /                         — inbox list
  getOrCreateConversation, // POST /                         — open/start a DM thread
  getMessages,             // GET  /:conversationId          — message history
  sendMessage,             // POST /:conversationId          — send a message
  markConversationRead,    // PUT  /:conversationId/read     — clear unread flag
  getUnreadCount,          // GET  /unread-count             — badge count
  unsendMessage,           // DELETE /:conversationId/:messageId — remove one message
  clearConversation,       // DELETE /:conversationId/clear  — wipe history
  reportDm,                // POST /:conversationId/report   — report abuse
  getClearedSnapshot,      // GET  /:conversationId/snapshot — view saved snapshot
} from "../controllers/messageController.js";

const router = express.Router();

// =============================================================================
// Global auth guard
// =============================================================================

/**
 * Apply the `protect` middleware to every route in this router.
 * All DM endpoints require a valid JWT — there is no public DM access.
 */
router.use(protect);

// =============================================================================
// Conversation-level routes
// =============================================================================

/**
 * GET /unread-count
 * Returns the total number of unread messages across all of the user's
 * conversations. Used to populate the unread badge in the navigation bar.
 *
 * Declared before GET / to avoid ambiguity.
 */
router.get("/unread-count", getUnreadCount);

/**
 * GET /
 * Returns all conversations (inbox) for the authenticated user, sorted by
 * most-recent message first, with the latest message preview included.
 */
router.get("/", getConversations);

/**
 * POST /
 * Find an existing conversation between the current user and a target user,
 * or create a new one if none exists.  Returns the conversation document
 * either way — callers can use the returned _id for subsequent requests.
 */
router.post("/", getOrCreateConversation);

// =============================================================================
// Message-level routes (scoped to a specific conversation)
// =============================================================================

/**
 * GET /:conversationId
 * Fetch paginated messages for a conversation.
 * The requesting user must be a participant.
 */
router.get("/:conversationId", getMessages);

/**
 * POST /:conversationId
 * Send a new message in the specified conversation.
 * Updates the conversation's lastMessage preview and unread counters,
 * and emits a real-time Socket.io event to the recipient.
 */
router.post("/:conversationId", sendMessage);

/**
 * PUT /:conversationId/read
 * Mark all messages in a conversation as read for the current user.
 * Resets that user's unread counter on the Conversation document.
 */
router.put("/:conversationId/read", markConversationRead);

/**
 * GET /:conversationId/snapshot
 * Retrieve the clearedSnapshot stored on the Conversation document.
 * Used to surface evidence in the admin DM report review panel after the
 * live chat history has been wiped.
 */
router.get("/:conversationId/snapshot", getClearedSnapshot);

/**
 * POST /:conversationId/report
 * File a DM abuse report against the other participant in the conversation.
 * Saves a message snapshot into the DmReport document for admin review.
 */
router.post("/:conversationId/report", reportDm);

/**
 * DELETE /:conversationId/clear
 * Wipe all messages in a conversation for the current user.
 * Saves the last 20 messages as a clearedSnapshot on the Conversation document
 * before deletion so a future report can still reference them.
 */
router.delete("/:conversationId/clear", clearConversation);

/**
 * DELETE /:conversationId/:messageId
 * "Unsend" (permanently delete) a single message.
 * Only the message's sender can unsend it.
 */
router.delete("/:conversationId/:messageId", unsendMessage);

export default router;
