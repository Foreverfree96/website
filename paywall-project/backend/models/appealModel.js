import mongoose from "mongoose";

const appealSchema = new mongoose.Schema(
  {
    /** The identifier the user typed (username or email) */
    identifier: { type: String, required: true, trim: true },
    /** Resolved user reference — populated after lookup */
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    username: { type: String, default: "" },
    email:    { type: String, default: "" },
    /** "ban" or "restriction" */
    type: { type: String, enum: ["ban", "restriction"], required: true },
    /** The user's appeal message */
    appealText: { type: String, required: true, maxlength: 1000 },
    /** Admin review status */
    status: { type: String, enum: ["pending", "approved", "dismissed"], default: "pending" },
  },
  { timestamps: true }
);

export default mongoose.model("Appeal", appealSchema);
