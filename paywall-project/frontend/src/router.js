// =============================================================================
// src/router.js
// Vue Router configuration for the entire application.
//
// Uses HTML5 History mode (createWebHistory) so URLs look like real paths
// (e.g. /feed) rather than hash-based paths (e.g. /#/feed).
//
// Route categories:
//   - Auth:         /login, /signup, and all password/email helper pages
//   - User account: /profile, /dashboard
//   - Content:      /feed, /create-post, /post/:id, /creator/:username
//   - Social:       /notifications, /messages, /messages/:id
//   - Misc:         /, /portfolio, /donations, /admin
//   - Catch-all:    any unknown path redirects back to /
// =============================================================================

import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "./composables/useAuth";

// ── Page / Component imports ──────────────────────────────────────────────────

import HomePage from "./route/HomePage.vue";
import SignupPage from "./route/SignupPage.vue";
import LoginPage from "./route/LoginPage.vue";
import ProfilePage from "./components/Profile.vue";
import DashboardPage from "./route/Dashboard.vue";
import DonationsPage from "./route/Donations.vue"; // <-- renamed import
import PortfolioPage from "./components/AboutPortfolio.vue";
import ForgotPassword from "./route/ForgotPassword.vue";
import ResetPassword from "./route/ResetPassword.vue";
import ForgotUsername from "./route/ForgotUsername.vue";
import ForgotEmail from "./route/ForgotEmail.vue";
import ConfirmEmailChange from "./route/ConfirmEmailChange.vue";
import VerifyEmail from "./route/VerifyEmail.vue";
import FeedPage from "./route/FeedPage.vue";
import CreatePost from "./route/CreatePost.vue";
import PostPage from "./route/PostPage.vue";
import CreatorProfile from "./route/CreatorProfile.vue";
import NotificationsPage from "./route/NotificationsPage.vue";
import AdminPage from "./route/AdminPage.vue";
import MessagesPage from "./route/MessagesPage.vue";
import CreatorsPage from "./route/CreatorsPage.vue";

// ── Route definitions ─────────────────────────────────────────────────────────

const routes = [
  // Public landing page
  { path: "/", component: HomePage },

  // ── Authentication ──────────────────────────────────────────────────────────
  { path: "/signup", component: SignupPage },
  { path: "/login", component: LoginPage },

  // Password recovery — /forgot-password sends a reset link email;
  // /reset-password/:token is the page the link in that email opens
  { path: "/forgot-password", component: ForgotPassword },
  { path: "/reset-password/:token", component: ResetPassword },

  // Username recovery — sends the user's username to their email address
  { path: "/forgot-username", component: ForgotUsername },
  { path: "/forgot-email",    component: ForgotEmail },

  // Email verification — token arrives via the signup confirmation email
  { path: "/verify-email/:token", component: VerifyEmail },

  // Email change confirmation — token sent when user requests a new email address
  { path: "/confirm-email-change/:token", component: ConfirmEmailChange },

  // ── Authenticated user pages ────────────────────────────────────────────────
  { path: "/profile", component: ProfilePage },
  { path: "/dashboard", component: DashboardPage },

  // ── Content / social ───────────────────────────────────────────────────────
  { path: "/feed", component: FeedPage },
  { path: "/create-post", component: CreatePost },

  // Individual post — :id is the MongoDB ObjectId of the post
  { path: "/post/:id", component: PostPage },

  // Browse all public creators
  { path: "/creators", component: CreatorsPage },

  // Public creator profile — :username is the creator's unique username
  { path: "/creator/:username", component: CreatorProfile },

  // In-app notifications list
  { path: "/notifications", component: NotificationsPage },

  // Direct messages — /messages shows the inbox;
  // /messages/:id opens a specific conversation thread
  { path: "/messages", component: MessagesPage },
  { path: "/messages/:id", component: MessagesPage },

  // ── Miscellaneous ──────────────────────────────────────────────────────────
  { path: "/donations", component: DonationsPage },
  { path: "/portfolio", component: PortfolioPage },
  { path: "/admin", component: AdminPage },

  // Catch-all: any route that doesn't match above redirects to the home page
  // The /:catchAll(.*) syntax is Vue Router 4's way of matching everything
  { path: "/:catchAll(.*)", redirect: "/" },
];

// ── Router instance ───────────────────────────────────────────────────────────

const router = createRouter({
  // HTML5 History API — no hash (#) in the URL; requires server-side
  // fallback (e.g. Vite dev server handles this automatically)
  history: createWebHistory(),
  routes,
});

// Guard the /admin route — if user is already loaded and is not an admin,
// redirect immediately. If auth is still loading (id === null on page refresh),
// the watch inside AdminPage.vue handles the redirect once the profile resolves.
const protectedRoutes = ["/feed", "/create-post", "/notifications", "/messages", "/dashboard", "/profile"];
const { user } = useAuth();

router.beforeEach((to) => {
  // Redirect unauthenticated users away from protected routes
  if (protectedRoutes.some(r => to.path.startsWith(r))) {
    const token = localStorage.getItem("jwtToken");
    if (!token) return "/login";
  }

  // Redirect non-admins away from /admin — also require a token
  if (to.path === "/admin") {
    const token = localStorage.getItem("jwtToken");
    if (!token) return "/login";
    if (user.value.id !== null && !user.value.isAdmin) return "/";
  }
});

// Track every page navigation — fire-and-forget, never blocks the user.
router.afterEach((to) => {
  fetch(import.meta.env.VITE_API_URL + "/api/track/pageview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: to.path }),
  }).catch(() => {});
});

export default router;
