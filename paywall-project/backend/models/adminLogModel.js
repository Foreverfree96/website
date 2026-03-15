import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema(
  {
    /** Admin who performed the action */
    admin:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminUsername:{ type: String, required: true },
    /** Short action label */
    action:       { type: String, required: true },
    /** Target user info */
    targetId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetUsername: { type: String, default: "" },
    /** Extra detail (e.g. duration, reason) */
    detail:       { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("AdminLog", adminLogSchema);
