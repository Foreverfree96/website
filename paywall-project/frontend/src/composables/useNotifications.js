// =============================================================================
// src/composables/useNotifications.js
// Notifications and real-time Socket.io composable.
//
// Handles two concerns in one composable:
//   1. REST API — fetching, marking read (all or one), and polling the unread
//      count as a fallback when the WebSocket cannot connect.
//   2. Socket.io — a single persistent connection that receives real-time
//      push events for new notifications, direct messages (DMs), and
//      conversation-cleared signals.
//
// Design notes:
//   - All state (`socket`, `pollInterval`, `unreadCount`, `notifications`,
//     `dmUnreadCount`, `dmHandlers`, `clearHandlers`) lives at MODULE scope,
//     making them true singletons shared across every component that calls
//     useNotifications(). This prevents opening multiple sockets and keeps
//     badge counts in sync application-wide.
//   - `loading` is the only local ref (created fresh per call site) because
//     it only needs to be reactive within the component that triggers a fetch.
//   - DM and conversation-clear events use a listener-array pattern instead of
//     a single callback so multiple components can independently subscribe to
//     the same event type (e.g. MessagesPage and App.vue both care about DMs).
// =============================================================================

import { ref } from "vue";
import axios from "axios";
import { io as socketIo } from "socket.io-client";

// ── Ping sound via Web Audio API (no audio file needed) ───────────────────────
const playPing = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch { /* browser audio blocked */ }
};

// Base URL for all notification REST endpoints
const API_URL = import.meta.env.VITE_API_URL + "/api/notifications";

// ── Module-level singletons ───────────────────────────────────────────────────

// The active Socket.io client instance; null when disconnected
let socket = null;

// Reference to the setInterval handle used for the HTTP-polling fallback
let pollInterval = null;

// Reactive count of unread app notifications (bell icon badge)
const unreadCount = ref(0);

// Full list of notification objects fetched from the server
const notifications = ref([]);

// Reactive count of unread direct messages (DM badge in nav)
const dmUnreadCount = ref(0);

// Reactive count of new incoming reports (mod badge in nav, admin only)
const modUnreadCount = ref(0);

// Arrays of subscriber callbacks invoked when the matching socket event fires.
// Using arrays allows multiple components to listen without overwriting each other.
let dmHandlers = [];
let clearHandlers = [];

