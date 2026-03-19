<template>
  <div>
    <!-- Navigation Bar -->
    <nav>
      <!-- Top bar: brand (mobile) + hamburger toggle -->
      <div class="nav-bar">
        <router-link to="/" class="nav-brand">🎨 Creator Hub</router-link>
        <button
          class="hamburger"
          :class="{ 'is-open': menuOpen }"
          @click="menuOpen = !menuOpen"
          aria-label="Toggle navigation"
        >
          <!-- Three spans become an animated X when .is-open is present -->
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <!--
        Nav links (collapsible on mobile).
        Clicking anywhere inside the menu closes it automatically so the
        user doesn't have to manually dismiss it after navigating.
      -->
      <div class="nav-menu" :class="{ 'is-open': menuOpen }" @click="menuOpen = false">

        <!-- ── Left link group ── -->
        <div class="nav-group nav-left">
          <router-link id="home-btn" to="/" class="nav-link">Home</router-link>

          <!-- Links shown only when the user is NOT logged in -->
          <template v-if="!isLoggedIn">
            <router-link id="login-btn" to="/login" class="nav-link">Login</router-link>
            <router-link id="signup-btn" to="/signup" class="nav-link">Sign Up</router-link>
          </template>

          <!-- Links shown only when the user IS logged in -->
          <template v-else>
            <router-link id="feed-btn" to="/feed" class="nav-link">Feed</router-link>
            <router-link id="creators-btn" to="/creators" class="nav-link">Creators</router-link>
            <router-link id="dashboard-btn" to="/dashboard" class="nav-link">Dashboard</router-link>
            <router-link id="profile-btn" to="/profile" class="nav-link">Profile</router-link>
            <router-link id="donate-btn" to="/donations" class="nav-link">Donate</router-link>

            <!--
              Notifications link with a red unread-count badge.
              The badge value is capped at "99+" to prevent it from
              stretching the nav on accounts with many notifications.
            -->
            <router-link id="notifications-btn" to="/notifications" class="nav-link notif-link">
              Notifications
              <!-- Only render the badge when there is at least one unread notification -->
              <span v-if="unreadCount > 0" class="notif-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </router-link>

            <!-- Mod Panel link — only rendered for admin / moderator accounts -->
            <router-link v-if="isAdmin" id="admin-btn" to="/admin" class="nav-link admin-link notif-link" @click="clearModCount">
              🛡️ Mod
              <span v-if="modUnreadCount > 0" class="notif-badge">{{ modUnreadCount > 99 ? '99+' : modUnreadCount }}</span>
            </router-link>
            <router-link v-if="isAdmin" id="analytics-btn" :to="{ path: '/admin', query: { tab: 'analytics' } }" class="nav-link analytics-link">📊 Analytics</router-link>
          </template>
        </div>

        <!-- ── Right link group ── -->
        <div class="nav-group nav-right">
          <!--
            Messages link with its own unread badge.
            Shares the same badge styling as Notifications but draws from
            a separate counter (dmUnreadCount) that tracks DM threads.
          -->
          <a v-if="isLoggedIn" class="nav-link" href="#" @click.prevent="playlistTools.open()">Playlists</a>
          <router-link v-if="isLoggedIn" id="messages-btn" to="/messages" class="nav-link notif-link">
            Messages
            <span v-if="dmUnreadCount > 0" class="notif-badge">{{ dmUnreadCount > 99 ? '99+' : dmUnreadCount }}</span>
          </router-link>

          <!-- Portfolio is public — always visible regardless of auth state -->
          <router-link id="about-btn" to="/portfolio" class="nav-link">Portfolio</router-link>

          <template v-if="isLoggedIn">
            <!--
              .prevent stops the default <router-link> navigation (to="#").
              The click handler performs the async logout flow instead.
            -->
            <router-link id="logout-btn" to="#" class="nav-link" @click.prevent="handleLogout">Logout</router-link>
          </template>
        </div>

      </div>
    </nav>

    <!-- The active route component is rendered here by Vue Router -->
    <router-view />

    <!-- Floating chat widget — only mounted when the user is authenticated -->
    <ChatWidget v-if="isLoggedIn" />

    <!-- Floating mini player — persists across route changes -->
    <MiniPlayer v-if="isLoggedIn" />

    <!-- Playlist tools modal (generate + convert) -->
    <PlaylistToolsModal v-if="isLoggedIn" />
  </div>
