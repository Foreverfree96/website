import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema(
  {
    /** User who performed the action (admin or regular user) */
    admin:         { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    adminUsername: { type: String, default: "" },
    /** Short action label */
    action:        { type: String, required: true },
    /** Target user info */
    targetId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetUsername:{ type: String, default: "" },
    /** Extra detail (e.g. duration, reason) */
    detail:        { type: String, default: "" },
    /** Source linking — used to make log entries clickable */
    sourceType:    { type: String, default: "" }, // 'post' | 'user' | 'comment' | 'dm' | 'report' | ''
    sourceId:      { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceUrl:     { type: String, default: "" }, // e.g. /post/:id or /creator/:username
  },
  { timestamps: true }
);

adminLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("AdminLog", adminLogSchema);
