// routes/userRoutes.js
import express from "express";
import {
  registerUser,
  loginUser,
  getUserProfile,
  upgradeToSubscriber,
  deleteUserAccount, // (we’ll add this soon)
  updateUsername // (we’ll add this soon)
} from "../controllers/userController.js";
import { protect, paywall } from "../middleware/auth.js";

const router = express.Router();

// 🟢 Public Routes
router.post("/signup", registerUser);   // expects { username, email, password }
router.post("/login", loginUser);       // expects { username OR email, password }

// 🟣 Protected Routes
router.get("/profile", protect, getUserProfile);
router.post("/subscribe", protect, upgradeToSubscriber);

// 💎 Premium Content
router.get("/premium-content", protect, paywall, (req, res) => {
  res.json({ message: "Welcome to your paywalled content!" });
});

// 🧪 Test Subscription (dev only)
router.post("/test-subscribe", protect, async (req, res) => {
  try {
    const user = req.user;
    user.isSubscriber = true;
    await user.save();
    res.json({
      message: "Test subscription activated",
      user: { id: user._id, isSubscriber: user.isSubscriber },
    });
  } catch (err) {
    console.error("❌ Test subscribe error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🗑️ Delete Account (to be implemented)
router.delete("/delete", protect, deleteUserAccount);

// ✏️ Update Username (to be implemented)
router.put("/update-username", protect, updateUsername);

export default router;
