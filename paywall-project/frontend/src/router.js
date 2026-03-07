// src/router.js
import { createRouter, createWebHistory } from "vue-router";

// Pages / Components
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
import ConfirmEmailChange from "./route/ConfirmEmailChange.vue";
import VerifyEmail from "./route/VerifyEmail.vue";
import FeedPage from "./route/FeedPage.vue";
import CreatePost from "./route/CreatePost.vue";
import PostPage from "./route/PostPage.vue";
import CreatorProfile from "./route/CreatorProfile.vue";

const routes = [
  { path: "/", component: HomePage },
  { path: "/signup", component: SignupPage },
  { path: "/login", component: LoginPage },
  { path: "/profile", component: ProfilePage },
  { path: "/dashboard", component: DashboardPage },
  { path: "/donations", component: DonationsPage },
  { path: "/portfolio", component: PortfolioPage },
  { path: "/forgot-password", component: ForgotPassword },
  { path: "/reset-password/:token", component: ResetPassword },
  { path: "/forgot-username", component: ForgotUsername },
  { path: "/confirm-email-change/:token", component: ConfirmEmailChange },
  { path: "/verify-email/:token", component: VerifyEmail },
  { path: "/feed", component: FeedPage },
  { path: "/create-post", component: CreatePost },
  { path: "/post/:id", component: PostPage },
  { path: "/creator/:username", component: CreatorProfile },
  { path: "/:catchAll(.*)", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
