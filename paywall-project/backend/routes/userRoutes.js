// routes/userRoutes.js
import express from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  upgradeToSubscriber,
  deleteUserAccount,
  updateUsername
} from "../controllers/userController.js";
import { protect, paywall } from "../middleware/auth.js";

const router = express.Router();

// ===========================
// 🟢 Public Routes
// ===========================
router.post("/signup", registerUser);
router.post("/login", loginUser);

// ===========================
// 🟣 Protected Routes
// ===========================
router.get("/profile", protect, getUserProfile);
router.put("/subscribe", protect, upgradeToSubscriber); // Upgrade subscription
router.put("/update-username", protect, updateUsername);
router.delete("/delete-account", protect, deleteUserAccount);

// ===========================
// 💎 Donations / Protected Content
// ===========================
// This route can be used as a placeholder for donations or subscriber-only content
router.get("/donations-content", protect, paywall, (req, res) => {
  res.json({ message: "Welcome! This content is for subscribers or donors." });
});

export default router;
