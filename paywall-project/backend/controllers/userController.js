/**
 * userController.js
 *
 * Handles all user-related HTTP request logic:
 *  - Registration with email verification
 *  - Login / logout
 *  - Password & email management (change, forgot, reset)
 *  - Username recovery
 *  - Public creator profile & follow system
 *  - Mutual-follower lookup (used by @mention autocomplete)
 *  - Account privacy, blocking, and profile customisation
 *  - Subscription upgrade and donation totals
 *  - Username/email availability checks
 *
 * All routes that modify data require the user to be authenticated via the
 * `protect` middleware (JWT), which attaches `req.user` before these handlers run.
 *
 * Emails are sent through the Brevo transactional API (fire-and-forget).
 */

import User from "../models/userModel.js";
import Post from "../models/postModel.js";
import Notification from "../models/notificationModel.js";
import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import BannedEmail from "../models/bannedEmailModel.js";
import Appeal from "../models/appealModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import axios from "axios";
import { siteLog } from "../utils/siteLog.js";


// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Escape special regex characters in user input to prevent ReDoS / regex injection. */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Generates a signed JWT for the given user ID.
 * Tokens expire after 7 days; the secret is read from JWT_SECRET env var.
 *
 * @param   {string} id - MongoDB ObjectId of the user
 * @returns {string}      Signed JWT string
 */
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ─── VALIDATORS ───────────────────────────────────────────────────────────────

/** Returns true if the string looks like a valid email address */
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Returns true if the password is at least 8 characters */
const isStrongPassword = (pw) => pw.length >= 8;

/**
 * Returns true if the username is between 2–30 characters and contains only
 * letters, numbers, and underscores (no spaces or special characters)
 */
const isValidUsername = (u) => u.length >= 2 && u.length <= 30 && /^[a-zA-Z0-9_]+$/.test(u);

// ─── EMAIL UTILITY ────────────────────────────────────────────────────────────

/**
 * Sends a transactional email via the Brevo (formerly Sendinblue) API.
 * This is fire-and-forget — errors are only logged, never thrown,
 * so a failed email never causes a request to fail.
 *
 * @param {Object} options
 * @param {string} options.to      - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html    - HTML body content
 */
const sendEmail = ({ to, subject, html }) => {
  axios.post("https://api.sendgrid.com/v3/mail/send", {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: process.env.GMAIL_USER, name: "Austin's Site" },
    subject,
    content: [{ type: "text/html", value: html }],
  }, {
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
  })
    .then(() => console.log("✅ Email sent to:", to))
    .catch(err => console.error("❌ Email send failed:", err.response?.data || err.message));
};

// ─── REGISTER ────────────────────────────────────────────────────────────────

