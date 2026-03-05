import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Resend } from "resend";

// Generate JWT
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Validators
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isStrongPassword = (pw) => pw.length >= 8;
const isValidUsername = (u) => u.length >= 2 && u.length <= 30 && /^[a-zA-Z0-9_]+$/.test(u);

let resend;
const getResend = () => {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
};

// ─── REGISTER ───────────────────────────────────────────────────────
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields are required" });
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string")
      return res.status(400).json({ message: "Invalid input" });
    if (!isValidUsername(username.trim()))
      return res.status(400).json({ message: "Username must be 2–30 characters (letters, numbers, underscores)" });
    if (!isValidEmail(email.trim()))
      return res.status(400).json({ message: "Invalid email address" });
    if (!isStrongPassword(password))
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    const emailTaken = await User.findOne({ email: email.trim().toLowerCase() });
    if (emailTaken) return res.status(400).json({ message: "Email already in use" });

    const usernameTaken = await User.findOne({ username: username.trim() });
    if (usernameTaken) return res.status(400).json({ message: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    });

    res.status(201).json({
      id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber || false,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("❌ Signup Error:", err);
    res.status(500).json({ message: "Server error", debug: err.message });
  }
};

// ─── LOGIN ───────────────────────────────────────────────────────────
export const loginUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const identifier = (email || username || "").trim();
    if (!identifier || !password)
      return res.status(400).json({ message: "Credentials required" });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) return res.status(401).json({ message: "Invalid credentials" });

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber || false,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ message: "Server error", debug: err.message });
  }
};

// ─── GET PROFILE ─────────────────────────────────────────────────────
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -resetToken -resetTokenExpiry");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user._id, username: user.username, email: user.email, isSubscriber: user.isSubscriber || false });
  } catch (err) {
    console.error("❌ Get Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPGRADE SUBSCRIBER ───────────────────────────────────────────────
export const upgradeToSubscriber = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isSubscriber = true;
    await user.save();
    res.json({ message: "Subscription upgraded", isSubscriber: true });
  } catch (err) {
    console.error("❌ Upgrade Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE ACCOUNT ───────────────────────────────────────────────────
export const deleteUserAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Account Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET DONATIONS TOTAL ──────────────────────────────────────────────
export const getDonationsTotal = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("donationsTotal");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ donationsTotal: user.donationsTotal || 0 });
  } catch (err) {
    console.error("❌ Get Donations Total Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPDATE USERNAME ──────────────────────────────────────────────────
export const updateUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== "string")
      return res.status(400).json({ message: "Username is required" });
    if (!isValidUsername(username.trim()))
      return res.status(400).json({ message: "Username must be 2–30 characters (letters, numbers, underscores)" });

    const taken = await User.findOne({ username: username.trim(), _id: { $ne: req.user.id } });
    if (taken) return res.status(400).json({ message: "Username already taken" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.username = username.trim();
    await user.save();
    res.json({ message: "Username updated successfully", username: user.username });
  } catch (err) {
    console.error("❌ Update Username Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHANGE PASSWORD (logged in) ──────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "All fields are required" });
    if (!isStrongPassword(newPassword))
      return res.status(400).json({ message: "New password must be at least 8 characters" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("❌ Change Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    // Always return success to avoid email enumeration
    if (!user) return res.json({ message: "If that email is registered, a reset link has been sent." });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetToken = hashed;
    user.resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${rawToken}`;

    try {
      await getResend().emails.send({
        from: "Austin's Site <onboarding@resend.dev>",
        to: user.email,
        subject: "Password Reset Request",
        html: `
          <h2>Password Reset</h2>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#003087;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
          <p>This link expires in <strong>1 hour</strong>.</p>
          <p>If you didn't request this, ignore this email.</p>
        `,
      });
    } catch (emailErr) {
      console.error("❌ Email send failed:", emailErr.message);
      console.log("🔗 Reset URL (dev fallback):", resetUrl);
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    console.error("❌ Forgot Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ message: "New password is required" });
    if (!isStrongPassword(newPassword))
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetToken: hashed,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired reset link" });

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("❌ Reset Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHECK USERNAME AVAILABILITY ─────────────────────────────────────
export const checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || !isValidUsername(username.trim()))
      return res.json({ available: false, message: "Invalid username format" });
    const exists = await User.findOne({ username: username.trim() });
    res.json({ available: !exists, message: exists ? "Username already taken" : "Username available" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHECK EMAIL AVAILABILITY ─────────────────────────────────────────
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !isValidEmail(email.trim()))
      return res.json({ available: false, message: "Invalid email format" });
    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    res.json({ available: !exists, message: exists ? "Email already registered" : "Email available" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