</template>

<script setup>
/**
 * App.vue — Root application shell
 *
 * This is the top-level component that wraps every page. It is responsible for:
 *
 *  1. Rendering the global sticky navigation bar, including auth-aware links
 *     (guest vs. logged-in), an admin/moderator shortcut, and unread-count
 *     badges on both the Notifications and Messages links.
 *
 *  2. Managing the mobile hamburger menu open/close state.
 *
 *  3. Connecting and disconnecting the Socket.io real-time channel whenever
 *     the user's login state changes (driven by a watcher on `isLoggedIn`).
 *
 *  4. Fetching the initial unread notification count and DM unread count
 *     on login so the badges are accurate from the first page load.
 *
 *  5. Providing the <router-view> mount point where each page component renders.
 *
 *  6. Rendering the floating <ChatWidget> component for authenticated users.
 */
import { ref, computed, unref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth.js";
import { useNotifications } from "./composables/useNotifications.js";
import ChatWidget from "./components/ChatWidget.vue";
import MiniPlayer from "./components/MiniPlayer.vue";
import PlaylistToolsModal from "./components/PlaylistToolsModal.vue";
import { usePlaylistTools } from "./composables/usePlaylistTools.js";

const router = useRouter();

// ─── AUTH ────────────────────────────────────────────────────────────────────

/**
 * useAuth composable:
 *   user   — reactive object containing the currently logged-in user's data
 *            (username, id, isAdmin, etc.); null / empty when logged out.
 *   logout — async function that clears the JWT from localStorage, resets
 *            the reactive user state, and resolves when done.
 */
const { user, logout } = useAuth();
const playlistTools = usePlaylistTools();

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

/**
 * useNotifications composable provides everything needed for the nav badges
 * and the real-time socket connection:
 *
 *   unreadCount        — reactive integer: how many activity notifications are
 *                        unread. Drives the red badge on the Notifications link.
 *   dmUnreadCount      — reactive integer: how many DM conversations have
 *                        unread messages. Drives the badge on the Messages link.
 *   connectSocket      — opens a Socket.io connection authenticated with the
 *                        user's JWT; registers listeners for incoming events.
 *   disconnectSocket   — tears down the socket and removes all listeners.
 *   fetchNotifications — calls GET /api/notifications, populates the store,
 *                        and updates unreadCount.
 *   setDmCount         — manually sets dmUnreadCount (used after fetching the
 *                        DM unread count from its own endpoint).
 */
const {
  unreadCount,
  dmUnreadCount,
  modUnreadCount,
  connectSocket,
  disconnectSocket,
  fetchNotifications,
  setDmCount,
  clearModCount,
} = useNotifications();

// ─── DM UNREAD COUNT ─────────────────────────────────────────────────────────

/**
 * fetchDmUnread
 *
 * Hits the dedicated messages unread-count endpoint and pushes the result
 * into the global notification store via setDmCount.
 *
 * Axios is imported dynamically (await import) so it is NOT included in the
 * critical initial JS bundle — this request is non-essential at startup and
 * its latency should not block the first render.
 *
 * Errors are silently swallowed; the badge just stays at 0 rather than
 * crashing the entire nav.
 */
const fetchDmUnread = async () => {
  try {
    const axios = (await import("axios")).default;
    const res = await axios.get(
      import.meta.env.VITE_API_URL + "/api/messages/unread-count"
    );
    setDmCount(res.data.count);
  } catch {
    /* ignore — DM badge stays at 0 */
  }
};

// ─── MOBILE MENU ─────────────────────────────────────────────────────────────

/**
 * menuOpen
 * Boolean ref that controls whether the hamburger nav menu is expanded.
 * Only relevant on mobile (≤768 px) where the full nav is hidden by default.
 * It is toggled by the hamburger button and auto-closed on any nav-menu click.
 */
const menuOpen = ref(false);

// ─── USER IDENTITY HELPERS ───────────────────────────────────────────────────

/**
 * getUserId
 *
 * Safely extracts the logged-in user's ID from the reactive user object.
 * Two field names are checked because:
 *   - JWT payloads decoded on the frontend use `id`  (transformed by the auth middleware).
 *   - Raw Mongoose documents returned by some endpoints use `_id`.
 *
 * Returns null when not logged in, which causes isLoggedIn to evaluate false.
 */
const getUserId = () => {
  const u = unref(user);
  return u?.id ?? u?._id ?? null;
};

// ─── COMPUTED AUTH FLAGS ──────────────────────────────────────────────────────

/**
 * isLoggedIn
 * True whenever a non-null user ID is present.
 * Used throughout the template to show/hide authenticated nav links
 * and to conditionally render the <ChatWidget>.
 */
const isLoggedIn = computed(() => !!getUserId());

/**
 * isAdmin
 * True only when the logged-in user has the `isAdmin` flag set to true.
 * Controls visibility of the Mod Panel link in the nav.
 */
const isAdmin = computed(() => !!unref(user)?.isAdmin);

// ─── SOCKET LIFECYCLE ────────────────────────────────────────────────────────

/**
 * Watch isLoggedIn so the Socket.io connection is managed automatically:
 *
 *   Login  → connect the socket with the stored JWT, then pre-fetch the
 *             notification list and DM unread count so badges are correct
 *             immediately after the page loads.
 *
 *   Logout → disconnect the socket (stops receiving real-time events) and
 *             zero the DM badge so it doesn't show stale data on the next
 *             login.
 *
 * `immediate: true` causes the callback to run once synchronously during
 * component setup, ensuring the socket is connected if the user is already
 * logged in when the page first loads (e.g. after a hard refresh).
 */
watch(
  isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      const token = localStorage.getItem("jwtToken");
      if (token) {
        // Open real-time socket authenticated with the stored JWT.
        connectSocket(token);
        // Populate the notification store so the badge is accurate at load.
        fetchNotifications();
        // Separately fetch the DM unread count (different API endpoint).
        fetchDmUnread();
      }
    } else {
      // User logged out — sever the socket and clear the DM counter.
      disconnectSocket();
      dmUnreadCount.value = 0;
    }
  },
  { immediate: true }
);

