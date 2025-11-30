// src/router.js
import { createRouter, createWebHistory } from "vue-router";

// Pages / Components
import HomePage from "./route/HomePage.vue";
import SignupPage from "./route/SignupPage.vue";
import LoginPage from "./route/LoginPage.vue";
import ProfilePage from "./components/Profile.vue";
import DashboardPage from "./route/Dashboard.vue";
import DonationsPage from "./route/Donations.vue"; // <-- renamed import

const routes = [
  { path: "/", component: HomePage },
  { path: "/signup", component: SignupPage },
  { path: "/login", component: LoginPage },
  { path: "/profile", component: ProfilePage },
  { path: "/dashboard", component: DashboardPage },
  { path: "/donations", component: DonationsPage }, // <-- updated path
  { path: "/:catchAll(.*)", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
