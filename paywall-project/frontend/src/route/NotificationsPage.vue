<template>
  <div class="notif-page">

    <!-- ── Page header ── -->
    <div class="notif-header">
      <h1 class="notif-title">Notifications</h1>
      <!--
        "Mark all read" is only rendered when there is at least one notification.
        Clicking it calls markAllRead, which sends a PATCH to the API and zeroes
        the nav badge in a single action.
      -->
      <button v-if="notifications.length" class="mark-read-btn" @click="markAllRead">
        Mark all read
      </button>
    </div>

    <!-- ── Content states ── -->

    <!-- Loading message while the initial fetch is in-flight -->
    <p v-if="loading" class="feed-status">Loading...</p>

    <!-- Empty state — shown after a successful load with no notifications -->
    <p v-else-if="!notifications.length" class="feed-status">No notifications yet.</p>

    <!-- ── Notification list ── -->
    <div v-else class="notif-list">
      <div
        v-for="n in notifications"
        :key="n._id"
        class="notif-card"
        :class="{ unread: !n.read }"
        @click="handleClick(n)"
      >
        <!--
          Left side: icon emoji + descriptive text sentence.
          iconFor(n.type) maps the type string to a representative emoji.
          textFor(n) builds a human-readable sentence from the notification data.
        -->
        <div class="notif-card__content">
          <span class="notif-icon">{{ iconFor(n.type) }}</span>
          <span class="notif-text">{{ textFor(n) }}</span>
        </div>

        <!-- Right side: formatted creation date pushed to the far right -->
        <span class="notif-date">{{ formatDate(n.createdAt) }}</span>
      </div>
    </div>

  </div>
</template>

<script setup>
/**
 * NotificationsPage.vue — User notification inbox
 *
 * Displays the authenticated user's activity notifications in reverse
 * chronological order (newest first, as returned by the API).
 *
 * Supported notification types:
 *   follow  — another user started following you.
 *   comment — someone commented on one of your posts.
 *   mention — someone @mentioned you in a comment.
 *
 * Interactions:
 *   - Clicking a card marks it as read (if unread) and navigates to the
 *     relevant context: the sender's profile for follows, or the post page
 *     for comments and mentions.
 *   - The "Mark all read" button sends a single bulk-read request to the API
 *     and clears the unread badge in the navigation bar.
 *
 * The reactive state (notification array, loading flag, unread count) all
 * live in the shared useNotifications composable so changes made here
 * are immediately reflected in the App.vue nav badge.
 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotifications } from '../composables/useNotifications.js';

const router = useRouter();

// ─── NOTIFICATIONS COMPOSABLE ─────────────────────────────────────────────────

/**
 * useNotifications composable:
 *   notifications    — reactive array of notification objects sorted newest-first.
 *                      Each object has: _id, type, read, sender, post, createdAt.
 *   loading          — true while the API request is in-flight.
 *   fetchNotifications — fetches GET /api/notifications, populates the array,
 *                        and updates the global unreadCount.
 *   markAllRead      — sends PATCH /api/notifications/read-all, marks every
 *                      notification as read in the reactive array, and sets
 *                      unreadCount to 0 (clearing the nav badge).
 *   markOneRead      — sends PATCH /api/notifications/:id/read for a single
 *                      notification and decrements unreadCount by 1.
 */
const { notifications, loading, fetchNotifications, markAllRead, markOneRead } = useNotifications();

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

/**
 * onMounted — fetch the latest notification list every time the page is visited.
 *
 * Re-fetching on each mount (rather than relying solely on the socket) ensures
 * the list is accurate even after the user navigates away and back, or after
 * notifications arrive while the socket was temporarily disconnected.
 */
onMounted(() => fetchNotifications());

// ─── INTERACTION HANDLERS ─────────────────────────────────────────────────────

/**
 * handleClick
 *
 * Called when the user clicks a notification card.  Two sequential steps:
 *
 *  1. Mark as read — if the notification is still unread, fire a PATCH request
 *     via markOneRead.  This decrements the global unreadCount (nav badge) and
 *     flips n.read to true so the green border styling is removed immediately.
 *     The await ensures the visual state update happens before navigation.
 *
 *  2. Navigate — route the user to the most relevant destination:
 *       follow   → the sender's public creator profile page.
 *       comment / mention → the post that generated the notification.
 *                           Optional chaining (n.post?._id) guards against
 *                           notifications whose post was deleted.
 */
const handleClick = async (n) => {
  // Step 1: Mark unread notification as read before navigating.
  if (!n.read) await markOneRead(n._id);

  // Step 2: Navigate to the relevant page based on notification type.
  if (n.type === 'follow') {
    // Follow notification → go to the follower's profile.
    router.push(`/creator/${n.sender.username}`);
  } else if (n.post?._id) {
    // Comment or mention notification → go to the relevant post.
    router.push(`/post/${n.post._id}`);
  }
  // If neither condition matches (e.g. post was deleted), nothing happens —
  // the notification is still marked read but no navigation occurs.
};

// ─── DISPLAY HELPERS ──────────────────────────────────────────────────────────

