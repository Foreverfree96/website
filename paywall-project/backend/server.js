// server.js
import express from "express";
import { config } from "dotenv";
import { connectDatabase } from "./utils/connectDatabase.js";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import User from "./models/userModel.js";

// 1️⃣ Load environment variables from .env
config();

// 2️⃣ Connect to MongoDB
connectDatabase();

// 3️⃣ Initialize Express app
const app = express();

// 4️⃣ Middleware     // Parse JSON payloads
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5️⃣ Routes
app.use("/api/users", userRoutes);

// Example test route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// 6️⃣ PAYPAL ROUTES

// CREATE ORDER
app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) return res.status(400).json({ error: "Missing amount" });

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
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: amount,
              },
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ PayPal create-order rejected:", data);
      return res.status(400).json({ error: data.message || "PayPal rejected order creation" });
    }
    return res.json(data);
  } catch (error) {
    console.error("❌ CREATE ORDER ERROR:", error);
    return res.status(500).json({ error: "Create Order Failed" });
  }
});

// CAPTURE ORDER
app.post("/api/paypal/capture-order/:orderID", async (req, res) => {
  try {
    const { orderID } = req.params;
    const { amount } = req.body;

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
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("❌ PayPal capture non-JSON response:", rawText);
      return res.status(502).json({ error: "Invalid response from PayPal" });
    }

    if (!response.ok) {
      console.error("❌ PayPal capture rejected:", data);
      return res.status(response.status).json({ error: data.message || "PayPal capture failed", details: data });
    }

    // If user is logged in, record the donation amount
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer") && amount) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await User.findByIdAndUpdate(decoded.id, {
          $inc: { donationsTotal: parseFloat(amount) },
        });
      } catch {
        // Non-fatal: user tracking failed but payment succeeded
      }
    }

    return res.json(data);
  } catch (error) {
    console.error("❌ CAPTURE ORDER ERROR:", error);
    return res.status(500).json({ error: "Capture Order Failed" });
  }
});

// 7️⃣ Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

// 8️⃣ Start server on dynamic port (Render) or 5000 locally
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
