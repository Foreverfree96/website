// =============================================================================
// backend/models/messageModel.js
//
// Mongoose schema and model for the Message collection.
//
// A Message is a single chat bubble within a DM Conversation thread.
// Messages are stored in their own collection (rather than embedded in the
// Conversation document) so that:
//   - Large threads don't bloat the conversation document beyond MongoDB's
//     16 MB document size limit.
//   - Pagination is straightforward — fetch N messages by conversation ID
//     sorted by createdAt.
//   - Individual messages can be deleted ("unsend") without rewriting the
//     entire conversation document.
//
// Index:
//   { conversation, createdAt: -1 } — supports the primary query pattern:
//   "fetch the most recent messages for a given conversation", served
//   entirely from the index.
// =============================================================================

import mongoose from "mongoose";

// -----------------------------------------------------------------------------
// Schema Definition
// -----------------------------------------------------------------------------

/**
 * messageSchema — defines the shape of a single DM message document.
 *
 * `timestamps: true` adds createdAt / updatedAt. The createdAt field is
 * used to sort messages chronologically within a conversation.
 */
const messageSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Relationships
    // ------------------------------------------------------------------

    /**
     * The Conversation thread this message belongs to.
     * Required so every message can be fetched by conversation ID.
     */
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },

    /** The user who sent this message. */
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ------------------------------------------------------------------
    // Content
    // ------------------------------------------------------------------

    /** The text content of the message. Trimmed to remove accidental whitespace. */
    body: { type: String, required: true, trim: true, maxlength: 2000 },

    // ------------------------------------------------------------------
    // Read state
    // ------------------------------------------------------------------

    /**
     * Whether the recipient has read this message.
     * Flipped to true when the recipient opens the conversation thread,
     * which also resets the unread counter on the parent Conversation doc.
     */
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Indexes
// -----------------------------------------------------------------------------

/**
 * Compound index on conversation + createdAt (descending).
 *
 * This directly supports the most frequent query:
 *   Message.find({ conversation: id }).sort({ createdAt: -1 }).limit(N)
 *
 * MongoDB can satisfy this query entirely from the index without touching
 * the collection documents.
 */
messageSchema.index({ conversation: 1, createdAt: -1 });

// -----------------------------------------------------------------------------
// Model export
// -----------------------------------------------------------------------------

/**
 * Reuse the compiled model if it already exists (protects against
 * double-registration during hot-reload), otherwise compile a fresh model.
 */
const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
export default Message;
