// =============================================================================
// backend/models/postModel.js
//
// Mongoose schemas and model for the Post collection.
//
// A Post is the primary content unit on the platform. Posts support:
//   - Text body and an optional title
//   - An optional uploaded image (imageUrl)
//   - An optional embedded external media link (mediaUrl + embedType)
//   - Content categories that match creator profile categories
//   - Private visibility (subscribers/donors only)
//   - Likes (array of user refs)
//   - Threaded comments (embedded sub-documents)
//   - Per-post and per-comment reporting with moderation status
//
// Sub-schemas defined here:
//   reportEntrySchema — a single report filed against a post or comment
//   commentSchema     — an individual comment embedded inside a Post document
// =============================================================================

import mongoose from "mongoose";

// -----------------------------------------------------------------------------
// Sub-schema: reportEntrySchema
// -----------------------------------------------------------------------------

/**
 * reportEntrySchema — records a single user report filed against a post or
 * comment.
 *
 * `_id: false` prevents Mongoose from generating a separate _id for each
 * report sub-document, keeping the embedded array lean.
 *
 * Each entry captures who reported the content, an optional reason string,
 * and when the report was submitted.
 */
const reportEntrySchema = new mongoose.Schema({
  /** The user who filed this report. */
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  /** Optional free-text reason provided by the reporter. */
  reason: { type: String, maxlength: 500, trim: true, default: "" },

  /** Timestamp of when the report was submitted. */
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

// -----------------------------------------------------------------------------
// Sub-schema: commentSchema
// -----------------------------------------------------------------------------

/**
 * commentSchema — represents a single comment embedded within a Post document.
 *
 * Comments are stored as an embedded array rather than a separate collection
 * so that a single query fetches a post along with all its comments.
 *
 * `timestamps: true` adds createdAt / updatedAt to each comment sub-document
 * so the frontend can display "posted X ago" without a separate lookup.
 */
const commentSchema = new mongoose.Schema(
  {
    /** The user who wrote this comment. */
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    /** The text content of the comment. */
    body: { type: String, required: true, maxlength: 1000, trim: true },

    /**
     * Legacy flat list of user IDs who have reported this comment.
     * Kept for backwards compatibility; new reports also write to `reports`.
     */
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    /**
     * Structured report entries for this comment, each containing a reason
     * and timestamp in addition to the reporter's user ID.
     */
    reports: [reportEntrySchema],
  },
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Main schema: postSchema
// -----------------------------------------------------------------------------

/**
 * postSchema — defines the shape of every Post document in the database.
 *
 * `timestamps: true` automatically adds createdAt and updatedAt.
 */
const postSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Core content fields
    // ------------------------------------------------------------------

    /** The creator who published this post. */
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    /** Optional headline / title for the post. */
    title: { type: String, maxlength: 150, trim: true, default: "" },

    /** Main text body of the post. */
    body: { type: String, maxlength: 5000, trim: true, default: "" },

    // ------------------------------------------------------------------
    // Media / embed fields
    // ------------------------------------------------------------------

    /**
     * URL of an external media embed (YouTube link, SoundCloud track, etc.).
     * Used together with embedType so the frontend knows how to render it.
     */
    mediaUrl: { type: String, default: "" },

    /**
     * Identifies the platform/type of the mediaUrl embed so the frontend
     * can render the correct embed component (e.g. YouTube iframe vs
     * SoundCloud widget).  Empty string means no embed.
     */
    embedType: {
      type: String,
      enum: ["youtube", "twitch", "instagram", "soundcloud", "spotify", "applemusic", "facebook", "twitter", "tiktok", "yt-channel", "twitch-channel", "kick-channel", "other", ""],
      default: "",
    },

    /**
     * Content category for this post — should match one of the creator's
     * declared categories so posts are discoverable by category.
     */
    category: {
      type: String,
      enum: ["Music", "Videos", "Streamer", "Pictures", "Blogger / Writer", ""],
      default: "",
    },

    /** URL of an image uploaded directly to the post (e.g. via cloud storage). */
    imageUrl: { type: String, default: "" },

    // ------------------------------------------------------------------
    // Visibility / moderation
    // ------------------------------------------------------------------

    /**
     * When true the post is paywalled — only subscribers or users who have
     * donated enough can view the full content.
     */
    isPrivate: { type: Boolean, default: false },

    /**
     * Moderation state managed by admins:
     *   "approved" — visible to all (default)
     *   "flagged"  — hidden from public; under admin review
     *   "pending"  — queued for review before going live
     */
    moderationStatus: { type: String, enum: ["approved", "flagged", "pending"], default: "approved" },

    // ------------------------------------------------------------------
    // Reporting
    // ------------------------------------------------------------------

    /**
     * Legacy flat list of user IDs who have reported this post.
     * Kept for backwards compatibility alongside the richer `reports` array.
     */
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    /**
     * Structured report entries for this post, including per-report reasons
     * and timestamps.
     */
    reports: [reportEntrySchema],

    // ------------------------------------------------------------------
    // Social interactions
    // ------------------------------------------------------------------

    /** Array of user IDs who have liked this post. Each user can like once. */
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    /** Embedded array of comments left on this post. */
    comments: [commentSchema],
  },
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Model export
// -----------------------------------------------------------------------------

/**
 * Reuse the already-compiled model when the module is re-evaluated (e.g.
 * during hot-reload), otherwise register a fresh model against the "posts"
 * collection.
 */
const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
