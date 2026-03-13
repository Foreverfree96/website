// =============================================================================
// backend/middleware/auth.js
//
// Express middleware functions for authentication and authorisation.
//
// Exports four middleware functions that can be composed on any route:
//
//   protect      — requires a valid JWT; attaches req.user or returns 401
//   optionalAuth — attaches req.user if a valid JWT is present; never blocks
//   isAdmin      — requires req.user.isAdmin === true; returns 403 otherwise
//   paywall      — requires req.user.isSubscriber === true; returns 403 otherwise
//
// Usage pattern:
//   router.get("/secret", protect, isAdmin, handler)
//   router.get("/post/:id", optionalAuth, handler)
//   router.get("/premium", protect, paywall, handler)
//
// JWT tokens are expected in the Authorization header as:
//   Authorization: Bearer <token>
// =============================================================================

import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

// =============================================================================
// protect — mandatory JWT authentication
// =============================================================================

/**
 * protect — verifies the Bearer JWT in the Authorization header.
 *
 * On success:
 *   - Decodes the token using JWT_SECRET from the environment.
 *   - Fetches the corresponding User from the database (selecting only the
 *     fields that downstream middleware and controllers need).
 *   - Attaches the user document to req.user and calls next().
 *
 * On failure:
 *   - Returns 401 if the token is missing, expired, or tampered with.
 *
 * Fields selected on req.user:
 *   username, email, isSubscriber, isAdmin, isVerified, blockedUsers
 *   (password and token fields are intentionally excluded for security)
 */
export const protect = async (req, res, next) => {
  let token;

  // Check that the Authorization header exists and uses the Bearer scheme.
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // Extract the token string after "Bearer ".
      token = req.headers.authorization.split(" ")[1];

      // Decode token — throws if the token is expired or the signature is invalid.
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch the user identified by the token payload's `id` claim.
      // Select only the fields needed by downstream middleware/controllers;
      // never return the hashed password or any token fields.
      req.user = await User.findById(decoded.id).select("username email isSubscriber isAdmin isVerified blockedUsers");

      next();
    } catch (err) {
      console.error("❌ Auth middleware error:", err);
      return res.status(401).json({ message: "Not authorized" });
    }
  } else {
    // No Authorization header present at all.
    return res.status(401).json({ message: "No token provided" });
  }
};

// =============================================================================
// optionalAuth — non-blocking JWT authentication
// =============================================================================

/**
 * optionalAuth — attempts to authenticate the request but never blocks it.
 *
 * Use this on routes that serve different content to authenticated vs
 * unauthenticated users (e.g. a post that shows extra controls to its author).
 *
 * On success: attaches the user to req.user exactly as protect does.
 * On failure / missing token: req.user stays undefined and next() is called.
 *
 * Errors are silently swallowed — an invalid token is treated the same as
 * no token (unauthenticated request).
 */
export const optionalAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer")) {
    try {
      const token = auth.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("username email isSubscriber isAdmin isVerified blockedUsers");
    } catch {
      // Invalid or expired token — just continue without attaching a user.
      // The route handler is responsible for checking whether req.user exists.
    }
  }
  next();
};

// =============================================================================
// isAdmin — admin role check
// =============================================================================

/**
 * isAdmin — authorisation guard that requires the authenticated user to be an admin.
 *
 * Must be used AFTER protect (or optionalAuth where a user is guaranteed),
 * because it reads req.user which protect attaches.
 *
 * Returns 403 Forbidden if the user is not an admin.
 * Calls next() to proceed to the route handler if they are.
 */
export const isAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) return next();
  res.status(403).json({ message: "Access denied: Admins only" });
};

// =============================================================================
// paywall — subscriber-only access check
// =============================================================================

/**
 * paywall — authorisation guard that requires the authenticated user to have
 * an active paid subscription (isSubscriber === true).
 *
 * Must be used AFTER protect so req.user is available.
 *
 * Returns 403 Forbidden if the user has not subscribed.
 * Calls next() to proceed to the paywalled route handler if they have.
 */
export const paywall = (req, res, next) => {
  if (req.user && req.user.isSubscriber) {
    next();
  } else {
    res.status(403).json({ message: "Access denied: Subscription required" });
  }
};
