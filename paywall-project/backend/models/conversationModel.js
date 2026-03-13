// =============================================================================
// backend/models/conversationModel.js
//
// Mongoose schema and model for the Conversation collection.
//
// A Conversation is a direct-message (DM) thread between exactly two users.
// Individual messages are stored in the separate Message collection; this
// document acts as the thread header, tracking:
//   - Which two users are in the conversation (participants)
//   - A preview of the most recent message (lastMessage / lastMessageAt)
//   - Per-user unread message counts (unread Map)
//   - A safety snapshot of the last 20 messages saved when a user clears
//     the conversation, so admins can still review it if a report is filed.
//
// Indexes:
//   participants   — fast lookup of all conversations a given user is part of
//   lastMessageAt  — descending sort so the inbox shows newest threads first
// =============================================================================

import mongoose from "mongoose";

// -----------------------------------------------------------------------------
// Schema Definition
// -----------------------------------------------------------------------------

/**
 * conversationSchema — defines the shape of a DM thread document.
 *
 * `timestamps: true` adds createdAt / updatedAt managed by Mongoose.
 */
const conversationSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Participants
    // ------------------------------------------------------------------

    /**
     * The two users who share this conversation thread.
     * Stored as an array of ObjectIds so a single index covers both
     * directions of the relationship.
     */
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],

    // ------------------------------------------------------------------
    // Message preview — cached on the conversation document so the
    // inbox list can be rendered without fetching every message.
    // ------------------------------------------------------------------

    /** Text preview of the most recently sent message in this thread. */
    lastMessage: { type: String, default: "" },

    /** Timestamp of the most recently sent message — used for inbox sorting. */
    lastMessageAt: { type: Date, default: Date.now },

    // ------------------------------------------------------------------
    // Unread counts
    // ------------------------------------------------------------------

    /**
     * Per-user unread message count, keyed by the userId string.
     * A Map is used instead of a plain object so Mongoose handles
     * serialisation correctly and the entries are easy to get/set:
     *
     *   conversation.unread.get(userId.toString())   // read
     *   conversation.unread.set(userId.toString(), 0) // reset after read
     *
     * The `of: Number` option constrains all Map values to numbers.
     */
    unread: { type: Map, of: Number, default: {} },

    // ------------------------------------------------------------------
    // Cleared snapshot — safety net for abuse reporting
    // ------------------------------------------------------------------

    /**
     * Snapshot of up to the last 20 messages captured just before a user
     * clears the conversation history.  Stored here so that if either
     * participant later files a report, admins still have evidence to
     * review even though the live messages are gone.
     *
     * senderUsername is denormalised (copied from User) at snapshot time
     * so the record remains readable even if the sender's account is later
     * deleted or renamed.
     */
    clearedSnapshot: [
      {
        /** ObjectId of the user who sent the snapshotted message. */
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        /** Username at the time of the snapshot (denormalised for permanence). */
        senderUsername: { type: String },

        /** Text content of the snapshotted message. */
        body: { type: String },

        /** Timestamp when the original message was sent. */
        sentAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Indexes
// -----------------------------------------------------------------------------

/**
 * Index on participants so MongoDB can quickly find all conversations that
 * include a specific user without a full collection scan.
 */
conversationSchema.index({ participants: 1 });

/**
 * Descending index on lastMessageAt so inbox queries that ORDER BY most-recent
 * first are served from the index rather than requiring an in-memory sort.
 */
conversationSchema.index({ lastMessageAt: -1 });

// -----------------------------------------------------------------------------
// Model export
// -----------------------------------------------------------------------------

/**
 * Reuse the compiled model if already registered (guards against hot-reload
 * double-registration), otherwise compile and export a new model.
 */
const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
export default Conversation;
