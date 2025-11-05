// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";


// ==============================
// 🔒 PROTECT ROUTE (JWT Auth)
// ==============================
export const protect = async (req, res, next) => {
  let token;

  // Check for Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      // Decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user to request
      req.user = await User.findById(decoded.id).select("-password");

      next(); // Continue to the route
    } catch (err) {
      console.error("❌ Auth middleware error:", err);
      return res.status(401).json({ message: "Not authorized" });
    }
  } else {
    return res.status(401).json({ message: "No token provided" });
  }
};

// ==============================
// 💳 PAYWALL CHECK (Subscriber Only)
// ==============================
export const paywall = (req, res, next) => {
  if (req.user && req.user.isSubscriber) {
    next(); // User is a subscriber, allow access
  } else {
    res.status(403).json({ message: "Access denied: Subscription required" });
  }
};
