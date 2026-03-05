import express from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  upgradeToSubscriber,
  deleteUserAccount,
  updateUsername,
  getDonationsTotal,
  changePassword,
  forgotPassword,
  resetPassword,
  forgotUsername,
  changeEmail,
  confirmEmailChange,
  checkUsername,
  checkEmail,
} from "../controllers/userController.js";
import { protect, paywall } from "../middleware/auth.js";

const router = express.Router();

// ─── Public ───────────────────────────────────────────────────────────
router.post("/signup", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.post("/forgot-username", forgotUsername);
router.get("/confirm-email-change/:token", confirmEmailChange);
router.get("/check-username", checkUsername);
router.get("/check-email", checkEmail);

// ─── Protected ────────────────────────────────────────────────────────
router.get("/profile", protect, getUserProfile);
router.put("/subscribe", protect, upgradeToSubscriber);
router.put("/update-username", protect, updateUsername);
router.put("/change-email", protect, changeEmail);
router.put("/change-password", protect, changePassword);
router.delete("/delete-account", protect, deleteUserAccount);
router.get("/donations-total", protect, getDonationsTotal);

// ─── Paywall ──────────────────────────────────────────────────────────
router.get("/donations-content", protect, paywall, (req, res) => {
  res.json({ message: "Welcome! This content is for subscribers or donors." });
});

export default router;