/**
 * POST /api/users/register
 *
 * Creates a new user account in a pending (unverified) state and sends
 * a 24-hour email verification link. The user cannot log in until they
 * click the link.
 *
 * Validation order:
 *  1. All fields present and correct types
 *  2. Username format (2–30 chars, alphanumeric + underscore)
 *  3. Email format
 *  4. Password strength (min 8 chars)
 *  5. Email uniqueness
 *  6. Username uniqueness
 *
 * The raw (unhashed) verification token is sent in the URL; only the
 * SHA-256 hash is stored in the database so a DB leak cannot be used
 * to verify accounts.
 *
 * Responds 201 with a success message on success; the email is sent
 * asynchronously after the response.
 *
 * @param {import("express").Request}  req - Body: { username, email, password }
 * @param {import("express").Response} res
 */
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Presence check
    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields are required" });

    // Type guard to prevent prototype-pollution or object injection
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string")
      return res.status(400).json({ message: "Invalid input" });

    if (!isValidUsername(username.trim()))
      return res.status(400).json({ message: "Username must be 2–30 characters (letters, numbers, underscores)" });
    if (!isValidEmail(email.trim()))
      return res.status(400).json({ message: "Invalid email address" });
    if (!isStrongPassword(password))
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    // Uniqueness checks — done after format validation to avoid unnecessary DB calls
    const emailTaken = await User.findOne({ email: email.trim().toLowerCase() });
    if (emailTaken) return res.status(400).json({ message: "Email already in use" });

    // Check if this email has been banned by a moderator
    const emailBanned = await BannedEmail.findOne({ email: email.trim().toLowerCase() });
    if (emailBanned) return res.status(403).json({ message: "This email address is not allowed." });

    const usernameTaken = await User.findOne({ username: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') });
    if (usernameTaken) return res.status(400).json({ message: "Username already taken" });

    // Hash the password with bcrypt (cost factor 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a secure random token; store only its hash in the DB
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      isVerified: false,
      emailVerifyToken: hashedToken,
      emailVerifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${rawToken}`;

    // Respond immediately, then send email in the background
    res.status(201).json({ message: "Check your email to confirm your account before logging in." });

    siteLog({ userId: user._id, username: user.username, action: "User Signed Up", sourceType: "user", sourceUrl: `/creator/${user.username}` });

    sendEmail({
      to: user.email,
      subject: "Confirm your email",
      html: `<p>Hi ${user.username},</p>
             <p>Click the link below to verify your email and activate your account:</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
             <p>This link expires in 24 hours.</p>`,
    });
  } catch (err) {
    console.error("❌ Signup Error:", err);
    res.status(500).json({ message: "Server error", debug: err.message });
  }
};

// ─── RESEND VERIFICATION EMAIL ────────────────────────────────────────────────

/**
 * POST /api/users/resend-verification
 *
 * Issues a fresh 24-hour email verification link for an account that has not
 * yet been verified.
 *
 * Intentionally returns the same success message whether or not the email
 * exists / is already verified, to prevent email enumeration attacks.
 *
 * @param {import("express").Request}  req - Body: { email }
 * @param {import("express").Response} res
 */
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Return the same generic message for "not found" and "already verified"
    // to avoid leaking which emails are registered
    if (!user || user.isVerified)
      return res.json({ message: "If that email is registered and unverified, a new link has been sent." });

    // Rotate the token so old links are invalidated
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.emailVerifyToken = hashedToken;
    user.emailVerifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${rawToken}`;

    // Respond first, then send email
    res.json({ message: "If that email is registered and unverified, a new link has been sent." });
    siteLog({ userId: user._id, username: user.username, action: "Resent Verification Email", sourceType: "user" });

    sendEmail({
      to: user.email,
      subject: "Verify your email",
      html: `<p>Hi ${user.username},</p>
             <p>Click the link below to verify your email and activate your account:</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
             <p>This link expires in 24 hours.</p>`,
    });
  } catch (err) {
    console.error("❌ Resend Verification Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────

/**
 * GET /api/users/verify-email/:token
 *
 * Validates the email verification token from the link that was emailed
 * to the user at registration. Activates the account if the token is
 * valid and has not expired.
 *
 * Token flow:
 *  - Incoming raw token → SHA-256 hash → compared against stored hash
 *  - If match and not expired: mark account as verified, clear token fields
 *
 * Route params:
 *  @param {string} token - Raw (unhashed) token from the verification URL
 *
 * Responds 200 on success, 400 if the link is invalid or expired.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const verifyEmail = async (req, res) => {
  try {
    // Hash the incoming token to match what we stored
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({
      emailVerifyToken: hashedToken,
      emailVerifyTokenExpiry: { $gt: new Date() }, // ensure token hasn't expired
    });
    if (!user) return res.status(400).json({ message: "Verification link is invalid or has expired." });

    // Mark the account as active and remove the one-time token
    user.isVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Email verified! You can now log in." });
    siteLog({ userId: user._id, username: user.username, action: "Email Verified", sourceType: "user" });
  } catch (err) {
    console.error("❌ Verify Email Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

/**
 * POST /api/users/login
 *
 * Authenticates a user by email or username + password.
 * Returns a signed JWT plus key profile fields on success.
 *
 * Security notes:
 *  - Returns "Invalid credentials" for both "user not found" and "wrong password"
 *    to prevent user enumeration.
 *  - Blocks login for unverified accounts with a 403.
 *  - Auto-promotes the configured ADMIN_EMAIL to admin on first login.
 *
 * Body params:
 *  @param {string} [email]    - User's email (use email OR username)
 *  @param {string} [username] - User's username (use email OR username)
 *  @param {string} password   - User's plain-text password
 *
 * Responds with: { id, username, email, isSubscriber, isAdmin, token }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const loginUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Accept either email or username as the login identifier
    const identifier = (email || username || "").trim();
    if (!identifier || !password)
      return res.status(400).json({ message: "Credentials required" });

    // Try email lookup first, then fall back to username lookup
    const user =
      await User.findOne({ email: identifier.toLowerCase() }) ||
      await User.findOne({ username: new RegExp(`^${escapeRegex(identifier)}$`, 'i') });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Block unverified accounts from logging in
    if (user.isVerified === false)
      return res.status(403).json({ message: "Please verify your email before logging in." });

    // Block banned accounts with a clear message
    if (user.isBanned)
      return res.status(403).json({ type: "banned", message: "This account has been permanently banned. If you believe this is a mistake, you can submit an appeal below." });

    // Note: restricted users CAN log in — restrictions are enforced per-action
    // via the notRestricted middleware on write routes (post, comment, message).
    // We include restrictedUntil in the response so the frontend can display a banner.

    // Auto-grant admin privileges to the designated admin email if not already set
    if (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL && !user.isAdmin) {
      user.isAdmin = true;
      await user.save();
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber || false,
      isAdmin: user.isAdmin || false,
      restrictedUntil: user.restrictedUntil || null,
      token: generateToken(user._id),
    });
    siteLog({ userId: user._id, username: user.username, action: "User Logged In" });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ message: "Server error", debug: err.message });
  }
};

// ─── LOGOUT (logging only — JWT is stateless) ─────────────────────────────────

export const logoutUser = async (req, res) => {
  siteLog({ userId: req.user._id, username: req.user.username, action: "User Logged Out" });
  res.json({ message: "Logged out" });
};

// ─── GET PROFILE ──────────────────────────────────────────────────────────────

/**
 * GET /api/users/profile  (protected)
 *
 * Returns the authenticated user's own profile data.
 * Sensitive fields (password, reset tokens) are excluded from the query.
 *
 * Responds with: { id, username, email, isSubscriber, isAdmin,
 *                  isPrivateAccount, categories, bio, socialLinks }
 *
 * @param {import("express").Request}  req - req.user.id set by auth middleware
 * @param {import("express").Response} res
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -resetToken -resetTokenExpiry");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user._id, username: user.username, email: user.email, isSubscriber: user.isSubscriber || false, isAdmin: user.isAdmin || false, isPrivateAccount: user.isPrivateAccount || false, categories: user.categories || [], bio: user.bio || "", socialLinks: user.socialLinks || {} });
  } catch (err) {
    console.error("❌ Get Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPGRADE SUBSCRIBER ───────────────────────────────────────────────────────

/**
 * POST /api/users/upgrade  (protected)
 *
 * Upgrades the authenticated user to subscriber status.
 * Called after a successful PayPal payment capture.
 *
 * Responds with: { message, isSubscriber: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const upgradeToSubscriber = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: "PayPal order ID is required" });

    // Verify the order was actually captured with PayPal before granting access
    const ppRes = await axios.get(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET).toString("base64"),
        },
      }
    );
    if (ppRes.data.status !== "COMPLETED")
      return res.status(400).json({ message: "Payment has not been completed" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isSubscriber = true;
    await user.save();
    res.json({ message: "Subscription upgraded", isSubscriber: true });
    siteLog({ userId: req.user._id, username: user.username, action: "Upgraded to Subscriber", sourceType: "user", sourceUrl: `/creator/${user.username}` });
  } catch (err) {
    console.error("❌ Upgrade Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE ACCOUNT ───────────────────────────────────────────────────────────

/**
 * DELETE /api/users/delete  (protected)
 *
 * Permanently deletes the authenticated user's account.
 * Note: posts and notifications are NOT cascade-deleted here;
 * that is handled in the admin controller's adminDeleteUser.
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const deleteUserAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Cascade deletions — remove all user-owned content and references
    await Post.deleteMany({ author: userId });
    await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });
    await Message.deleteMany({ sender: userId });
    await Conversation.deleteMany({ participants: { $size: 1, $all: [userId] } });
    await Conversation.updateMany({ participants: userId }, { $pull: { participants: userId } });
    await User.updateMany(
      { $or: [{ followers: userId }, { following: userId }] },
      { $pull: { followers: userId, following: userId } }
    );
    const deletedUsername = user.username;
    await user.deleteOne();

    res.json({ message: "Account deleted successfully" });
    siteLog({ userId, username: deletedUsername, action: "Account Deleted (self)", sourceType: "user" });
  } catch (err) {
    console.error("❌ Delete Account Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET DONATIONS TOTAL ──────────────────────────────────────────────────────

/**
 * GET /api/users/donations  (protected)
 *
 * Returns the cumulative donation total recorded against the authenticated user.
 * This is incremented by server.js whenever a PayPal capture succeeds.
 *
 * Responds with: { donationsTotal: number }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getDonationsTotal = async (req, res) => {
  try {
    // Only select the donationsTotal field to minimise data exposure
    const user = await User.findById(req.user.id).select("donationsTotal");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ donationsTotal: user.donationsTotal || 0 });
  } catch (err) {
    console.error("❌ Get Donations Total Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPDATE USERNAME ──────────────────────────────────────────────────────────

/**
 * PUT /api/users/username  (protected)
 *
 * Updates the authenticated user's username after validating format
 * and uniqueness (excluding the current user from the uniqueness check).
 *
 * Body params:
 *  @param {string} username - Desired new username
 *
 * Responds with: { message, username }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const updateUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== "string")
      return res.status(400).json({ message: "Username is required" });
    if (!isValidUsername(username.trim()))
      return res.status(400).json({ message: "Username must be 2–30 characters (letters, numbers, underscores)" });

    // Check uniqueness but exclude the current user's own document
    const taken = await User.findOne({ username: new RegExp(`^${escapeRegex(username.trim())}$`, 'i'), _id: { $ne: req.user.id } });
    if (taken) return res.status(400).json({ message: "Username already taken" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.username = username.trim();
    await user.save();
    const oldUsername = req.user.username;
    res.json({ message: "Username updated successfully", username: user.username });
    siteLog({ userId: req.user._id, username: user.username, action: "Username Changed", detail: `was: ${oldUsername}`, sourceType: "user" });
  } catch (err) {
    console.error("❌ Update Username Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHANGE PASSWORD (logged in) ──────────────────────────────────────────────

/**
 * PUT /api/users/password  (protected)
 *
 * Changes the authenticated user's password after verifying the current one.
 * Requires the user to know their current password (not for use in reset flow).
 *
 * Body params:
 *  @param {string} currentPassword - User's existing plain-text password
 *  @param {string} newPassword     - Desired new password (min 8 chars)
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "All fields are required" });
    if (!isStrongPassword(newPassword))
      return res.status(400).json({ message: "New password must be at least 8 characters" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Verify current password before allowing the change
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password changed successfully" });
    siteLog({ userId: req.user._id, username: user.username, action: "Password Changed", sourceType: "user" });
  } catch (err) {
    console.error("❌ Change Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

/**
 * POST /api/users/forgot-password
 *
 * Sends a 1-hour password reset link to the user's registered email address.
 * Returns the same message regardless of whether the email is registered
 * to prevent email enumeration.
 *
 * The raw token is sent in the URL; only the SHA-256 hash is stored in the DB.
 *
 * Body params:
 *  @param {string} email - User's registered email address
 *
 * Responds with a generic success message then sends the email in background.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
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

    // Respond immediately, then fire the email asynchronously
    res.json({ message: "If that email is registered, a reset link has been sent." });
    siteLog({ userId: user._id, username: user.username, action: "Forgot Password Requested", sourceType: "user" });

    sendEmail({
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
  } catch (err) {
    console.error("❌ Forgot Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

/**
 * POST /api/users/reset-password/:token
 *
 * Validates the password-reset token from the emailed link and replaces
 * the user's password. Clears the reset token after use so it cannot
 * be reused.
 *
 * Route params:
 *  @param {string} token - Raw (unhashed) token from the reset URL
 *
 * Body params:
 *  @param {string} newPassword - The desired new password (min 8 chars)
 *
 * Responds with a success message on success, 400 if the link is invalid/expired.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ message: "New password is required" });
    if (!isStrongPassword(newPassword))
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    // Hash the incoming token to compare against the stored hash
    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetToken: hashed,
      resetTokenExpiry: { $gt: Date.now() }, // ensure not expired
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired reset link" });

    // Replace the password and invalidate the token
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in." });
    siteLog({ userId: user._id, username: user.username, action: "Password Reset", sourceType: "user" });
  } catch (err) {
    console.error("❌ Reset Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHANGE EMAIL ─────────────────────────────────────────────────────────────

/**
 * PUT /api/users/email  (protected)
 *
 * Initiates an email address change. The new email is stored as pendingEmail
 * until the user clicks the confirmation link sent to the new address.
 * Requires the user's current password as a security confirmation.
 *
 * Body params:
 *  @param {string} newEmail  - Desired new email address
 *  @param {string} password  - User's current plain-text password
 *
 * Responds with a success message then sends the confirmation email in background.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const changeEmail = async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail || !password)
      return res.status(400).json({ message: "All fields are required" });
    if (!isValidEmail(newEmail.trim()))
      return res.status(400).json({ message: "Invalid email address" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Require current password before changing such a sensitive field
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });

    // Ensure the new email is not already registered to a different account
    const taken = await User.findOne({ email: newEmail.trim().toLowerCase(), _id: { $ne: req.user.id } });
    if (taken) return res.status(400).json({ message: "Email already in use" });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Stage the new email rather than applying it immediately
    user.pendingEmail = newEmail.trim().toLowerCase();
    user.emailChangeToken = hashed;
    user.emailChangeTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const confirmUrl = `${process.env.FRONTEND_URL}/confirm-email-change/${rawToken}`;

    res.json({ message: "Check your new email to confirm the change." });
    siteLog({ userId: req.user._id, username: user.username, action: "Email Change Requested", sourceType: "user" });

    sendEmail({
      to: newEmail.trim().toLowerCase(),
      subject: "Confirm your new email address",
      html: `
        <h2>Confirm Email Change</h2>
        <p>Click the button below to confirm your new email address:</p>
        <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#003087;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm Email</a>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    });
  } catch (err) {
    console.error("❌ Change Email Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CONFIRM EMAIL CHANGE ─────────────────────────────────────────────────────

/**
 * GET /api/users/confirm-email-change/:token
 *
 * Finalises an email address change by validating the token that was sent to
 * the new email address. Moves pendingEmail into the live email field and
 * clears all staging fields.
 *
 * Route params:
 *  @param {string} token - Raw (unhashed) token from the confirmation URL
 *
 * Responds with: { message } on success, 400 if invalid/expired.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const confirmEmailChange = async (req, res) => {
  try {
    const { token } = req.params;
    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      emailChangeToken: hashed,
      emailChangeTokenExpiry: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired confirmation link" });

    // Promote pendingEmail to the active email
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.emailChangeToken = undefined;
    user.emailChangeTokenExpiry = undefined;
    await user.save();

    res.json({ message: "Email updated successfully." });
    siteLog({ userId: user._id, username: user.username, action: "Email Changed", sourceType: "user" });
  } catch (err) {
    console.error("❌ Confirm Email Change Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── FORGOT USERNAME ──────────────────────────────────────────────────────────

/**
 * POST /api/users/forgot-username
 *
 * Emails the user's username to their registered email address.
 * Responds immediately before sending the email to prevent timing attacks
 * that could reveal whether an email is registered.
 *
 * Body params:
 *  @param {string} email - User's registered email address
 *
 * Responds with a generic success message then optionally sends the email.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const forgotUsername = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Respond immediately — send email in background so it never hangs
    // and so response time doesn't reveal whether the email is registered
    res.json({ message: "If that email is registered, your username has been sent." });

    if (user) {
      sendEmail({
        to: user.email,
        subject: "Your Username",
        html: `
          <h2>Username Reminder</h2>
          <p>Your username is: <strong>${user.username}</strong></p>
          <p>If you didn't request this, ignore this email.</p>
        `,
      });
    }
  } catch (err) {
    console.error("❌ Forgot Username Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── FORGOT EMAIL ─────────────────────────────────────────────────────────────

/**
 * POST /api/users/forgot-email
 *
 * User enters their username; we look up the account and email them their
 * registered email address along with their username as a reminder.
 * Responds immediately with a generic message to prevent user enumeration.
 *
 * Body params:
 *  @param {string} username - The user's account username
 */
export const forgotEmail = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "Username is required" });

    const user = await User.findOne({ username: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') });

    // Always return success to prevent username enumeration
    if (!user) return res.json({ message: "If that username exists, we've sent an email with your registered address." });

    sendEmail({
      to: user.email,
      subject: "Your Registered Email Address",
      html: `
        <h2>Email Reminder</h2>
        <p>Hi <strong>${user.username}</strong>,</p>
        <p>You requested a reminder of the email address linked to your account.</p>
        <p>Your registered email is: <strong>${user.email}</strong></p>
        <p>Your username is: <strong>${user.username}</strong></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    res.json({ message: "If that username exists, we've sent an email with your registered address." });
  } catch (err) {
    console.error("❌ Forgot Email Error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
};

// ─── GET PUBLIC CREATOR PROFILE ───────────────────────────────────────────────

/**
 * GET /api/users/:username/profile
 *
 * Returns the public-facing profile for any user by username.
 * Fetches basic info with a lean query first, then does a separate populate
 * for followers/following so a single corrupted DB reference doesn't crash
 * the whole request.
 *
 * Route params:
 *  @param {string} username - The target user's username
 *
 * Responds with: { ...userFields, followers, following, followerCount, followingCount }
 * Followers and following arrays contain { _id, username } objects.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getCreatorProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: new RegExp(`^${escapeRegex(req.params.username)}$`, 'i') })
      .select("username bio categories socialLinks followers following createdAt isPrivateAccount")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // Populate followers/following in a separate query so a corrupted ref
    // doesn't 500 the whole request — we catch and return empty arrays instead
    let followers = [];
    let following = [];
    try {
      const populated = await User.findById(user._id)
        .select("followers following")
        .populate("followers", "username")
        .populate("following", "username")
        .lean();
      // Filter out any null entries caused by deleted/dangling user references
      followers = (populated?.followers || []).filter(Boolean);
      following = (populated?.following || []).filter(Boolean);
    } catch {
      // Corrupted ref — return empty arrays rather than crashing
    }

    res.json({ ...user, followers, following, followerCount: followers.length, followingCount: following.length });
  } catch (err) {
    console.error("❌ Get Creator Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET ALL PUBLIC CREATORS ──────────────────────────────────────────────────

/**
 * GET /api/users/creators  (public)
 *
 * Returns a list of all public (non-private) accounts, sorted by follower count
 * descending so the most popular creators appear first.
 *
 * Optional query params:
 *   ?search=<string>  — case-insensitive prefix match on username
 *
 * Each item: { _id, username, bio, categories, followerCount }
 */
export const getAllCreators = async (req, res) => {
  try {
    const filter = { isPrivateAccount: { $ne: true } };
    if (req.query.search) {
      filter.username = { $regex: escapeRegex(req.query.search), $options: 'i' };
    }
    const users = await User.aggregate([
      { $match: filter },
      { $project: { username: 1, bio: 1, categories: 1, followerCount: { $size: { $ifNull: ['$followers', []] } } } },
      { $sort: { followerCount: -1 } },
    ]);

    const result = users.map(u => ({
      _id: u._id,
      username: u.username,
      bio: u.bio || '',
      categories: u.categories || [],
      followerCount: u.followerCount,
    }));

    res.json(result);
  } catch (err) {
    console.error('❌ Get All Creators Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET MUTUAL FOLLOWERS ─────────────────────────────────────────────────────

/**
 * GET /api/users/mutuals  (protected)
 *
 * Returns the list of users who both follow the authenticated user AND
 * are followed back by the authenticated user (mutual followers).
 * Used by the @mention autocomplete on the frontend to limit suggestions
 * to people the user actually knows.
 *
 * Responds with: { mutuals: [{ _id, username }] }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getMutualFollowers = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("following followers").lean();
    if (!me) return res.status(404).json({ message: "User not found" });

    // Build a Set of IDs the current user is following for O(1) lookup
    const followingSet = new Set(me.following.map(id => id.toString()));

    // Keep only followers who are also in the following set (i.e. mutuals)
    const mutualIds = me.followers.map(id => id.toString()).filter(id => followingSet.has(id));

    const mutuals = await User.find({ _id: { $in: mutualIds } }).select("username").lean();
    res.json({ mutuals });
  } catch (err) {
    console.error("❌ Get Mutual Followers Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── TOGGLE PRIVATE ACCOUNT ───────────────────────────────────────────────────

/**
 * PUT /api/users/private  (protected)
 *
 * Toggles the authenticated user's account privacy setting.
 * When private, the user's posts are excluded from public feeds and their
 * profile content is hidden from non-followers.
 *
 * Responds with: { isPrivateAccount: boolean }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const togglePrivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isPrivateAccount = !user.isPrivateAccount;
    await user.save();
    res.json({ isPrivateAccount: user.isPrivateAccount });
    siteLog({ userId: req.user._id, username: user.username, action: user.isPrivateAccount ? "Account Set Private" : "Account Set Public", sourceType: "user" });
  } catch (err) {
    console.error("❌ Toggle Private Account Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── BLOCK / UNBLOCK ──────────────────────────────────────────────────────────

/**
 * POST /api/users/block/:userId  (protected)
 *
 * Blocks the specified user. Also removes any existing follow relationship
 * in both directions so the blocked user no longer appears in follower lists.
 *
 * Route params:
 *  @param {string} userId - The ID of the user to block
 *
 * Responds with: { ok: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) return res.status(400).json({ message: "Cannot block yourself" });

    // Add to blocked list (addToSet prevents duplicates)
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { blockedUsers: userId } });

    // Remove follow relationship in both directions
    await User.findByIdAndUpdate(req.user.id, { $pull: { followers: userId, following: userId } });
    await User.findByIdAndUpdate(userId, { $pull: { followers: req.user.id, following: req.user.id } });

    const blocked = await User.findById(userId).select("username").lean();
    res.json({ ok: true });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Blocked User", targetId: userId, targetUsername: blocked?.username || "", sourceType: "user" });
  } catch (err) {
    console.error("❌ blockUser:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/users/unblock/:userId  (protected)
 *
 * Removes the specified user from the authenticated user's block list.
 * Does NOT automatically re-establish any follow relationships.
 *
 * Route params:
 *  @param {string} userId - The ID of the user to unblock
 *
 * Responds with: { ok: true }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const unblocked = await User.findById(userId).select("username").lean();
    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: userId } });
    res.json({ ok: true });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Unblocked User", targetId: userId, targetUsername: unblocked?.username || "", sourceType: "user" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── FOLLOW / UNFOLLOW ────────────────────────────────────────────────────────

/**
 * PUT /api/users/:username/follow  (protected)
 *
 * Toggles a follow relationship between the authenticated user and the
 * target user identified by username. If not following, follows; if already
 * following, unfollows.
 *
 * On a new follow, a real-time "follow" notification is emitted to the target
 * user's Socket.io room and persisted in the Notification collection.
 * Notification failure is non-fatal and does not affect the HTTP response.
 *
 * Route params:
 *  @param {string} username - The target user's username
 *
 * Responds with: { following: boolean, followerCount: number }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const toggleFollow = async (req, res) => {
  try {
    const target = await User.findOne({ username: new RegExp(`^${escapeRegex(req.params.username)}$`, 'i') });
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target._id.toString() === req.user.id)
      return res.status(400).json({ message: "You cannot follow yourself" });

    const me = await User.findById(req.user.id);
    const isFollowing = me.following.includes(target._id);

    if (isFollowing) {
      // Unfollow: remove from both sides of the relationship
      me.following.pull(target._id);
      target.followers.pull(me._id);
    } else {
      // Follow: add to both sides
      me.following.push(target._id);
      target.followers.push(me._id);
    }

    // Save both documents concurrently
    await Promise.all([me.save(), target.save()]);

    // ── Real-time follow notification (new follows only) ─────────────────────
    if (!isFollowing) {
      try {
        const { getIo } = await import("../utils/socketEmitter.js");
        const Notification = (await import("../models/notificationModel.js")).default;

        // Persist the notification so it appears in the notifications feed
        const notif = await Notification.create({ recipient: target._id, type: "follow", sender: me._id });

        // Push to the target's private socket room so their UI updates instantly
        getIo()?.to(target._id.toString()).emit("notification", {
          _id: notif._id,
          type: "follow",
          sender: { _id: me._id, username: me.username },
          read: false,
          createdAt: notif.createdAt,
        });
      } catch (e) {
        console.warn("Notification emit failed:", e.message);
      }
    }

    res.json({ following: !isFollowing, followerCount: target.followers.length });

    siteLog({ userId: me._id, username: me.username, action: isFollowing ? "Unfollowed" : "Followed", targetId: target._id, targetUsername: target.username, sourceType: "user", sourceUrl: `/creator/${target.username}` });
  } catch (err) {
    console.error("❌ Toggle Follow Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPDATE CREATOR PROFILE ───────────────────────────────────────────────────

/**
 * PUT /api/users/creator-profile  (protected)
 *
 * Allows the authenticated user to update their public creator profile fields:
 * bio, categories, and social media links.
 *
 * Only the fields present in the request body are updated (partial update).
 * Bio is clamped to 300 characters. Only the allow-listed social platforms
 * are accepted to prevent arbitrary key injection.
 *
 * Body params (all optional):
 *  @param {string}   [bio]         - Profile bio (max 300 chars)
 *  @param {string[]} [categories]  - Array of content categories
 *  @param {Object}   [socialLinks] - Map of platform name → URL
 *
 * Responds with: { message, bio, categories, socialLinks }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const updateCreatorProfile = async (req, res) => {
  try {
    const { bio, category, socialLinks } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (bio !== undefined) user.bio = bio.trim().slice(0, 300);
    if (Array.isArray(req.body.categories)) user.categories = req.body.categories;

    if (socialLinks) {
      // Only allow known platform keys to prevent arbitrary field injection
      const allowed = ["youtube", "instagram", "twitch", "tiktok", "soundcloud", "facebook"];
      for (const key of allowed) {
        if (socialLinks[key] !== undefined) user.socialLinks[key] = socialLinks[key].trim();
      }
    }

    await user.save();
    res.json({ message: "Profile updated", bio: user.bio, categories: user.categories, socialLinks: user.socialLinks });
    siteLog({ userId: req.user._id, username: user.username, action: "Creator Profile Updated", sourceType: "user", sourceUrl: `/creator/${user.username}` });
  } catch (err) {
    console.error("❌ Update Creator Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHECK USERNAME AVAILABILITY ──────────────────────────────────────────────

/**
 * GET /api/users/check-username?username=xxx
 *
 * Real-time username availability check used by the registration form.
 * Returns { available: false } for invalid formats without hitting the DB.
 *
 * Query params:
 *  @param {string} username - Username to check
 *
 * Responds with: { available: boolean, message: string }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    // Short-circuit invalid formats without a DB round trip
    if (!username || !isValidUsername(username.trim()))
      return res.json({ available: false, message: "Invalid username format" });
    const exists = await User.findOne({ username: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') });
    res.json({ available: !exists, message: exists ? "Username already taken" : "Username available" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CHECK EMAIL AVAILABILITY ─────────────────────────────────────────────────

/**
 * GET /api/users/check-email?email=xxx
 *
 * Real-time email availability check used by the registration form.
 * Returns { available: false } for invalid formats without hitting the DB.
 *
 * Query params:
 *  @param {string} email - Email address to check
 *
 * Responds with: { available: boolean, message: string }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    // Short-circuit invalid formats without a DB round trip
    if (!email || !isValidEmail(email.trim()))
      return res.json({ available: false, message: "Invalid email format" });
    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    res.json({ available: !exists, message: exists ? "Email already registered" : "Email available" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── SUBMIT APPEAL ────────────────────────────────────────────────────────────

/**
 * POST /api/users/appeal
 *
 * Unauthenticated — called by banned or restricted users from the login page.
 * Looks up the user by username or email, then creates an Appeal document.
 * Rate-limited at the route level.
 */
export const submitAppeal = async (req, res) => {
  try {
    const { identifier, appealText, type } = req.body;
    if (!identifier || !appealText || !type)
      return res.status(400).json({ message: "All fields are required." });
    if (!["ban", "restriction"].includes(type))
      return res.status(400).json({ message: "Invalid appeal type." });
    if (appealText.length > 1000)
      return res.status(400).json({ message: "Appeal must be 1000 characters or fewer." });

    // Try to find the user so we can attach them to the appeal
    const user =
      await User.findOne({ email: identifier.trim().toLowerCase() }) ||
      await User.findOne({ username: new RegExp(`^${identifier.trim()}$`, "i") });

    // Block duplicate appeals — one pending/approved appeal per user per type allowed.
    // If their previous appeal was dismissed they may resubmit.
    if (user) {
      const existing = await Appeal.findOne({
        user: user._id,
        type,
        status: "pending",
      });
      if (existing) {
        return res.status(409).json({
          message: "You already have a pending appeal under review. Please wait for a response.",
          alreadySubmitted: true,
        });
      }
    }

    await Appeal.create({
      identifier: identifier.trim(),
      user:       user?._id || null,
      username:   user?.username || identifier.trim(),
      email:      user?.email || "",
      type,
      appealText: appealText.trim(),
    });

    res.json({ message: "Your appeal has been submitted. We will review it shortly." });
    siteLog({ userId: user?._id || null, username: user?.username || identifier.trim(), action: "Appeal Submitted", detail: `${type}: ${appealText.trim().slice(0, 80)}`, sourceType: "user" });
  } catch (err) {
    console.error("❌ submitAppeal Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── WITHDRAW APPEAL ──────────────────────────────────────────────────────────

/**
 * DELETE /api/users/appeal
 *
 * Unauthenticated — lets a banned/restricted user cancel their pending appeal.
 * Only deletes if the appeal is still "pending" (can't undo an approved one).
 */
export const withdrawAppeal = async (req, res) => {
  try {
    const { identifier, type } = req.body;
    if (!identifier || !type)
      return res.status(400).json({ message: "identifier and type are required." });

    const user =
      await User.findOne({ email: identifier.trim().toLowerCase() }) ||
      await User.findOne({ username: new RegExp(`^${identifier.trim()}$`, "i") });

    if (!user) return res.status(404).json({ message: "User not found." });

    const appeal = await Appeal.findOne({ user: user._id, type, status: "pending" });
    if (!appeal) return res.status(404).json({ message: "No pending appeal found." });

    await appeal.deleteOne();
    res.json({ message: "Appeal withdrawn." });
    siteLog({ userId: user._id, username: user.username, action: "Appeal Withdrawn", detail: type, sourceType: "user" });
  } catch (err) {
    console.error("❌ withdrawAppeal Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
