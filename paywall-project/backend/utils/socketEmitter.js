// =============================================================================
// backend/utils/socketEmitter.js
//
// Shared Socket.io instance store — a simple module-level singleton that
// lets any part of the backend emit real-time events without needing to
// import the HTTP server or the Socket.io setup directly.
//
// How it works:
//   1. When the server starts, the Socket.io instance (`io`) is created and
//      then immediately handed to `setIo(io)` so this module holds a reference.
//   2. Anywhere in the codebase that needs to push an event to a client calls
//      `getIo()` to retrieve the same instance and emits on it.
//
// Usage example (in a controller):
//   import { getIo } from "../utils/socketEmitter.js";
//
//   const io = getIo();
//   if (io) {
//     // Emit to a specific user's private room (keyed by their userId string).
//     io.to(recipientId.toString()).emit("notification", payload);
//   }
//
// The null-check (`if (io)`) is a safety guard for test environments or
// early-startup code paths where setIo may not have been called yet.
// =============================================================================

/**
 * Module-level reference to the Socket.io Server instance.
 * Starts as null and is populated once by setIo() at server startup.
 */
let _io = null;

/**
 * setIo — stores the Socket.io Server instance for later retrieval.
 *
 * Called once in the server entry file immediately after Socket.io is
 * initialised, e.g.:
 *   import { setIo } from "./utils/socketEmitter.js";
 *   const io = new Server(httpServer, { ... });
 *   setIo(io);
 *
 * @param {import("socket.io").Server} io - The Socket.io Server instance.
 */
export const setIo = (io) => { _io = io; };

/**
 * getIo — returns the stored Socket.io Server instance.
 *
 * Returns null if called before setIo() has been invoked (e.g. in unit
 * tests or if called before server bootstrap completes).  Callers should
 * guard against null before emitting events.
 *
 * @returns {import("socket.io").Server | null}
 */
export const getIo = () => _io;
