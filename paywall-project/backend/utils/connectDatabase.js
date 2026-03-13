// =============================================================================
// backend/utils/connectDatabase.js
//
// Establishes and manages the application's connection to MongoDB via Mongoose.
//
// Called once at server startup (in the main server entry file) before any
// routes begin handling requests.  If the connection cannot be established,
// the process exits immediately with a non-zero code so the host environment
// (Docker, PM2, systemd, etc.) knows to restart or alert.
//
// Connection options explained:
//   maxPoolSize              — up to 20 concurrent socket connections in the
//                              Mongoose connection pool; tunes throughput under
//                              load without overwhelming the MongoDB server.
//   serverSelectionTimeoutMS — Mongoose will throw if it cannot find a
//                              suitable server within 5 seconds (default is
//                              30 s which makes boot-time failures slow).
//   socketTimeoutMS          — close idle sockets after 30 seconds to free
//                              resources on both ends of the connection.
//
// Environment variable:
//   MONGO_URI — full MongoDB connection string, e.g.:
//     mongodb://localhost:27017/paywall   (local dev)
//     mongodb+srv://user:pass@cluster.mongodb.net/paywall  (Atlas)
// =============================================================================

import mongoose from "mongoose";

/**
 * connectDatabase — connects Mongoose to MongoDB using the MONGO_URI
 * environment variable.
 *
 * This is an async function so the caller can `await` it and be confident
 * the database is ready before the HTTP server starts accepting requests.
 *
 * On success: logs "MongoDB connected" to stdout.
 * On failure: logs the error and calls process.exit(1) to halt the process.
 */
export const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Allow up to 20 simultaneous connections in the pool for concurrent requests.
      maxPoolSize: 20,

      // Fail fast if MongoDB is unreachable at startup (5 s instead of 30 s default).
      serverSelectionTimeoutMS: 5000,

      // Drop idle socket connections after 30 seconds to reclaim resources.
      socketTimeoutMS: 30000,
    });
    console.log("MongoDB connected");
  } catch (err) {
    // Log the full error so the reason for failure is visible in the logs,
    // then exit with code 1 to signal an abnormal termination to the OS/process manager.
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
};
