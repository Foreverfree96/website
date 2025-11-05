// src/router.js
import { createRouter, createWebHistory } from "vue-router";

// Pages / Components
import HomePage from "./route/Homepage.vue"; // make sure the filename is exactly Homepage.vue
import SignupPage from "./route/SignupPage.vue";
import LoginPage from "./route/LoginPage.vue";
import ProfilePage from "./components/Profile.vue";
import DashboardPage from "./route/Dashboard.vue";
import PremiumContent from "./route/PremiumContent.vue";

const routes = [
  { path: "/", component: HomePage }, // use correct import name
  { path: "/signup", component: SignupPage },
  { path: "/login", component: LoginPage },
  { path: "/profile", component: ProfilePage },
  { path: "/dashboard", component: DashboardPage },
  { path: "/premium", component: PremiumContent },
  { path: "/:catchAll(.*)", redirect: "/" }, // fallback route
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