// ─── DEBUG ───────────────────────────────────────────────────────────────────

/**
 * Log the user object at startup.
 * Useful in development to confirm that the JWT was decoded correctly and
 * that the reactive user state has been hydrated before the first render.
 */
onMounted(async () => {
  console.log("[App.vue] mounted:", unref(user));

  // Verify Spotify connection on app startup so we remember auth state
  if (isLoggedIn.value) {
    try {
      const token = localStorage.getItem('jwtToken');
      if (token) {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/spotify/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.connected) {
            // Mark that Spotify OAuth is done so SDK knows
            localStorage.setItem('sp_oauth_done', '1');
            if (data.isPremium) localStorage.setItem('sp_premium', '1');
            else localStorage.removeItem('sp_premium');
          }
          // If token is expired but user is connected, the backend will
          // auto-refresh on the next API call — no action needed here
        }
      }
    } catch { /* non-critical */ }
  }
});

// ─── LOGOUT HANDLER ──────────────────────────────────────────────────────────

/**
 * handleLogout
 *
 * Performs a clean logout in four ordered steps:
 *   1. Close the mobile menu so it doesn't appear open on the next login.
 *   2. Disconnect the socket before invalidating the JWT to avoid sending
 *      unauthenticated events after the token is cleared.
 *   3. Call the auth composable logout which clears the JWT from localStorage
 *      and resets the reactive user object to its empty state.
 *   4. Redirect to /login so the user lands on the sign-in screen.
 */
const handleLogout = async () => {
  menuOpen.value = false;
  disconnectSocket();
  try {
    const token = localStorage.getItem("jwtToken");
    if (token) {
      const axios = (await import("axios")).default;
      await axios.post(import.meta.env.VITE_API_URL + "/api/users/logout", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {}
  await logout();
  router.push("/login");
};
</script>

<style scoped>
/* ── Core nav layout ── */
nav {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 0 20px;
}

/* Top bar — only visible on mobile (brand + hamburger) */
.nav-bar {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
}

/* Brand name — hidden on desktop (desktop shows only links) */
.nav-brand {
  color: pink;
  font-weight: 700;
  font-size: 1.05rem;
  text-decoration: none;
  letter-spacing: 0.02em;
}

/* Hamburger button — hidden on desktop */
.hamburger {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 26px;
  height: 18px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 60;
  flex-shrink: 0;
}
.hamburger span {
  display: block;
  width: 100%;
  height: 3px;
  background: pink;
  border-radius: 2px;
  transition: transform 0.28s ease, opacity 0.28s ease;
  transform-origin: center;
}
/* Animate the three bars into an X when the menu is open */
.hamburger.is-open span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); }
.hamburger.is-open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
.hamburger.is-open span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); }

