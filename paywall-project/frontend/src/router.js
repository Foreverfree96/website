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
  { path: "/:catchAll(.*)", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
