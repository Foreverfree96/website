import mongoose from "mongoose";

const bannedEmailSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

const BannedEmail = mongoose.models.BannedEmail || mongoose.model("BannedEmail", bannedEmailSchema);
export default BannedEmail;
