// =============================================================================
// src/composables/useAuth.js
// Global authentication composable.
//
// Provides a single, shared reactive user object and all auth-related API
// calls (signup, login, logout, profile, subscription, account management).
//
// Design notes:
//   - `user` and `error` are declared OUTSIDE the function so they are module-
//     level singletons. Every component that calls useAuth() shares the same
//     reactive refs, which keeps the navbar and all other consumers in sync
//     with each other without needing Vuex/Pinia.
//   - `profileLoaded` is a plain boolean (not reactive) used as a simple guard
//     so the auto-load request only fires once per page session, even if many
//     components call useAuth() on mount.
//   - All API requests attach a JWT via axios's default Authorization header,
//     which is set/cleared by setAuthHeader().
// =============================================================================

import { ref } from "vue";
import axios from "axios";

// Base URL for all user-related API endpoints, sourced from the .env file
const API_URL = import.meta.env.VITE_API_URL + "/api/users";

// ── Module-level singletons ───────────────────────────────────────────────────
// Declared outside useAuth() so every call site shares the same reactive state.

// Reactive user object — null-ish defaults represent a logged-out state
const user = ref({
  id: null,
  username: "",
  email: "",
  isSubscriber: false,
  isAdmin: false,
  isPrivateAccount: false,
});

// Last error message from any auth operation; cleared before each new request
const error = ref(null);

// Guard flag — prevents duplicate GET /profile calls if multiple components
// call useAuth() before the first request completes
let profileLoaded = false;