// =============================================================================
// useNotifications — composable factory function
// =============================================================================
export function useNotifications() {

  // Per-call-site loading flag (not a singleton — each consumer tracks its own)
  const loading = ref(false);

  // ── REST: Fetch notifications ───────────────────────────────────────────────

  /**
   * Loads a page of notifications from the server (20 per page) and
   * simultaneously refreshes the unread count. Updates both reactive refs.
   * Errors are silently swallowed because a failed notification fetch should
   * not break the rest of the UI.
   */
  const fetchNotifications = async (page = 1) => {
    loading.value = true;
    try {
      const res = await axios.get(API_URL, { params: { page, limit: 20 } });
      notifications.value = res.data.notifications;
      unreadCount.value = res.data.unreadCount;
    } catch {
      // non-critical — badge / list will just keep its current value
    } finally {
      loading.value = false;
    }
  };

  // ── REST: Poll unread count ─────────────────────────────────────────────────

  /**
   * Lightweight request that only fetches the current unread count number.
   * Used by the polling fallback when the socket is unavailable.
   * Nullish coalescing (`?? 0`) ensures the ref never becomes undefined.
   */
  const pollUnreadCount = async () => {
    try {
      const res = await axios.get(`${API_URL}/unread-count`);
      unreadCount.value = res.data.unreadCount ?? 0;
    } catch {}
  };

  /**
   * Starts a 30-second polling interval that keeps the unread count fresh
   * when the WebSocket connection is not available (e.g. server cold start,
   * network restriction). The guard `if (!pollInterval)` prevents duplicate
   * intervals from being created.
   */
  const startPollingFallback = () => {
    if (!pollInterval) pollInterval = setInterval(pollUnreadCount, 30_000);
  };

  // ── REST: Mark read ─────────────────────────────────────────────────────────

  /**
   * Marks every notification as read on the server, then resets the local
   * unread count to 0 and flips the `read` flag on all local notification
   * objects so the UI updates immediately without a refetch.
   */
  const markAllRead = async () => {
    try {
      await axios.put(`${API_URL}/read-all`);
      unreadCount.value = 0;
      // Mutate the objects in-place via map so Vue's reactivity picks up the change
      notifications.value = notifications.value.map(n => ({ ...n, read: true }));
    } catch {}
  };

  /**
   * Marks a single notification as read by its MongoDB _id.
   * Only decrements the unread counter if the notification was previously
   * unread (prevents the count going negative on double-clicks).
   * Uses Math.max(0, ...) as a defensive lower-bound guard.
   */
  const markOneRead = async (id) => {
    try {
      await axios.put(`${API_URL}/${id}/read`);
      const notif = notifications.value.find(n => n._id === id);
      if (notif && !notif.read) {
        notif.read = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    } catch {}
  };

  /** Permanently deletes a single notification. */
  const deleteOneNotif = async (id) => {
    try {
      await axios.delete(`${API_URL}/${id}`);
      const idx = notifications.value.findIndex(n => n._id === id);
      if (idx !== -1) {
        const wasUnread = !notifications.value[idx].read;
        notifications.value.splice(idx, 1);
        if (wasUnread) unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    } catch {}
  };

  /** Permanently deletes all notifications for the current user. */
  const deleteAllNotifs = async () => {
    try {
      await axios.delete(API_URL);
      notifications.value = [];
      unreadCount.value = 0;
    } catch {}
  };

  // ── Socket.io: Connect ──────────────────────────────────────────────────────

  /**
   * Opens a Socket.io connection authenticated with the user's JWT.
   * The guard `if (socket) return` makes this idempotent — calling it
   * multiple times (e.g. from App.vue and a page component) is safe.
   *
   * Events handled:
   *   "notification"         — a new in-app notification was created for this user;
   *                            prepend it to the list and increment the badge.
   *   "dm"                   — a new direct message arrived; increment the DM badge
   *                            and fan out to any registered dmHandlers.
   *   "conversation_cleared" — the other party cleared a conversation; fan out to
   *                            any registered clearHandlers so MessagesPage can react.
   *   "connect_error"        — socket failed to connect; activate HTTP polling so
   *                            the badge still updates (degraded but functional).
   *   "connect"              — socket reconnected successfully; stop polling since
   *                            real-time events are flowing again.
   */
  const connectSocket = (token) => {
    if (socket) return; // Already connected — do nothing

    socket = socketIo(import.meta.env.VITE_API_URL, {
      auth: { token },
      // Try WebSocket first, fall back to long-polling if blocked
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      timeout: 10_000,
    });

    // New notification pushed from the server
    socket.on("notification", (notif) => {
      notifications.value.unshift(notif); // Prepend so newest is first
      unreadCount.value += 1;
      playPing();
    });

    // New direct message pushed from the server
    socket.on("dm", (data) => {
      dmUnreadCount.value += 1;
      playPing();
      // Invoke all registered DM listeners (e.g. MessagesPage live-appends the message)
      dmHandlers.forEach(h => h(data));
    });

    // The other party cleared a conversation
    socket.on("conversation_cleared", (data) => {
      clearHandlers.forEach(h => h(data));
    });

    // A new report was submitted — increment the mod badge for admins
    socket.on("mod:report", () => {
      modUnreadCount.value += 1;
    });

    // If WebSocket unavailable (e.g. server cold-starting), fall back to polling
    socket.on("connect_error", () => {
      startPollingFallback();
    });

    // Clear polling once socket is live — real-time events replace it
    socket.on("connect", () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    });
  };

  // ── Socket.io: Disconnect ───────────────────────────────────────────────────

  /**
   * Tears down the socket connection and resets all singleton state.
   * Called on logout so the next user starts with a clean slate.
   */
  const disconnectSocket = () => {
    if (socket) { socket.disconnect(); socket = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    unreadCount.value = 0;
    notifications.value = [];
    dmUnreadCount.value = 0;
    modUnreadCount.value = 0;
    dmHandlers = [];
    clearHandlers = [];
  };

  // ── DM handler registration ─────────────────────────────────────────────────

  /**
   * Registers a callback to be invoked whenever a "dm" socket event arrives.
   * Returns an unsubscribe function — call it in the component's onUnmounted
   * hook to prevent memory leaks and stale closures.
   *
   * Usage:
   *   const off = addDmHandler((data) => { ... });
   *   onUnmounted(off);
   */
  const addDmHandler = (fn) => {
    dmHandlers.push(fn);
    // Return a cleanup function that removes only this specific handler
    return () => { dmHandlers = dmHandlers.filter(h => h !== fn); };
  };

  /**
   * Registers a callback for "conversation_cleared" socket events.
   * Returns an unsubscribe function identical in pattern to addDmHandler.
   */
  const addClearHandler = (fn) => {
    clearHandlers.push(fn);
    return () => { clearHandlers = clearHandlers.filter(h => h !== fn); };
  };

  // ── DM count helpers ────────────────────────────────────────────────────────

  /**
   * Replaces the DM unread count with an absolute value.
   * Used when MessagesPage fetches the full unread count on mount.
   */
  const setDmCount = (n) => { dmUnreadCount.value = n; };

  /** Resets the mod report badge to 0. Called when an admin visits /admin. */
  const clearModCount = () => { modUnreadCount.value = 0; };

  /**
   * Decrements the DM unread count by `n` (default 1).
   * Math.max(0, ...) prevents the counter from going below zero.
   * Called when the user opens a conversation and reads its messages.
   */
  const decrementDmCount = (n = 1) => { dmUnreadCount.value = Math.max(0, dmUnreadCount.value - n); };

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    notifications,
    unreadCount,
    dmUnreadCount,
    modUnreadCount,
    loading,
    fetchNotifications,
    markAllRead,
    markOneRead,
    deleteOneNotif,
    deleteAllNotifs,
    connectSocket,
    disconnectSocket,
    addDmHandler,
    addClearHandler,
    setDmCount,
    clearModCount,
    decrementDmCount,
    getSocket: () => socket,
  };
}
