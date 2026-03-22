/**
 * server.js
 *
 * Entry point for the Express backend. Responsible for:
 *  - Bootstrapping the HTTP server and Socket.io instance
 *  - Registering all global middleware (CORS, Helmet, body parsing, rate limiting)
 *  - Mounting all API route groups
 *  - Handling the PayPal create-order / capture-order flow directly (no separate route file)
 *  - Emitting real-time events via Socket.io with JWT-authenticated rooms
 *  - Attaching a global error handler
 *
 * Environment variables required:
 *  FRONTEND_URL       — Production frontend origin (e.g. https://mysite.vercel.app)
 *  JWT_SECRET         — Secret used to sign and verify JWTs
 *  PAYPAL_CLIENT_ID   — PayPal sandbox client ID
 *  PAYPAL_SECRET      — PayPal sandbox client secret
 *  PORT               — (optional) Port to listen on; defaults to 5000
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "dotenv";
import { connectDatabase } from "./utils/connectDatabase.js";
import userRoutes from "./routes/userRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import trackRoutes from "./routes/trackRoutes.js";
import spotifyRoutes from "./routes/spotifyRoutes.js";
import youtubeRoutes from "./routes/youtubeRoutes.js";
import twitchRoutes from "./routes/twitchRoutes.js";
import { onlineUsers } from "./utils/onlineUsers.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import User from "./models/userModel.js";
import { setIo } from "./utils/socketEmitter.js";

// Load .env variables into process.env
config();

// Connect to MongoDB — await so routes don't run before DB is ready
await connectDatabase();

// One-time: ensure owner account has unlimited status
try {
  await User.updateOne({ email: "itsmeabc411@gmail.com" }, { $set: { isUnlimited: true, isAdmin: true } });
} catch { /* silent */ }

const app = express();

// Trust the first proxy hop — required for accurate rate-limiting and IP detection
// when deployed behind a reverse proxy (e.g. Render, Railway, Heroku)
app.set("trust proxy", 1);

// Wrap express app in a raw Node http.Server so Socket.io can share the same port
const httpServer = createServer(app);

// ─── SOCKET.IO SETUP ────────────────────────────────────────────────────────

/**
 * Reusable CORS origin validator.
 * Allows:
 *  - Requests with no origin (mobile apps, curl, Postman)
 *  - Any localhost port (development)
 *  - Vercel preview URLs matching the myportfoliofrontend* pattern
 *  - The exact production frontend URL from FRONTEND_URL env var
 *
 * @param {string|undefined} origin   - The Origin header value from the request
 * @param {Function}         callback - CORS callback: (error, allow: boolean)
 */
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

// Reusable origin check — shared between Socket.io and Express CORS
function isAllowedOrigin(origin) {
  if (!origin) return true;
  // Dev: localhost or 127.0.0.1 on any port
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Vercel preview/production deployments
  if (/^https:\/\/myportfoliofrontend[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  // Render frontend deployments
  if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)) return true;
  // Exact match of configured FRONTEND_URL
  if (origin === process.env.FRONTEND_URL) return true;
  return false;
}

// Share the io instance with the rest of the app via the socketEmitter utility
// so controllers can emit events without importing server.js directly
setIo(io);

// ─── SOCKET.IO MIDDLEWARE ────────────────────────────────────────────────────

/**
 * Socket.io authentication middleware.
 * Every incoming socket connection must supply a valid JWT in
 * socket.handshake.auth.token. The decoded user ID is attached to
 * socket.userId so it can be used when the connection is established.
 *
 * Rejects unauthenticated connections before they are admitted.
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Authentication error"));
  }
});

/**
 * Socket.io connection handler.
 * Each authenticated user joins a private room named after their own user ID.
 * This allows the server to target real-time events (notifications, DMs) at a
 * specific user by calling io.to(userId).emit(...).
 */
io.on("connection", async (socket) => {
  socket.join(socket.userId);
  onlineUsers.add(socket.userId);

  // If this user is an admin, join the broadcast room for real-time analytics
  try {
    const u = await User.findById(socket.userId).select("isAdmin").lean();
    if (u?.isAdmin) socket.join("admins");
  } catch {}

  // Push updated online count + user list to all connected admin panels
  const emitOnline = async () => {
    const ids = [...onlineUsers];
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }).select("username email isAdmin isSubscriber").lean()
      : [];
    io.to("admins").emit("analytics:online", { count: ids.length, users });
  };
  emitOnline().catch(() => {});

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.userId);
    emitOnline().catch(() => {});
  });
});

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────

// Helmet sets a collection of security-related HTTP response headers
// (e.g. X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options)
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ─── BODY PARSING ─────────────────────────────────────────────────────────────