// =============================================================================
// useAuth — composable factory function
// =============================================================================
export function useAuth() {

  // ── JWT header helper ───────────────────────────────────────────────────────

  /**
   * Sets or clears the Authorization header on every subsequent axios request.
   * Called with a token string on login, and with null/undefined on logout.
   */
  const setAuthHeader = (token) => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  // ── Auto-load profile on page refresh ─────────────────────────────────────
  // If a JWT is already in localStorage (i.e. the user refreshed the page while
  // logged in), re-attach the header and fetch the current user's profile so
  // reactive state is restored without requiring the user to log in again.
  // The `profileLoaded` guard ensures this block only runs once per module load.
  if (!profileLoaded) {
    const token = localStorage.getItem("jwtToken");
    if (token) {
      profileLoaded = true;
      setAuthHeader(token);
      axios
        .get(`${API_URL}/profile`)
        .then((res) => { user.value = { ...res.data }; })
        // Only logout on 401 (invalid/expired token) — ignore network errors
        // and server restarts so a cold-start doesn't silently log the user out
        .catch((err) => { if (err.response?.status === 401) logout(); });
    }
  }

  // ── SIGNUP ─────────────────────────────────────────────────────────────────

  /**
   * Registers a new account. On success no token is returned — the user must
   * verify their email address before they can log in.
   */
  const signup = async (username, email, password) => {
    error.value = null;
    try {
      await axios.post(`${API_URL}/signup`, { username, email, password });
      // No token — user must verify email before logging in
    } catch (err) {
      error.value = err.response?.data?.message || "Signup failed.";
      throw err;
    }
  };

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  /**
   * Authenticates with a username OR email plus password. The backend accepts
   * either field under both the `username` and `email` keys, so we send the
   * same value for both and let the backend decide which one matched.
   * On success, stores the JWT in localStorage and updates the shared user ref.
   */
  const login = async (usernameOrEmail, password) => {
    error.value = null;

    try {
      const res = await axios.post(`${API_URL}/login`, {
        username: usernameOrEmail,
        email: usernameOrEmail,
        password,
      });

      // Persist the token so it survives page refreshes
      localStorage.setItem("jwtToken", res.data.token);
      setAuthHeader(res.data.token);

      // Spread the full response into the reactive user object — this is what
      // triggers navbar updates and any other reactive consumer (KEY FIX)
      user.value = { ...res.data };
    } catch (err) {
      error.value = err.response?.data?.message || "Login failed.";
      throw err;
    }
  };

  // ── LOGOUT ─────────────────────────────────────────────────────────────────

  /**
   * Clears all auth state: removes the JWT from storage, deletes the axios
   * header, and resets the user ref to its logged-out defaults.
   * Also resets `profileLoaded` so that if a different user logs in during
   * the same session the auto-load will run again for them.
   */
  const logout = () => {
    localStorage.removeItem("jwtToken");
    setAuthHeader(null);
    profileLoaded = false;
    user.value = {
      id: null,
      username: "",
      email: "",
      isSubscriber: false,
      isAdmin: false,
      isPrivateAccount: false,
    };
  };

  // ── GET PROFILE ────────────────────────────────────────────────────────────

  /**
   * Re-fetches the current user's profile from the server and updates the
   * reactive user ref. Useful after profile edits to ensure local state
   * matches the database.
   */
  const getProfile = async () => {
    try {
      const res = await axios.get(`${API_URL}/profile`);
      user.value = { ...res.data };
    } catch (err) {
      throw err;
    }
  };

  // ── SUBSCRIBE ──────────────────────────────────────────────────────────────

  /**
   * Activates the subscription on the backend (called after a successful
   * PayPal payment). Only updates the `isSubscriber` flag on the user ref
   * rather than replacing the whole object, to avoid clobbering other fields.
   */
  const subscribe = async () => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/subscribe`);
      user.value = {
        ...user.value,
        isSubscriber: res.data.isSubscriber,
      };
    } catch (err) {
      error.value = "Subscription failed.";
      throw err;
    }
  };

  // ── UPDATE USERNAME ────────────────────────────────────────────────────────

  /**
   * Changes the logged-in user's username. On success, patches the username
   * field in the reactive user ref so all components see the new value.
   */
  const updateUsername = async (newUsername) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/update-username`, {
        username: newUsername,
      });

      user.value = {
        ...user.value,
        username: res.data.username,
      };

      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to update username.";
      throw err;
    }
  };

  // ── DELETE ACCOUNT ─────────────────────────────────────────────────────────

  /**
   * Permanently deletes the logged-in user's account on the backend, then
   * calls logout() to clear all local auth state.
   */
  const deleteAccount = async () => {
    error.value = null;
    try {
      await axios.delete(`${API_URL}/delete-account`);
      logout();
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to delete account.";
      throw err;
    }
  };

  // ── DONATIONS TOTAL ────────────────────────────────────────────────────────

  /**
   * Fetches the cumulative donations total for the logged-in user.
   * Returns 0 on error so the calling component can always render a number.
   */
  const getDonationsTotal = async () => {
    try {
      const res = await axios.get(`${API_URL}/donations-total`);
      return res.data.donationsTotal;
    } catch {
      return 0;
    }
  };

  // ── CHANGE PASSWORD ────────────────────────────────────────────────────────

  /**
   * Requires the user's current password (for security verification) plus the
   * desired new password. The server enforces any password strength rules.
   */
  const changePassword = async (currentPassword, newPassword) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/change-password`, { currentPassword, newPassword });
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to change password.";
      throw err;
    }
  };

  // ── UPDATE CREATOR PROFILE ─────────────────────────────────────────────────

  /**
   * Updates creator-specific profile fields (e.g. bio, avatar, banner).
   * `data` is a plain object or FormData containing the fields to update.
   * Merges the server response into the reactive user ref so changes are
   * reflected everywhere immediately.
   */
  const updateCreatorProfile = async (data) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/update-creator-profile`, data);
      user.value = { ...user.value, ...res.data };
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to update profile.";
      throw err;
    }
  };

  // ── CHANGE EMAIL ───────────────────────────────────────────────────────────

  /**
   * Initiates an email change request. The backend sends a confirmation link
   * to the new address; the actual email field is only updated in the database
   * once the user clicks that link (handled by ConfirmEmailChange.vue).
   * The local user ref is patched optimistically with the new email.
   */
  const changeEmail = async (newEmail, password) => {
    error.value = null;
    try {
      const res = await axios.put(`${API_URL}/change-email`, { newEmail, password });
      user.value = { ...user.value, email: res.data.email };
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to change email.";
      throw err;
    }
  };

  // ── TOGGLE PRIVATE ACCOUNT ─────────────────────────────────────────────────

  /**
   * Flips the user's account privacy setting on the backend and patches the
   * `isPrivateAccount` field in the reactive user ref.
   */
  const togglePrivateAccount = async () => {
    const res = await axios.put(`${API_URL}/toggle-private-account`);
    user.value = { ...user.value, isPrivateAccount: res.data.isPrivateAccount };
    return res.data;
  };

  // ── FORGOT PASSWORD ────────────────────────────────────────────────────────

  /**
   * Sends a password reset email to the given address. No auth required —
   * this is the first step of the unauthenticated reset flow.
   */
  const forgotPassword = async (email) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/forgot-password`, { email });
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to send reset email.";
      throw err;
    }
  };

  // ── RESET PASSWORD ─────────────────────────────────────────────────────────

  /**
   * Completes the password reset flow using the one-time token from the reset
   * email link. The token is part of the URL (route param) and is validated
   * server-side before the new password is accepted.
   */
  const resetPassword = async (token, newPassword) => {
    error.value = null;
    try {
      const res = await axios.post(`${API_URL}/reset-password/${token}`, { newPassword });
      return res.data;
    } catch (err) {
      error.value = err.response?.data?.message || "Failed to reset password.";
      throw err;
    }
  };

  // ── PREMIUM CONTENT ────────────────────────────────────────────────────────

  /**
   * Fetches subscriber-only content from the backend. The request will be
   * rejected with 403 if the user is not an active subscriber.
   */
  const getPremiumContent = async () => {
    error.value = null;
    try {
      const res = await axios.get(`${API_URL}/premium-content`);
      return res.data;
    } catch (err) {
      error.value = "Failed to load premium content.";
      throw err;
    }
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    user,
    error,
    signup,
    login,
    logout,
    getProfile,
    subscribe,
    updateUsername,
    deleteAccount,
    getDonationsTotal,
    getPremiumContent,
    changePassword,
    changeEmail,
    updateCreatorProfile,
    forgotPassword,
    resetPassword,
    togglePrivateAccount,
  };
}
