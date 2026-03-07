import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 30 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    isSubscriber: { type: Boolean, default: false },
    donationsTotal: { type: Number, default: 0, min: 0 },
    isVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String },
    emailVerifyTokenExpiry: { type: Date },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
    pendingEmail: { type: String },
    emailChangeToken: { type: String },
    emailChangeTokenExpiry: { type: Date },
    bio: { type: String, maxlength: 300, default: "" },
    categories: [{ type: String, enum: ["Music", "Videos", "Streamer", "Pictures", "Blogger / Writer"] }],
    socialLinks: {
      youtube: { type: String, default: "" },
      instagram: { type: String, default: "" },
      twitch: { type: String, default: "" },
      tiktok: { type: String, default: "" },
      soundcloud: { type: String, default: "" },
      facebook: { type: String, default: "" },
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
