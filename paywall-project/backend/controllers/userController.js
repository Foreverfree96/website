// controllers/userController.js
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// 🧩 Helper: Generate JWT Token (no expiry, only invalidated on logout)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET);
};

// 🟢 REGISTER (Signup)
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check for existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("❌ Signup Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 🔵 LOGIN
export const loginUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Allow login with username OR email
    const user = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 🟣 GET USER PROFILE
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("❌ Get Profile Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 💎 UPGRADE TO SUBSCRIBER
export const upgradeToSubscriber = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" });

    user.isSubscriber = true;
    await user.save();

    res.json({ message: "Subscription upgraded", isSubscriber: true });
  } catch (err) {
    console.error("❌ Upgrade Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 🗑️ DELETE ACCOUNT
export const deleteUserAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Account Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✏️ UPDATE USERNAME
export const updateUsername = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim() === "") {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.username = username.trim();
    await user.save();

    res.json({ message: "Username updated successfully", username: user.username });
  } catch (err) {
    console.error("❌ Update Username Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