/**
 * iconFor
 *
 * Maps a notification type string to a representative emoji icon.
 * The object literal acts as a mini lookup table.  The fallback (|| '🔔')
 * covers any future notification types that haven't been added here yet.
 *
 * @param {string} type — e.g. 'follow', 'comment', 'mention'
 * @returns {string} emoji character
 */
const iconFor = (type) => ({ follow: '👤', comment: '💬', mention: '@' }[type] || '🔔');

/**
 * textFor
 *
 * Builds a human-readable sentence describing the notification event.
 *
 * Defensive patterns used:
 *   - `n.sender?.username ?? 'Someone'` — handles deleted accounts where the
 *     sender document no longer exists.
 *   - `n.post?.title || 'a post'`       — handles deleted posts or notifications
 *     that pre-date the title field being stored on the notification.
 *
 * @param {object} n — notification object from the API
 * @returns {string} human-readable description
 */
const textFor = (n) => {
  const sender = n.sender?.username ?? 'Someone';
  if (n.type === 'follow')  return `${sender} followed you`;
  if (n.type === 'comment') return `${sender} commented on your post "${n.post?.title || 'a post'}"`;
  if (n.type === 'mention') return `${sender} mentioned you in a comment`;
  return 'New notification'; // fallback for unknown future types
};

/**
 * formatDate
 * Converts an ISO 8601 date string into the user's locale short date format
 * (e.g. "3/13/2026" in en-US).
 *
 * @param {string} d — ISO date string from the API
 * @returns {string} locale-formatted date
 */
const formatDate = (d) => new Date(d).toLocaleDateString();
</script>

<style scoped>
.notif-page {
  max-width: 600px;
  margin: 30px auto;
  padding: 0 16px 60px;
}

.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.notif-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #000;
  margin: 0;
}

.mark-read-btn {
  background: #000;
  color: pink;
  border: 3px solid #14532d;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease;
}
.mark-read-btn:hover { transform: translateY(-2px); color: rgb(125, 190, 157); }

/* Shared loading / empty state style (reuses feed-status name for consistency) */
.feed-status {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: #000;
  margin-top: 40px;
}

/* Vertical stack of notification cards */
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notif-card {
  background: pink;
  border: 3px solid #000;
  border-radius: 12px;
  padding: 14px 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: transform 0.2s ease;
}
.notif-card:hover { transform: translateY(-2px); }

/*
  Unread notifications get a green border and a lighter off-white background
  to distinguish them from already-read items at a glance.
  The border/background revert to the default when n.read becomes true.
*/
.notif-card.unread { border-color: #14532d; background: #fff0f6; }

/* Left content area: icon + text sentence */
.notif-card__content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notif-icon { font-size: 1.1rem; }

.notif-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #000;
}

/* Date stamp — pushed to the right; flex-shrink: 0 stops it from collapsing */
.notif-date {
  font-size: 0.8rem;
  color: #777;
  flex-shrink: 0;
  margin-left: 12px;
}

/* ── Responsive ── */

/* Large tablet landscape */
@media (max-width: 1024px) {
  .notif-page { max-width: 560px; }
}

/* Tablet portrait */
@media (max-width: 768px) {
  .notif-page { max-width: 100%; padding: 0 14px 50px; margin: 20px auto; }
  .notif-title { font-size: 1.4rem; }
}

/* Large phone */
@media (max-width: 600px) {
  .notif-page { padding: 0 10px 44px; margin: 14px auto; }
  .notif-title { font-size: 1.3rem; }
  .notif-header { margin-bottom: 16px; }
  /* Allow cards to wrap so the date can drop below on narrow screens */
  .notif-card { padding: 12px 14px; flex-wrap: wrap; gap: 6px; }
  /* Content takes up remaining width before the date wraps */
  .notif-card__content { flex: 1; min-width: 0; }
  .notif-text { font-size: 0.9rem; word-break: break-word; }
  .notif-date { font-size: 0.75rem; }
  .mark-read-btn { padding: 5px 12px; font-size: 0.85rem; }
}

/* Phone */
@media (max-width: 480px) {
  .notif-page { padding: 0 8px 40px; }
  .notif-card { padding: 10px 12px; border-radius: 10px; }
  .notif-text { font-size: 0.88rem; }
  .notif-icon { font-size: 1rem; }
  .mark-read-btn { padding: 5px 10px; font-size: 0.82rem; }
}

/* Small phone (360px) — stack icon+text and date vertically */
@media (max-width: 360px) {
  .notif-title { font-size: 1.15rem; }
  .notif-card { flex-direction: column; align-items: flex-start; gap: 4px; }
  .notif-date { margin-left: 0; font-size: 0.72rem; }
  .notif-text { font-size: 0.85rem; }
  .mark-read-btn { font-size: 0.8rem; padding: 4px 9px; }
}

/* Very small phone (320px) */
@media (max-width: 320px) {
  .notif-page { padding: 0 6px 36px; }
  .notif-title { font-size: 1.05rem; }
  .notif-card { padding: 8px 10px; }
}

/* Landscape phone — tighten vertical margins */
@media (max-height: 500px) and (orientation: landscape) {
  .notif-page { margin: 8px auto; }
  .notif-header { margin-bottom: 12px; }
}
</style>
