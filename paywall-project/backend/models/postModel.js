import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, maxlength: 1000, trim: true },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, maxlength: 150, trim: true, default: "" },
    body: { type: String, maxlength: 5000, trim: true, default: "" },
    mediaUrl: { type: String, default: "" },
    embedType: {
      type: String,
      enum: ["youtube", "twitch", "instagram", "soundcloud", "spotify", "applemusic", "facebook", "twitter", "tiktok", "other", ""],
      default: "",
    },
    category: {
      type: String,
      enum: ["Music", "Videos", "Streamer", "Pictures", "Blogger / Writer", ""],
      default: "",
    },
    imageUrl: { type: String, default: "" },
    isPrivate: { type: Boolean, default: false },
    moderationStatus: { type: String, enum: ["approved", "flagged", "pending"], default: "approved" },
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
  },
  { timestamps: true }
);

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