// Limit request bodies — 500kb allows playlist match/convert payloads (up to 1000 tracks)
// while still blocking unreasonably large requests
app.use(express.json({ limit: "500kb" }));
app.use(express.urlencoded({ extended: true, limit: "500kb" }));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────

/**
 * General API rate limiter applied to all user-facing routes.
 * Allows up to 10,000 requests per 15-minute window per IP.
 * Returns standardised headers (RateLimit-*) and a JSON error on breach.
 */
// Skip rate limiting for unlimited users (checks JWT from Authorization header)
const isUnlimitedUser = async (req) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return false;
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('isUnlimited').lean();
    return !!user?.isUnlimited;
  } catch { return false; }
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50000,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isUnlimitedUser,
});

/**
 * Stricter rate limiter specifically for PayPal endpoints.
 * Allows up to 2000 requests per minute to prevent payment-endpoint abuse.
 */
const paypalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2000,
  message: { message: "Too many payment requests, slow down." },
  skip: isUnlimitedUser,
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use("/api/users", authLimiter, userRoutes);
app.use("/api/posts", authLimiter, postRoutes);
app.use("/api/notifications", authLimiter, notificationRoutes);
app.use("/api/admin", authLimiter, adminRoutes);
app.use("/api/messages", authLimiter, messageRoutes);
app.use("/api/track",   authLimiter, trackRoutes);
app.use("/api/spotify", authLimiter, spotifyRoutes);
app.use("/api/youtube", authLimiter, youtubeRoutes);
app.use("/api/twitch",  authLimiter, twitchRoutes);

// Simple health-check endpoint to confirm the server is alive
app.get("/", (req, res) => res.send("Backend is running!"));

// ─── PAYPAL: CREATE ORDER ─────────────────────────────────────────────────────

/**
 * POST /api/paypal/create-order
 *
 * Creates a PayPal sandbox order for the given USD amount.
 * The frontend receives the PayPal order ID and passes it to the JS SDK
 * to present the payment sheet to the user.
 *
 * Body params:
 *  @param {number} amount - Dollar amount to charge (must be > 0 and <= 10,000)
 *
 * Responds with the raw PayPal order object (contains the order ID and approval link).
 */
app.post("/api/paypal/create-order", paypalLimiter, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);

    // Validate amount before hitting the PayPal API
    if (!amount || isNaN(amount) || amount <= 0 || amount > 10000)
      return res.status(400).json({ message: "Invalid amount" });

    // Call the PayPal v2 Orders API using HTTP Basic auth (client_id:secret base64-encoded)
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

    // Read the body as text first so we can handle non-JSON PayPal error responses gracefully
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

// ─── PAYPAL: CAPTURE ORDER ────────────────────────────────────────────────────

/**
 * POST /api/paypal/capture-order/:orderID
 *
 * Captures (finalises) an approved PayPal order and moves the funds.
 * Called by the frontend after the user approves payment in the PayPal popup.
 *
 * If the request includes a valid Bearer JWT the captured amount is added to
 * the authenticated user's donationsTotal field — this is best-effort and
 * does NOT fail the response if the tracking update errors.
 *
 * Route params:
 *  @param {string} orderID - The PayPal order ID returned from create-order
 *                            (must match /^[A-Z0-9]+$/)
 *
 * Responds with the PayPal capture result object on success.
 */
app.post("/api/paypal/capture-order/:orderID", paypalLimiter, async (req, res) => {
  try {
    const { orderID } = req.params;

    // Basic format validation to prevent malformed IDs reaching PayPal
    if (!orderID || !/^[A-Z0-9]+$/.test(orderID))
      return res.status(400).json({ message: "Invalid order ID" });

    // Capture the order using the PayPal v2 API
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

    // Safely parse the response text (PayPal occasionally returns HTML on gateway errors)
    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch {
      return res.status(502).json({ message: "Invalid response from PayPal" });
    }

    if (!response.ok) return res.status(response.status).json({ message: "Capture failed" });

    // ── Optional donation tracking ───────────────────────────────────────────
    // If the request carries a valid JWT, attribute the captured amount to that
    // user's cumulative donation total. This is fire-and-forget; any failure
    // is logged as a warning but does not affect the HTTP response.
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Drill into the PayPal response structure to find the captured amount
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

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────

/**
 * Catch-all Express error handler (4-argument signature required by Express).
 * Any middleware that calls next(err) will land here.
 * Logs the stack trace server-side and returns a generic 500 to the client.
 */
app.use((err, req, res, next) => {
  // Body-parser payload-too-large error
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: "Request too large" });
  }
  // Body-parser JSON syntax error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: "Invalid JSON" });
  }
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
