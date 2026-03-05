// server.js
import express from "express";
import { config } from "dotenv";
import { connectDatabase } from "./utils/connectDatabase.js";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import User from "./models/userModel.js";

config();
connectDatabase();

const app = express();

// ─── Security Headers ───────────────────────────────────────────────
app.use(helmet());

// ─── CORS ───────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any localhost port in development, or the configured frontend URL
    const isLocalhost = /^http:\/\/localhost(:\d+)?$/.test(origin);
    const isAllowed = isLocalhost || origin === process.env.FRONTEND_URL;
    if (isAllowed) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ─── Body Parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Rate Limiting ──────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const paypalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { message: "Too many payment requests, slow down." },
});

// ─── Routes ─────────────────────────────────────────────────────────
app.use("/api/users", authLimiter, userRoutes);

app.get("/", (req, res) => res.send("Backend is running!"));

// ─── PayPal: Create Order ────────────────────────────────────────────
app.post("/api/paypal/create-order", paypalLimiter, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || isNaN(amount) || amount <= 0 || amount > 10000)
      return res.status(400).json({ message: "Invalid amount" });

    const response = await fetch(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
            ).toString("base64"),
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: amount.toFixed(2) } }],
        }),
      }
    );

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch {
      return res.status(502).json({ message: "Invalid response from PayPal" });
    }

    if (!response.ok) return res.status(400).json({ message: "Order creation failed" });
    return res.json(data);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PayPal: Capture Order ───────────────────────────────────────────
app.post("/api/paypal/capture-order/:orderID", paypalLimiter, async (req, res) => {
  try {
    const { orderID } = req.params;
    if (!orderID || !/^[A-Z0-9]+$/.test(orderID))
      return res.status(400).json({ message: "Invalid order ID" });

    const response = await fetch(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
            ).toString("base64"),
        },
      }
    );

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch {
      return res.status(502).json({ message: "Invalid response from PayPal" });
    }

    if (!response.ok) return res.status(response.status).json({ message: "Capture failed" });

    // Optionally track donation if user is logged in
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const capturedAmount = data?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
        if (capturedAmount) {
          await User.findByIdAndUpdate(decoded.id, {
            $inc: { donationsTotal: parseFloat(capturedAmount) },
          });
        }
      } catch {
        // Non-fatal — log for auditing but don't fail the response
        console.warn("⚠️ Could not track donation for user");
      }
    }

    return res.json(data);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── Global Error Handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
