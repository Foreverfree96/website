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

// 🟢 Public Routes
router.post("/signup", registerUser);
router.post("/login", loginUser);

// 🟣 Protected Routes
router.get("/profile", protect, getUserProfile);
router.post("/subscribe", protect, upgradeToSubscriber);
router.put("/update-username", protect, updateUsername);
router.delete("/delete-account", protect, deleteUserAccount);

// 💎 Premium Content
router.get("/premium-content", protect, paywall, (req, res) => {
  res.json({ message: "Welcome to your paywalled content!" });
});

export default router;
