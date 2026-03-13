// =============================================================================
// backend/routes/userRoutes.js
//
// Express router for all user-related API endpoints.
// Mounted at /api/users in the main server file.
//
// Route groups:
//   Public      — no authentication required (registration, login, public profiles)
//   Protected   — valid JWT required via the `protect` middleware
//   Paywall     — valid JWT + active subscription required (protect + paywall)
//
// Middleware imported:
//   protect  — verifies JWT and attaches req.user (401 if missing/invalid)
//   paywall  — confirms req.user.isSubscriber === true (403 otherwise)
// =============================================================================

import express from "express";
import {
  registerUser,        // POST /signup          — create a new account
  loginUser,           // POST /login           — authenticate and return JWT
  verifyEmail,         // GET  /verify-email/:token — confirm email on sign-up
  resendVerification,  // POST /resend-verification — resend the confirmation email
  getUserProfile,      // GET  /profile         — fetch the authenticated user's own profile
  upgradeToSubscriber, // PUT  /subscribe       — mark the user as a paying subscriber
  deleteUserAccount,   // DELETE /delete-account — permanently remove the account
  updateUsername,      // PUT  /update-username — change the user's username
  getDonationsTotal,   // GET  /donations-total — total amount donated by the user
  changePassword,      // PUT  /change-password — update the account password
  forgotPassword,      // POST /forgot-password — send a password reset email
  resetPassword,       // POST /reset-password/:token — apply the new password
  forgotUsername,      // POST /forgot-username — email the user their username
  changeEmail,         // PUT  /change-email    — start an email-change flow
  confirmEmailChange,  // GET  /confirm-email-change/:token — complete the change
  getCreatorProfile,   // GET  /creator/:username — public creator profile page data
  toggleFollow,        // POST /creator/:username/follow — follow or unfollow a creator
  updateCreatorProfile,// PUT  /update-creator-profile — update bio, links, categories
  checkUsername,       // GET  /check-username  — availability check during sign-up
  checkEmail,          // GET  /check-email     — availability check during sign-up
  getMutualFollowers,  // GET  /mutual-followers — users who follow each other (for @mention)
  togglePrivateAccount,// PUT  /toggle-private-account — flip the account privacy flag
  blockUser,           // POST /block/:userId   — add a user to the block list
  unblockUser,         // DELETE /block/:userId — remove a user from the block list
} from "../controllers/userController.js";
import { protect, paywall } from "../middleware/auth.js";

const router = express.Router();

// =============================================================================
// Public routes — no authentication needed
// =============================================================================

/** Register a new user account. */
router.post("/signup", registerUser);

/** Authenticate an existing user and return a signed JWT. */
router.post("/login", loginUser);

/** Confirm a user's email address using the token sent in the welcome email. */
router.get("/verify-email/:token", verifyEmail);

/** Re-send the email verification link (e.g. if the original expired). */
router.post("/resend-verification", resendVerification);

/** Initiate the "forgot password" flow — sends a reset link to the user's email. */
router.post("/forgot-password", forgotPassword);

/** Complete a password reset using the token from the reset email. */
router.post("/reset-password/:token", resetPassword);

/** Send a reminder email containing the user's username. */
router.post("/forgot-username", forgotUsername);

/**
 * Confirm a pending email address change.
 * The token was sent to the new email address during the change-email flow.
 */
router.get("/confirm-email-change/:token", confirmEmailChange);

/** Check whether a username is already taken (used during sign-up). */
router.get("/check-username", checkUsername);

/** View a creator's public profile, posts, and follower counts. */
router.get("/creator/:username", getCreatorProfile);

/**
 * Follow or unfollow a creator.
 * Protected because the acting user must be identified.
 */
router.post("/creator/:username/follow", protect, toggleFollow);

/** Update the authenticated user's creator profile (bio, social links, categories). */
router.put("/update-creator-profile", protect, updateCreatorProfile);

/** Check whether an email address is already registered (used during sign-up). */
router.get("/check-email", checkEmail);

// =============================================================================
// Protected routes — valid JWT required
// =============================================================================

/**
 * Get the list of users who mutually follow each other with the authenticated user.
 * Used by the @mention autocomplete in comments.
 */
router.get("/mutual-followers", protect, getMutualFollowers);

/** Fetch the authenticated user's own profile data (used on the account page). */
router.get("/profile", protect, getUserProfile);

/** Upgrade the authenticated user's account to subscriber status after payment. */
router.put("/subscribe", protect, upgradeToSubscriber);

/** Change the authenticated user's username. */
router.put("/update-username", protect, updateUsername);

/** Initiate an email address change — sends a verification link to the new address. */
router.put("/change-email", protect, changeEmail);

/** Change the authenticated user's password (requires current password). */
router.put("/change-password", protect, changePassword);

/** Permanently delete the authenticated user's account and all associated data. */
router.delete("/delete-account", protect, deleteUserAccount);

/** Get the cumulative total amount this user has donated. */
router.get("/donations-total", protect, getDonationsTotal);

/** Toggle the account's private/public visibility flag. */
router.put("/toggle-private-account", protect, togglePrivateAccount);

/** Add a user to this account's block list. */
router.post("/block/:userId", protect, blockUser);

/** Remove a user from this account's block list. */
router.delete("/block/:userId", protect, unblockUser);

// =============================================================================
// Paywall routes — valid JWT + active subscription required
// =============================================================================

/**
 * Example paywalled content endpoint.
 * Only reachable by authenticated users who also have isSubscriber === true.
 * Returns a simple confirmation message; real paywalled routes follow the
 * same protect → paywall → handler pattern.
 */
router.get("/donations-content", protect, paywall, (req, res) => {
  res.json({ message: "Welcome! This content is for subscribers or donors." });
});

export default router;
