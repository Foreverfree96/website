// backend/models/userModel.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    isSubscriber: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Prevent OverwriteModelError with nodemon hot reload
const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