/* Desktop nav menu — horizontal row */
.nav-menu {
  display: flex;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
  width: 100%;
}

.nav-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

/* Push the right group to the far right of the bar */
.nav-right {
  margin-left: auto;
  flex-shrink: 0;
}

/* Nav link overrides */
.nav-link {
  padding: 0.55rem 1.1rem !important;
  display: inline-flex !important;
  align-items: center;
  border-radius: 6px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

#about-btn  { font-weight: 600; }
#logout-btn { line-height: normal !important; }

/* Notification / DM badge — absolute-positioned over the parent link */
.notif-link { position: relative; }
.notif-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #e11d48;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 1px 5px;
  line-height: 1.2;
  min-width: 16px;
  text-align: center;
  pointer-events: none; /* badge shouldn't intercept clicks intended for the link */
}

/* Admin / mod link gets a distinct amber colour to stand out */
.admin-link { color: #92400e !important; font-weight: 700 !important; }
/* Analytics link — same amber scheme as the Mod link */
.analytics-link { color: #92400e !important; font-weight: 700 !important; }

/* ── Responsive breakpoints ── */

/* Shrink spacing on tablet landscape */
@media (max-width: 1024px) {
  nav { padding: 0 16px; }
  .nav-link { padding: 0.5rem 0.9rem !important; font-size: 0.93rem; }
}

/* Tablet: slightly tighter */
@media (max-width: 900px) {
  .nav-link { padding: 0.45rem 0.75rem !important; font-size: 0.88rem; }
  .nav-group { gap: 2px; }
}

/* Mobile breakpoint: hamburger takes over, links stack vertically */
@media (max-width: 768px) {
  nav { padding: 0 14px; }

  /* Show the mobile top bar (brand + hamburger) */
  .nav-bar { display: flex; }

  /* Hide desktop menu by default; .is-open makes it visible */
  .nav-menu {
    display: none;
    flex-direction: column;
    align-items: stretch;
    padding: 6px 0 14px;
    border-top: 1px solid #333;
    gap: 3px;
  }
  .nav-menu.is-open { display: flex; }

  /* Both link groups become full-width stacks on mobile */
  .nav-group,
  .nav-group.nav-right {
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    margin-left: 0;
  }

  /* Visual separator between the two groups on mobile */
  .nav-right {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid #2a2a2a;
  }

  .nav-link {
    width: 100%;
    box-sizing: border-box;
    justify-content: flex-start !important;
    padding: 0.72rem 1rem !important;
    font-size: 0.95rem;
    border-radius: 6px;
  }

  #about-btn { margin-right: 0; }
}

/* Phone */
@media (max-width: 600px) {
  nav { padding: 0 10px; }
  .nav-brand { font-size: 1rem; }
  .nav-link { padding: 0.65rem 0.875rem !important; font-size: 0.92rem; }
}

/* Small phone */
@media (max-width: 480px) {
  nav { padding: 0 8px; }
  .nav-brand { font-size: 0.95rem; }
  .nav-link { padding: 0.6rem 0.8rem !important; font-size: 0.88rem; }
  .notif-badge { font-size: 0.6rem; padding: 1px 4px; min-width: 14px; top: 4px; right: 6px; }
}

/* Very small phone (360px) */
@media (max-width: 360px) {
  nav { padding: 0 6px; }
  .nav-brand { font-size: 0.88rem; }
  .nav-link { padding: 0.55rem 0.7rem !important; font-size: 0.84rem; }
}

/* Landscape phone — constrain nav height and allow scrolling if needed */
@media (max-height: 500px) and (orientation: landscape) {
  .nav-menu { max-height: 80vh; overflow-y: auto; }
  .nav-link { padding: 0.5rem 0.875rem !important; }
}
</style>
