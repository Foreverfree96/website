// =============================================================================
// backend/models/dmReportModel.js
//
// Mongoose schema and model for the DmReport collection.
//
// A DmReport is an abuse report filed by one user against another based on
// the content of a direct-message (DM) conversation.
//
// Key design decisions:
//   - The report embeds a snapshot of the selected messages at the time of
//     filing, so evidence is preserved even if the conversation is later
//     cleared or the reported user's account is deleted.
//   - senderUsername is denormalised into each snapshot entry so the message
//     history is human-readable in the admin panel without extra lookups.
//   - Status tracks the admin review workflow: pending → reviewed | dismissed.
//
// Admin routes (adminRoutes.js) expose GET /dm-reports and
// PUT /dm-reports/:reportId to list and update these documents.
// =============================================================================

import mongoose from "mongoose";

// -----------------------------------------------------------------------------
// Schema Definition
// -----------------------------------------------------------------------------

/**
 * dmReportSchema — defines the shape of a DM abuse report document.
 *
 * `timestamps: true` adds createdAt / updatedAt so admins can see when each
 * report was filed and when it was last touched.
 */
const dmReportSchema = new mongoose.Schema(
  {
    // ------------------------------------------------------------------
    // Parties involved
    // ------------------------------------------------------------------

    /** The user who filed this report. */
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    /** The user being reported for abusive behaviour. */
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    /** The conversation in which the alleged abuse took place. */
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },

    // ------------------------------------------------------------------
    // Report details
    // ------------------------------------------------------------------

    /** Free-text reason provided by the reporter explaining the abuse. */
    reason: { type: String, required: true, maxlength: 500, trim: true },

    // ------------------------------------------------------------------
    // Message snapshot
    // ------------------------------------------------------------------

    /**
     * A copy of the specific messages the reporter selected as evidence.
     * Preserved at the time of filing so the record is durable:
     *   - The reporter may clear the conversation after submitting.
     *   - The reported user's account may be suspended or deleted.
     *
     * senderUsername is copied from the User document at snapshot time
     * (denormalised) so it remains readable even if the username changes later.
     */
    messages: [
      {
        /** ObjectId of the user who sent this message. */
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        /** Username at the time the report was filed (denormalised). */
        senderUsername: { type: String },

        /** Text content of the message. */
        body: { type: String, maxlength: 2000 },

        /** Timestamp when the original message was sent. */
        sentAt: { type: Date },
      },
    ],

    // ------------------------------------------------------------------
    // Admin review workflow
    // ------------------------------------------------------------------

    /**
     * Current state of the report in the admin moderation queue:
     *
     *   "pending"   — newly filed, awaiting admin review (default)
     *   "reviewed"  — admin has investigated and taken action
     *   "dismissed" — admin determined no violation occurred
     */
    status: { type: String, enum: ["pending", "reviewed", "dismissed"], default: "pending" },
  },
  { timestamps: true }
);

// -----------------------------------------------------------------------------
// Model export
// -----------------------------------------------------------------------------

/**
 * Reuse the compiled model if already registered (hot-reload guard),
 * otherwise compile and register a new model against the "dmreports" collection.
 */
const DmReport = mongoose.models.DmReport || mongoose.model("DmReport", dmReportSchema);
export default DmReport;
