// =============================================================================
// backend/models/userModel.js
//
// Mongoose schema and model for the User collection.
//
// A User represents any registered account on the platform. Users can be:
//   - Regular users (default)
//   - Subscribers (isSubscriber: true) — have paid for premium content access
//   - Admins (isAdmin: true) — can moderate content and manage the platform
//
// Key relationships:
//   - followers / following  → self-referential many-to-many via ObjectId arrays
//   - blockedUsers           → users this account has blocked
//
// Authentication tokens (email verification, password reset, email change) are
// stored as hashed strings directly on the document alongside expiry timestamps.
// =============================================================================

import mongoose from "mongoose";

// -----------------------------------------------------------------------------
// Schema Definition
// -----------------------------------------------------------------------------

/**
 * userSchema — defines the shape and validation rules for every user document.
 *
 * `timestamps: true` automatically adds `createdAt` and `updatedAt` fields
 * that Mongoose keeps in sync on every save.
 */
const userSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Identity fields
    // ------------------------------------------------------------------

    /** Display name chosen by the user. Must be unique across the platform. */
    username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 30 },

    /** Login email. Stored lowercase so lookups are case-insensitive. */
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },

    /** Bcrypt-hashed password — never stored or returned in plaintext. */
    password: { type: String, required: true },

    // ------------------------------------------------------------------
    // Role / status flags
    // ------------------------------------------------------------------

    /** Whether the user has an active paid subscription (unlocks paywalled content). */
    isSubscriber: { type: Boolean, default: false },

    /** Whether the user has admin privileges (can moderate posts, manage users). */
    isAdmin: { type: Boolean, default: false },

    /** Cumulative dollar amount this user has donated to creators. */
    donationsTotal: { type: Number, default: 0, min: 0 },

    /** Whether the user has confirmed their email address after registration. */
    isVerified: { type: Boolean, default: false },

    // ------------------------------------------------------------------
    // Email verification tokens
    // Used during the initial sign-up flow to confirm the user's email.
    // ------------------------------------------------------------------

    /** One-time token emailed to the user to confirm their address on sign-up. */
    emailVerifyToken: { type: String },

    /** Expiry timestamp for emailVerifyToken — token is invalid after this date. */
    emailVerifyTokenExpiry: { type: Date },

    // ------------------------------------------------------------------
    // Password reset tokens
    // Used by the "forgot password" flow.
    // ------------------------------------------------------------------

    /**
     * Hashed reset token emailed when the user requests a password reset.
     * sparse index so MongoDB ignores null/undefined values and only indexes
     * documents that actually have a token set.
     */
    resetToken: { type: String, index: { sparse: true } },

    /** Expiry timestamp for resetToken. */
    resetTokenExpiry: { type: Date },

    // ------------------------------------------------------------------
    // Email change tokens
    // Used when an authenticated user wants to update their email address.
    // ------------------------------------------------------------------

    /**
     * New email address the user wants to switch to.
     * Stored here temporarily until the change is confirmed via token.
     */
    pendingEmail: { type: String },

    /**
     * Token emailed to the new address to confirm the email change.
     * Sparse indexed for the same reason as resetToken.
     */
    emailChangeToken: { type: String, index: { sparse: true } },

    /** Expiry timestamp for emailChangeToken. */
    emailChangeTokenExpiry: { type: Date },

    // ------------------------------------------------------------------
    // Creator / profile fields
    // ------------------------------------------------------------------

    /** Short bio shown on the creator's public profile page. */
    bio: { type: String, maxlength: 300, default: "" },

    /**
     * Content categories the creator produces.
     * Used to filter and discover creators by type.
     */
    categories: [{ type: String, enum: ["Music", "Videos", "Streamer", "Pictures", "Blogger / Writer"] }],

    /**
     * External social media profile URLs.
     * All default to empty string so the object is always present and safe
     * to read without null-checks on the frontend.
     */
    socialLinks: {
      youtube:    { type: String, default: "" },
      instagram:  { type: String, default: "" },
      twitch:     { type: String, default: "" },
      tiktok:     { type: String, default: "" },
      soundcloud: { type: String, default: "" },
      facebook:   { type: String, default: "" },
    },

    // ------------------------------------------------------------------
    // Social graph — followers / following
    // ------------------------------------------------------------------

    /** Array of User ObjectIds who follow this account. */
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    /** Array of User ObjectIds this account follows. */
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ------------------------------------------------------------------
    // Privacy / moderation
    // ------------------------------------------------------------------

    /**
     * When true the account's posts are only visible to followers.
     * Non-followers see the profile but not the content.
     */
    isPrivateAccount: { type: Boolean, default: false },

    /**
     * Users this account has blocked.
     * Blocked users cannot send DMs or interact with this account's content.
     */
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ------------------------------------------------------------------
    // Moderation restrictions
    // ------------------------------------------------------------------

    /**
     * When set to a future date the account is temporarily restricted —
     * the user cannot post, comment, or send DMs until this date passes.
     * Null / past date means no active restriction.
     */
    restrictedUntil: { type: Date, default: null },

    /**
     * When true the account is permanently banned.
     * Banned users cannot log in or interact with the platform.
     */
    isBanned: { type: Boolean, default: false },
  },
  // Automatically manage createdAt and updatedAt timestamps on every document.
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Model export
// -----------------------------------------------------------------------------

/**
 * Reuse the compiled model if it already exists (important in hot-reload
 * environments like Nodemon where modules can be re-evaluated), otherwise
 * compile and register a new model against the "users" collection.
 */
const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
