<template>
  <div>
    <!-- Navigation Bar -->
    <nav class="bg-white shadow-md p-4 flex items-center">
      <!-- LEFT SIDE -->
      <div class="flex space-x-4 items-center">
        <router-link id="home-btn" to="/" class="nav-link">Home</router-link>
        <router-link id="donate-btn" to="/donations" class="nav-link">Donate</router-link>

        <!-- When NOT logged in -->
        <template v-if="!isLoggedIn">
          <router-link id="login-btn" to="/login" class="nav-link">Login</router-link>
          <router-link id="signup-btn" to="/signup" class="nav-link">Sign Up</router-link>
        </template>

        <!-- When logged in -->
        <template v-else>
          <router-link id="logout-btn" to="#" class="nav-link" @click.prevent="handleLogout">
            Logout
          </router-link>
          <router-link id="profile-btn" to="/profile" class="nav-link">Profile</router-link>
          <router-link id="dashboard-btn" to="/dashboard" class="nav-link">Dashboard</router-link>
        </template>
      </div>

      <!-- RIGHT SIDE -->
      <div class="ml-auto flex items-center">
        <router-link id="about-btn" to="/portfolio" class="nav-link">
          Portfolio
        </router-link>
      </div>
    </nav>


    <router-view />
  </div>
</template>

<script setup>
import { computed, unref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "./composables/useAuth.js";

const router = useRouter();
const { user, logout } = useAuth();

// Extract user id safely
const getUserId = () => {
  const u = unref(user);
  return u?.id ?? u?._id ?? null;
};

// Reactive login state
const isLoggedIn = computed(() => !!getUserId());

// Debug mount
onMounted(() => {
  console.log("[App.vue] mounted:", unref(user));
});

// Logout handler
const handleLogout = async () => {
  await logout();
  router.push("/login");
};
</script>

<style scoped>
nav {
  position: sticky;
  top: 0;
  z-index: 50;

}

/* Ensure consistent button size */
.nav-link {
  padding: 0.6rem 1.2rem !important;
  display: inline-flex !important;
  align-items: center;
  border-radius: 6px;
  font-weight: 500;
  text-decoration: none;

}


/* Fix height differences */
#logout-btn {
  line-height: normal !important;
}

#about-btn {
  margin-right: 50px;
  font-weight: 600;
}
</style>
